import { DiscordTogether } from "discord-together";
import { CommandInteraction } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";

export default class Together extends Command {
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'together',
                fullName: 'Together活動產生器',
                detail: '在語音頻道和其他使用者一起使用App',
                usage: ['together youtube'],
                example: '/together app:youtube',
                enable: true
            },
            commandOptions: [
                {
                    type: 'CHAT_INPUT',
                    name: 'together',
                    description: '建立聊天室活動',
                    options: [
                        {
                            type: 'STRING',
                            name: 'app',
                            description: '要執行的app',
                            required: true,
                            choices: [
                                { name: 'Youtube', value: 'youtube' }
                            ]
                        }
                    ]
                }
            ]
        })
    }

    public async run(msg: CommandInteraction) {
        if (msg instanceof CommandInteraction) {
            if (!msg?.guildId) return msg.reply('此功能只能在群組中使用。');
            if (!this.client.discordTogether) {
                this.client.discordTogether = new DiscordTogether(this.client);
            }

            const guild = await this.client.guilds.fetch(msg.guildId);
            const member = await guild.members.fetch(msg.member!.user.id);

            if (!member.voice.channel) {
                msg.reply({ content: '\\❌ | 請先加入語音頻道。', ephemeral: true, allowedMentions: { repliedUser: false } })
                return;
            }

            this.client.discordTogether.createTogetherCode(member.voice.channel.id, 'youtube')
                .then((invite: { code: string }) => msg.reply(`[點這邊加入Watch Togther](${invite.code})`));
        }
    }
}