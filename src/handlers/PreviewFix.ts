import { Collection, Interaction, Message, MessageActionRow, MessageButton, MessageFlags, MessageOptions } from "discord.js";
import { Client } from "../structures/Client";
import { Handler } from "../structures/Handler";
import extractURL from "../utils/extractURL";
import fetch from "node-fetch";
import { log } from "../utils/logger";
import MessageEmbed from "../structures/MessageEmbed";
import urlMetadata from "url-metadata";

const embedCheckDelay = 3; //sec
const embedDeleteTimeout = 0.5; //min

interface TweetLookupData {
    data: {
        public_metrics: {
            retweet_count: number;
            reply_count: number;
            like_count: number;
            quote_count: number;
        }
        author_id: string;
        id: string;
        text: string;
        created_at: string;
        attachments: {
            media_keys: string[];
        };
    }[];
    includes: {
        media: {
            media_key: string;
            type: 'photo' | 'video';
            url: string;
        }[];
        users: {
            id: string;
            name: string;
            username: string;
            profile_image_url: string;
        }[];
    };
}

interface TweetShowData {
    extended_entities: {
        media: {
            video_info: {
                aspect_ratio: [number, number];
                duration_millis: number;
                variants: {
                    bitrate?: number;
                    content_type: string;
                    url: string;
                }[];
            }
        }[];
    };
}

export default class PreviewFix extends Handler {
    private repairedMsg: { originId: string, repairedId: string }[] = [];
    private queueSize = 10;

    public constructor(client: Client) {
        super(client, {
            info: {
                name: 'previewFix',
                fullName: '連結預覽修正',
                detail: '為預覽失效或缺乏資訊的連結補上預覽，目前支援Twitter與LineToday(liff)。',
                enable: true
            }
        })
    }

    public execute(): void {}

