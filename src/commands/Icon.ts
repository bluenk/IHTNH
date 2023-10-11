import { 
    ApplicationCommandOptionType,
    ApplicationCommandType,
    CommandInteraction,
    ContextMenuCommandInteraction,
    Message,
    User
} from "discord.js";
import { Client } from "../structures/Client.js";
import { Command } from "../structures/Command.js"

export default class Icon extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'icon',
                fullName: '檢視頭像',
                detail: '放大顯示使用者的頭像。',
                category: 'others',
                alias: ['pfp', 'avatar'],
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
                    type: ApplicationCommandType.ChatInput,
                    name: 'icon',
                    description: '檢視頭像',
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'user',
                            description: '目標使用者'
                        }
                    ]
                },
                {
                    type: ApplicationCommandType.User,
                    name: '檢視頭像'
                }
            ]
        })
    }

    run(msg: Message | CommandInteraction | ContextMenuCommandInteraction) {
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
            ephemeral: msg instanceof ContextMenuCommandInteraction
        });
    }

    private getIcon(user: User): string {
        return user.avatarURL({ size: 2048 }) || '';
    }
}