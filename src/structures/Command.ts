import { ApplicationCommandData, Collection, CommandInteraction, Interaction, Message } from "discord.js";
import { Client } from "./Client";

export interface CommandOptionsData {
    info: {
        name: string;
        fullName: string;
        detail: string;
        usage: string[];
        example: string;
        enable: boolean;
    },
    commandOptions?: ApplicationCommandData[]
}

export abstract class Command {
    protected replyMsg: Collection<string, Message> = new Collection();

    constructor(public client: Client, public options: CommandOptionsData) { }

    public abstract run(msg: Message | Interaction | CommandInteraction, args?: string[]): void;

    protected isURL(str: unknown) {
        if (!(typeof str === 'string')) return false;
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    }
}