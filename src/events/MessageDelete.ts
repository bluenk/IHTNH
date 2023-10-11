import { Message } from "discord.js";
import { Client } from "../structures/Client.js";
import { Event } from "../structures/Event.js";
import PreviewFix from "../handlers/PreviewFix.js";

export default class MessageDelete extends Event {
    public constructor(client: Client) {
        super(client, 'messageDelete');
    }

    public execute(msg: Message): void {
        (this.client.handlers.collection.get('previewFix') as PreviewFix).deleteRepaired(msg);
    }
}