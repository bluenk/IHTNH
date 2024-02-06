import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ChatInputCommandInteraction,
    CommandInteraction,
    Interaction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageComponentInteraction,
    MessageEditOptions,
    APIEmbed,
    User,
    codeBlock,
    inlineCode,
    bold,
    ButtonStyle,
    ButtonComponent,
    AutocompleteInteraction,
    CacheType,
    StringSelectMenuBuilder,
    MessageFlags
} from "discord.js";
import fetch from "node-fetch";
import FormData from "form-data";
import { log } from "../utils/logger.js";
import { Client } from "../structures/Client.js";
import { Command } from "../structures/Command.js";
import EmbedBuilder from "../structures/EmbedBuilder.js";
import ReplyDb, { ReplyData } from "../models/ReplyDb.js";
import { Document, Model, Types } from "mongoose";

enum SubCommand {
    NEW = 'new',
    EDIT = 'edit',
    GET = 'get'
}

enum ErrorMessages {
    ARGS_MISSING = '指令格式錯誤。',
    URL_INCORRECT = '圖片網址不正確。',
    KEYWORD_EXIST = '此觸發詞已經在清單內，請勿重複添加。',
    KEYWORD_NOT_EXIST = '找不到此觸發詞，請確認輸入格式是否正確。',
    IMAGE_UPLOAD_FAILED = '圖片上傳失敗，請聯絡管理員處理。',
    IMAGE_TOO_LARGE = '圖片檔案太大，上限為10MB。',
    DB_UPDATE_FAILED = '操作失敗，資料庫更新失敗。'
}
type ErrorType = keyof typeof ErrorMessages;

interface ImgurResData {
    link: string;
    deleteHash: string;
}

interface Props {
    targetKeyword: string;
    content?: string;
    author: User;
    msg: Message | CommandInteraction;
    replyMsg: Message;
    model: Model<ReplyData>;
    doc: (Document<unknown, any, ReplyData> & ReplyData & {
        _id: Types.ObjectId;
    }) | null;
}

