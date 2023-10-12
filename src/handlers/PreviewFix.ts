import { Collection, Interaction, Message, ActionRowBuilder, ButtonBuilder, BaseMessageOptions, ButtonStyle, MessagePayload, RawFile, MessageCreateOptions, AttachmentPayload, AttachmentBuilder } from "discord.js";
import { Client } from "../structures/Client.js";
import { Handler } from "../structures/Handler.js";
import EmbedBuilder from "../structures/EmbedBuilder.js";
import urlMetadata from "url-metadata";
import extractURL from "../utils/extractURL.js";
import TwitterCrawler, { ITweetData } from "../utils/TwitterCrawler.js";
import ffmpegStreamer from "../utils/ffmpegStreamer.js";
import { log } from "../utils/logger.js";


const embedCheckDelay = 8; //sec
const embedDeleteTimeout = 1; //min

export default class PreviewFix extends Handler {
    private repairedMsg: { originId: string, repairedId: string }[] = [];
    private queueSize = 10;
    private twitterCrawler: TwitterCrawler;
    private page;

    public constructor(client: Client) {
        super(client, {
            info: {
                name: 'previewFix',
                fullName: '連結預覽修正',
                detail: '為預覽失效或缺乏資訊的連結補上預覽，目前支援Twitter與LineToday(liff)。',
                enable: true
            }
        });

        this.twitterCrawler = new TwitterCrawler();
        this.page = this.twitterCrawler.init();
    }

    public execute(): void {}

    public async run(msg: Message<boolean>): Promise<void> {
        // Skip if message is mark as spoiler.
        if (msg.content.match(/\|\|(?:.|\n)*\|\|/g)) return;

        const urls = extractURL(msg.content).map(str =>  new URL(str));
        const twitterUrls = urls.filter(url => url.hostname === 'twitter.com' || url.hostname === 'x.com');
        const lineTodayUrls = urls.filter(url => url.hostname === 'liff.line.me');
        // console.log(urls)

        
        if (!msg.deletable) return;
        
        const needFix = [
            ...twitterUrls
                .filter(url => !msg.embeds.find((v) => v.url === url.href))
                .filter(url => Boolean(url.pathname.split('/')[3])),
            ...lineTodayUrls
        ];
        // console.log(msg.embeds, {needFix});
        if (!needFix.length) return;

        let msgOptions: BaseMessageOptions = { embeds: [], files: [] };
        if (needFix.some(v => twitterUrls.includes(v))) {
            const data = await this.fixTwitter(msg, twitterUrls);
            msgOptions = {
                embeds: [...msgOptions.embeds!, ...data.embeds || []],
                files: [...msgOptions.files!, ...data.files || []]
            };
        }
        if (needFix.some(v => lineTodayUrls.includes(v))) {
            const data = await this.fixLineToday(msg, lineTodayUrls);
            msgOptions = {
                embeds: [...msgOptions.embeds!, ...data.embeds || []]
            };
        }

        if (!msgOptions.embeds?.length && !msgOptions.files?.length) {
            return log(Error('Empty msgOptions, Faild to fix perview!'));
        }

        const btnActionRow = new ActionRowBuilder<ButtonBuilder>({
            components: [
                new ButtonBuilder({
                    customId: 'delete',
                    style: ButtonStyle.Danger,
                    label: '不需要'
                })
            ] 
        });
        
        const replyMsg = await msg.reply({
            ...msgOptions,
            allowedMentions: { repliedUser: false },
            components: [btnActionRow]
        });

        this.queueAdd(msg.id, replyMsg.id);
        
        const filter = (i: Interaction) => i.user.id === msg.author.id;
        replyMsg.awaitMessageComponent({ filter, time: embedDeleteTimeout * 60 * 1000 })
            .then(i => {
                this.queueRemove(replyMsg.id);
                replyMsg.delete();
            })
            .catch(err => {
                if (err.code === 'InteractionCollectorError') {
                    if (!replyMsg.editable) return;
                    replyMsg.edit({ components:[] });
                } else {
                    log(err, this.options.info.name);
                }
            });
        
        // Check if original message has genarated perview, if yes then remove replyed message
        setTimeout(async () => {
            if (msg.embeds.length > 0) {
                this.queueRemove(replyMsg.id);
                replyMsg.delete();
            }
        }, embedCheckDelay * 1000)
    }

