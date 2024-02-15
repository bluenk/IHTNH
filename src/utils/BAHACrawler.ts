import { Page, Protocol } from "puppeteer";
import { Parser } from "htmlparser2";
import WebCrawler from "../structures/WebCrawler.js";
import { loggerInit } from "./logger.js";

const log = loggerInit('BAHACrawler');

export interface IBAHAData {
    url: URL,
    title: string,
    description: string,
    image: URL
}

export default class BAHACrawler extends WebCrawler {
    protected cookies?: Protocol.Network.Cookie[] | undefined;
    protected page?: Page | undefined;

    constructor() {
        super();

        this.loadCookies('cookie-BAHA', async (err, cookie) => {
            this.page = await this.initPage(new URL('https://forum.gamer.com.tw/'));
        }) 
    }

    public async crawl(url: URL): Promise<IBAHAData> {
        if (!this.page) throw Error('Crawler not initialized yet!');
        
        this.page.goto(url.toString());

        try {
            log('Start crawling with apiCatch method.');
            return this.apiCatch(url);
        } catch {
            log('apiCatch method failed! switching to queryPage method.');
            return this.queryPage();
        }
    }

    private async apiCatch(url: URL) {
        if (!this.page) throw Error('Crawler not initialized yet!');

        const htmlPage = await this.page.waitForResponse(res => res.url().includes('C.php'));

        const resData: Promise<IBAHAData> =
            new Promise(async (resolve, reject) => {
                let title: string, description: string, url: string, image: string;

                const parser = new Parser({
                    onopentag(name, att) {
                        if (!(name === 'meta' && att.property)) return;
                        if (!att.property.startsWith('og:')) return;
                        if (att.property === 'og:site_name') return;

                        const metaType: keyof IBAHAData = att.property.slice(3) as keyof IBAHAData;

                        switch (metaType) {
                            case "url":
                                url = att.content;
                                break;

                            case "title":
                                title = att.content;
                                break;

                            case "description":
                                description = att.content;
                                break;

                            case "image":
                                image = att.content;
                                break;
                        }
                    },
                    onclosetag(name) {
                        if (name === 'head') {
                            if (!(title && url && image)) return reject();
                            resolve({
                                url: new URL(url),
                                description,
                                title,
                                image: new URL(image)
                            });
                        }
                    }
                })
                
                parser.write(await htmlPage.text());
                parser.end();    
            });

        if (!resData!) throw Error('Faild to catch response.');

        this.exportCookies('cookie-BAHA');

        return resData;
    }

    private async queryPage() {
        if (!this.page) throw Error('Crawler not initialized yet!');

        await this.page.waitForSelector('head meta');

        const title = await (await (await this.page.$('meta[property="og:title"]'))!.getProperty('content')).jsonValue();
        const description = await (await (await this.page.$('meta[property="og:description"]'))!.getProperty('content')).jsonValue();
        const image = await (await (await this.page.$('meta[property="og:image"]'))!.getProperty('content')).jsonValue();
        const url = await (await (await this.page.$('meta[property="og:url"]'))!.getProperty('content')).jsonValue();
        
        this.exportCookies('cookie-BAHA');

        return { url: new URL(url), title, description, image: new URL(image) }
    }
}