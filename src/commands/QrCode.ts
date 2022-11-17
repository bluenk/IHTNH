import { Message, Interaction, CacheType, CommandInteraction, ChatInputCommandInteraction, ApplicationCommandType, ApplicationCommandOptionType, AttachmentBuilder, ContextMenuCommandInteraction } from "discord.js";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";
import EmbedBuilder from "../structures/EmbedBuilder";
import sharp from "sharp";
import fetch from "node-fetch";
import jsQR, { QRCode } from "jsqr";
import qrcode from "qrcode";

enum SubCommand {
    Reader = 'reader',
    Genarator = 'genarator'
}

export default class QrCode extends Command {
    public constructor(client: Client) {
        super(client, {
            info: {
                name: 'qrcode',
                fullName: 'QR Code產生/讀取器',
                detail: '製作/讀取QR Code，支援應用程式(右鍵->應用程式)選單。',
                category: 'others',
                alias: ['qr'],
                usage: ['i.qrcode <mode> [url]'],
                example: 'i.qrcode read https://i.imgur.com/qrcode.jpg',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'qrcode',
                    description: 'Qr Code',
                    options: [
                        {
                            type: ApplicationCommandOptionType.Subcommand,
                            name: SubCommand.Reader,
                            description: '讀取 QR Code',
                            options: [
                                {
                                    type: ApplicationCommandOptionType.String,
                                    name: 'url',
                                    description: '請輸入包含QR Code的圖片網址',
                                    required: true
                                }
                            ]
                        },
                        {
                            type: ApplicationCommandOptionType.Subcommand,
                            name: SubCommand.Genarator,
                            description: 'QR Code 產生器',
                            options: [
                                {
                                    type: ApplicationCommandOptionType.String,
                                    name: 'text',
                                    description: '請輸入要產生QR Code的內容',
                                    required: true
                                }
                            ]
                        }
                    ]
                },
                {
                    type: ApplicationCommandType.Message,
                    name: '讀取QR Code',
                }
            ]
        })
    }

    public async run(msg: Message | Interaction | CommandInteraction, args?: string[] | undefined) {
        if (msg instanceof ChatInputCommandInteraction) {
            if (msg.options.getSubcommand() === SubCommand.Reader) {
                const url = msg.options.getString('url')!;
                if (!this.isURL(url)) return this.sendRes('網址不正確。', msg, false);
                const data = await this.reader(url);
                if (!data) return this.sendRes('未偵測到QR Code。', msg, false);

                msg.reply({
                    embeds: [this.makeResultEmbed(data)],
                    files: [new AttachmentBuilder(await this.genarator(data), { name: 'qrcode.png' })]
                });
            }
            if (msg.options.getSubcommand() === SubCommand.Genarator) {
                const text = msg.options.getString('text')!;
                
                msg.reply({
                    embeds: [this.makeGenaratedEmbed()],
                    files: [new AttachmentBuilder(await this.genarator(text), { name: 'qrcode.png' })]
                });
            }
        }
        
        if (msg instanceof ContextMenuCommandInteraction) {
            const targetMsg = await msg.channel?.messages.fetch(msg.targetId)!;
            const imgUrl = 
                targetMsg.attachments.first()?.url ||
                targetMsg.embeds[0].data.image?.url ||
                targetMsg.embeds[0].data.thumbnail?.url;

            if (!imgUrl) return this.sendRes('未偵測到圖片。', msg, false, true);
            
            const data = await this.reader(imgUrl);
            if (!data) return this.sendRes('未偵測到QR Code。', msg, false, true);

            msg.reply({
                embeds: [this.makeResultEmbed(data)],
                files: [new AttachmentBuilder(await this.genarator(data), { name: 'qrcode.png' })],
                ephemeral: true
            });
        }
    }

    private async reader(url: string) {
        const image = await fetch(url);
        const imageBuf = Buffer.from(await image.arrayBuffer());
        const imageUint8Buf =
            await sharp(imageBuf)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true })
                .catch(console.error);

        if (!imageUint8Buf) return;
        const { data, info } = imageUint8Buf;

        const imageData = new Uint8ClampedArray(data.buffer);
        const code = jsQR(imageData, info.width, info.height);

        return code?.data;
    }

    private async genarator(data: string) {
        return await qrcode.toBuffer(data, { errorCorrectionLevel: "low" })//.catch(console.error);
    }

    private makeResultEmbed(data: QRCode['data']) {
        return new EmbedBuilder({
            author: { name: '掃描結果' },
            description: data,
            thumbnail: { url: 'attachment://qrcode.png' }
        });
    }

    private makeGenaratedEmbed() {
        return new EmbedBuilder({
            author: { name: 'QR Code 產生器' },
            image: { url: 'attachment://qrcode.png' }
        });
    }
}