import { Collection, CommandInteraction, Formatters, Interaction, Message, MessageActionRow, MessageButton, MessageOptions, User } from "discord.js";
import fetch from "node-fetch";
import FormData from "form-data";
import { log } from "../utils/logger";
import { Client } from "../structures/Client";
import { Command } from "../structures/Command";
import MessageEmbed from "../structures/MessageEmbed";
import ReplyDb, { ReplyData } from "../models/ReplyDb";
import { Model } from "mongoose";

const { codeBlock, inlineCode, bold } = Formatters;

enum CommandMode {
    NEW = 'new',
    ADD = 'add'
}

enum AddCommandMode {
    KEYWORD = 'new_keyword',
    IMAGE = 'new_url'
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

export default class Reply extends Command {
    // private msg: CommandInteraction | Message | undefined;
    private props: Collection<string, {
        targetKeyword: string;
        content: string;
        author: User;
        model: Model<ReplyData>;
    }> = new Collection();
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
                    'i.reply add 觸發詞 新觸發詞' + '\n' +
                    'i.reply add 觸發詞 https://i.imgur.com/新圖片.jpg' + '\n' +
                    '/reply new keyword:觸發詞 url:https://i.imgur.com/example.jpg' + '\n' +
                    '/reply add keyword:觸發詞 mode:觸發詞 new_content:新觸發詞' + '\n' +
                    '/reply add keyword:觸發詞 mode:圖片 snew_content:https://i.imgur.com/新圖片.jpg',
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
                            name: CommandMode.NEW,
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
                            name: CommandMode.ADD,
                            description: '添加觸發詞/圖片',
                            options: [
                                {
                                    type: 'STRING',
                                    name: 'keyword',
                                    description: '目標觸發詞',
                                    required: true
                                },
                                {
                                    type: 'STRING',
                                    name: 'mode',
                                    description: '要加入新圖片還是觸發詞',
                                    choices: [
                                        {
                                            name: '觸發詞',
                                            value: AddCommandMode.KEYWORD
                                        },
                                        {
                                            name: '圖片',
                                            value: AddCommandMode.IMAGE
                                        }
                                    ],
                                    required: true
                                },
                                {
                                    type: 'STRING',
                                    name: 'new_content',
                                    description: '要加入的觸發詞或是圖片URL',
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
        let mode: string | undefined;
        let addMode: AddCommandMode | undefined;
        
        this.replyMsg.set(msg.id, await msg.reply({ content: '處理中...', fetchReply: true }) as Message);

        // Get keyword and url.
        if (msg instanceof CommandInteraction) {
            mode = msg.options.getSubcommand(true);
            keyword = msg.options.getString('keyword')!;
            if (msg.options.getSubcommand(true) === CommandMode.NEW) {
                content = msg.options.getString('url')!;
            }
            if (msg.options.getSubcommand(true) === CommandMode.ADD) {
                content = msg.options.getString('new_content')!;
                addMode = Object.values(AddCommandMode).find(v => v === msg.options.getString('mode')!);
            }
            // console.log(this.targetKeyword, this.content);
        }

        if (msg instanceof Message) {
            // console.log({ args });
            if (args.length <= 2) return this.replyMsg.get(msg.id)!.edit(this.sendErr('ARGS_MISSING'));
            if (!(Object.values(CommandMode).find(v => v === args[1]))) return this.replyMsg.get(msg.id)!.edit(this.sendErr('ARGS_MISSING'));
            mode = args[1];
            keyword = args[2];

            if (args[3]) {
                content = args[3];
                addMode = content.match(/(https?:\/\/[^ ]*)/) ? AddCommandMode.IMAGE : AddCommandMode.KEYWORD;
            } else {
                content = msg.attachments.first()?.url;
                if (!content) return this.replyMsg.get(msg.id)!.edit(this.sendErr('ARGS_MISSING'));
                if ((msg.attachments.first()?.size! / 1024 / 1024) > 10) return this.replyMsg.get(msg.id)?.edit(this.sendErr('IMAGE_TOO_LARGE'));
                addMode = AddCommandMode.IMAGE;
            }
        }

        this.props.set(msg.id, {
            targetKeyword: keyword!,
            content: content!,
            author:  'author' in msg ? msg.author : msg.user,
            model: new ReplyDb(this.client, msg.guildId).model
        });

        // Check sub command mode.
        if (mode === CommandMode.NEW) {
            await this.new(msg.id);
        }
        if (mode === CommandMode.ADD) {
            await this.add(msg.id, addMode!);
        }

        this.props.delete(msg.id);
        this.replyMsg.delete(msg.id);
    }

    private async new(msgId: string) {
        const { model, targetKeyword, content } = this.props.get(msgId)!;
        if (await model.exists({ keyword: targetKeyword })) {
            this.replyMsg.get(msgId)!.edit({
                content: this.sendErr('KEYWORD_EXIST'),
                embeds: [await this.makeKeywordEmbed(targetKeyword, msgId)]
            });
            return;
        }
        const correct = await this.handleCheckMenu(msgId);
        if (!correct) return;
        const res = await this.uploadImgur(msgId);
        if (!res) return this.replyMsg.get(msgId)!.edit(this.sendErr('IMAGE_UPLOAD_FAILED'));
        await this.appendData(res, msgId);
        await this.replyMsg.get(msgId)!.edit(this.makeSuccessEmbed(res, msgId));
    }

    private async add(msgId: string, mode: AddCommandMode) {
        const { content } = this.props.get(msgId)!;
        if (!await this.checkKeywordExist(msgId)) return this.replyMsg.get(msgId)!.edit(this.sendErr('KEYWORD_NOT_EXIST'));
        console.log('add command mode: ', mode);
        let dbRes: boolean = false;
        if (mode === AddCommandMode.IMAGE) {
            const correct = await this.handleCheckMenu(msgId);
            if (!correct) return;
            const res = await this.uploadImgur(msgId);
            if (!res) return this.replyMsg.get(msgId)!.edit(this.sendErr('IMAGE_UPLOAD_FAILED'));
            dbRes = await this.updateData({
                url: res.link,
                deleteHash: res.deleteHash
            }, msgId);
        }
        if (mode === AddCommandMode.KEYWORD) {
            dbRes = await this.updateData(content, msgId);
        }

        if (dbRes) await this.replyMsg.get(msgId)!.edit('\\✔️ | 操作成功，觸發詞已更新。');
    }

    private handleCheckMenu(msgId: string): Promise<boolean> {
        const { author, content } = this.props.get(msgId)!;
        return new Promise(async (resolve, reject) => {
            if (!this.isURL(content)) {
                this.replyMsg.get(msgId)?.edit(this.sendErr('URL_INCORRECT'));
                return resolve(false);
            }
            this.replyMsg.get(msgId)!.edit({ ...this.makeCheckMenu(msgId), content: '確認階段' });
            
            const filter = (i: Interaction) => i.user.id === author.id;
            const collector = this.replyMsg.get(msgId)!.createMessageComponentCollector({ filter, time: this.checkTime * 1000 });

            collector?.once('collect', (i) => {
                if (i.customId === 'no') return collector.stop('CANCEL');
                collector.stop('PASS');
                resolve(true);
            });

            collector?.once('end', (collected, reason) => {
                if (reason === 'PASS') {
                    this.replyMsg.get(msgId)!.edit({
                        content: '已確認，上傳圖片中...',
                        embeds: [],
                        components: []
                    });
                    return;
                }
                let result: string = '\\❎ | ';
                if (reason !== 'CANCEL') result += '時限已過，'
                this.replyMsg.get(msgId)!.edit({
                    content: result + '取消中...',
                    embeds: [],
                    components: []
                })
                .then(m => setTimeout(() => m.delete(), 5000));
                resolve(false);
            });
        });
    }

    private makeCheckMenu(msgId: string): MessageOptions {
        const { targetKeyword, content } = this.props.get(msgId)!;
        const embed = new MessageEmbed()
            .setAuthor({ name: '請確認以下內容是否正確' })
            .addField('觸發詞', targetKeyword)
            .setImage(content)
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

    private async uploadImgur(msgId: string): Promise<void | ImgurResData> {
        const { content } = this.props.get(msgId)!;
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
            return log(err, this.options.info.name);
        }

        return {
            link: data.link,
            deleteHash: data.deletehash
        }
    }

    private async appendData(imgurRes: ImgurResData, msgId: string) {
        const { model, targetKeyword, author } = this.props.get(msgId)!;
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

    private async updateData(updateData: string | { url: string, deleteHash: string }, msgId: string) {
        const { model, targetKeyword } = this.props.get(msgId)!;
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

    private async checkKeywordExist(msgId: string) {
        const { model, targetKeyword } = this.props.get(msgId)!;
        const doc = await model.findOne({ keyword: targetKeyword });
        
        if (doc) {
            return true;
        } else {
            log('Keyword not found.', this.options.info.name);
            return false;
        }
    }

    private makeSuccessEmbed(imageRes: ImgurResData, msgId: string) {
        const {  targetKeyword, author } = this.props.get(msgId)!;
        const embed = new MessageEmbed()
            .setTitle('\\✨ | 觸發詞成功加入清單!')
            .addField('觸發詞', targetKeyword, true)
            .addField('申請人', `<@${author.id}>`, true)
            .setImage(imageRes.link)
            .showVersion();
        return { embeds: [embed] , content: ' '}
    }

    private async makeKeywordEmbed(keyword: string, msgId: string) {
        const { model, targetKeyword } = this.props.get(msgId)!;
        const doc = await model.findOne({ keyword })!.exec();
        return new MessageEmbed({
            author: { name: '與此觸發詞衝突' },
            fields: [{ name: '觸發詞', value: doc?.keyword.map(s => s === targetKeyword ? bold(s) : s).join(', ')! }],
            thumbnail: { url: doc?.response[0].url }
        })
    }

    private sendErr(type: ErrorType) {
        const hint =
            codeBlock('用法: i.reply <new|add> <關鍵字> [圖片網址]') + '\n' +
            `註: <>為必填 []為選擇性 |為或者，使用 ${inlineCode('i.help reply')} 以獲得更多資訊。`;

        return '\\⛔ | ' + ErrorMessages[type] +
            (type === 'ARGS_MISSING' ? '\n' + hint : '');
    }
}