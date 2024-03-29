import { Client as DiscordClient, ClientOptions } from "discord.js";
import { log } from "../utils/logger.js";
import EventLoader from "../utils/EventLoader.js";
import CommandLoader from "../utils/CommandLoader.js";
import ConnectDb from "../utils/ConnectDb.js";
import App from "../api/App.js";
import HandlerLoader from "../utils/HandlerLoader.js";
import WebCrawler from "./WebCrawler.js";

export interface ReplyKeywords {
    keywords: string[];
}

export class Client extends DiscordClient {
    public readonly events = new EventLoader(this);
    public readonly commands = new CommandLoader(this);
    public readonly handlers = new HandlerLoader(this);
    public readonly db = new ConnectDb();
    public readonly app = new App(this);

    public constructor(options: ClientOptions) {
        super(options);
    }

    public async start() {
        await WebCrawler.initBrowser();

        this.login(process.env.BOT_TOKEN);
        this.events.load();
        this.commands.load();
        this.handlers.load();
        this.app.start();
        

        this.on('ready', async () => {
            log(`Logged in as ${this.user?.tag}`);
            log(`bot running...`);
        
            log('guilds:');
            console.table(this.guilds.cache.map(guild => {
                return {
                    id: guild.id,
                    name: guild.name,
                    memberCount: guild.memberCount
                }
            }));

            this.handlers.collection
                .filter(h => h.options.info.enable)
                .forEach(h => h.execute());

            this.commands.depolyCommands();
        })
    }

}