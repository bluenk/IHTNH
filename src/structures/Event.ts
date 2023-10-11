import { ClientEvents } from "discord.js";
import { Client } from "./Client.js";

// export interface EventType {
//     readonly name: keyof ClientEvents;
//     execute: (...args: any) => void;
// }

export abstract class Event {
    public constructor(public client: Client, public readonly name: keyof ClientEvents) {}
    public abstract execute(...args: any): void;
}