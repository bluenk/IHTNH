import { CommandInteraction, Message } from "discord.js";
import { Command } from "../structures/Command";
import fetch, { Response } from "node-fetch";
import { log } from "../utils/logger";
import { Client } from "../structures/Client";
import MessageEmbed from "../structures/MessageEmbed";

export default class Neko extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'neko',
                fullName: 'Nekos.moe隨機圖片',
                detail: '從Nekos.moe隨機抽取圖片。',
                usage: ['neko'],
                example: 'i.neko' + '\n' + '/neko',
                enable: true
            },
            commandOptions: [
                {
                    type: 'CHAT_INPUT',
                    name: 'neko',
                    description: '隨機獸耳娘圖'
                }
            ]
        })
    }

    public async run(msg: CommandInteraction | Message) {
        const embed = await this.getEmbed();
        if (!embed) return; 
        msg.reply({ embeds: [embed] });
    }

    private async getEmbed(): Promise<MessageEmbed | void> {
        let data;
        try {
            const res = await fetch('https://nekos.moe/api/v1/random/image?nsfw=false', {
                method: 'GET',
                headers: {
                    'User-Agent': 'IHTNH discordBot'
                }
            });
            data = await res.json();
        } catch (err) {
            return log(err, 'neko');
        }

        log('Received JSON from Nekos.moe', 'neko');

        const postURL = `https://nekos.moe/post/${data.images[0].id}`;
        const imgURL = `https://nekos.moe/image/${data.images[0].id}.jpg`;
        return new MessageEmbed()
            .setTitle('Click here to see the post')
            .setDescription(`artist: ${data.images[0].artist}`)
            .setImage(imgURL)
            .setFooter({ text: '圖片來自 Nekos.moe', iconURL: 'https://nekos.moe/static/favicon/favicon-32x32.png' })
            .setURL(postURL)       // set url to Title
    }
}


