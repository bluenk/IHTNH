import { Collection, CommandInteraction, Formatters, Interaction, Message, MessageActionRow, MessageButton, MessageComponentInteraction, MessageEmbedOptions, MessageOptions, User } from "discord.js";
import fetch from "node-fetch";
import FormData from "form-data";
import { log } from "../utils/logger";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";
import MessageEmbed from "../structures/MessageEmbed";
import ReplyDb, { ReplyData } from "../models/ReplyDb";
import { Model } from "mongoose";
import { reject } from "lodash";

const { codeBlock, inlineCode, bold } = Formatters;

enum SubCommand {
    NEW = 'new',
    EDIT = 'edit'
}

enum ErrorMessages {
    ARGS_MISSING = '指令格式錯誤。',
    URL_INCORRECT = '圖片網址不正確。',
    KEYWORD_EXIST = '此觸發詞已經在清單內，請勿重複添加。',
    KEYWORD_NOT_EXIST = '找不到此觸發詞，請確認輸入格式是否正確。',
    IMAGE_UPLOAD_FAILED = '圖片上傳失敗，請聯絡管理員處理。',
    IMAGE_TOO_LARGE = '圖片檔案太大，上限為10MB。'
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
    replyMsg: Message;
    model: Model<ReplyData>;
}

export default class Reply extends Command {
    private readonly checkTime = 60; //sec

    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'reply',
                fullName: '建立/編輯觸發詞',
                detail: '使用者打出特定詞彙時會回覆對應圖片。',
                usage: ['reply new', 'reply add'],
                example:
                    'i.reply new 觸發詞 https://i.imgur.com/example.jpg' + '\n' +
                    'i.reply edit 觸發詞' + '\n' +
                    '/reply new keyword:觸發詞 url:https://i.imgur.com/example.jpg' + '\n' +
                    '/reply edit keyword:觸發詞',
                enable: true
            },
            commandOptions: [
                {
                    type: 'CHAT_INPUT',
                    name: 'reply',
                    description: '建立/編輯觸發詞',
                    options: [
                        {
                            type: 'SUB_COMMAND',
                            name: SubCommand.NEW,
                            description: '新增觸發詞',
                            options: [
                                {
                                    type: 'STRING',
                                    name: 'keyword',
                                    description: '觸發詞',
                                    required: true
                                },
                                {
                                    type: 'STRING',
                                    name: 'url',
                                    description: '回應的圖片',
                                    required: true
                                }
                            ]
                        },
                        {
                            type: 'SUB_COMMAND',
                            name: SubCommand.EDIT,
                            description: '編輯觸發詞',
                            options: [
                                {
                                    type: 'STRING',
                                    name: 'keyword',
                                    description: '目標觸發詞',
                                    required: true
                                }
                            ]
                        }
                    ]
                }
            ]
        })
    }
    
    public async run(msg: CommandInteraction | Message, args: string[]) {
        if (!msg.inGuild()) return;
        if (!msg.channel) return;
        
        let keyword: string | undefined;
        let content: string | undefined;
        let subCommand: string | undefined;
        
        const replyMsg = await msg.reply({ content: '處理中...', fetchReply: true }) as Message;

        // Get keyword and url.
        if (msg instanceof CommandInteraction) {
            subCommand = msg.options.getSubcommand(true);
            keyword = msg.options.getString('keyword')!;
            if (subCommand === SubCommand.NEW) {
                content = msg.options.getString('url')!;
            }
            if (subCommand === SubCommand.EDIT) {
                // content = msg.options.getString('new_content')!;
                // addMode = Object.values(AddCommandMode).find(v => v === msg.options.getString('mode')!);
            }
            // console.log(this.targetKeyword, this.content);
        }

        if (msg instanceof Message) {
            // console.log({ args });
            if (args.length <= 2) return this.replyMsg.get(msg.id)!.edit(this.sendErr('ARGS_MISSING'));
            if (!(Object.values(SubCommand).find(v => v === args[1]))) return this.replyMsg.get(msg.id)!.edit(this.sendErr('ARGS_MISSING'));
            subCommand = args[1];
            keyword = args[2];

            if (args[3]) {
                content = args[3];
                // addMode = content.match(/(https?:\/\/[^ ]*)/) ? AddCommandMode.IMAGE : AddCommandMode.KEYWORD;
            } else {
                content = msg.attachments.first()?.url;
                if (!content) return this.replyMsg.get(msg.id)!.edit(this.sendErr('ARGS_MISSING'));
                if ((msg.attachments.first()?.size! / 1024 / 1024) > 10) return this.replyMsg.get(msg.id)?.edit(this.sendErr('IMAGE_TOO_LARGE'));
                // addMode = AddCommandMode.IMAGE;
            }
        }

        const props: Props = {
            targetKeyword: keyword!,
            // content: content!,
            author:  'author' in msg ? msg.author : msg.user,
            replyMsg,
            model: new ReplyDb(this.client, msg.guildId).model
        };

        // Check sub command mode.
        if (subCommand === SubCommand.NEW) {
            await this.new(props);
        }
        if (subCommand === SubCommand.EDIT) {
            await this.edit(props);
        }
    }

    private async new(props: Props) {
        const { model, targetKeyword, content, replyMsg } = props;
        if (await this.checkKeywordExist(props)) {
            replyMsg.edit({
                content: this.sendErr('KEYWORD_EXIST'),
                embeds: [await this.makeKeywordEmbed(props, 'conflict')]
            });
            return;
        }
        const correct = await this.handleCheckMenu(props, props.replyMsg);
        if (!correct) return;
        const res = await this.uploadImgur(props);
        if (!res) return replyMsg.edit(this.sendErr('IMAGE_UPLOAD_FAILED'));
        await this.appendData(res, props);
        await replyMsg.edit(this.makeSuccessEmbed(res, props));
    }

    private async edit(props: Props) {
        const { author, replyMsg } = props;
        if (!await this.checkKeywordExist(props)) {
            replyMsg.edit({
                content: this.sendErr('KEYWORD_NOT_EXIST')
            });
            return;
        }

        const btnRow = new MessageActionRow({
            components: [
                new MessageButton({
                    type: 'BUTTON',
                    style: 'PRIMARY',
                    customId: 'addKeyword',
                    label: '添加觸發詞'
                }),
                new MessageButton({
                    type: 'BUTTON',
                    style: 'PRIMARY',
                    customId: 'addContent',
                    label: '添加圖片'
                }),
                new MessageButton({
                    type: 'BUTTON',
                    style: 'DANGER',
                    customId: 'delete',
                    label: '刪除'
                }),
                new MessageButton({
                    type: 'BUTTON',
                    style: 'SECONDARY',
                    customId: 'exit',
                    label: '✖️'
                })
            ]
        })

        const menu = await replyMsg.edit({
            content: ' ',
            embeds: [await this.makeKeywordEmbed(props, 'preview')],
            components: [btnRow]
        });

        const filter = (interaction: Interaction) => interaction.user.id == author.id;
        const collector = menu?.createMessageComponentCollector({ filter, max: 1 });
        const collected = await new Promise((resolve: (arg: MessageComponentInteraction) => void, reject) => {
            collector?.once('end', c => resolve(c.first()!));
        });

        menu?.edit({ components: [] });

        switch(collected.customId) {
            case 'exit':
                await menu?.edit({ content: '編輯已結束' });
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
        
    private async add(props: Props, mode: 'addKeyword' | 'addContent') {
        const { author, replyMsg } = props;

        const askMsg = await replyMsg.channel.send('請回覆要添加的內容:');
        const collected = await askMsg.channel.awaitMessages({ filter: msg => msg.author === author, max: 1 });
        const resMsg = collected.first()!;

        let dbRes: boolean = false;
        if (mode === 'addContent') {
            props.content = resMsg.content;

            const correct = await this.handleCheckMenu(props, askMsg);
            if (!correct) return;

            const res = await this.uploadImgur(props);
            if (!res) {
                askMsg.delete();
                resMsg.delete();
                replyMsg.edit(this.sendErr('IMAGE_UPLOAD_FAILED'));
                return;
            }

            dbRes = await this.updateData({
                url: res.link,
                deleteHash: res.deleteHash
            }, props);
        }
        if (mode === 'addKeyword') {
            dbRes = await this.updateData(resMsg.content, props);
        }

        if (dbRes) {
            replyMsg.edit({
                content: '\\✔️ | 操作成功，觸發詞已更新。',
                embeds: [await this.makeKeywordEmbed(props, 'preview')]
            });
        }
        
        askMsg.delete();
        resMsg.delete();
    }

    private async delete(props: Props) {
        
    }

    private handleCheckMenu(props: Props, editMsg: Message): Promise<boolean> {
        const { author, content } = props;
        return new Promise(async (resolve, reject) => {
            if (!this.isURL(content)) {
                editMsg.edit(this.sendErr('URL_INCORRECT'));
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

    private makeCheckMenu(props: Props): MessageOptions {
        const { targetKeyword, content } = props;
        const embed = new MessageEmbed()
            .setAuthor({ name: '請確認以下內容是否正確' })
            .addField('觸發詞', targetKeyword)
            .setImage(content!)
            .setFooter({ text: `時限 ${this.checkTime} 秒` });

        const btn = [
            new MessageButton({
                customId: 'yes',
                label: 'Yes',
                style: 'SUCCESS'
            }),
            new MessageButton({
                customId: 'no',
                label: 'No',
                style: 'DANGER'
            })
        ];

        const row = new MessageActionRow({ components: btn });
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

    private async checkKeywordExist(props: Props) {
        const { model, targetKeyword } = props;
        const doc = await model.exists({ keyword: targetKeyword });
        
        return doc ? true : false;
    }

    private makeSuccessEmbed(imageRes: ImgurResData, props: Props) {
        const {  targetKeyword, author } = props;
        const embed = new MessageEmbed()
            .setTitle('\\✨ | 觸發詞成功加入清單!')
            .addField('觸發詞', targetKeyword, true)
            .addField('申請人', `<@${author.id}>`, true)
            .setImage(imageRes.link)
            .showVersion();
        return { embeds: [embed] , content: ' '}
    }

    private async makeKeywordEmbed(props: Props, type: 'preview' | 'conflict') {
        const { model, targetKeyword } = props;
        const doc = await model.findOne({ keyword: targetKeyword })!.exec();
        if (!doc) throw Error('Keyword not founded');

        let embedOptions: MessageEmbedOptions;
        const defaultOptions: MessageEmbedOptions = {
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
            case 'preview':
                embedOptions = {
                    author: { name: '觸發詞預覽' },
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

            case 'conflict':
                embedOptions = {
                    author: { name: '與此觸發詞衝突' }
                };
                break;
        }

        return new MessageEmbed({ ...defaultOptions, ...embedOptions });
    }

    private sendErr(type: ErrorType) {
        const hint =
            codeBlock('用法: i.reply <new|add> <關鍵字> [圖片網址]') + '\n' +
            `註: <>為必填 []為選擇性 |為或者，使用 ${inlineCode('i.help reply')} 以獲得更多資訊。`;

        return '\\⛔ | ' + ErrorMessages[type] +
            (type === 'ARGS_MISSING' ? '\n' + hint : '');
    }
}