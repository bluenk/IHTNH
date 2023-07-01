import { Message, Interaction, CacheType, CommandInteraction, ApplicationCommandOptionChoiceData, ApplicationCommandType, ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { Client } from "../structures/Client.js";
import { Command } from "../structures/Command.js"
import EmbedBuilder from "../structures/EmbedBuilder.js";

export default class Timestamp extends Command{
    public constructor(client: Client) {
        super(client, {
            info: {
                name: 'timestamp',
                fullName: 'Discord timestamp 產生器',
                detail: '轉換時間成Discord timestamp',
                category: 'others',
                alias: [],
                usage: ['timestamp'],
                example: '/timestamp yyyy:2022 mm:06 dd:13 hh:15 min:26',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'timestamp',
                    description: '產生 Discord Timestamp',
                    options: [
                        { type: ApplicationCommandOptionType.Integer, name: 'year', description: '年分', required: true },
                        { 
                            type: ApplicationCommandOptionType.Integer,
                            name: 'month',
                            description: '月分(01~12)',
                            required: true
                        },
                        { 
                            type: ApplicationCommandOptionType.Integer,
                            name: 'day',
                            description: '日(0~31)',
                            required: true
                        },
                        { 
                            type: ApplicationCommandOptionType.Integer,
                            name: 'hour',
                            description: '小時(24小時制|0~23)',
                            required: true
                        },
                        { 
                            type: ApplicationCommandOptionType.Integer,
                            name: 'min',
                            description: '分鐘(0~59)',
                            required: true
                        }
                    ]
                }
            ]
        });
    }

    public run(msg: ChatInputCommandInteraction, args?: string[] | undefined): void {
        if (!(msg instanceof CommandInteraction)) return;

        const year = msg.options.getInteger('year');
        let month = paddingLeft(msg.options.getInteger('month')!);
        let day = paddingLeft(msg.options.getInteger('day')!);
        let hour = paddingLeft(msg.options.getInteger('hour')!);
        let min = paddingLeft(msg.options.getInteger('min')!);

        const time = new Date(`${year}-${month}-${day}T${hour}:${min}:00+0800`).getTime() / 1000;
        
        const embed = new EmbedBuilder({
            author: { name: 'Discoed Timestamps' },
            fields: [
                { name: `\`<t:${time}>\``, value: `<t:${time}>`, inline: true },
                { name: `\`<t:${time}:R>\``, value: `<t:${time}:R>`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: `\`<t:${time}:D>\``, value: `<t:${time}:D>`, inline: true },
                { name: `\`<t:${time}:T>\``, value: `<t:${time}:T>`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: `\`<t:${time}:d>\``, value: `<t:${time}:d>`, inline: true },
            ]
        });

        msg.reply({ embeds: [embed], ephemeral: true })
    }
}

const paddingLeft = (number: number) => {
    return number < 10 ? '0' + number : number;
}