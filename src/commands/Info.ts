import { CommandInteraction, Message } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";
import MessageEmbed from "../structures/MessageEmbed";

export default class Info extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'info',
                fullName: 'bot詳細資訊',
                detail: '可查看目前啟用的指令。',
                usage: ['info'],
                example: 'i.info' + '\n' + '/info',
                enable: true
            },
            commandOptions: [
                {
                    type: 'CHAT_INPUT',
                    name: 'info',
                    description: '關於bot'
                }
            ]
        })
    }

    public run(msg: CommandInteraction | Message) {
        if (msg instanceof CommandInteraction) {
            msg.reply({ embeds: [this.makeEmbed()] });
        }
        if (msg instanceof Message) {
            msg.channel.send({ embeds: [this.makeEmbed()] });
        }
    }

    private makeEmbed() {
        const commands = this.client.commands.collection;
        const handlers = this.client.handlers.collection;

        let availableCmd: string[] = [];
        let unavailableCmd: string[] = [];
        let availableHandlers: string[] = [];
        let unavailableHandlers: string[] = [];

        for (const command of commands.values()) {
            const { enable, name } = command.options.info;
            if (enable) {
                availableCmd.push(name);
            } else {
                unavailableCmd.push(name);
            }
        }

        // console.log({availableCmd, unavailableCmd})

        for (const handler of handlers.values()) {
            const { enable, name } = handler.options.info;
            if (enable) {
                availableHandlers.push(name);
            } else {
                unavailableHandlers.push(name);
            }
        }

        const uptime = Math.floor(process.uptime());
        const appUptime = Math.floor(uptime / 24 / 3600) + ' days ' + Math.floor(uptime / 3600 % 60) + ' hr ' + Math.floor(uptime / 60 % 60) + ' min ' + uptime % 60 + ' sec';

        return new MessageEmbed()
            .setThumbnail(this.client.user?.avatarURL() ?? '')
            .setTitle('\\📄 詳細資訊')
            // .addField('運行時間', appUptime, false)
            .addField('指令狀態', [...availableCmd.map(n => '[\\✔️] ' + n), ...unavailableCmd.map(n => '[\\❌] ' + n)].join('\n'), true)
            .addField('指令狀態', [...availableHandlers.map(n => '[\\✔️] ' + n), ...unavailableHandlers.map(n => '[\\❌] ' + n)].join('\n'), true)
            // .addField('觸發詞數量',client.replyData ? client.replyData.length.toString() : '', true)
            .showVersion();
    }
}