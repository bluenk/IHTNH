import {
    Client as DiscordClient,
    ClientOptions,
    Collection,
    ColorResolvable,
    Guild
} from "discord.js";
import { log } from "../utils/logger";
import EventLoader from "../utils/EventLoader";
import CommandLoader from "../utils/CommandLoader";
import ConnectDb from "../utils/ConnectDb";
import App from "../api/App";
import { DiscordTogether } from "discord-together";
import HandlerLoader from "../utils/HandlerLoader";

export interface ReplyKeywords {
    keywords: string[];
}

export class Client extends DiscordClient {
    public readonly events = new EventLoader(this);
    public readonly commands = new CommandLoader(this);
    public readonly handlers = new HandlerLoader(this);
    public readonly db = new ConnectDb();
    public readonly app = new App(this);
    public replyCache: Collection<string, ReplyKeywords>;
    public servers: Collection<string, Guild>;
    public discordTogether: DiscordTogether<{[x: string]: string}> | undefined;

    public constructor(options: ClientOptions) {
        super(options);
        this.servers = new Collection();
        this.replyCache = new Collection();
    }

    public start() {
        this.login(process.env.BOT_TOKEN);
        this.events.load();
        this.commands.load();
        this.handlers.load();
        this.app.start();

        this.on('ready', async () => {
            log(`Logged in as ${this.user?.tag}`);
            log(`bot running...`);
        
            this.servers = this.guilds.cache;
            log('guilds:');
            console.table(this.servers.map(guild => {
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