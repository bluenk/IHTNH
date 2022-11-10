import { ApplicationCommandData, ChatInputCommandInteraction, Collection, CommandInteraction, ContextMenuCommandInteraction, Guild, Interaction, Message, MessageEditOptions, TextBasedChannel, TextChannel, WebhookEditMessageOptions } from "discord.js";
import { Client } from "./Client";

export interface CommandOptionsData {
    info: {
        name: string;
        fullName: string;
        detail: string;
        category: 'core' | 'guild' | 'others'
        alias: string[];
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

    protected async editReply(options: MessageEditOptions, msg: CommandInteraction | ContextMenuCommandInteraction | Message) {
        // Can't edit ephemeral message, use <Interaction>.editReply instead.
        if (msg instanceof ContextMenuCommandInteraction) {
            return msg.editReply(options as WebhookEditMessageOptions);
        } else {
            return this.replyMsg.get(msg.id)?.edit(options);
        }
    }

    protected sendRes(content: string, target: Message | ChatInputCommandInteraction | ContextMenuCommandInteraction, success: boolean) {
        target.reply({
            content: (success ? '\\✔️ | ' : '\\❌ | ') + content
        });
    }
}