    public async run(msg: Message<boolean>): Promise<void> {
        // When original message got deleted, Delete the repaired msg too.
        if (!msg.deletable && this.repairedMsg.some(i => i.originId === msg.id)) {
            const repairedMsgId = this.repairedMsg.find(i => i.originId === msg.id)!.repairedId;
            const repairedMsg = await msg.channel.messages.fetch(repairedMsgId);
            repairedMsg.delete();
            this.queueRemove(repairedMsgId);
            return;
        }

        // Skip if message is mark as spoiler.
        if (msg.content.match(/\|\|(?:.|\n)*\|\|/g)) return;

        const urls = extractURL(msg.content).map(str =>  new URL(str));
        const twitterUrls = urls.filter(url => url.hostname === 'twitter.com');
        const lineTodayUrls = urls.filter(url => url.hostname === 'liff.line.me');
        console.log(urls)

        setTimeout(async () => {
            if (!msg.deletable) return;
            
            const needFix = [
                ...twitterUrls
                    .filter(url => !msg.embeds.find((v) => v.url === url.href))
                    .filter(url => Boolean(url.pathname.split('/')[3])),
                ...lineTodayUrls
            ];
            // console.log(msg.embeds, {needFix});
            if (!needFix.length) return;

            let msgOptions: MessageOptions = { embeds: [], files: [] };
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

            const btnActionRow = new MessageActionRow({
                components: [
                    new MessageButton({
                        customId: 'delete',
                        style: 'DANGER',
                        label: '刪除'
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
                    if (err.code === 'INTERACTION_COLLECTOR_ERROR') {
                        if (!replyMsg.editable) return;
                        replyMsg.edit({ components:[] });
                    } else {
                        log(err, this.options.info.name);
                    }
                });
        }, embedCheckDelay * 1000)
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
            .filter(Boolean) as MessageEmbed[]
        }
    }
        
    private makeLineTodayEmbed(data: urlMetadata.Result) {
        const { publisher, datePublished, author, headline, description, image } = data.jsonld;
        return new MessageEmbed({
            url: data.url,
            author: { name: publisher.name },
            title: headline,
            description,
            thumbnail: { url: image },
            footer: { text: author.name },
            timestamp: new Date(datePublished)
        });
    }

    private async fixTwitter(msg: Message, twitterUrls: URL[]) {
        log(twitterUrls.length + ' tweet preview failures detected. Fixing...', this.options.info.name);
        const tweetIds = twitterUrls.map(url => url.pathname.split('/')[3]);
        const data = await this.fetchTweetLookup(tweetIds);

        // console.log({tweetIds}, JSON.stringify(data, null, 2));
        return this.makeTweetEmbeds(data);
    }

    private makeTweetEmbeds(tweetsData: TweetLookupData): MessageOptions {
        let embeds: MessageEmbed[] = [];
        let files: string[] = [];
        for (const data of tweetsData.data) {
            const user = tweetsData.includes.users.find(v => v.id === data.author_id)!;
            const media = tweetsData.includes.media.filter(v => data.attachments.media_keys.includes(v.media_key));
            const desArr = data.text.split(' ');
            const tweetShortURL = desArr.pop();
            
            if (media[0].type === 'video') files.push(media[0].url);

            embeds.push(
                new MessageEmbed({
                    url: tweetShortURL,
                    author: {
                        name: user.name + ` (@${user.username})`,
                        iconURL: user.profile_image_url
                    },
                    description: desArr.join(' '),
                    fields: [
                        { name: 'Likes', value: data.public_metrics.like_count.toString(), inline: true },
                        { name: 'Retweets', value: data.public_metrics.retweet_count.toString(), inline: true }
                    ],
                    image: { url: media[0].url },
                    footer: {
                        text: media[0].type === 'video' ? '影片推文，載入速度較慢' : `推文預覽修正`,
                        iconURL: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
                    },
                    timestamp: new Date(data.created_at)
                })
            )

            const mediaLength = data.attachments.media_keys.length;
            if (mediaLength > 1) {
                for (let i = 1; i < mediaLength; i++) {
                    embeds.push(
                        new MessageEmbed({
                            url: tweetShortURL,
                            image: { url: media[i].url }
                        })
                    )
                }
            }
        }

        return { embeds, files };
    }
    
    private async fetchTweetLookup(tweetIds: string[]) {
        const tweetLookupURL = 
            'https://api.twitter.com/2/tweets' + 
            '?ids=' + tweetIds +
            '&expansions=attachments.media_keys,author_id' +
            '&tweet.fields=created_at,public_metrics' +
            '&media.fields=url,preview_image_url' +
            '&user.fields=profile_image_url';

        const tweetShowURL = (id: string) => 'https://api.twitter.com/1.1/statuses/show.json?id=' + id;

        const data = await this.fetchTwitter(tweetLookupURL);
        if (!data) throw log(Error('Faild to fetch twitter api!'), this.options.info.name);

        
        const videoMediaKeys = data.includes.media.filter(m => m.type === 'video');
        const videoMediatweet = data.data.filter(i => {
            return videoMediaKeys.some(v => i.attachments.media_keys.includes(v.media_key));
        });
        const videoMediaIds = videoMediatweet.map(v => v.id);
            
        const idMediaKeyPair = new Collection<string, string>();
        videoMediaKeys.forEach(k => {
            videoMediatweet.forEach(t => {
                if (t.attachments.media_keys.includes(k.media_key)) {
                    idMediaKeyPair.set(t.id, k.media_key);
                }
            })
        })

        if (videoMediaIds) {
            const showData = new Collection<string, string>();

            for (const id of videoMediaIds) {
                const res = await this.fetchTwitter(tweetShowURL(id)) as unknown as TweetShowData;
                
                const videoURLs = res.extended_entities.media[0].video_info.variants
                    .filter(v => v.bitrate)
                    .sort((a, b) =>b.bitrate! - a.bitrate!)
                    .map(v => v.url);

                showData.set(idMediaKeyPair.get(id)!, videoURLs[0]);
            }

            for (const mediaKey of showData.keys()) {
                const index = data.includes.media.findIndex(m => m.media_key === mediaKey);
                data.includes.media[index].url = showData.get(mediaKey)!;
            }

            return data;
        } else {
            return data;
        }
    }

    private async fetchTwitter(url: string): Promise<TweetLookupData | void> {
        let data;
        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + process.env.TWITTER_TOKEN
                }
            });
            data = await res.json();
        } catch (err) {
            return log(err, this.options.info.name);
        }

        return data;
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