import puppeteer, { Browser, Page, Protocol } from "puppeteer";
import { loggerInit } from "../utils/logger.js";
import { writeFile, readFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = loggerInit('WebCrawler');

export default abstract class WebCrawler {
    protected static browser: Browser;
    protected abstract cookies?: Protocol.Network.Cookie[];
    protected abstract page?: Page;

    static async initBrowser() {
        this.browser = await puppeteer.launch({ headless: 'new', executablePath: '/usr/bin/google-chrome-stable' });
        log('Browser has initialized.');
    }

    protected async initPage(url: URL) {
        const page = await WebCrawler.browser.newPage();
        page.goto(url.href);

        if (this.cookies) {
            log('Loading cookies for ' + url.host);
            page.setCookie(...this.cookies);
        }

        return page;
    }

    /**
     * Load cookies from /assets.
     * @param filename File name for cookie file
     */
    protected loadCookies(filename: string, callback?: (err: Error | null, cookie?: Protocol.Network.Cookie[]) => void) {
        readFile(__dirname + `/../../assets/${filename}`, async (err, data) => {
            if (err) {
                log('Failed to load cookies! Continue inti page without been login.');
                log(err);

                if (callback) callback(err);
            } else {
                this.cookies = JSON.parse(data.toString());

                if (callback) callback(null, this.cookies);
            }
        });
    }

    /**
     * Save current page's cookies to a file.
     * @param filename filename for saved cookies. e.g. `cookie-twitter`
     */
    protected async exportCookies(filename: string) {
        if (!this.page) throw Error('Page not initialized yet!');

        this.cookies = await this.page.cookies();
        writeFile(
            __dirname + '/../../assets/' + filename,
            JSON.stringify(this.cookies),
            err => { if (err) throw err }
        );
    }
}