export default class Reply extends Command {
    private readonly checkTime = 60; //sec

    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'reply',
                fullName: '建立/編輯觸發詞',
                detail: '使用者打出特定詞彙時會回覆對應圖片。',
                category: 'guild',
                alias: [],
                usage: Object.values(SubCommand).map(v => `/reply ${v}`),
                example:
                    'i.reply new 觸發詞 https://i.imgur.com/example.jpg' + '\n' +
                    'i.reply edit 觸發詞' + '\n' +
                    '/reply new keyword:觸發詞 url:https://i.imgur.com/example.jpg' + '\n' +
                    '/reply edit keyword:觸發詞' + '\n' +
                    '/reply get keyword:觸發詞',
                enable: true
            },
            commandOptions: [
                {
                    type: ApplicationCommandType.ChatInput,
                    name: 'reply',
                    description: '建立/編輯觸發詞',
                    options: [
                        {
                            type: ApplicationCommandOptionType.Subcommand,
                            name: SubCommand.NEW,
                            description: '新增觸發詞',
                            options: [
                                {
                                    type: ApplicationCommandOptionType.String,
                                    name: 'keyword',
                                    description: '觸發詞',
                                    required: true
                                },
                                {
                                    type: ApplicationCommandOptionType.String,
                                    name: 'url',
                                    description: '回應的圖片',
                                    required: true
                                }
                            ]
                        },
                        {
                            type: ApplicationCommandOptionType.Subcommand,
                            name: SubCommand.EDIT,
                            description: '編輯觸發詞',
                            options: [
                                {
                                    type: ApplicationCommandOptionType.String,
                                    name: 'keyword',
                                    description: '目標觸發詞',
                                    required: true,
                                    autocomplete: true
                                }
                            ]
                        },
                        {
                            type: ApplicationCommandOptionType.Subcommand,
                            name: SubCommand.GET,
                            description: '取圖模式',
                            options: [
                                {
                                    type: ApplicationCommandOptionType.String,
                                    name: 'keyword',
                                    description: '目標觸發詞',
                                    required: true,
                                    autocomplete: true
                                }
                            ]
                        }
                    ]
                }
            ]
        })
    }

    public async autocomplete(i: AutocompleteInteraction<CacheType>) {
        const value = i.options.getString('keyword');
        if (!value) return;
        
        const model = new ReplyDb(this.client, i.guildId!).model;
        
        const ac = await model.aggregate([
            {
                $search: {
                    autocomplete: {
                        path: 'keyword',
                        query: value
                    }
                },
                
            },
            { $limit: 8 },
            {
                $project: {
                    _id: 0,
                    keyword: 1
                }
            }
        ]).exec();

        i.respond(ac.map(({ keyword }) => ({ name: keyword[0], value: keyword[0] })));
    }
    
    public async run(msg: ChatInputCommandInteraction | Message, args: string[]) {
        if (!msg.inGuild()) return;
        if (!msg.channel) return;
        
        let replyMsg: Message;
        let keyword: string | undefined;
        let content: string | undefined;
        
        // match subcommand string to enum.
        let subCommand =
                SubCommand[
                    Object.keys(SubCommand).find(k => {
                        return SubCommand[k as keyof typeof SubCommand] ===
                            (
                                msg instanceof CommandInteraction
                                    ? msg.options.getSubcommand(true)
                                    : args[1]
                            );
                    }) as keyof typeof SubCommand
        ];

        switch (subCommand) {
            case SubCommand.GET:
                // i'm just too lazy to deal with this rn, won't become a bug at somepoint right...?
                replyMsg = null as unknown as Message;
                keyword = (msg as ChatInputCommandInteraction).options.getString('keyword', true);
                
                break;
            
            default:
                replyMsg = 
                    await msg.reply({
                        content: '處理中...',
                        fetchReply: true,
                }) as Message;
            
            
                // Get keyword and url.
                if (msg instanceof CommandInteraction) {
                    keyword = msg.options.getString('keyword', true);
                    content = msg.options.getString('url') || undefined;
                }

                if (msg instanceof Message) {
                    // console.log({ args });
                    if (args.length < 3) return replyMsg.edit(this.makeErrMsg('ARGS_MISSING'));
                    if (!(Object.values(SubCommand).find(v => v === args[1]))) return replyMsg.edit(this.makeErrMsg('ARGS_MISSING'));
                                
                    keyword = args[2];
                    content = args[3] || msg.attachments.first()?.url;
                }

                if (subCommand === SubCommand.NEW) {
                    if (!content) return replyMsg.edit(this.makeErrMsg('ARGS_MISSING'));
                    if (
                        msg instanceof Message && 
                        ((msg.attachments.first()?.size! / 1024 / 1024) > 10)
                    ) {
                        return this.replyMsg.get(msg.id)?.edit(this.makeErrMsg('IMAGE_TOO_LARGE'));
                    }
                }

                break;
        }

        if (!keyword) return log(Error('Unable to find the keyword!'));

        const props: Props = {
            targetKeyword: keyword,
            content,
            msg,
            author:  'author' in msg ? msg.author : msg.user,
            replyMsg,
            model: new ReplyDb(this.client, msg.guildId).model,
            doc: null
        };

        this[subCommand](props);
    }

    private async new(props: Props) {
        const { replyMsg, targetKeyword } = props;

        if (await this.checkKeywordExist(props, targetKeyword)) {
            replyMsg.edit({
                content: this.makeErrMsg('KEYWORD_EXIST'),
                embeds: [await this.makeKeywordEmbed(props, 'conflict')]
            });
            return;
        }

        const correct = await this.handleCheckMenu(props, props.replyMsg);
        if (!correct) return;

        const res = await this.uploadImgur(props);
        if (!res) return replyMsg.edit(this.makeErrMsg('IMAGE_UPLOAD_FAILED'));

        await this.appendData(res, props);
        await replyMsg.edit(this.makeSuccessEmbed(res, props));
    }

    private async edit(props: Props) {
        const { author, replyMsg, targetKeyword, model } = props;
        
        if (!await this.checkKeywordExist(props, targetKeyword)) {
            replyMsg.edit({
                content: this.makeErrMsg('KEYWORD_NOT_EXIST')
            });
            return;
        }

        props.doc = await model.findOne({ keyword: targetKeyword })!.exec();

        const btnRow = new ActionRowBuilder<ButtonBuilder>({
            components: [
                new ButtonBuilder({
                    style: ButtonStyle.Primary,
                    customId: 'addKeyword',
                    label: '添加觸發詞'
                }),
                new ButtonBuilder({
                    style: ButtonStyle.Primary,
                    customId: 'addContent',
                    label: '添加圖片'
                }),
                new ButtonBuilder({
                    style: ButtonStyle.Danger,
                    customId: 'delete',
                    label: '刪除'
                }),
                new ButtonBuilder({
                    style: ButtonStyle.Secondary,
                    customId: 'exit',
                    label: '✖️'
                })
            ]
        })

        const menu = await replyMsg.edit({
            content: ' ',
            embeds: [await this.makeKeywordEmbed(props, 'editPreview')],
            components: [btnRow]
        });

        const collected = await this.handleComponents(menu, author);

        await menu?.edit({ components: [new ActionRowBuilder<ButtonBuilder>({ components: [btnRow.components.pop()!] })] });

        switch(collected.customId) {
            case 'exit':
                await this.endMenu(menu);
                break;
                
            case 'addKeyword':
            case 'addContent':
                await this.add(props, collected.customId);
                break;

            case 'delete':
                await this.delete(props);
                break;
        }
    }

    private async get(props: Props) {
        const { msg, targetKeyword } = props;

        const menu = await msg.reply({
            content: ' ',
            embeds: [await this.makeKeywordEmbed(props, 'preview')],
            // components: [btnRow],
            ephemeral: true
        });
    }
        
    private async add(props: Props, mode: 'addKeyword' | 'addContent') {
        const { author, replyMsg } = props;

        const askMsg = await replyMsg.channel.send('請回覆要添加的內容:');
        const collected = await Promise.race([
            askMsg.channel.awaitMessages({ filter: msg => msg.author === author, max: 1 }),
            this.handleComponents(replyMsg, author)
        ])
        if (collected instanceof MessageComponentInteraction) {
            askMsg.delete();
            this.endMenu(replyMsg);
            return;
        } else {
            replyMsg.edit({ components: [] });
        }
        const resMsg = collected.first()!;

        let dbRes: boolean = false;
        if (mode === 'addContent') {
            props.content = resMsg.content || resMsg.attachments.first()?.url;

            const correct = await this.handleCheckMenu(props, askMsg);
            if (!correct) return;

            const res = await this.uploadImgur(props);
            if (!res) {
                askMsg.delete();
                resMsg.delete();
                replyMsg.edit(this.makeErrMsg('IMAGE_UPLOAD_FAILED'));
                return;
            }

            dbRes = await this.updateData({
                url: res.link,
                deleteHash: res.deleteHash
            }, props);
        }
        if (mode === 'addKeyword') {
            if (await this.checkKeywordExist(props, resMsg.content)) {
                replyMsg.edit({ content: this.makeErrMsg('KEYWORD_EXIST') });
                askMsg.delete();
                return;
            }
            dbRes = await this.updateData(resMsg.content, props);
        }


        replyMsg.edit({
            content: dbRes ? '\\✔️ | 操作成功，觸發詞已更新。' : this.makeErrMsg('DB_UPDATE_FAILED'),
            embeds: [await this.makeKeywordEmbed(props, 'editPreview')],
            components: []
        });

        askMsg.delete();
        resMsg.delete();
    }

    private async delete(props: Props) {
        const { replyMsg, model, targetKeyword, author } = props;

        const doc = await model.findOne({ keyword: targetKeyword });
        if (!doc) return;
        const noOptions = doc.keyword.length + doc.response.length === 2;
        const menu = await replyMsg.fetch();

        const seleteRow = new ActionRowBuilder<StringSelectMenuBuilder>({
            components: [
                new StringSelectMenuBuilder({
                    customId: 'list',
                    maxValues: 1,
                    options: [
                        ...doc.keyword.map(v => { return { label: v, value: v }  }),
                        ...doc.response.map(v => { return { label: v.url, value: v.url }  })
                    ]
                })
            ]
        });
        const optionsRow = new ActionRowBuilder<ButtonBuilder>({
            components: [
                new ButtonBuilder({
                    style: ButtonStyle.Danger,
                    customId: 'deleteAll',
                    label: '全部刪除',
                    emoji: '⚠️'
                }),
                ButtonBuilder.from(menu.components[0].components[0] as ButtonComponent)
            ]
        });
        const rows = noOptions ? [optionsRow] : [optionsRow, seleteRow];

        await menu.edit({
            content: noOptions ? '觸發詞與圖片無多餘選項時，將刪除**整個**觸發詞' : '請選擇要刪除的項目',
            components: rows
        });

        const collected = await this.handleComponents(menu, author);

        let deletePart;
        let showPreview = true;
        if (collected.isStringSelectMenu()) {
            const value = collected.values[0];
            if (this.isURL(value)) {
                const { deleteHash } = doc.response.find(v => v.url === value)!;

                deletePart = `圖片 \`${value}\` `;
                await this.deleteImgur(deleteHash);
                await doc.updateOne({ $pull: { response: { url: value } } });
            } else {
                deletePart = `觸發詞 \`${value}\``;
                await doc.updateOne({ $pull: { keyword: value } });
            }
        } else {
            switch(collected.customId) {
                case 'deleteAll':
                    showPreview = false
                    deletePart = `觸發詞 \`${targetKeyword}\` 整體`;
                    doc.response.forEach(v => this.deleteImgur(v.deleteHash));
                    await doc.remove();
                    break;

                case 'exit':
                    this.endMenu(menu);
                    return;
            }
        }

        menu.edit({
            content: `\\✔️ | ${deletePart}已移除。`,
            embeds: showPreview ? [await this.makeKeywordEmbed(props, 'editPreview')] : [],
            components: []
        })
    }

    private handleCheckMenu(props: Props, editMsg: Message): Promise<boolean> {
        const { author, content } = props;
        return new Promise(async (resolve, reject) => {
            if (!this.isURL(content)) {
                editMsg.edit(this.makeErrMsg('URL_INCORRECT'));
                return resolve(false);
            }
            editMsg.edit({ ...this.makeCheckMenu(props), content: '確認階段' });
            
            const filter = (i: Interaction) => i.user.id === author.id;
            const collector = editMsg.createMessageComponentCollector({ filter, time: this.checkTime * 1000 });

            collector?.once('collect', (i) => {
                if (i.customId === 'no') return collector.stop('CANCEL');
                collector.stop('PASS');
                resolve(true);
            });

            collector?.once('end', (collected, reason) => {
                if (reason === 'PASS') {
                    editMsg.edit({
                        content: '已確認，上傳圖片中...',
                        embeds: [],
                        components: []
                    });
                    return;
                }
                let result: string = '\\❎ | ';
                if (reason !== 'CANCEL') result += '時限已過，'
                editMsg.edit({
                    content: result + '取消中...',
                    embeds: [],
                    components: []
                })
                .then(m => setTimeout(() => m.delete(), 5000));
                resolve(false);
            });
        });
    }

    private async handleComponents(menu: Message, author: User) {
        const filter = (interaction: Interaction) => interaction.user.id === author.id;
        const collector = menu?.createMessageComponentCollector({ filter, max: 1 });

        return new Promise((resolve: (arg: MessageComponentInteraction) => void, reject) => {
            collector?.once('collect', c => {
                c.deferUpdate();
                resolve(c);
            });
        });
    }

    private makeCheckMenu(props: Props): MessageEditOptions {
        const { targetKeyword, content } = props;
        const embed = new EmbedBuilder({
           author: { name: '請確認以下內容是否正確' },
           fields: [
                { name: '觸發詞', value: targetKeyword }
           ],
           image: { url: content! },
           footer: { text: `時限 ${this.checkTime} 秒` }
        });

        const btn = [
            new ButtonBuilder({
                customId: 'yes',
                label: 'Yes',
                style: ButtonStyle.Success
            }),
            new ButtonBuilder({
                customId: 'no',
                label: 'No',
                style: ButtonStyle.Danger
            })
        ];

        const row = new ActionRowBuilder<ButtonBuilder>({ components: btn });
        return { embeds: [embed], components: [row] };
    }

    private async uploadImgur(props: Props): Promise<void | ImgurResData> {
        const { content } = props;
        const formData = new FormData();
        formData.append('image', content);
        formData.append('type', 'url');

        let data;
        try {
            const res = await fetch('https://api.imgur.com/3/upload', {
                method: 'POST',
                headers: {
                    Authorization: 'Client-ID ' + process.env.IMGUR_CLIENT_ID
                },
                body: formData
            });
            const body = await res.json();
            if (!body.success) throw body;
            data = body.data;
        } catch (err) {
            return console.error(err);
        }

        return {
            link: data.link,
            deleteHash: data.deletehash
        }
    }

    private async deleteImgur(deleteHash: string): Promise<void> {
        const url = 'https://api.imgur.com/3/image/' + deleteHash;

        try {
            const res = await fetch(url, {
                method: 'DELETE',
                headers: {
                    Authorization: 'Client-ID ' + process.env.IMGUR_CLIENT_ID
                }
            });
            const body = await res.json();
            if (!body.success) throw body;
        } catch (err) {
            console.error(err);
        }
    }

    private async appendData(imgurRes: ImgurResData, props: Props) {
        const { model, targetKeyword, author } = props;
        return new model({
            keyword: [targetKeyword],
            response: [{
                url: imgurRes.link,
                deleteHash: imgurRes.deleteHash
            }],
            createBy: author.id,
            count: 0
        }).save();
    }

    private async updateData(updateData: string | { url: string, deleteHash: string }, props: Props) {
        const { model, targetKeyword } = props;
        try {
            await model.findOneAndUpdate(
                { keyword: targetKeyword },
                updateData instanceof Object
                    ? { $push: { response: { url: updateData.url, deleteHash: updateData.deleteHash } } }
                    : { $push: { keyword: updateData } },
                { upsert: true }
            );
            return true;
        } catch (err) {
            log(err, this.options.info.name);
            return false;
        }
    }

    private async checkKeywordExist(props: Props, keyword: string) {
        const { model } = props;
        const doc = await model.exists({ keyword });
        
        return doc ? true : false;
    }

    private makeSuccessEmbed(imageRes: ImgurResData, props: Props) {
        const { targetKeyword, author } = props;
        const embed = new EmbedBuilder({
           title: '\\✨ | 觸發詞成功加入清單!',
           fields: [
                { name: '觸發詞', value: targetKeyword, inline: true },
                { name: '申請人', value: `<@${author.id}>`, inline: true }
           ],
           image: { url: imageRes.link }
        }).showVersion();

        return { embeds: [embed] , content: ' '}
    }

    private async makeKeywordEmbed(props: Props, type: 'editPreview' | 'conflict' | 'preview') {
        const { model, targetKeyword, doc: dDoc } = props;

        const doc = await model.findOne(dDoc ? { _id: dDoc._id } : { keyword: targetKeyword })!.exec();
        if (!doc) throw Error('Keyword not found');

        let embedOptions: APIEmbed;
        const defaultOptions: APIEmbed = {
            fields: [
                {
                    name: '觸發詞\u2800\u2800',
                    value: doc.keyword.map(s => s === targetKeyword ? bold(s) : s).join('\n')!,
                    inline: true
                }
            ],
            thumbnail: { url: doc.response[0].url }
        };
        switch(type) {
            case 'editPreview':
                embedOptions = {
                    author: { name: '🔍 編輯觸發詞' },
                    fields: [
                        ...defaultOptions.fields!,
                        {
                            name: '圖片',
                            value: doc.response.map(v => v.url).join('\n'),
                            inline: true
                        }
                    ]
                };
                break;

            case 'preview':
                embedOptions = {
                    author: { name: '🔍 預覽觸發詞' },
                    fields: [
                        ...defaultOptions.fields!,
                        {
                            name: '圖片',
                            value: doc.response.map(v => v.url).join('\n'),
                            inline: true
                        }
                    ],
                    image: { url: doc.response[0].url },
                    thumbnail: undefined
                };
                break;

            case 'conflict':
                embedOptions = {
                    author: { name: '與此觸發詞衝突' }
                };
                break;
        }

        return new EmbedBuilder({ ...defaultOptions, ...embedOptions });
    }

    private async endMenu(menu: Message) {
        await menu.edit({
            content: '編輯已結束',
            components: []
        })
    }

    private makeErrMsg(type: ErrorType) {
        const hint =
            codeBlock('用法: i.reply <new|edit> <關鍵字> [圖片網址]') + '\n' +
            '常常打錯指令嗎？又或者忘記指令怎麼打嗎？斜線指令或許正適合你，在對話框輸入\`/\`試試看吧！\n\n' +
            `註: <>為必填 []為選擇性 |為或者，使用 ${inlineCode('i.help reply')} 以獲得更多資訊。`;

        return '\\❌ | ' + ErrorMessages[type] +
            (type === 'ARGS_MISSING' ? '\n' + hint : '');
    }
}