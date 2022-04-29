import { Collection } from "discord.js";
import { Client } from "../structures/Client";
import { Handler } from "../structures/Handler";
import Loader from "../structures/Loader";

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
            this.client.handlers.collection.set(handler.options.info.name, handler)
        }
    }
}