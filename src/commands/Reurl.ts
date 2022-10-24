import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ChatInputCommandInteraction,
    ContextMenuCommandInteraction,
    DMChannel,
    Interaction,
    Message,
    TextChannel,
    ThreadChannel
} from "discord.js";
import fetch from "node-fetch";
import { Command } from "../structures/Command";
import { log } from "../utils/logger";
import { Client } from "../structures/Client";
import EmbedBuilder from "../structures/EmbedBuilder";

export default class Reurl extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'reurl',
                fullName: 'reurl縮網址產生器',
                detail: '透過reurl.cc產生縮網址。',
                usage: ['reurl'],
                example:
                    'i.reurl https://www.google.com/' + '\n' +
                    '/reurl url:https://www.google.com/',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'reurl',
                    description: '縮網址',
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'url',
                            description: '要轉換的網址',
                            required: true
                        }
                    ]
                },
                {
                    type: ApplicationCommandType.Message,
                    name: '產生縮網址'
                }
            ]
        })
    }

    public async run(msg: Interaction | Message, args: string[]) {
        if (msg instanceof ChatInputCommandInteraction) {
            const url = msg.options.getString('url')!;
            if (!this.isURL(url)) return msg.reply('\\❌ | 未收到URL，請確認是否輸入正確？');

            const embed = await this.makeURL(url);
            if (!embed) return;

            msg.reply({ embeds: [embed], ephemeral: true });
        }
        if (msg instanceof ContextMenuCommandInteraction) {
            const targetMsg = await msg.channel?.messages.fetch(msg.targetId);
            // console.log({ msg, targetMsg })
                // .then(channel => {
                //     if (
                //         channel instanceof TextChannel ||
                //         channel instanceof ThreadChannel ||
                //         channel instanceof DMChannel
                //     ) {
                //         return channel.messages.fetch(msg.id);
                //     }
                // });
            if (!targetMsg) return msg.reply('未取得到網址，可能已被刪除或權限不足。');
            const urls = targetMsg.content.match(/\bhttps?:\/\/\S+/gi);
            if (!urls) return;

            const embed = await this.makeURL(urls[0]);
            if (!embed) return; 

            msg.reply({ embeds: [embed], ephemeral: true });
        }
        if (msg instanceof Message) {
            if (!args?.length) return;
            if (!args[1]) return msg.channel.send('⚠️ | 沒有提供網址!');
            if (!args[1].startsWith('http')) return msg.channel.send('⚠️ | 沒有提供網址!');

            const embed = await this.makeURL(args[1]);
            if (!embed) return; 
            if (msg.member) embed.setFooter({ text: `由使用者 ${msg.member.displayName} 所發送的網址` });

            msg.channel.send({ embeds: [embed] });
            msg.delete();
        }
    }

    private async makeURL(url: string) {
        let data;
        try {
            const res = await fetch('https://api.reurl.cc/shorten', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'reurl-api-key': process.env.REURL_TOKEN!
                },
                body: JSON.stringify({ url })
            });
            data = await res.json();
        } catch (err) {
            return log(err, 'reurl');
        }

        if (!('res' in data)) return log("Missing 'res' property in response data.", 'reurl');
        if (data.res !== 'success') return log('Resopnse status: ' + data.res, 'reurl');

        return new EmbedBuilder({ description: data.short_url });
    }
}

