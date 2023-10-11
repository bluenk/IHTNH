import { GatewayIntentBits, codeBlock } from 'discord.js';
import { Client } from './structures/Client.js';
import 'dotenv/config';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.start();


// Caught unexcept errors to prevent process exiting and notify owner.
// 防止程式因為例外狀況而停止執行，並通知擁有者。
process.on('uncaughtException', async (err) => {
    if (process.env.NODE_ENV === 'pro') {
        const owner = await client.users.fetch(process.env.OWNER_ID!);
        const DMCh = await owner.createDM();
        DMCh.send('uncaughtException detected' + codeBlock('js', err.stack || err.message));
    }
    console.error(err);
});