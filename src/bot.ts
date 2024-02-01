import { GatewayIntentBits, codeBlock } from 'discord.js';
import { Client } from './structures/Client.js';
import EmbedBuilder from './structures/EmbedBuilder.js';
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
process.on('uncaughtException', async (err, origin) => {
    if (process.env.NODE_ENV === 'pro') {
        const owner = await client.users.fetch(process.env.OWNER_ID!);
        const DMCh = await owner.createDM();
        const embed = new EmbedBuilder({
            title: '\\⚠️ 發生例外狀況',
            description: codeBlock(err.message),
            fields: [
                { name: 'Origin', value: codeBlock(origin.toString()), inline: false },
                { name: 'Cause', value: codeBlock(String(err.cause) || 'none'), inline: false },
                { name: 'Stack', value: codeBlock(err.stack || 'none'), inline: false }
            ]
        });

        DMCh.send({ embeds: [embed] });
    }
    console.info(`>>> Uncaught Exception`);
    console.error(err);
});