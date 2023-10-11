import puppeteer, { Page, Protocol } from "puppeteer";
import { writeFile, readFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loggerInit } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = loggerInit('TwitterCrawler');

export default class TwitterCrawler {
    private loginCookies: Protocol.Network.Cookie[] = [];
    private page: Page | null = null;
    
    public constructor() {
        readFile(__dirname + '/../../assets/cookie-cache', (err, data) => {
            if (err) throw err;

            this.loginCookies = JSON.parse(data.toString());
        });
    }

    public async init() {
        const browser = await puppeteer.launch({ headless: 'new', executablePath: '/usr/bin/google-chrome-stable' });
        const page = await browser.newPage();

        await page.setCookie(...this.loginCookies);

        await page.goto('https://twitter.com/');
        
        // await this.login(page);

        log('Browser has initialized.');

        this.page = page;
        return page;
    }

    public async crawl(url: URL): Promise<ITweetData> {
        if (!this.page) throw Error('Crawler not initialized yet!');

        await this.page.goto(url.toString());

        // Catch every m3u8 that can be found in the requests
        const m3u8Urls: URL[] = [];
        this.page.on('request', e => {
            const reqUrl = new URL(e.url());

            if (!(reqUrl.href.includes('pbs.twimg.com') || reqUrl.href.includes('video.twimg'))) return;

            if (
                (reqUrl.href.includes('twimg.com/ext_tw_video/') ||
                reqUrl.href.includes('twimg.com/media/') ||
                reqUrl.href.includes('twimg.com/tweet_video/')) &&
                reqUrl.href.includes('m3u8')
                ) {
                    m3u8Urls.push(reqUrl);
            }
        });
        
        // const typeMetaTag = await this.page.waitForSelector('head > meta[property="og:type"]');
        // const imageMetaTag = await this.page.waitForSelector('head > meta[property="og:image"]');
        // const tweetType = await (await typeMetaTag?.getProperty('content'))?.jsonValue();
        // const mediaUrl = await (await imageMetaTag?.getProperty('content'))?.jsonValue();

        await this.page.waitForSelector('article[tabindex="-1"]');

        const pm =
            await this.page.$$eval(
                'article[tabindex="-1"] span[data-testid="app-text-transition-container"] > span > span',
                els => els.map(el => el.innerText)
            );

        // const imageComponent = this.page.$('article[tabindex="-1"] div[data-testid=tweetPhoto]');
        // const videoComponent = this.page.$('article[tabindex="-1"] div[data-testid=videoComponent]');

        // const component = await Promise.race([imageComponent, videoComponent]);

        const components = await this.page.$$('article[tabindex="-1"] div[data-testid]');
        const componentTypes = await Promise.all(components.map(elh => elh.evaluate(el => el.getAttribute('data-testid'))));
        
        const contentStart = componentTypes.indexOf('caret') + 1;
        const contentEnd = componentTypes.indexOf('reply');
        const contentComponentTypes = componentTypes.slice(contentStart, contentEnd);
        
        // console.log({ componentTypes, contentComponentTypes });

        const authorName = await this.page.$eval('article[tabindex="-1"] div[data-testid=User-Name] span > span', el => el.innerText);
        const authorId = await this.page.$eval('article[tabindex="-1"] div[data-testid=User-Name] a > div > span', el => el.innerText);
        const authorPfP = await (await (await this.page.$('article[tabindex="-1"] div[data-testid=Tweet-User-Avatar] img'))!.getProperty('src')).jsonValue();

        const tweetUrl = await (await (await this.page.$('meta[property="og:url"]'))!.getProperty('content')).jsonValue();
        const tweetTimestamp = await (await (await this.page.$('article[tabindex="-1"] time'))!.getProperty('dateTime')).jsonValue();
        
        const description = await (await (await this.page.$('meta[property="og:description"]'))!.getProperty('content')).jsonValue();
        
        
        // Getting media URLs
        const mediaEls = await this.page.$$('article[tabindex="-1"] div > img[alt="圖片"], article[tabindex="-1"] div > video');
        const mediaUrls =
            await Promise.all(
                    mediaEls
                        .map(async el => {
                            return new URL(
                                await (
                                    await el.getProperty('src')
                                )
                                .jsonValue()
                            )
                        })
            );

        if (!mediaUrls) throw Error('Faild to get matadata from tweets.');
        
        const mediaType = 
            componentTypes.includes('videoPlayer')
                ? mediaUrls[0].protocol === 'blob:'
                    ? 'VEDIO'
                    : 'VEDIO_GIF'
                : 'IMAGE';

        return {
            url: new URL(tweetUrl),
            mediaType,
            author: { id: authorId, name: authorName, pfp: new URL(authorPfP) },
            mediaUrls:
                mediaType === 'VEDIO'
                    ? [m3u8Urls[0]]
                    : mediaUrls,
            description,
            publicMetrics: { views: pm[0], replys: pm[1], retweets: pm[2], likes: pm[3], bookmarks: pm[4] },
            timestamp: tweetTimestamp
        };
    }

    private async login(page: Page) {
        await page.goto("https://twitter.com/i/flow/login");

        await page.waitForSelector("[autocomplete=username]");
        await page.type("input[autocomplete=username]", process.env.TWITTER_USER_EMAIL!);

        await page.click('div[role=button]:nth-of-type(6)');

        await page.waitForNetworkIdle();
        
        // Sometimes twitter suspect suspicious activties, so it ask for your handle/phone Number
        const extractedText = await page.$eval("*", (el) => el.innerHTML);
        if (extractedText.includes("輸入你的電話號碼或使用者名稱")) {
            await page.waitForSelector("[autocomplete=on]");
            await page.type("input[autocomplete=on]", process.env.TWITTER_USER_USERNAME!);

            await page.click("div[role=button] > div > span > span");
        }

        await page.waitForSelector('[autocomplete="current-password"]');
        await page.type('[autocomplete="current-password"]', process.env.TWITTER_USER_PASSWORD!);

        await page.click("div[role=button] > div > span > span");
        await page.waitForSelector("h1[role=heading]");

        this.loginCookies = await page.cookies();
        writeFile(__dirname + '/../../assets/cookie-cache', JSON.stringify(this.loginCookies), err => { if (err) throw err });
    }
}

export interface ITweetData {
    url: URL,
    mediaUrls: URL[],
    author: {
        id: string,
        name: string,
        pfp: URL
    },
    publicMetrics: {
        views: string,
        replys: string,
        retweets: string,
        likes: string,
        bookmarks: string
    },
    description: string,
    mediaType: 'IMAGE' | 'VEDIO' | 'VEDIO_GIF',
    timestamp: string
}