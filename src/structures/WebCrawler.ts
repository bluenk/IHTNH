import puppeteer, { Browser, Page, Protocol } from "puppeteer";
import { log } from "../utils/logger.js";

export default abstract class WebCrawler {
    protected browser?: Browser;
    protected abstract cookies?: Protocol.Network.Cookie[];
    protected abstract page?: Page;

    public async initBrowser() {
        this.browser = await puppeteer.launch({ headless: 'new', executablePath: '/usr/bin/google-chrome-stable' });
        log('Browser has initialized.');
    }

    protected async initPage(url: URL) {
        if (!this.browser) await this.initBrowser();
        if (!this.browser) return;

        const page = await this.browser.newPage();
        page.goto(url.href);

        if (this.cookies) {
            page.setCookie(...this.cookies);
        }

        return page;
    }

    // protected async openNewPage(url: URL) {
    //     const page = await this.browser.newPage();
        
    // }
}