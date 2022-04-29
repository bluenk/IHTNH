import mongoose, { Connection } from "mongoose";

export default class ConnectDb {
    public connection: Connection;
    public constructor() {
        this.connection = mongoose.createConnection(process.env.MONGODB_CONN_URL!);
    }
}