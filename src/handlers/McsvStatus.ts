import { Message, ThreadChannel } from "discord.js";
import { Client } from "../structures/Client";
import { Handler } from "../structures/Handler";
import * as util from 'minecraft-server-util';
import { log } from "../utils/logger";

enum Status { UP, DOWN }

export default class McsvStatus extends Handler {
    private curStatus: Status = Status.DOWN;
    private preStatus: Status = Status.DOWN;
    private threadCh: ThreadChannel | undefined;


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
            this.threadCh = await this.client.channels.fetch('919479047736659998') as ThreadChannel;
        } catch(err) {
            return log(err , this.options.info.name);
        }
        this.checkStatus();
    }
    
    private checkStatus() {
        const options = {
            timeout: 1000 * 15,
            enableSRV: false
        };
        
        util.status(process.env.MC_SERVER_HOST!, 25565, options)
            .then((result) => {
                // console.log(result.players)
                if (result.players.online) {
                    const players = result.players.sample?.map((player) => {
                        return player.name;
                    });
                    log('Online players: ' + players?.sort((a, b) => a.localeCompare(b)), this.options.info.name);
                }
                this.handleEvent(Status.UP);
            })
            .catch((err) => {
                this.handleEvent(Status.DOWN);
                if (err.message === 'Socket closed unexpectedly while waiting for data') return;
                if (err.message === 'Timed out while retrieving server status') return;
                console.error(err);
            });

        setTimeout(() => this.checkStatus(), 1000 * 60 * 1)
    }

    private async handleEvent(newStatus: Status) {
        this.preStatus = this.curStatus;
        this.curStatus = newStatus;

        // If status has changed.
        if (this.preStatus !== this.curStatus) {
            if (this.threadCh?.archived) {
                await this.threadCh.setArchived(false);
            }

            if (this.curStatus ===  Status.UP) {
                this.threadCh?.edit({ name: '🟢伺服器狀態-線上 ' });
                // threadCh.lastMessage.reply('test')
            } else {
                this.threadCh?.edit({ name: '🔴伺服器狀態-停止 ' });
            }
        }
    }
}