    public async deleteRepaired(msg: Message) {
        // When original message got deleted, Delete the repaired msg too.
        if (!this.repairedMsg.some(i => i.originId === msg.id)) return;
        
        log('Detect deleted message, delete repaired message.');

        const repairedMsgId = this.repairedMsg.find(i => i.originId === msg.id)!.repairedId;
        const repairedMsg = await msg.channel.messages.fetch(repairedMsgId);

        repairedMsg.delete();
        this.queueRemove(repairedMsgId);
    }

    private async fixLineToday(msg: Message, lineTodayUrls: URL[]) {
        return {
            embeds: (await Promise.all(
                lineTodayUrls.map(async url => {
                    const modifiedPath = url.pathname.split('/').slice(3).join('/');
                    const redirectUrl = 'https://today.line.me/tw/' + modifiedPath;
                    try {
                        const res = await urlMetadata(redirectUrl);
                        return this.makeLineTodayEmbed(res);
                    } catch(err) {
                        console.error(err);
                    }
                })
            ))
            .filter(Boolean) as EmbedBuilder[]
        }
    }
        
    private makeLineTodayEmbed(data: urlMetadata.Result) {
        const { publisher, datePublished, provider, headline, description, image } = data.jsonld;
        console.log(data.jsonld);
        return new EmbedBuilder({
            url: data.url,
            author: { name: publisher.name },
            title: headline,
            description,
            thumbnail: { url: image },
            footer: { text: provider.name },
            timestamp: datePublished
        });
    }

    private async fixTwitter(msg: Message, twitterUrls: URL[]) {
        log(twitterUrls.length + ' tweet preview failures detected. Fixing...', this.options.info.name);
        // const tweetIds = twitterUrls.map(url => url.pathname.split('/')[3]);
        const data = await this.twitterCrawler.crawl(twitterUrls[0]);

        // msg.reply(data.mediaUrls.map(u => u.href).join('\n'));
        console.log(data);
        return this.makeTweetEmbeds(data);
    }

    private async makeTweetEmbeds(tweetsData: ITweetData): Promise<MessageCreateOptions> {
        let files: AttachmentBuilder[] = [];
        const { author, mediaUrls, url, publicMetrics, mediaType, timestamp, description } = tweetsData; 
        
        if (mediaType === 'VEDIO_GIF') {
            files.push(...mediaUrls.map(url =>  new AttachmentBuilder(url.href)));
        }
        if (mediaType === 'VEDIO') {
            files.push(...mediaUrls.map(url =>  new AttachmentBuilder(ffmpegStreamer(url.href), { name: 'preview.mp4' })));
        }
        

        const embeds = [
            new EmbedBuilder({
                url: url.href,
                author: {
                    name: author.name + ` (${author.id})`,
                    icon_url: author.pfp.href
                },
                description,
                fields: [
                    { name: '喜歡', value: publicMetrics.likes, inline: true },
                    { name: '轉推', value: publicMetrics.retweets, inline: true }
                ],
                image: mediaType === 'IMAGE' ? { url: mediaUrls[0].href } : undefined,
                footer: {
                    text: `推文預覽  •  ${publicMetrics.views} 次查看`,
                    icon_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
                },
                timestamp: new Date(timestamp).toISOString()
            })
        ];

        // Adding additional images
        if (mediaUrls.length > 1) {
            mediaUrls
                .slice(1)
                .forEach(mUrl => {
                    embeds.push(
                        new EmbedBuilder({
                            url: url.href,
                            image: { url: mUrl.href }
                        })
                    );
                });
        }

        return { embeds, files };
    }
    

    private queueAdd(originId: string, repairedId: string) {
        this.repairedMsg.push({ originId, repairedId });
        if (this.repairedMsg.length > this.queueSize) {
            this.repairedMsg.shift();
        }
    }

    private queueRemove(repairedId: string) {
        const targetIndex = this.repairedMsg.findIndex(i => i.repairedId === repairedId);
        this.repairedMsg.splice(targetIndex, 1);
    }
}