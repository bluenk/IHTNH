import { DMChannel, Message, PartialGroupDMChannel } from 'discord.js';
import fs from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { Client } from "../structures/Client.js";
import { Handler } from "../structures/Handler.js";
import EmbedBuilder from "../structures/EmbedBuilder.js";
import { log } from "../utils/logger.js";
import extractURL from "../utils/extractURL.js";

export default class AntiScam extends Handler {
    private domains: string[] = [];
    private badUsers: string[] = [];
    public constructor(public client: Client) {
        super(client, {
            info: {
                name: 'antiScam',
                fullName: '反釣魚',
                detail: '偵測釣魚連結並移除',
                enable: true
            }
        });
        this.updateDomainList();
    }

    public execute(): void {}

    public run(msg: Message) {
        if (!this.domains.length) return log(new Error('Domain list data incorrect! Skip url checking.'), this.options.info.name);
        
        const urls = extractURL(msg.content);
        // console.log({ urls });

        for (const url of urls) {
            log('Checking url => ' + url, this.options.info.name);
            const domainWithPath = url.split('://')[1];
            const domain = domainWithPath.split('/')[0];
            console.log({ url, domainWithPath, domain });

            if (
                this.domains.some((scamDomain, i) => {
                    if (domain === scamDomain) {
                        log(`**SCAM LINK DETECTED**\nURL match with domain name "` + this.domains[i] + '" send by ' + msg.author.tag, this.options.info.name);
                        return true;
                    }
                })
            ) {
                msg.delete().then((thisMsg) => {
                    log(`Message has been deleted\n`, this.options.info.name);
                    this.client.channels.fetch(thisMsg.channelId).then(ch => {
                        if (!ch?.isTextBased() || ch.partial || ch instanceof DMChannel) return;
                        if (this.badUsers.some(userId => thisMsg.author.id === userId)) {
                            log('Scam bot comfirmed, kick user.', this.options.info.name);
                            ch.send({
                                embeds: [
                                    new EmbedBuilder({
                                        title: `自動禁言`,
                                        fields: [
                                            { name: '使用者', value: thisMsg.author.tag, inline: true },
                                            { name: '原因', value: '發送釣魚連結', inline: true }
                                        ]
                                    })
                                ]
                            });

                            thisMsg.member?.timeout(3600*1000, '發送釣魚連結');
                            return;
                        }
                        this.badUsers.push(thisMsg.author.id);
                        // console.log({badUsers});
                        ch.send(`<@${thisMsg.author.id}> ` + '偵測到釣魚連結，已自動移除。請注意累犯將會被禁言！');
                    })
                })
            }
        }
    }

    private async updateDomainList() {
        const data = await this.fetchDomainList();
        if (!data) return;
        this.domains = data;

        setInterval(async () => {
            const tmp = await this.fetchDomainList();
            if (tmp) {
                this.domains = tmp
                log('Domain list updated.', this.options.info.name);
            } else {
                log('Failed to updata domain list.', this.options.info.name);
            }
            // console.table(domains.slice(0, 5));
        }, 6 * 3600 * 1000);
    }

    private async fetchDomainList() {
        let githubDomains = [];
        try {
            const res = await fetch('https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.json');
            githubDomains = (await res.json()).domains;
        } catch (err) {
            log(new Error('Failed to load json from github.'), this.options.info.name);
            return console.error(err);
        }

        if (!githubDomains.length) {
            return console.error(new Error('Did not recive data from github.'));
        }
        const customDomains: string[] = JSON.parse((await fs.readFile(join(dirname(fileURLToPath(import.meta.url)), '../../assets/customDomains.json'))).toString()).domains;

        return [...new Set(customDomains.concat(githubDomains))];
    }
}