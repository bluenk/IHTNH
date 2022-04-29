import { NextFunction, Request, Response } from "express";
import { Client } from "../../structures/Client";
import Controller from "../../structures/Controller";
import MessageEmbed from "../../structures/MessageEmbed";
import { log } from "../../utils/logger";

export default class ChangeLogController extends Controller {
    public constructor(public client: Client) { super() }

    public execute(req: Request, res: Response, next: NextFunction) {
        const data = req.body;
        const embed = new MessageEmbed({
            author: { name: data.title },
            description: data.content,
        })
        .showVersion();
    
        this.client.channels.fetch(data.channelId)
            .then(ch => {
                if (!ch?.isText()) return;
                ch.send({ embeds: [embed] });
                res.sendStatus(200).end();
            })
            .catch(err => {
                log(err, 'ChangeLogController');
                res.sendStatus(500).end();
        });
    }
}