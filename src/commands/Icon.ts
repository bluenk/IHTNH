import { CommandInteraction, ContextMenuInteraction, Interaction, Message, User } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command"

export default class Icon extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'icon',
                fullName: '檢視頭像',
                detail: '放大顯示使用者的頭像。',
                usage: ['icon'],
                example:
                    'i.icon' + '\n' +
                    'i.icon @uesr' + '\n' +
                    '/icon' + '\n' +
                    '/icon user:@user',
                enable: true
            },
            commandOptions: [
                {
                    type: 'CHAT_INPUT',
                    name: 'icon',
                    description: '檢視頭像',
                    options: [
                        {
                            type: 'STRING',
                            name: 'user',
                            description: '目標使用者'
                        }
                    ]
                },
                {
                    type: 'USER',
                    name: '檢視頭像'
                }
            ]
        })
    }

    run(msg: Message | CommandInteraction | ContextMenuInteraction) {
        let user: User;
        if (msg instanceof Message) {
            user = msg.mentions.users.first() ?? msg.author;
        } else {
            user = msg.options.getUser('user') ?? msg.user;
        }

        if (!user) return;
        const url = this.getIcon(user);
        msg.reply({
            ...(url ? { files: [url] } : { content: '\\❌ | 這位使用者並沒有設定大頭貼' }),
            ephemeral: msg instanceof ContextMenuInteraction
        });
    }

    private getIcon(user: User): string {
        return user.avatarURL({ size: 2048, dynamic: true }) || '';
    }
}