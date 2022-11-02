import { Message, Interaction, CacheType, CommandInteraction, inlineCode } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";
import EmbedBuilder from "../structures/EmbedBuilder";

export default class Help extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'help',
                fullName: 'help',
                detail: '查詢指令用法及詳細資訊',
                alias: [],
                usage: ['help', 'help [command]'],
                example:
                    'i.help' + '\n' +
                    'i.help reply' + '\n',
                enable: true
            }
        })
    }

    public run(msg: Message | Interaction | CommandInteraction, args?: string[]): void {
        let embed: EmbedBuilder | undefined;
        if (args?.length === 1) {
            embed = new EmbedBuilder({
                title: '\\❔ 指令清單',
                description: `輸入 ${inlineCode('i.help [指令名]')} 取得更詳細的資訊。`,
                fields: [
                    {
                        name: '主要',
                        value: inlineCode('reply') + ' ' + inlineCode('info') + ' ' + inlineCode('help'),
                        inline: true
                    },
                    {
                        name: '伺服器',
                        value: inlineCode('afk'),
                        inline: true
                    },
                    {
                        name: '其他',
                        value: 
                            inlineCode('search') + ' ' +
                            inlineCode('play') + ' ' +
                            inlineCode('icon') + ' ' +
                            inlineCode('neko') + ' ' +
                            inlineCode('reurl')
                    }
                ]
            }).showVersion();
        }
        if (args?.length === 2 && this.client.commands.collection.has(args[1])) {
            const { options } = this.client.commands.collection.get(args![1])!;
            embed = new EmbedBuilder({
                title: options.info.fullName,
                description: options.info.detail,
                fields: [
                    {
                        name: '使用',
                        value: options.info.usage.join('\n') ?? 'N/A',
                        inline: false
                    },
                    {
                        name: '範例',
                        value: inlineCode(options.info.example ?? 'N/A'),
                        inline: false
                    }
                ]
            }).showVersion();
        }

        if (embed) msg.channel?.send({ embeds: [embed] });
    }
}