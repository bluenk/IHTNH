import { CommandInteraction } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";

export default class Say extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'say',
                fullName: '代理發言',
                detail: '使用bot發送匿名訊息',
                usage: ['say'],
                example: '/say message:Hello World!',
                enable: true
            },
            commandOptions: [
                {
                    type: 'CHAT_INPUT',
                    name: 'say',
                    description: '代理發言',
                    defaultPermission: false,
                    options: [
                        {
                            type: 'STRING',
                            name: 'message',
                            description: '內容',
                            required: true
                        }
                    ]
                }
            ]
        });
    }

    public run(msg: CommandInteraction, args?: string[]): void {
        
    }
}