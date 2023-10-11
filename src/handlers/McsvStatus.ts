import { Collection, Message, MessageType, ThreadChannel } from "discord.js";
import { Client } from "../structures/Client.js";
import { Handler } from "../structures/Handler.js";
import EmbedBuilder from "../structures/EmbedBuilder.js";
import { loggerInit } from "../utils/logger.js";
import _ from "lodash";
import fetch from "node-fetch";
import { EventEmitter } from 'node:events';
const log = loggerInit('McsvStatus');

const pollingDelay = 5; //min

enum Status { UP = 'up', DOWN = 'down' }
enum ThreadTitle {
    UP = '🟢伺服器-線上',
    DOWN = '🔴伺服器-停止'
}

export default class McsvStatus extends Handler {
    private curStatus: Status = Status.DOWN;
    private threadCh: ThreadChannel | undefined;
    private detailMsg: Message | null = null;
    private lastSeen = new Collection<string, number>();

    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'mcsvStatus',
                fullName: 'mcsv狀態監控',
                detail: '監控Minecraft伺服器並將狀態顯示至Discord上',
                enable: true
            }
        })
    }

    public run(msg: Message<boolean>): void {}

    public async execute() {
        try {
            this.threadCh = await this.client.channels.fetch(process.env.MC_SERVER_STATUS_THREAD!) as ThreadChannel;
        } catch(err) {
            return log(err);
        }

        const server = new Server(process.env.MC_SERVER_HOST!);
        server.listen();
        log(`Start listening to ${process.env.MC_SERVER_HOST!}`);

        // Reuse last detail msg if bot restarted
        if (this.threadCh?.name.startsWith(ThreadTitle.UP.toString())) {
            log('Reusing last detail message.');
            const msgs = await this.threadCh.messages.fetch();

            this.detailMsg = 
                msgs
                    .filter(m => m.author.id === this.client.user?.id && m.type === MessageType.Default)
                    .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
                    .first()
                ?? null;
        }

        server.on('online', isOnline => {
            log('server online?: ' + isOnline);
      
            if (!isOnline) this.threadCh?.edit({ name: ThreadTitle.DOWN });
            if (this.threadCh?.name === ThreadTitle.DOWN.toString() && isOnline) this.threadCh?.edit({ name: ThreadTitle.UP });

            this.curStatus = isOnline ? Status.UP : Status.DOWN;
        });

        server.on('playerListChanged', async (players: MCStatusData["players"]) => {
            log('player list chnaged: ' + JSON.stringify(players, null, 2));

            const embed = this.makeDetailEmbed(players);

            if (this.detailMsg) {
                this.detailMsg.edit({ embeds: [embed] });
            } else {
                if (this.curStatus === Status.DOWN) return;
                this.detailMsg = await this.threadCh!.send({ embeds: [embed] });
            }

            this.threadCh?.edit({ name: `${ThreadTitle.UP} ${players.online}/${players.max}` });
        });
    }

    private makeDetailEmbed(players: MCStatusData["players"]) {
        const groupN = 3;

        return new EmbedBuilder({
            author: { name: '📄 伺服器資訊' },
            fields: [
                { name: '線上人數\u200b\u200b', value: `${players.online} / ${players.max}`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                {
                    name: '在線玩家',
                    value: players.list
                        .sort((a, b) => a.name_clean.localeCompare(b.name_clean, 'zh-TW'))
                        .map(p => `\`${p.name_clean}\``)
                        // .reduce((p: string[][], c, i) => {
                        //     if (i % groupN === 0) {
                        //         p.push([c]);
                        //     } else {
                        //         p[p.length - 1].push(c);
                        //     }
                        //     return p;
                        // }, []) 
                        // .map(g => g.join(', '))
                        .join('\n')
                        .slice(0, 1023)
                        || '無',
                    inline: true
                },
                {
                    name: '最後登入時間',
                    value: this.lastSeen
                        .sort((a, b) => b - a)
                        .map((v, k) => `\`${k}\` - <t:${v}:R>`)
                        .join('\n')
                        || '無',
                    inline: true
                },
                { name: '\u200b', value: `最後更新於<t:${Math.floor(Date.now() / 1000)}:R>` }
            ]
        });
    }
}

class Server extends EventEmitter {
    public online: boolean = false;
    public players: string[] = [];
    
    public constructor(private readonly host: string) {
        super();
        this.query().catch(log);
    }

    async query() {
        const res = await fetch(`https://api.mcstatus.io/v2/status/java/${this.host}`);
        return res.json();
    }

    async listen() {
        const loop = setTimeout(async () => {
            const data: MCStatusData = await this.query();
            const nwePlayers = data.players.list.map(p => p.name_clean).sort();

            if (this.online !== data.online) this.emit('online', data.online);
            if (
                this.players.length !== nwePlayers.length ||
                !this.players.every((v, i) => v === nwePlayers[i])
                ) {
                    this.emit('playerListChanged', data.players);
                }
            
            this.online = data.online;
            this.players = nwePlayers;

            loop.refresh();
        }, 1000 * 60 * pollingDelay);
    }
}

interface MCStatusData {
    online: boolean,
    host: string,
    port: number,
    eula_blocked: boolean,
    retrieved_at: number,
    expires_at: number,
    version: {
        name_raw: string,
        name_clean: string,
        name_html: string,
        protocal: number
    },
    players: {
        online: number,
        max: number,
        list: {
            uuid: string,
            name_raw: string,
            name_clean: string,
            name_html: string,
        }[],
    },
    motd: {
        raw: string,
        clean: string,
        html: string
    },
    icon: string,
    mods: {
        name: string,
        version: string
    }[],
    software: string,
    plugins: {
        name: string,
        version: string
    }[]
}