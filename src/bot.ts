import { Intents, Formatters } from 'discord.js';
import { Client } from './structures/Client';
import 'dotenv/config';
const { codeBlock } = Formatters;

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.DIRECT_MESSAGES
    ]
});

client.start();



process.on('uncaughtException', async (err) => {
    if (process.env.NODE_ENV === 'pro') {
        const bluenk = await client.users.fetch(process.env.OWNER_ID!);
        const DMCh = await bluenk.createDM();
        DMCh.send('uncaughtException detected' + codeBlock('js', err.stack || err.message));
    }
    console.error(err);
});