import { CommandInteraction, ContextMenuCommandInteraction, Interaction } from "discord.js";
import { Client } from "../structures/Client";
import { Event } from "../structures/Event";

export default class InteractionCreate extends Event {
    public constructor(client: Client) {
        super(client, 'interactionCreate');
    }

    public async execute(i: Interaction) {
        let commandName: string;
        if (!(i instanceof CommandInteraction || i instanceof ContextMenuCommandInteraction)) return;
        if (i.isCommand()) commandName = i.commandName;
        if (i.isContextMenuCommand()) commandName = i.commandName;

        const names = this.client.commands.collection.map(command => {
            const { commandOptions } = command.options;
            if (!commandOptions) return;
            return {
                command: command.options.info.name,
                name: commandOptions.map(option => option.name)
            }
        });
        const target = names.find(v => v?.name.includes(commandName))!;

        const command = this.client.commands.collection.get(target?.command);
        if (command?.options.info.enable) {
            command.run(i);
        } else {
            i.reply('\\⛔ | 此指令停用中');
        }
    }
}