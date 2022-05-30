import { ApplicationCommandData, Collection, CommandInteraction, ContextMenuInteraction, Interaction, Message, MessageOptions } from "discord.js";
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

    protected async editReply(options: MessageOptions, msg: CommandInteraction | ContextMenuInteraction | Message) {
        // Can't edit ephemeral message, use <Interaction>.editReply instead.
        if (msg instanceof ContextMenuInteraction) {
            return msg.editReply(options);
        } else {
            return this.replyMsg.get(msg.id)?.edit(options);
        }
    }
}