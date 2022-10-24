import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction, PermissionsBitField } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";

export default class Say extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'say',
                fullName: '代理發言',
                detail: '使用bot發送匿名訊息',
                usage: ['say'],
                example: '/say message:Hello World!',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'say',
                    description: '代理發言',
                    defaultMemberPermissions: PermissionsBitField.Flags.ManageGuild,
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'message',
                            description: '內容',
                            required: true
                        }
                    ]
                }
            ]
        });
    }

    public async run(msg: ChatInputCommandInteraction, args?: string[]) {
        const content = msg.options.getString('message')!;
        await msg.channel?.send({ content });
        msg.reply({ content: '\\✔️ | 已發送！', ephemeral: true, allowedMentions: { repliedUser: false } });
    }
}