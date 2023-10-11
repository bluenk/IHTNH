import { Connection, Model, Schema } from 'mongoose';
import { Client } from '../structures/Client.js';

export interface ReplyData {
    keyword: string[];
    response: {
        url: string;
        deleteHash: string;
    }[];
    createBy: number;
    count: number;
}

const replySchema = new Schema<ReplyData>({
    keyword: [String],
    response: [
        { url: String, deleteHash: String }
    ],
    createBy: Number,
    count: Number
}, { timestamps: true });

export default class ReplyDb {
    private readonly db: Connection;
    public model: Model<ReplyData>;

    public constructor(public client: Client, public readonly guildId: string) {
        this.db = client.db.connection.useDb('reply');
        this.model = this.db.model('Reply', replySchema, guildId);
    }
}