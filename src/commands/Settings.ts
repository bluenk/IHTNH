import {
    Message,
    Interaction,
    CacheType,
    CommandInteraction,
    ApplicationCommandType,
    ApplicationCommandOptionType,
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    PresenceStatusData
} from "discord.js";
import { Client } from "../structures/Client.js";
import { Command } from "../structures/Command.js"
import { loggerInit } from "../utils/logger.js";

const log = loggerInit('settings');

export default class Settings extends Command {
    public constructor(client: Client) {
        super(client, {
            info: {
                name: 'settings',
                fullName: '設定',
                detail: 'bot設定，管理員專用。',
                category: 'core',
                alias: [],
                usage: ['/settings <category> <target> <value>'],
                example: 
                    '/settings category:command target:play value:disable\n' +
                    '/settings category:presence target:status value:idle',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'settings',
                    description: '設定',
                    defaultMemberPermissions: 'Administrator',
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'category',
                            description: '類別',
                            required: true,
                            choices: [
                                {
                                    name: '指令',
                                    value: 'command'
                                },
                                {
                                    name: 'bot狀態',
                                    value: 'presence'
                                }
                            ]
                        },
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'target',
                            description: '調整項目',
                            required: true,
                            autocomplete: true
                        },
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'value',
                            description: '值',
                            required: true,
                            autocomplete: true
                        }
                    ]
                }
            ]
        })
    }

    public autocomplete(i: AutocompleteInteraction<CacheType>): void {
        const category = i.options.getString('category');
        const target = i.options.getString('target');
        const focused = i.options.getFocused(true).name;

        if (focused === 'target' && category) {
            switch (category) {
                case 'command': {
                    const options = this.client.commands.collection.map((v, k) => {
                        return {
                            name: k,
                            value: k
                        }
                    });
                    i.respond(options);
                    break;
                }

                case 'presence': {
                    i.respond(['status', 'activities'].map(s => {return { name: s, value: s }}));
                    break;
                }
            }
        }
        if (focused === 'value' && target) {
            if (this.client.commands.collection.has(target)) {
                i.respond([
                    { name: '啟用', value: 'enable' },
                    { name: '停用', value: 'disable' }
                ]);
            }

            switch (target) {
                case 'status': {
                    i.respond(
                        ['online', 'idle', 'invisible', 'dnd']
                            .filter(s => this.client.user?.presence.status !== s)
                            .map(s => {return { name: s, value: s }})
                    );
                    break;
                }
                
                case 'activities': {
                    i.respond([{ name: '清除狀態', value: 'reset' }]);
                    break;
                }
            }
        }
    }

    public run(i: Message<boolean> | Interaction<CacheType> | CommandInteraction<CacheType>, args?: string[] | undefined): void {
        if (i instanceof ChatInputCommandInteraction) {
            const category = i.options.getString('category');
            const target = i.options.getString('target');
            const value = i.options.getString('value');

            if (!(category && target && value)) return;

            if (category === 'command') {
                const targetCommand = this.client.commands.collection.get(target)!;
                log(`${target} has been ${value}.`);
                
                switch (value) {
                    case 'disable':
                        targetCommand.options.info.enable = false;
                        break;
                    
                    case 'enable':
                        targetCommand.options.info.enable = true;
                        break;
                }
            }

            if (category === 'presence') {
                switch (target) {
                    case 'status':
                        this.client.user?.setStatus(value as PresenceStatusData);
                        break;

                    case 'activities':
                        if (value === 'reset') {
                            this.client.user?.setActivity();
                            log('activities has been reset.');
                        } else {
                            this.client.user?.setActivity(value);
                            log(`activities set to ${value}.`);
                        }
                        break;
                }
            }

            this.sendRes('已套用更變。', i, true, true);
        }
    }
}