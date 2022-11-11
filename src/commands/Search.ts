import {
    Collection,
    ChatInputCommandInteraction,
    ContextMenuCommandInteraction,
    DMChannel,
    EmbedFooterData,
    Formatters,
    Interaction,
    InteractionUpdateOptions,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageComponentInteraction,
    ApplicationCommandType,
    ApplicationCommandOptionType,
    ButtonStyle
} from "discord.js";
import sagiri, { SagiriResult } from "sagiri";
import { log } from "../utils/logger";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";
import EmbedBuilder from "../structures/EmbedBuilder";
const SC = sagiri(process.env.SAUCENAO_TOKEN!);

type SagiriResultFix = SagiriResult & {
    raw: {
        data: {
            creator: string;
        }
    }
}

enum ErrorMessages {
    ARGS_MISSING = '指令格式錯誤。',
    URL_INCORRECT = '圖片網址不正確。',
    URL_NOT_FOUND = '沒有附加圖片或未偵測到圖片。'
}
type ErrorType = keyof typeof ErrorMessages;

export default class Search extends Command {
    private url: string | undefined;
    // private msg: Collection<string, Message | ChatInputCommandInteraction | ContextMenuCommandInteraction> = new Collection();

    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'search',
                fullName: 'SauceNao圖片搜尋',
                detail: '上傳圖片至SauceNao.com查詢',
                category: 'others',
                alias: ['find', 'sn'],
                usage: ['search'],
                example:
                    'i.search https://nekos.moe/image/rJQB1Dq2z.jpg' + '\n' +
                    '/search url:https://nekos.moe/image/rJQB1Dq2z.jpg' + '\n' +
                    '右鍵有圖片的訊息 > 應用程式 > 以圖搜圖(SauceNao)',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'search',
                    description: '圖片搜尋',
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: 'url',
                            description: '圖片網址',
                            required: true
                        }
                    ]
                },
                {
                    type: ApplicationCommandType.Message,
                    name: '以圖搜圖(SauceNao)'
                }
            ]
        })
    }

    public async run(msg: ChatInputCommandInteraction | ContextMenuCommandInteraction | Message, args: string[]) {
        // this.msg.set(msg.id, msg);

        const replyOptions = {
            content: '處理中...',
            ephemeral: msg instanceof ContextMenuCommandInteraction,
            fetchReply: true
        }

        // Can't reply to a Message in DMChannel.
        if (!msg.inGuild() && msg instanceof Message) {
            this.replyMsg.set(msg.id, await msg.channel.send(replyOptions.content));
        } else {
            this.replyMsg.set(msg.id, await msg.reply(replyOptions) as Message);
        }

        // Get the image url.
        if (msg instanceof ChatInputCommandInteraction) {
            this.url = msg.options.getString('url')!;
        }
        if (msg instanceof ContextMenuCommandInteraction) {
            const targetMsg = await msg.channel?.messages.fetch(msg.targetId);
            if (!targetMsg) return this.replyMsg.get(msg.id)?.edit(this.sendErr('URL_NOT_FOUND'));

            this.url =
                targetMsg.attachments.first()?.url ??
                targetMsg.embeds[0]?.image?.url ??
                targetMsg.embeds[0]?.thumbnail?.url;
        }
        if (msg instanceof Message) {
            this.url = msg.attachments.first()?.url ?? args[1] ?? msg.embeds[0].image?.url;
        }

        // Make sure the url is vaild.
        if (this.isURL(this.url)) {
            this.handleSearch(this.url!, msg);
        } else {
            await this.editReply({ content: this.sendErr(this.url === undefined ? 'URL_NOT_FOUND' : 'URL_INCORRECT') }, msg);
            this.replyMsg.delete(msg.id);
        }
    }

    private async handleSearch(url: string, msg: ChatInputCommandInteraction | ContextMenuCommandInteraction | Message) {
        const buttons = [
            new ButtonBuilder({
                customId: 'previous',
                label: '<',
                style: ButtonStyle.Secondary,
                disabled: true
            }),
            new ButtonBuilder({
                customId: 'next',
                label: '>',
                style: ButtonStyle.Secondary
            })
        ]
        const row = new ActionRowBuilder<ButtonBuilder>({ components: buttons });

        let index = 0;
        const resultEmbeds = await this.makeEmbeds(url);
        const firstEmbed = resultEmbeds[index].setFooter(this.footerOptions(index, resultEmbeds.length));
        const msgOptions = { embeds: [firstEmbed], components: [row], content: ' ' };

        await this.editReply(msgOptions, msg);

        const filter = (interaction: Interaction) => interaction.user.id == ('author' in msg ? msg.author.id : msg.user.id);
        const collector = this.replyMsg.get(msg.id)!.createMessageComponentCollector({ filter, time: 1 * 60 * 1000 })

        collector.on('collect', (interaction: MessageComponentInteraction) => {
            const updateOptions: InteractionUpdateOptions = {};

            // Handle buttons.
            if (interaction.customId == 'next') {
                updateOptions.embeds = [resultEmbeds[++index]];
            }
            if (interaction.customId == 'previous') {
                updateOptions.embeds = [resultEmbeds[--index]];
            }

            // Disable button on first one and last one.
            if (index === 0 || index === resultEmbeds.length - 1) {
                row.components[index ? 1 : 0].setDisabled(true);
                row.components[index ? 0 : 1].setDisabled(false);
            } else {
                row.components.forEach(btn => btn.setDisabled(false));
            }
            updateOptions.components = [row];

            if (!(updateOptions.embeds![0] instanceof EmbedBuilder)) return;
            updateOptions.embeds![0].setFooter(this.footerOptions(index, resultEmbeds.length));
            interaction.update(updateOptions);
        });

        collector.once('end', async () => {
            row.components.forEach(btn => btn.setDisabled(true));
            const menuEmbed = (await this.replyMsg.get(msg.id)!.fetch()).embeds[0];
            console.log(menuEmbed);
            this.editReply({
                embeds: [
                    EmbedBuilder.from(menuEmbed)
                        .setFooter({
                            ...this.footerOptions(index, resultEmbeds.length),
                            text: menuEmbed.footer!.text += '  |  已過期'
                    })!
                ],
                components: [row]
            }, msg);
            this.replyMsg.delete(msg.id);
        });
    }

    private async makeEmbeds(url: string) {
        const res = await SC(url) as SagiriResultFix[];

        const embeds = [];
        for (const result of res) {
            embeds.push(this.makeEmbed(result));
        }

        return embeds;
    }

    private makeEmbed(result: SagiriResultFix) {
        // console.log(result);
        let imgId: string | undefined;
        let titelUrl: string | undefined;
        let author: string | undefined;
        let title: string | undefined;
        let description: string | undefined;
 
        switch (result.index) {
            case 5: // Pixiv
            case 6:
                titelUrl = result.url;
                author = result.raw.data.member_name;
                imgId = result.raw.data.pixiv_id;
                title = result.raw.data.title;
                // description = `\ntitle: ${title}`;
                break;

            case 8: // Nico Nico Seiga
                titelUrl = result.url;
                author = result.raw.data.member_name;
                imgId = result.raw.data.seiga_id;
                title = result.raw.data.title;
                // description = `\ntitle: ${title}\nimgId: ${imgId}`;
                break;

            case 10: // drawr(Shutdown)
                titelUrl = result.url;
                author = result.raw.data.member_name;
                imgId = result.raw.data.drawr_id;
                title = result.raw.data.title;
                // description = `\ntitle: ${title}\nimgId: ${imgId}`;
                break;

            case 18: // H-Misc e.g. nhentai
                titelUrl = result.url;
                title = result.raw.data.source; //+ ` (${result.raw.data.jp_name})`;
                // description = '\ntitle: ' + title;
                break;

            case 20: // MediBang
                titelUrl = result.url;
                author = result.raw.data.member_name;
                title = result.raw.data.title;
                // description = '\ntitle: ' + title;
                break;

            case 31: // bcy
                titelUrl = result.url;
                author = result.raw.data.member_name;
                imgId = result.raw.data.bcy_id;
                title = result.raw.data.title;
                // description = `\ntitle: ${title}\nimgId: ${imgId}`;
                break;

            case 34: // DeviantArt
                titelUrl = result.url;
                author = result.authorName ?? undefined;
                title = result.raw.data.title;
                imgId = result.raw.data.da_id.toString();
                // description = `\ntitle: ${title}\nimgId: ${imgId}`;
                break;

            case 35: // Pawoo
                titelUrl = result.url;
                author = result.raw.data.author_name; //pawoo_user_display_name;
                break;

            default: // others e.g. Danbooru / Gelbooru
                title = result.raw.data.title;
                author = result.authorName ?? result.raw.data.creator;
                description = `\nsource: ${result.raw.data.source}`;

                if (!result.raw.data.source) break;

                if (String.prototype.startsWith.call(result.raw.data.source, 'http')) {
                    let sourceUrl = new URL(result.raw.data.source);
                    switch (sourceUrl.host) {
                        case 'i.pximg.net':
                        case 'i1.pixiv.net':
                        case 'i2.pixiv.net':
                        case 'i3.pixiv.net':
                        case 'i4.pixiv.net':
                            imgId = sourceUrl.pathname.split('/').pop()?.split('.').shift()?.split('_').shift();
                            titelUrl = 'https://www.pixiv.net/artworks/' + imgId;
                            break;

                        case 'www.pixiv.net':
                            imgId = sourceUrl.searchParams.get('illust_id') ?? undefined;
                            break;

                        case 'twitter.com':
                            imgId = sourceUrl.pathname.split('/status/').pop()?.split('/').shift() + ` (@${sourceUrl.pathname.split('/', 2).pop()})`;
                            titelUrl = result.raw.data.source;
                            break;

                        case 'exhentai.org':

                            break;

                        default:
                            break;
                    }
                }
                break;
        }

        return new EmbedBuilder({
            title: title ?? 'Sauce found ?',
            url: titelUrl ?? '',
            description: `Found at ${result.site} (${result.url})` + description,
            fields: [
                { name: '相似度', value: result.similarity + '%', inline: true },
                { name: '作者', value: author ?? '未知', inline: true }
            ],
            thumbnail: { url: result.thumbnail }
        });
    }

    private footerOptions(index: number, total: number): EmbedFooterData {
        return {
            text: `搜尋結果由SauceNao提供  |  Page: ${index + 1} / ${total}`
        }
    };

    private sendErr(type: ErrorType) {
        return '\\⛔ | ' + ErrorMessages[type]
    }
}