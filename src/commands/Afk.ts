import { Command } from '../structures/Command';
import { log } from '../utils/logger';
import { ApplicationCommandType, CommandInteraction, DiscordAPIError, GuildMember, Message } from 'discord.js';

export default class Afk extends Command {
    public constructor(client: Command["client"]) {
        super(client, {
            info: {
                name: 'afk',
                fullName: '閒置/離開狀態',
                detail: '取得AFK身分組，與線上成員分開顯示。',
                alias: [],
                usage: ['afk'],
                example: 'i.afk' + '\n' + '/afk',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'afk',
                    description: '切換AFK狀態'
                }
            ]
        })
    }

    public async run(msg: Message | CommandInteraction) {
        if (!msg.member) return;
        if (!(msg.member instanceof GuildMember)) return;
        
        msg.reply({ content: await this.setAFK(msg.member), ephemeral: true });
    }

    private async setAFK(member: GuildMember) {
        const afkRole = member.guild.roles.cache.find(role => role.name == 'AFK');
        if (!afkRole) return '\\⛔ | 此伺服器沒有\'AFK\'身分組。'
    
        if (member.roles.cache.some(role => role.name == 'AFK')) {
            try {
                await member.roles.remove(afkRole);
            } catch(err) {
                if (err instanceof DiscordAPIError && err.code === 50013) return '\\⛔ | Bot權限不足，無法執行此操作。';
            }
            log(`${member.displayName} now removed AFK.`, 'afk');
    
            return '\\✅ | 移除身分組 **AFK**';
        } else {
            member.roles.add(afkRole);
            log(`${member.displayName} now AFK.`, 'afk');
    
            return '\\✅ | 設定身分組 **AFK**';
        }
    }
}