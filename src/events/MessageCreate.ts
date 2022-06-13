import { Message } from "discord.js";
import { log } from "../utils/logger";
import ReplyDb from "../models/ReplyDb";
import { Client } from "../structures/Client";
import { Event } from "../structures/Event";
import random from "../utils/random";

export default class MessageCreate extends Event {
    public constructor(client: Client) {
        super(client, 'messageCreate');
    }

    public async execute(msg: Message) {
        // console.log(msg);
        if (msg.author.bot) return;

        let hasPrefix = false;
        let hasAttachments = false;
        if (msg.content.startsWith(process.env.NODE_ENV === 'pro' ? 'i.' : 'i,')) hasPrefix = true;
        if (msg.attachments.size) hasAttachments = true;

        const args = msg.content.substring(2).split(' ');

        // if (hasPrefix && args[0] === 'ping') {
        //     msg.reply('pong!');
        // }

        // Handle prefix commands.
        if (hasPrefix && this.client.commands.collection.has(args[0].toLowerCase())) {
            log(`User ${msg.author.tag} has triggered the ${args[0]} command.`, this.name);
            const command = this.client.commands.collection.get(args[0].toLowerCase());
            if (command?.options.info.enable) {
                command.run(msg, args);
            } else {
                msg.reply('\\⛔ | 此指令目前停用中');
            }
        }
        
        // Hnadle keyword reply. 
        if (!msg.inGuild()) return;
        const { model } = new ReplyDb(this.client, msg.guildId);
        const res = await model.findOneAndUpdate({ keyword: msg.content }, { $inc: { count: 1 } });
        if (res) {
            log(`Keyword '${res.keyword}' matched.`);
            const img = res.response[random(0, res.response.length - 1)].url;
            const sended = await msg.channel.send(img);

            setTimeout(() => {
                if (!sended.embeds.length) {
                    log('Imgur link preview failed, fallback to upload method.');
                    sended.edit({ content: ' ', files: [img] });
                }
            }, 1500)
        }

        // AntiScam url check and PreviewFix.
        const hasUrl = msg.content.match(/(https?:\/\/[^ ]*)/g);
        const urlHandlers = ['antiScam', 'previewFix'];
        if (hasUrl) {
            for (const name of urlHandlers) {
                this.client.handlers.collection.get(name)?.run(msg);
            }
        }
    }
}