import { Message } from "discord.js";
import { Client } from "./Client";

export interface HandlerOptionsData {
    info: {
        name: string;
        fullName: string;
        detail: string;
        enable: boolean;
    }
}

export abstract class Handler {
    constructor(public client: Client, public options: HandlerOptionsData) { }

    // Execute at ready.
    public abstract execute(): void;
    // Execute at events.
    public abstract run(msg: Message): void;
}