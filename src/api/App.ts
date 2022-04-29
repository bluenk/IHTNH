import fs from 'fs/promises';
import http from 'http';
import https from 'https';
import express from 'express';
import morgan from 'morgan';
import xmlPraser from 'express-xml-bodyparser';
import { join } from 'path';
import { Client } from '../structures/Client';
import { router } from './router';
import { log } from '../utils/logger';

export default class App {
    private readonly app;
    private readonly hostname = process.env.HOSTNAME;
    private privateKey: string | undefined;
    private certificate: string | undefined;
    private ca: string | undefined;
    private httpsServer: https.Server | undefined;
    private httpServer: http.Server | undefined;
    public constructor(public client: Client) {
        this.app = express();
    }

    public async start() {
        await this.loadTLS();
        this.createServers();

        this.httpServer?.listen(80);
        this.httpsServer?.listen(443);

        this.app.use(morgan('dev'));
        this.app.use(xmlPraser());
        this.app.use(express.json());

        for (const route of router) {
            this.app.use(new route(this.client).getRouter());
        }

        log('Start listening...', 'App');
    }

    private async loadTLS() {
        try {
            this.privateKey = await fs.readFile('/etc/letsencrypt/live/' + this.hostname + '/privkey.pem', 'utf8');
            this.certificate = await fs.readFile('/etc/letsencrypt/live/' + this.hostname + '/cert.pem', 'utf8');
            this.ca = await fs.readFile('/etc/letsencrypt/live/' + this.hostname + '/chain.pem', 'utf8');
        } catch(err) {
            log('Failed to load TLS flies.', 'App');
        }
    }

    private createServers() {
        if (this.privateKey && this.certificate && this.ca) {
            this.httpsServer = https.createServer({ key: this.privateKey, cert: this.certificate, ca: this.ca }, this.app);
            this.httpServer = http.createServer((req, res) => {
                res.writeHead(301, { 'Location': 'https://' + req.headers.host + req.url }).end();
            });
        } else {
            this.httpsServer = https.createServer(this.app);
            this.httpServer = http.createServer(this.app);
        }
    }
}