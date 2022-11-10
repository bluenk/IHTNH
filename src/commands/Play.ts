import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    DiscordGatewayAdapterCreator,
    joinVoiceChannel,
    VoiceConnection,
    VoiceConnectionStatus
} from "@discordjs/voice";
import {
    Message,
    CommandInteraction,
    Collection,
    ActionRowBuilder,
    ButtonBuilder,
    InteractionUpdateOptions,
    MessageEditOptions,
    ApplicationCommandType,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    ButtonStyle,
    Colors,
    ButtonComponent
} from "discord.js";
import ytdl, { videoInfo } from "ytdl-core";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";
import EmbedBuilder from "../structures/EmbedBuilder";
import { log } from "../utils/logger";
import { EventEmitter } from "events";

enum ErrorMsg {
    URL_MISSING = '缺少網址。',
    URI_INCORRECT = '網址不正確。',
    USER_VOICE_NOT_CONNCETED = '請先加入語音頻道。'
}
type ErrorMsgType = keyof typeof ErrorMsg;

export default class Play extends Command {
    private servers: Collection<
        string,
        {
            conn: VoiceConnection,
            queue: { url: string, info: ytdl.videoInfo}[],
            queueStatus: EventEmitter
        }
        > = new Collection();

    constructor(client: Client) {
        super(client, {
            info: {
                name: 'play',
                fullName: '音樂播放機',
                detail: '在使用者當前的語音頻道撥放音樂，目前僅支援Youtube網址。',
                category: 'others',
                alias: ['p'],
                usage: ['play'],
                example:
                    'i.play https://youtu.be/dQw4w9WgXcQ' + '\n' +
                    '/play url:https://youtu.be/dQw4w9WgXcQ',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'play',
                    description: 'Youtube音樂播放',
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'url',
                            description: 'Youtube影片網址',
                            required: true
                        }
                    ]
                }
            ]
        });
    }

    public async run(msg: Message | ChatInputCommandInteraction, args?: string[]) {
        let url: string | undefined;
        let isPlaying = false;
        let replyMsg: Message;

        if (msg instanceof Message) {
            if (!msg.inGuild()) return;
        } else {
            if (!msg.inCachedGuild()) return;
        }
        
        if (this.servers.has(msg.guildId)) {
            replyMsg = await msg.reply({
                content: '確認網址中...',
                fetchReply: true,
                allowedMentions: { repliedUser: false }
            }) as Message;
            
            isPlaying = true;
        } else {
            replyMsg = await msg.reply({
                content: '指令已啟動，處理中...',
                fetchReply: true,
                allowedMentions: { repliedUser: false }
            }) as Message;
            
            this.replyMsg.set(msg.id, replyMsg);
        }
        if (!replyMsg) return;
        
        if (msg instanceof Message) {
            if (args === undefined || args!.length < 2) return replyMsg.edit({ content: this.sendErr('URL_MISSING') });
            // if (!this.isURL(args[1])) return replyMsg.edit({ content: this.sendErr('URI_INCORRECT') });

            url = args[1];
        }

        if (msg instanceof ChatInputCommandInteraction) {
            url = msg.options.getString('url')!;
        }
        
        if (url && !ytdl.validateURL(url)) return replyMsg.edit(this.sendErr('URI_INCORRECT'));
        if (!msg.member?.voice.channelId) return replyMsg.edit({ content: this.sendErr('USER_VOICE_NOT_CONNCETED') })
        if (isPlaying) {
            if (url) replyMsg.edit({ content: '\\✔️ | 已加入播放清單！' });
            setTimeout(() => {
                    if (msg instanceof Message) msg.delete();
                    replyMsg.delete();
            }, 5000);
        }

        this.play(url!, msg, replyMsg);
    }

    private async play(url: string, msg: Message<true> | CommandInteraction<'cached'>, replyMsg: Message) {
        const info = await ytdl.getBasicInfo(url);
        const queueItem = { url, info };

        if (!this.servers.has(msg.guildId)) {
            this.servers.set(msg.guildId, {
                conn: joinVoiceChannel({
                    channelId: msg.member?.voice.channelId!,
                    guildId: msg.guildId,
                    adapterCreator: msg.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator // Temporary fix for not assignable issue.
                }),
                queue: [queueItem],
                queueStatus: new EventEmitter()
            });
        } else {
            const current = this.servers.get(msg.guildId)!;
            current.queue.push(queueItem);
            current.queueStatus.emit('queueChange');
            this.servers.set(msg.guildId, current);
            return;
        }

        const { conn, queue } = this.servers.get(msg.guildId)!;

        const player = createAudioPlayer();
        this.handleMenu(replyMsg, player);
        conn.subscribe(player);
        player.play(this.makeAudioRes(url));
        
        // player.on<'stateChange'>('stateChange', (oldState, newState) => {
        //     console.log(`[${msg.guildId}-stateChange]: ` + oldState.status + ' -> ' + newState.status);
        //     if (oldState.status === AudioPlayerStatus.Playing &&
        //         newState.status === AudioPlayerStatus.Idle) {
                    
        //     }
        // });
        
        player.on(AudioPlayerStatus.Idle, () => {
            const current = this.servers.get(msg.guildId)!;
            current.queue.shift();

            if (!current.queue.length) {
                conn.disconnect();
                return;
            }
            
            player.play(this.makeAudioRes(current.queue[0].url));
            this.servers.set(msg.guildId, current);
        })

        conn.once(VoiceConnectionStatus.Disconnected, async () => {
            log('voice connrction disconnected.', this.options.info.name);
            const menu = await replyMsg.fetch();

            replyMsg.edit({
                embeds: [
                    EmbedBuilder.from(menu.embeds[0]).setAuthor({ name: '已結束播放' })
                ],
                components: [
                    new ActionRowBuilder<ButtonBuilder>({  
                        components: menu.components[0].components.map((b, i) => ButtonBuilder.from(b as ButtonComponent).setDisabled(i < 2))
                    })
                ]
            });

            player.stop(true);
            conn.destroy();
            this.servers.delete(conn.joinConfig.guildId);
        })

        // console.log(this.servers.get(msg.guildId)?.queue);
    }

    private async handleMenu(msg: Message, player: AudioPlayer) {
        const btns = [
            new ButtonBuilder({
                customId: 'pause',
                label: '暫停',
                style: ButtonStyle.Primary,
                emoji: '<:pauseButton:877416903327506513>'
            }),
            new ButtonBuilder({
                customId: 'skip',
                label: '跳過',
                style: ButtonStyle.Primary,
                emoji: '<:skipButton:877419859586216019>'
            }),
        ];
        const btnRow = new ActionRowBuilder<ButtonBuilder>({ components: btns });

        const embed = new EmbedBuilder({
            title:  '📡 緩衝中...',
            color: Colors.DarkGrey
        })

        const options: MessageEditOptions =  { embeds: [embed], components: [btnRow], content: ' ' };

        
        const menu = await msg.edit({...options, allowedMentions: { repliedUser: false }});
        const collector = menu.createMessageComponentCollector();
        
        // Hendle menu interaction.
        collector.on('collect', (i) => {
            const updateOptions: InteractionUpdateOptions = {};

            switch (i.customId) {
                case 'pause':
                    btns.splice(0, 1, btns[0].setLabel('繼續').setCustomId('resume').setEmoji('<:playButton:877415426420776970>'));
                    player.pause();
                    break;
                    
                case 'resume':
                    btns.splice(0, 1, btns[0].setLabel('暫停').setCustomId('pause').setEmoji('<:pauseButton:877416903327506513>'));
                    player.unpause();
                    break;

                case 'skip':
                    player.stop(true);
                    break;
            }

            const newBtnRow = new ActionRowBuilder<ButtonBuilder>({ components: btns });
            updateOptions.components = [newBtnRow];

            i.update(updateOptions);
        });

        player.on(AudioPlayerStatus.Playing, async () => {
            const { queue } = this.servers.get(msg.guildId!)!;
            const { videoDetails } = queue[0].info;
            
            const menuEmbed = new EmbedBuilder({
                author: { name: '正在播放' },
                title: videoDetails.title,
                description: videoDetails.author.name,
                fields: [
                    {
                        name: '總時長', 
                        value: new Date(parseInt(videoDetails.lengthSeconds) * 1000)
                            .toISOString()
                            .slice(11, 19)
                            .replace(/^[0:]+/, ""),
                            inline: true
                    },
                    {
                        name: '觀看次數',
                        value: Number(videoDetails.viewCount).toLocaleString('zh-TW'),
                        inline: true
                    },
                    {
                        name: '發布日期',
                        value: videoDetails.publishDate,
                        inline: true
                    }
                ],
                thumbnail: videoDetails.thumbnails[0]
            });

            const listEmbed = new EmbedBuilder({
                author: { name: '播放清單' },
                description: this.makePlayList(queue)
            });
            
            menu.edit({ embeds: [menuEmbed, listEmbed] });
        });

        // Update queue embed.
        const { queueStatus } = this.servers.get(msg.guildId!)!;

        queueStatus.on('queueChange', async () => {
            const { queue } = this.servers.get(msg.guildId!)!;
            const newMenu = await menu.fetch();
            // console.log(`[${menu.guildId}-queueUpdate]: `, queue);

            const updatedListEmbed = EmbedBuilder.from(newMenu.embeds[1]).setDescription(this.makePlayList(queue));

            newMenu.edit({ embeds: [newMenu.embeds[0], updatedListEmbed] });
        })
    }

    private makeAudioRes(url: string) {
        const ytRes = ytdl(url, { filter: f => f.audioCodec === 'opus', highWaterMark: 1 << 26 });
        return createAudioResource(ytRes);
    }

    private makePlayList(queue: {url: string, info: videoInfo}[]) {
        return queue.map((t, i) => `${i === 0 ? 'ᐅ ' : '　'}[${t.info.videoDetails.title}](${t.url})`).join('\n');
    }

    private sendErr(message: ErrorMsgType) {
        return '\\❌ | ' + ErrorMsg[message];
    }
}