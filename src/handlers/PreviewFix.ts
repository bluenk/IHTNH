import { Collection, Interaction, Message, ActionRowBuilder, ButtonBuilder, BaseMessageOptions, ButtonStyle, MessagePayload, RawFile, MessageCreateOptions, AttachmentPayload, AttachmentBuilder, codeBlock } from "discord.js";
import { Client } from "../structures/Client.js";
import { Handler } from "../structures/Handler.js";
import EmbedBuilder from "../structures/EmbedBuilder.js";
import urlMetadata from "url-metadata";
import extractURL from "../utils/extractURL.js";
import TwitterCrawler, { ITweetData, IUserData } from "../utils/TwitterCrawler.js";
import ffmpegStreamer from "../utils/ffmpegStreamer.js";
import { loggerInit } from "../utils/logger.js";
import { includes } from "lodash";

const log = loggerInit('previewFix');

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
                .filter(url => Boolean(url.pathname.split('/')[1])),
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
        const btnCollector = replyMsg.createMessageComponentCollector({ filter, time: embedDeleteTimeout * 60 * 1000 })
        
        btnCollector
            .on('collect', c => {
                log(`${c.user.displayName} requested embed removal`)
                
                this.queueRemove(replyMsg.id);
                btnCollector.stop('Message deletion');
                replyMsg.delete();
            })
            .once('end', (c, reason) => {
                if (reason === 'Message deletion') return;
                replyMsg.edit({ components:[] });
            });
 
        // Check if original message has genarated perview, if yes then remove replied message
        setTimeout(async () => {
            if (msg.embeds.length > 0 && this.repairedMsg.some((v => v.repairedId === replyMsg.id))) {
                log('embed has been genarated by discord, removing reply message');

                this.queueRemove(replyMsg.id);
                btnCollector.stop('Message deletion');
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
        log(twitterUrls.length + ' tweet preview failures detected. Fixing...');
        // const tweetIds = twitterUrls.map(url => url.pathname.split('/')[3]);
        const data = await this.twitterCrawler.crawl(twitterUrls[0]);

        // msg.reply(data.mediaUrls.map(u => u.href).join('\n'));
        // console.log(data);
        return data.type === 'TWEET'
            ? this.makeTweetEmbeds(data as ITweetData)
            : this.makeTwitterUserEmbeds(data as IUserData)
    }

    private async makeTweetEmbeds(tweetsData: ITweetData): Promise<MessageCreateOptions> {
        let files: AttachmentBuilder[] = [];
        const { error, author, mediaUrls, url, publicMetrics, timestamp, description } = tweetsData; 

        tweetsData.mediaUrls?.forEach(({ url, mediaType }) => {
            if (mediaType === 'PHOTO') return;

            files.push(
                new AttachmentBuilder(
                    url.href.includes('.m3u8')
                        ? ffmpegStreamer(url.href, 'STREAM_MP4')
                        : mediaType === 'ANIMATED_GIF' 
                            ? ffmpegStreamer(url.href, 'GIF')
                            : url.href
                    , { name: 'preview.' + (mediaType === 'VIDEO' ? 'mp4' : 'gif') }
                )
            );
        });
       
        const embeds = [
            new EmbedBuilder({
                url: url?.href,
                author: 
                    author && {
                    name: author.name + ` (${author.id})`,
                    icon_url: author?.pfp.href
                },
                description: error ? '\❌ *這篇推文已經被刪除了*': description,
                fields: 
                    publicMetrics && [
                    { name: '', value: `<:retweet:1161941192418803732>  ${publicMetrics.retweets}`, inline: true },
                    { name: '', value: `<:like:1161943557448413194>  ${publicMetrics.likes}`, inline: true }
                ],
                image: mediaUrls && mediaUrls[0]?.mediaType === 'PHOTO' ? { url: mediaUrls[0].url.href } : undefined,
                footer: {
                    text: `推文預覽${(publicMetrics && '  •  ' + publicMetrics.views + ' 次查看') || ''}`,
                    icon_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
                },
                timestamp: timestamp && new Date(timestamp).toISOString()
            })
        ];

        // Adding additional images
        if (mediaUrls && mediaUrls.length > 1) {
            mediaUrls
                .filter(m => m.mediaType === "PHOTO")
                .slice(1)
                .forEach(mUrl => {
                    embeds.push(
                        new EmbedBuilder({
                            url: url?.href,
                            image: { url: mUrl.url.href }
                        })
                    );
                });
        }

        return { embeds, files };
    }
    
    private async makeTwitterUserEmbeds(userData: IUserData): Promise<MessageCreateOptions> {
        const {
            error,
            user, 
            url,
            publicMetrics,
            description,

        } = userData; 
       
        const embeds = [
            new EmbedBuilder(
                !error
                    ? {
                        url: url?.href,
                        author: 
                            user && {
                            name: user.name + ` (@${user.id})`
                        },
                        description,
                        fields: 
                            publicMetrics && [
                            { name: '', value: `${publicMetrics.following.toLocaleString('zh-TW')} **個跟隨中**`, inline: true },
                            { name: '', value: `${publicMetrics.followers.toLocaleString('zh-TW')} **位跟隨者**`, inline: true }
                        ],
                        thumbnail: user && { url: user?.pfp.href.replace('_normal.', '_400x400.') },
                        image: user?.banner && { url: user?.banner.href },
                        footer: {
                            text:
                                `使用者預覽  •  ` + 
                                `${publicMetrics!.status.toLocaleString('zh-TW')} 則貼文　|　` +
                                `${publicMetrics!.medias.toLocaleString('zh-TW')} 個相片和影片　|　` +
                                `${publicMetrics!.likes.toLocaleString('zh-TW')} 個喜歡`
                                ,
                            icon_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
                        }
                    }
                    : {
                        description: '\❌ *此帳戶不存在*',
                        footer: {
                            text: `使用者預覽`,
                            icon_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
                        }
                    }
            )
        ];
        
        return { embeds };
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