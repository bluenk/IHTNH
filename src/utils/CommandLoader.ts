import { ApplicationCommandData, Collection } from "discord.js";
import { log } from "./logger.js";
import { Client } from "../structures/Client.js";
import { Command } from "../structures/Command.js";
import Loader from "../structures/Loader.js";

export default class CommandLoader extends Loader {
    public collection: Collection<string, Command>; 

    public constructor(public client: Client) { 
        super()
        this.collection = new Collection();
    }

    public async load() {
        const commands: Command[] = await this.importModules('../commands/', this.client);
        console.log('Command modules: ', commands.map(c => c.options.info.name));

        for (const command of commands) {
            this.client.commands.collection.set(command.options.info.name, command)
        }

        // this.depolyCommands();
    }

    public async depolyCommands() {
        const data: ApplicationCommandData[] = Array.from(this.client.commands.collection.values()).flatMap((command) => {
            if (!command.options.info.enable) return [];
            if (!command.options.commandOptions) return [];
            return command.options.commandOptions;
        });
		const appclicationCommands = await this.client.application?.commands.set(data);
        log('Commands deployed.', 'CommandLoader');
    }
}