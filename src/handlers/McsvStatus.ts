import { Collection, Message, ThreadChannel } from "discord.js";
import { Client } from "../structures/Client";
import { Handler } from "../structures/Handler";
import MessageEmbed from "../structures/MessageEmbed";
import * as util from "minecraft-server-util";
import { FullQueryResponse } from "minecraft-server-util";
import { log } from "../utils/logger";
import _ from "lodash";
import dns from "dns";
import { promisify } from 'util';
const dnsResolve = promisify(dns.resolve);

const fetchDelay = 1; //min

enum Status { UP = 'up', DOWN = 'down' }

export default class McsvStatus extends Handler {
    private curStatus: Status = Status.DOWN;
    private preStatus: Status = Status.DOWN;
    private curDetail: FullQueryResponse | undefined;
    private perDetail: FullQueryResponse | undefined;
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
            return log(err , this.options.info.name);
        }

        this.checkStatus();
    }
    
    private async checkStatus() {
        const host = process.env.MC_SERVER_HOST!;
        const reverseProxyHost = process.env.MC_REVERSE_PROXY_HOST!;
        const options = {
            timeout: 1000 * 15,
            enableSRV: false
        };
        
        try {
            const status = await util.status(host, 25565, options);
            const query = await util.queryFull(host, 25565, options).catch(console.error) ?? undefined;

            // Check the server IP to offset the difference in latency between clitnt and player.
            // If serverIP equal to reverseProxyIP => Reverse proxy, add about 45ms(proxy to player RTT)*.
            // * Cilent and Proxy are on the same machine.
            // Using proxy:     player <──45ms + localLatency──> proxy/client <──45ms + localLatency──> server
            // Not using proxy: player <──localLatency──> server, clint <──45ms + localLatency──> server
            let offset = 0;
            if (reverseProxyHost) {
                try {
                    const serverIP = await dnsResolve(host);
                    const reverseProxyIP = await dnsResolve(process.env.MC_REVERSE_PROXY_HOST!);
                    
                    offset = serverIP[0] === reverseProxyIP[0] ? 45 : -45 ;
                } catch (err) {
                    console.error(err);
                }
            }

            this.handleStatus(Status.UP, query, status.roundTripLatency + offset);
        } catch(err: any) {
            this.handleStatus(Status.DOWN);

            if (err.message === 'Socket closed unexpectedly while waiting for data') return;
            if (err.message === 'Timed out while retrieving server status') return;
            console.error(err);
        }
    }
    
    private async handleStatus(newStatus: Status, detail?: FullQueryResponse, latency?: number) {
        setTimeout(() => this.checkStatus(), 1000 * 60 * fetchDelay);

        this.preStatus = this.curStatus;
        this.curStatus = newStatus;
        this.perDetail = this.curDetail;
        this.curDetail = detail;

        // Edit thread title when server status changes.
        if (this.preStatus !== this.curStatus) {
            if (this.threadCh?.archived) {
                await this.threadCh.setArchived(false);
            }

            if (this.curStatus === Status.UP) {
                await this.threadCh?.edit({ name: '🟢伺服器狀態-線上 ' });
            } else {
                this.threadCh?.edit({ name: '🔴伺服器狀態-停止 ' });
                this.detailMsg?.delete();
                this.detailMsg = null;
                this.lastSeen.clear();
            }

            log(`Server is ${this.curStatus} now.`, this.options.info.name);
        }

        // Update embed when player list changes.
        const prePlayers = this.perDetail?.players.list.sort((a, b) => a.localeCompare(b));
        const curPlayers = this.curDetail?.players.list.sort((a, b) => a.localeCompare(b));
        if (!_.isEqual(prePlayers, curPlayers)) {
            const logout = this.perDetail?.players.list.filter(p => !this.curDetail?.players.list.includes(p)) ?? [];
            const login = this.curDetail?.players.list.filter(p => !this.perDetail?.players.list.includes(p)) ?? [];
            // console.log({ logout, login });

            for (const player of login) {
                if (this.lastSeen.has(player)) this.lastSeen.delete(player);
            }
            for (const player of logout) {
                this.lastSeen.set(player, Math.floor(Date.now() / 1000));
            }

            const embed = this.makeDetailEmbed(latency!, detail);

            if (this.detailMsg) {
                this.detailMsg.edit({ embeds: [embed] });
            } else {
                if (this.curStatus === Status.DOWN) return;
                this.detailMsg = await this.threadCh!.send({ embeds: [embed] });
            }
        }
    }

    private makeDetailEmbed(latency: number, detail?: FullQueryResponse) {
        const groupN = 3;
        const latencyIndicator =
            latency >= 150
                ? '\\🔴'
                : latency >= 120
                    ? '\\🟠'
                    : latency >= 80
                        ? '\\🟡'
                        : latency >= 30
                            ? '\\🟢'
                            : '\\🔵';

        return new MessageEmbed({
            author: { name: '📄 伺服器資訊' },
            fields: [
                { name: '線上人數\u2800\u2800', value: `${detail?.players.online} / ${detail?.players.max}`, inline: true },
                { name: '延遲', value:  `${latencyIndicator} ${latency}ms`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                {
                    name: '在線玩家',
                    value: detail?.players.list
                        .sort((a, b) => a.localeCompare(b, 'zh-TW'))
                        .map(p => `\`${p}\``)
                        .reduce((p: string[][], c, i) => {
                            if (i % groupN === 0) {
                                p.push([c]);
                            } else {
                                p[p.length - 1].push(c);
                            }
                            return p;
                        }, [])
                        .map(g => g.join(', '))
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