import express from 'express';
import morgan from 'morgan';
import xmlPraser from 'express-xml-bodyparser';
import { Client } from '../structures/Client.js';
import { router } from './router.js';
import { log } from '../utils/logger.js';

export default class App {
    private readonly app;
    private readonly port = 5000;
    private readonly host = '0.0.0.0';
    
    public constructor(public client: Client) {
        this.app = express();
    }

    public async start() {
        this.app.listen(this.port, this.host, () => log('Start listening...', 'App'));

        this.app.use(morgan('dev'));
        this.app.use(xmlPraser());
        this.app.use(express.json());

        for (const route of router) {
            this.app.use(new route(this.client).getRouter());
        }
    }
}