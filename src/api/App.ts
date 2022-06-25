import express from 'express';
import morgan from 'morgan';
import xmlPraser from 'express-xml-bodyparser';
import { Client } from '../structures/Client';
import { router } from './router';
import { log } from '../utils/logger';

export default class App {
    private readonly app;
    public constructor(public client: Client) {
        this.app = express();
    }

    public async start() {
        this.app.listen(5000, () =>  log('Start listening...', 'App'));

        this.app.use(morgan('dev'));
        this.app.use(xmlPraser());
        this.app.use(express.json());

        for (const route of router) {
            this.app.use(new route(this.client).getRouter());
        }
    }
}