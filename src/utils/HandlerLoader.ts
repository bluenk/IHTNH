import { Collection } from "discord.js";
import { Client } from "../structures/Client.js";
import { Handler } from "../structures/Handler.js";
import Loader from "../structures/Loader.js";

export default class HandlerLoader extends Loader {
    public collection: Collection<string, Handler>; 

    public constructor(public client: Client) { 
        super()
        this.collection = new Collection();
    }

    public async load() {
        const handlers: Handler[] = await this.importModules('../handlers/', this.client);
        console.log('Handler modules: ', handlers.map(c => c.options.info.name));

        for (const handler of handlers) {
            this.collection.set(handler.options.info.name, handler)
        }
    }
}