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
        const browser = await puppeteer.launch({ headless: 'new', executablePath: '/usr/bin/google-chrome-stable', args: ['--lang=zh-TW'] });
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
            // console.log(reqUrl.href);

            if (!(reqUrl.href.includes('pbs.twimg.com') || reqUrl.href.includes('video.twimg'))) return;

            if (
                // (reqUrl.href.includes('twimg.com/ext_tw_video/') ||
                // reqUrl.href.includes('twimg.com/media/') ||
                // reqUrl.href.includes('twimg.com/tweet_video/')) &&
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

        // If views count not available, add placeholder
        if (pm.length < 5) pm.unshift('N/A');

        // const imageComponent = this.page.$('article[tabindex="-1"] div[data-testid=tweetPhoto]');
        // const videoComponent = this.page.$('article[tabindex="-1"] div[data-testid=videoComponent]');

        // const component = await Promise.race([imageComponent, videoComponent]);

        const components = await this.page.$$('article[tabindex="-1"] div[data-testid]');
        const componentTypes = await Promise.all(components.map(elh => elh.evaluate(el => el.getAttribute('data-testid'))));
        
        const contentStart = componentTypes.indexOf('caret') + 1;
        const contentEnd = componentTypes.indexOf('reply');
        const contentComponentTypes = componentTypes.slice(contentStart, contentEnd);
        
        // console.log({ componentTypes, contentComponentTypes });
        await this.page.waitForSelector('article[tabindex="-1"] div[data-testid=Tweet-User-Avatar] img');

        const authorName = (await (await (await this.page.$('meta[property="og:title"]'))!.getProperty('content')).jsonValue()).substring(5).split('：「')[0];
        const authorId = await this.page.$eval('article[tabindex="-1"] div[data-testid=User-Name] a > div > span', el => el.innerText);
        const authorPfP = await (await (await this.page.$('article[tabindex="-1"] div[data-testid=Tweet-User-Avatar] img'))!.getProperty('src')).jsonValue();

        const tweetUrl = await (await (await this.page.$('link[rel="canonical"]'))!.getProperty('href')).jsonValue();
        const tweetTimestamp = await (await (await this.page.$('article[tabindex="-1"] time'))!.getProperty('dateTime')).jsonValue();
        
        const description =
            await this.page.$$eval(
                `article[tabindex="-1"] div[data-testid="tweetText"] span:not([aria-hidden="true"]), article[tabindex="-1"] div[data-testid="tweetText"] a:has(span), article[tabindex="-1"] div[data-testid="tweetText"] img`,
                els => els.map(el => el.innerText || el.getAttribute('alt')).join('')
                )
                .catch(err => '');
        
        // Getting media URLs
        const mediaEls = await this.page.$$('article[tabindex="-1"] img[draggable="true"]:not([alt=""]):not([alt="方形個人資料圖片"]), article[tabindex="-1"] div > video, article[tabindex="-1"] div[data-testid="card.layoutLarge.media"] img');
        const mediaUrls =
            (await Promise.all(
                    mediaEls
                        .map(async el => {
                            const url = new URL(await (await el.getProperty('src')).jsonValue())
                            return  {
                                url,
                                mediaType: url.protocol === 'blob:'
                                    ? 'VIDEO'
                                    : url.href.endsWith('mp4')
                                        ? 'VIDEO_GIF'
                                        : 'IMAGE'
                            } 
                        })
                        
            ))
            .map(m => {
                return m.mediaType === 'VIDEO'
                    ?  { url: m3u8Urls.shift(), mediaType: m.mediaType }
                    : m;
            }) as ITweetData['mediaUrls'];

        // const mediaType = 
        //     componentTypes.includes('videoPlayer')
        //         ? mediaUrls[0].protocol === 'blob:'
        //             ? 'VIDEO'
        //             : 'VIDEO_GIF'
        //         : componentTypes.some(s => s === 'tweetPhoto' || s === 'card.layoutLarge.media') 
        //             ? 'IMAGE'
        //             : null;

        // if (!m3u8Urls.length && mediaType === 'VIDEO') throw Error('Faild to get m3u8 URLs from tweets.');
        if (
            !mediaUrls.length 
            && componentTypes.includes('tweetPhoto')
            && componentTypes.includes('videoPlayer')
            ) log(Error('Faild to get media URLs from tweets.'));
        
        return {
            url: new URL(tweetUrl),
            author: { id: authorId, name: authorName, pfp: new URL(authorPfP) },
            mediaUrls,
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
    mediaUrls: { url: URL, mediaType: 'IMAGE' | 'VIDEO' | 'VIDEO_GIF' }[],
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
    timestamp: string
}