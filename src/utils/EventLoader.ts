import { Client } from "../structures/Client.js";
import { Event } from "../structures/Event.js";
import Loader from "../structures/Loader.js";

export default class EventLoader extends Loader {
    public constructor(public client: Client) { super() }

    public async load() {
        const events: Event[] = await this.importModules('../events/', this.client);
        console.log('Event modules: ', events.map(e => e.name));

        for (const event of events) {
            this.client.on(event.name, (...args) => event.execute(...args))
        }
    }
}