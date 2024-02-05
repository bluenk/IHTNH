import { Page, Protocol } from "puppeteer";
import WebCrawler from "../structures/WebCrawler.js";

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

        await this.page.goto(url.toString());
        await this.page.waitForSelector('head meta');

        const title = await (await (await this.page.$('meta[property="og:title"]'))!.getProperty('content')).jsonValue();
        const description = await (await (await this.page.$('meta[property="og:description"]'))!.getProperty('content')).jsonValue();
        const image = await (await (await this.page.$('meta[property="og:image"]'))!.getProperty('content')).jsonValue();
        
        this.exportCookies('cookie-BAHA');

        return { url, title, description, image: new URL(image) }
    }
}