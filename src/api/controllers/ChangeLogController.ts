import { NextFunction, Request, Response } from "express";
import { Client } from "../../structures/Client.js";
import Controller from "../../structures/Controller.js";
import EmbedBuilder from "../../structures/EmbedBuilder.js";
import { log } from "../../utils/logger.js";

export default class ChangeLogController extends Controller {
    public constructor(public client: Client) { super() }

    public execute(req: Request, res: Response, next: NextFunction) {
        const data = req.body;
        const embed = new EmbedBuilder({
            author: { name: data.title },
            description: data.content,
        })
        .showVersion();
    
        this.client.channels.fetch(data.channelId)
            .then(ch => {
                if (!ch?.isTextBased()) return;
                ch.send({ embeds: [embed] });
                res.sendStatus(200).end();
            })
            .catch(err => {
                log(err, 'ChangeLogController');
                res.sendStatus(500).end();
        });
    }
}