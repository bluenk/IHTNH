import { Message, Interaction, CacheType, CommandInteraction, ApplicationCommandOptionChoice } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command"
import MessageEmbed from "../structures/MessageEmbed";

export default class Timestamp extends Command{
    public constructor(client: Client) {
        super(client, {
            info: {
                name: 'timestamp',
                fullName: 'Discord timestamp 產生器',
                detail: '轉換時間成Discord timestamp',
                usage: ['timestamp'],
                example: '/timestamp yyyy:2022 mm:06 dd:13 hh:15 min:26',
                enable: true
            },
            commandOptions: [
                {
                    type: 'CHAT_INPUT',
                    name: 'timestamp',
                    description: '產生 Discord Timestamp',
                    options: [
                        { type: 'INTEGER', name: 'year', description: '年分', required: true },
                        { 
                            type: 'INTEGER',
                            name: 'month',
                            description: '月分',
                            required: true,
                            choices: makeNumberOptions(1, 12)
                        },
                        { 
                            type: 'INTEGER',
                            name: 'day',
                            description: '日(0~31)',
                            required: true,
                        },
                        { 
                            type: 'INTEGER',
                            name: 'hour',
                            description: '小時(24小時制)',
                            required: true,
                            choices: makeNumberOptions(0, 23)
                        },
                        { 
                            type: 'INTEGER',
                            name: 'min',
                            description: '分鐘(0~59)',
                            required: true,
                        }
                    ]
                }
            ]
        });
    }

    public run(msg: Message<boolean> | Interaction<CacheType> | CommandInteraction<CacheType>, args?: string[] | undefined): void {
        if (!(msg instanceof CommandInteraction)) return;

        const year = msg.options.getInteger('year');
        let month = paddingLeft(msg.options.getInteger('month')!);
        let day = paddingLeft(msg.options.getInteger('day')!);
        let hour = paddingLeft(msg.options.getInteger('hour')!);
        let min = paddingLeft(msg.options.getInteger('min')!);

        const time = new Date(`${year}-${month}-${day}T${hour}:${min}:00`).getTime() / 1000;
        
        const embed = new MessageEmbed({
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

const makeNumberOptions = (start: number, end: number): ApplicationCommandOptionChoice[] => {
    const arr: ApplicationCommandOptionChoice[] = [];
    for (let i = start; i <= end; i++) {
        arr.push({ name: i.toString(), value: i });
    }
    return arr;
}

const paddingLeft = (number: number) => {
    return number < 10 ? '0' + number : number;
}