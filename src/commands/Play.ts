import { Message, Interaction, CacheType, CommandInteraction } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";

export default class Play extends Command {
    constructor(client: Client) {
        super(client, {
            info: {
                name: 'play',
                fullName: '音樂播放機',
                detail: '在使用者當前的語音頻道撥放音樂，目前僅支援Youtube網址。',
                usage: ['play'],
                example: 'i.play https://youtu.be/dQw4w9WgXcQ',
                enable: false
            }
        });
    }

    public run(msg: Message | Interaction| CommandInteraction, args?: string[]): void {
        
    }
}