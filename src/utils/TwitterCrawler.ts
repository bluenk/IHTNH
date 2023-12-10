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

    public async crawl(url: URL): Promise<ITweetData | IUserData> {
        if (!this.page) throw Error('Crawler not initialized yet!');

        await this.page.goto(url.toString());

        const linkType = url.pathname.includes('/status/') ? 'TWEET' : 'OTHERS';
        log('link type: ' + linkType);

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
 
        try {
            return this.apiResponseCatch(linkType);
        } catch(err) {
            // fall back to legacy method
            log('apiResponseCatch method failed! falling back to queryPage.');
            log(err);

            return this.queryPage(m3u8Urls);
        }        
    }

    private async queryPage(m3u8Urls: URL[]): Promise<ITweetData> {
        if (!this.page) throw Error('Crawler not initialized yet!');

        await this.page.waitForSelector('article[tabindex="-1"]');

        const pm: (string | null)[] =
            await this.page.$$eval(
                'article[tabindex="-1"] span[data-testid="app-text-transition-container"] > span > span',
                els => els.map(el => el.innerText)
            );

        // If views count not available, add placeholder
        if (pm.length < 5) pm.unshift(null);

        // const typeMetaTag = await this.page.waitForSelector('head > meta[property="og:type"]');
        // const imageMetaTag = await this.page.waitForSelector('head > meta[property="og:image"]');
        // const tweetType = await (await typeMetaTag?.getProperty('content'))?.jsonValue();
        // const mediaUrl = await (await imageMetaTag?.getProperty('content'))?.jsonValue();

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
                                        ? 'ANIMATED_GIF'
                                        : 'IMAGE'
                            } 
                        })
                        
            ))
            .map(m => {
                return m.mediaType === 'VIDEO'
                    ?  { url: m3u8Urls.shift(), mediaType: m.mediaType }
                    : m;
            }) as ITweetData['mediaUrls'];

        if (
            !mediaUrls?.length 
            && componentTypes.includes('tweetPhoto')
            && componentTypes.includes('videoPlayer')
            ) log(Error('Faild to get media URLs from tweets.'));
        
        return {
            error: false,
            type: "TWEET",
            url: new URL(tweetUrl),
            author: { id: authorId, name: authorName, pfp: new URL(authorPfP) },
            mediaUrls,
            description,
            publicMetrics: { views: pm[0], replys: pm[1]!, retweets: pm[2]!, likes: pm[3]!, bookmarks: pm[4]! },
            timestamp: tweetTimestamp
        };
    }

    private async apiResponseCatch(linkType: 'TWEET' | 'OTHERS'): Promise<ITweetData | IUserData> {
        if (!this.page) throw Error('Crawler not initialized yet!');

        // user profile
        if (linkType === 'OTHERS') {
            const userDetail = await (await this.page.waitForResponse(res => res.request().url().includes('UserByScreenName'))).json() as IUserDetail;
            
            // user got banned
            if (!userDetail.data.user) return { error: true, type: 'USER' };
            
            const {
                legacy,
                is_blue_verified
            } = userDetail.data.user.result;
            const {
                screen_name,
                name,
                profile_image_url_https,
                profile_banner_url,
                followers_count,
                friends_count,
                favourites_count,
                statuses_count,
                media_count,
                listed_count,
                url,
                description,
                verified
            } = legacy;

            return {
                error: false,
                type: "USER",
                user: {
                    id: screen_name,
                    name,
                    pfp: new URL(profile_image_url_https),
                    banner: profile_banner_url ? new URL(profile_banner_url) : undefined
                },
                publicMetrics: {
                    followers: followers_count,
                    following: friends_count,
                    status: statuses_count,
                    medias: media_count,
                    likes: favourites_count,
                    listed: listed_count
                },
                url: new URL(`https://twitter.com/${screen_name}`),
                description,
                verified,
                blueVerified: is_blue_verified
            }
        }

        const tweetDetail = await (await this.page.waitForResponse(res => res.request().url().includes('TweetDetail'))).json() as ITweetDetail;
        
        if (tweetDetail.errors?.length) return { error: true, type: "TWEET" };
        if (
            !tweetDetail.data.threaded_conversation_with_injections_v2?.instructions[0]
                .entries![0].content.itemContent?.tweet_results
        ) return { error: true, type: 'TWEET' };

        const rawTweetRes = tweetDetail.data.threaded_conversation_with_injections_v2?.instructions[0].entries[0].content.itemContent?.tweet_results.result;
        
        if (Object.hasOwn(rawTweetRes, 'tombstone')) return { error: true, type: 'TWEET' };
        
        const tweetResults =
            Object.hasOwn(rawTweetRes, 'limitedActionResults')
                ? (rawTweetRes as ITweetDetailLimitedAction).tweet
                : rawTweetRes as ITweetDetailResult;
        const { core, views, legacy, card } = tweetResults;

        if (!legacy || !core || !views) {
            return { error: true, type: "TWEET"}
        }
            
        const {
            entities,
            created_at,
            bookmark_count,
            favorite_count,
            quote_count,
            reply_count,
            retweet_count,
            full_text,
            id_str
        } = legacy;
        const authorResult = core.user_results.result;

        return {
            error: false,
            type: 'TWEET',
            url: new URL(`https://twitter.com/i/status/${id_str}`),
            author: {
                id: '@' + authorResult.legacy.screen_name,
                name: authorResult.legacy.name,
                pfp: new URL(authorResult.legacy.profile_image_url_https)
            },
            mediaUrls:
                entities.media?.map(m => {
                    return  {
                        url: 
                            new URL(
                                m.type === 'photo'
                                ? m.media_url_https
                                : m.video_info!.variants.filter(v => v.bitrate !== undefined).sort((a, b) => b.bitrate! - a.bitrate!)[0].url
                            ),
                        mediaType: m.type.toUpperCase() as "VIDEO" | "ANIMATED_GIF" | "PHOTO"
                    };
                })
                || (card
                    ? [{
                        mediaType: 'PHOTO',
                        url: 
                            new URL(
                                card!.legacy.binding_values
                                    .find(({ key, value }) => key === 'thumbnail_image_original')!
                                    .value.image_value!.url
                            )
                    }]
                    : undefined)
            ,
            description: full_text.slice(0, -23),
            publicMetrics: {
                views: Number(views.count).toLocaleString('zh-TW'),
                replys: reply_count.toLocaleString('zh-TW'),
                retweets: retweet_count.toLocaleString('zh-TW'),
                likes: favorite_count.toLocaleString('zh-TW'),
                bookmarks: bookmark_count.toLocaleString('zh-TW')
            },
            timestamp: created_at
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

interface crawlData {
    error: boolean,
    type: 'TWEET' | 'USER',
    url?: URL,
    description?: string,
}

export interface ITweetData extends crawlData {
    mediaUrls?: { url: URL, mediaType: 'PHOTO' | 'VIDEO' | 'ANIMATED_GIF' }[],
    author?: {
        id: string,
        name: string,
        pfp: URL
    },
    publicMetrics?: {
        views: string | null,
        replys: string,
        retweets: string,
        likes: string,
        bookmarks: string
    }
    timestamp?: string
}

export interface IUserData extends crawlData {
    user?: {
        id: string,
        name: string,
        pfp: URL,
        banner?: URL
    },
    publicMetrics?: {
        following: number,
        followers: number,
        listed: number,
        likes: number,
        medias: number,
        status: number
    },
    location?: string,
    blueVerified?: boolean,
    verified?: boolean
}

interface ITweetDetail {
    errors?: {
        message: string,
        code: number,
        kind: string,
        name: string,
        source: string
    }[],
    data: {
        threaded_conversation_with_injections_v2?: {
            instructions: {
                type: 'TimelineAddEntries' | 'TimelineTerminateTimeline',
                entries?: {
                    entryId: string,
                    sortIndex: string,
                    content: {
                        entryType: string | 'TimelineTimelineItem',
                        __typename: string,
                        itemContent?: {
                            itemType: string | 'TimelineTweet',
                            __typename: string,
                            tweet_results: {
                                result: 
                                ITweetDetailTombstone
                                | ITweetDetailLimitedAction
                                | ITweetDetailResult,
                            },
                            tweetDisplayType: string | 'Tweet',
                            hasModeratedReplies: boolean
                        },
                        items?: {}[],
                        displayType?: string,
                        clientEventInfo?: {}
                    }
                }[],
                direction?: string
            }[]
        }
    }
}

interface ITweetDetailTombstone {
    tombstone: {
        __typename: 'TextTombstone',
        text: {
            rtl: boolean,
            text: string,
            entities: {
                fromIndex: number,
                toIndex: number,
                ref: {
                    type: string,
                    url: string,
                    urlType: string
                }
            }[]
        }
    }
}

interface ITweetDetailLimitedAction {
    limitedActionResults: {
        limited_actions: {
            action: 'Reply',
            prompt: {
                __typename: string,
                cta_type: string,
                headline: {
                    text: string,
                    entities: []
                },
                subtext: {
                    text: string,
                    entities: []
                }
            }
        }[]
    },
    tweet: ITweetDetailResult,
}

interface ITweetDetailResult {
    __typename: 'Tweet' | 'TweetTombstone'
    rest_id?: string, // tweet id
    has_birdwatch_notes?: boolean,
    core?: { // author info
        user_results: {
            result: {
                __typename: string,
                id: string, // base64 encoded api id
                rest_id: string, // api id, not display id
                affiliates_highlighted_label: {},
                has_graduated_access: boolean,
                is_blue_verified: boolean,
                profile_image_shape: 'Circle' | 'Square',
                legacy: {
                    following: boolean,
                    can_dm: boolean,
                    can_media_tag: boolean,
                    created_at: string,
                    default_profile: boolean,
                    default_profile_image: boolean,
                    description: string, // author's bio
                    entities: {
                        description: {
                            urls: {
                                display_url: string,
                                expanded_url: string,
                                url: string,
                                indices: number[]
                            }[]
                        },
                        url?: { // custom website links etc...
                            urls: {
                                display_url: string,
                                expanded_url: string,
                                url: string,
                                indices: number[]
                            }[]
                        }
                    },
                    fast_followers_count: number,
                    favourites_count: number,
                    followers_count: number,
                    friends_count: number, // follow others
                    has_custom_timelines: boolean,
                    is_translator: boolean,
                    listed_count: number,
                    location: string,
                    media_count: number,
                    name: string, // display name
                    normal_followers_count: number,
                    pinned_tweet_ids_str: string[],
                    possibly_sensitive: boolean,
                    profile_image_url_https: string,
                    profile_interstitial_type: string,
                    screen_name: string, // display user id
                    statuses_count: number, // tweet count, include retweets & replys
                    translator_type: string,
                    url?: string, // user's custom website link
                    verified: boolean,
                    verified_type?: string | 'Business',
                    want_retweets: boolean,
                    withheld_in_countries: string[]
                }
            }
        }
    },
    card?: {
        rest_id: string // short url for the card, t.co
        legacy: {
            binding_values: {
                key:
                    'photo_image_full_size_large' |
                    'thumbnail_image' |
                    'description' |
                    'domain' |
                    'thumbnail_image_large' |
                    'summary_photo_image_small' |
                    'thumbnail_image_original' |
                    'photo_image_full_size_small' |
                    'summary_photo_image_large' |
                    'thumbnail_image_small' |
                    'thumbnail_image_x_large' |
                    'photo_image_full_size_original' |
                    'vanity_url' |
                    'photo_image_full_size' |
                    'thumbnail_image_color' |
                    'title' |
                    'summary_photo_image_color' |
                    'summary_photo_image_x_large' |
                    'summary_photo_image' |
                    'photo_image_full_size_color' |
                    'photo_image_full_size_x_large' |
                    'card_url' |
                    'summary_photo_image_original',
                value: {
                    type: 'IMAGE' | 'STRING' | 'IMAGE_COLOR' ,
                    image_value?: {
                        height: number,
                        width: number,
                        url: string
                    },
                    string_value?: string
                    scribe_key?: string
                    image_color_value?: {
                        rgb: {
                            blue: number,
                            green: number,
                            red: number
                        },
                        percentage: number
                    }[]
                }
            }[],
            card_platform: {
                platform: {
                    audience: {
                        name: string | 'production'
                    },
                    device: {
                        name: string | 'Swift',
                        version: string
                    }
                }
            },
            name: string,
            url: string, // same as rest_id
            user_refs_results: []
        }
    }
    unmention_data?: {},
    unified_card?: {
        card_fetch_state: string | 'NoCard'
    },
    edit_control?: {
        edit_tweet_ids: string[],
        editable_until_msecs: string,
        is_edit_eligible: boolean,
        edits_remaining: string
    },
    is_translatable?: boolean,
    views?: {
        count: string,
        state: string
    },
    source?: string,
    legacy?: {
        bookmark_count: number,
        bookmarked: boolean,
        created_at: string,
        conversation_id_str: string,
        display_text_range: number[],
        entities: {
            media?: {
                display_url: string,
                expanded_url: string,
                id_str: string,
                indices: number[],
                media_key: string,
                media_url_https: string,
                type: 'photo' | 'video' | 'animated_gif',
                url: string,
                additional_media_info?: {
                    monetizable: boolean
                }
                ext_media_availability: {
                    status: 'Available'
                },
                features?: {
                    large: { faces: [] },
                    medium: { faces: [] },
                    small: { faces: [] },
                    orig: { faces: [] }
                },
                sizes: {
                    large: { h: number, w: number, resize: 'fit' | 'crop' },
                    medium: { h: number, w: number, resize: 'fit' | 'crop' },
                    small: { h: number, w: number, resize: 'fit' | 'crop' },
                    thumb: { h: number, w: number, resize: 'fit' | 'crop' }
                },
                original_info: {
                    height: number,
                    width: number,
                    focus_rects: {
                        x: number,
                        y: number,
                        w: number,
                        h: number
                    }[] 
                },
                video_info?: {
                    aspect_ratio: [number, number],
                    duration_millis: number,
                    variants: {
                        bitrate?: number,
                        content_type: 'video/mp4' | 'application/x-mpegURL',
                        url: string
                    }[]
                }
            }[],
            user_mentions: {
                id_str: string,
                name: string,
                screen_name: string,
                indices: number[]
            }[],
            urls: {
                display_url: string,
                expanded_url: string,
                url: string,
                indices: number[]
            }[],
            hashtags: {
                indices: number[],
                text: string
            }[],
            symbols: []
        },
        extended_entities: {
            media: {
                display_url: string,
                expanded_url: string,
                id_str: string,
                indices: number[],
                media_key: string,
                media_url_https: string,
                type: 'photo' | 'video' | 'animated_gif',
                url: string,
                additional_media_info?: {
                    monetizable: boolean
                }
                ext_media_availability: {
                    status: 'Available'
                },
                features?: {
                    large: { faces: [] },
                    medium: { faces: [] },
                    small: { faces: [] },
                    orig: { faces: [] }
                },
                sizes: {
                    large: { h: number, w: number, resize: 'fit' | 'crop' },
                    medium: { h: number, w: number, resize: 'fit' | 'crop' },
                    small: { h: number, w: number, resize: 'fit' | 'crop' },
                    thumb: { h: number, w: number, resize: 'fit' | 'crop' }
                },
                original_info: {
                    height: number,
                    width: number,
                    focus_rects: {
                        x: number,
                        y: number,
                        w: number,
                        h: number
                    }[] 
                },
                video_info?: {
                    aspect_ratio: [number, number],
                    duration_millis: number,
                    variants: {
                        bitrate?: number,
                        content_type: 'video/mp4' | 'application/x-mpegURL',
                        url: string
                    }[]
                }
            }[]
        },
        favorite_count: number,
        favorited: boolean,
        full_text: string,
        is_quote_status: boolean,
        lang: string,
        possibly_sensitive: boolean,
        possibly_sensitive_editable: boolean,
        quote_count: number,
        reply_count: number,
        retweet_count: number,
        retweeted: boolean,
        user_id_str: string,
        id_str: string
    },
    quick_promote_eligibility?: {
        eligibility: string | 'IneligibleNotProfessional'
    }
}

interface IUserDetail {
    data: {
        user?: {
            result: {
                __typename: string,
                id: string, // base64 encoded api id
                rest_id: string, // api id, not display id
                affiliates_highlighted_label: {},
                has_graduated_access: boolean,
                is_blue_verified: boolean,
                profile_image_shape: 'Circle' | 'Square',
                legacy: {
                    following?: boolean,
                    can_dm: boolean,
                    can_media_tag: boolean,
                    created_at: string,
                    default_profile: boolean,
                    default_profile_image: boolean,
                    description: string, // author's bio
                    entities: {
                        description: {
                            urls: {
                                display_url: string,
                                expanded_url: string,
                                url: string,
                                indices: number[]
                            }[]
                        },
                        url?: { // custom website links etc...
                            urls: {
                                display_url: string,
                                expanded_url: string,
                                url: string,
                                indices: number[]
                            }[]
                        }
                    },
                    fast_followers_count: number,
                    favourites_count: number,
                    followers_count: number,
                    friends_count: number, // follow others
                    has_custom_timelines: boolean,
                    is_translator: boolean,
                    listed_count: number,
                    location: string,
                    media_count: number,
                    name: string, // display name
                    normal_followers_count: number,
                    pinned_tweet_ids_str: string[],
                    possibly_sensitive: boolean,
                    profile_banner_url?: string,
                    profile_image_url_https: string,
                    profile_interstitial_type: string,
                    screen_name: string, // display user id
                    statuses_count: number, // tweet count, include retweets & replys
                    translator_type: string,
                    url?: string, // user's custom website link
                    verified: boolean,
                    verified_type?: string | 'Business',
                    want_retweets: boolean,
                    withheld_in_countries: string[]
                },
                professional?: {
                    rest_id: string,
                    professional_type: 'Creator',
                    category: {
                        id: number,
                        name: '插畫家',
                        icon_name: 'IconBriefcaseStroke'
                    }[]
                }
                smart_blocked_by: boolean,
                smart_blocking: boolean,
                legacy_extended_profile: {
                    birthdate?: {
                        num: number,
                        month: number,
                        visibility: 'Public' | 'Followers',
                        year_visibility: 'Self'
                    }
                },
                is_profile_translatable: boolean,
                has_hidden_likes_on_profile: boolean,
                has_hidden_subscriptions_on_profile: boolean,
                verification_info: {
                    is_identity_verified: boolean,
                    reason?: {
                        description: {
                            text: string,
                            entities: {
                                from_index: number,
                                to_index: number,
                                ref: {
                                    url: string,
                                    url_type: 'ExternalUrl'
                                }
                            }[]
                        },
                        verified_since_msec: string
                    }
                },
                highlights_info: {
                    can_highlight_tweets: boolean,
                    highlighted_tweets: string
                },
                business_account: {
                    affiliates_count?: number
                },
                creator_subscriptions_count: number
            }
        }
    }
}