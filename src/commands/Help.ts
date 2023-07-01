import { Message, Interaction, CommandInteraction, inlineCode, codeBlock } from "discord.js";
import { Client } from "../structures/Client.js";
import { Command } from "../structures/Command.js";
import EmbedBuilder from "../structures/EmbedBuilder.js";

export default class Help extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'help',
                fullName: 'help',
                detail: '查詢指令用法及詳細資訊',
                category: 'core',
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
        const commands = this.client.commands.collection;
        const coreModules = commands.filter(m => m.options.info.category === 'core');
        const guildModules = commands.filter(m => m.options.info.category === 'guild');
        const otherModules = commands.filter(m => m.options.info.category === 'others');

        if (args?.length === 1) {
            embed = new EmbedBuilder({
                title: '\\❔ 指令清單',
                description: `輸入 ${inlineCode('i.help [指令名]')} 取得更詳細的資訊。`,
                fields: [
                    {
                        name: '核心功能',
                        value: coreModules.map(m => inlineCode(m.options.info.name)).join('\n'),
                        inline: true
                    },
                    {
                        name: '伺服器',
                        value: guildModules.map(m => inlineCode(m.options.info.name)).join('\n'),
                        inline: true
                    },
                    {
                        name: '其他',
                        value: otherModules.map(m => inlineCode(m.options.info.name)).join('\n'),
                        inline: true
                    }
                ]
            }).showVersion();
        }
        if (args?.length === 2 && commands.some(c => [c.options.info.name, ...c.options.info.alias].includes(args[1]))) {
            const { options } = commands.find(c => [c.options.info.name, ...c.options.info.alias].includes(args[1]))!;
            embed = new EmbedBuilder({
                title: options.info.fullName,
                description: options.info.detail,
                fields: [
                    {
                        name: '別名',
                        value: options.info.alias.map(a => inlineCode(a)).join(' ') || '無'
                    },
                    {
                        name: '使用',
                        value: options.info.usage.join('\n') || 'N/A',
                    },
                    {
                        name: '範例',
                        value: inlineCode(options.info.example || 'N/A'),
                    }
                ]
            }).showVersion();
        }

        if (embed) msg.channel?.send({ embeds: [embed] });
    }
}