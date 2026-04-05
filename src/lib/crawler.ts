/**
 * Instagram Crawler using Playwright
 * Crawls Instagram Reels pages to extract video URLs and metadata.
 * Uses stealth techniques to avoid detection.
 */
import { Browser, Page } from 'playwright';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';

// Apply stealth plugin to completely hide headless browser signatures from Instagram
chromium.use(stealthPlugin());

export interface VideoItem {
  source: 'instagram';
  videoUrl: string;
  pageUrl: string;
  views: number;
  likes: number;
  caption: string;
  account: string;
}

interface CrawlConfig {
  accounts: string[];
  keywords: string[];
  limit: number;
}

const COOKIES_PATH = path.join(process.cwd(), 'data', 'cookies.json');

function randomDelay(min = 1500, max = 3500): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ensure data directories exist
 */
function ensureDataDirs() {
  const dataDir = path.join(process.cwd(), 'data');
  const downloadsDir = path.join(dataDir, 'downloads');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
}

/**
 * Save browser cookies to disk for session persistence
 */
async function saveCookies(page: Page) {
  try {
    const cookies = await page.context().cookies();
    ensureDataDirs();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  } catch {
    // Non-critical — silently continue
  }
}

/**
 * Load saved cookies if available
 */
async function loadCookies(page: Page) {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const raw = fs.readFileSync(COOKIES_PATH, 'utf-8');
      const cookies = JSON.parse(raw);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await page.context().addCookies(cookies);
      }
    }
  } catch {
    // Non-critical — silently continue
  }
}

/**
 * Handle Instagram login if a login wall is detected
 */
async function handleLogin(page: Page, log: (msg: string) => void): Promise<boolean> {
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;

  if (!username || !password) {
    log('Login wall detected but no INSTAGRAM_USERNAME/PASSWORD in .env.local — skipping login');
    return false;
  }

  log('Login wall detected — attempting auto-login…');

  try {
    // Try to navigate to login page
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Attempt to dismiss "Allow all cookies" accept banner if deployed in EU-West regions
    try {
      const allowCookies = page.locator('button:has-text("Allow all cookies"), button:has-text("Accept")');
      if (await allowCookies.count() > 0) {
        await allowCookies.first().click();
        await randomDelay(1000, 2000);
      }
    } catch { }

    // Wait explicitly for the login form instead of failing silently instantly
    const usernameInput = page.locator('input[name="username"]');
    try {
      await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      const title = await page.title();
      log(`✗ Login form never appeared! Page Title: "${title}". Instagram might be blocking Railway's IP or showing a challenge.`);
      return false;
    }

    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
      await randomDelay(500, 1000);
      await page.locator('input[name="password"]').fill(password);
      await randomDelay(500, 1000);

      // Submit
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      await randomDelay(3000, 5000);

      // Dismiss "Save login info" popup if it appears
      try {
        const notNowBtn = page.locator('button:has-text("Not Now"), div[role="button"]:has-text("Not Now")');
        if (await notNowBtn.isVisible({ timeout: 3000 })) {
          await notNowBtn.click();
          await randomDelay(1000, 2000);
        }
      } catch {
        // No popup — fine
      }

      // Dismiss notifications popup if it appears
      try {
        const notNowBtn2 = page.locator('button:has-text("Not Now")');
        if (await notNowBtn2.isVisible({ timeout: 3000 })) {
          await notNowBtn2.click();
          await randomDelay(1000, 2000);
        }
      } catch {
        // No popup — fine
      }

      await saveCookies(page);
      log('Login successful ✓');
      return true;
    }
  } catch (e) {
    log(`Login failed: ${(e as Error).message}`);
  }

  return false;
}

/**
 * Extract reel data from an Instagram user's Reels tab
 */
async function crawlAccount(
  browser: Browser,
  account: string,
  limit: number,
  log: (msg: string) => void,
): Promise<VideoItem[]> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const page = await context.newPage();
  await loadCookies(page);

  const results: VideoItem[] = [];

  try {
    const reelsUrl = `https://www.instagram.com/${account.replace('@', '')}/reels/`;
    log(`Navigating to ${reelsUrl}`);
    await page.goto(reelsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 4000);

    // Check for login wall
    const isLoginPage =
      page.url().includes('/accounts/login') ||
      (await page.locator('input[name="username"]').isVisible().catch(() => false));

    if (isLoginPage) {
      const loggedIn = await handleLogin(page, log);
      if (loggedIn) {
        await page.goto(reelsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(2000, 4000);
      } else {
        log(`Skipping @${account} — login required but credentials not available`);
        return [];
      }
    }

    // Scroll to load more reels
    const maxScrolls = Math.ceil(limit / 3) + 2; // ~3 reels per scroll
    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await randomDelay(1500, 2500);
    }

    // Extract reel links from the page
    const reelLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/reel/"]'));
      return [...new Set(links.map((a) => (a as HTMLAnchorElement).href))];
    });

    log(`Found ${reelLinks.length} reel links for @${account}`);

    // Visit each reel to extract metadata (up to limit)
    const linksToVisit = reelLinks.slice(0, limit);

    for (const reelUrl of linksToVisit) {
      try {
        await randomDelay(2000, 4000);
        await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await randomDelay(1500, 3000);

        // Extract video data from the page
        const videoData = await page.evaluate(() => {
          // Try to get video URL from <video> element
          const videoEl = document.querySelector('video');
          const videoUrl = videoEl?.src || videoEl?.querySelector('source')?.src || '';

          // Try to get from meta tags
          const ogVideo = document.querySelector('meta[property="og:video"]');
          const ogVideoUrl = ogVideo?.getAttribute('content') || '';

          // Get view count and like count from aria labels and text
          const statsText = document.body.innerText;

          // Parse views — look for patterns like "123,456 views" or "123K views"
          let views = 0;
          const viewsMatch = statsText.match(/([\d,.]+[KMB]?)\s*(?:views|plays)/i);
          if (viewsMatch) {
            const raw = viewsMatch[1].replace(/,/g, '');
            if (raw.includes('K')) views = parseFloat(raw) * 1000;
            else if (raw.includes('M')) views = parseFloat(raw) * 1000000;
            else if (raw.includes('B')) views = parseFloat(raw) * 1000000000;
            else views = parseInt(raw) || 0;
          }

          // Parse likes
          let likes = 0;
          const likesMatch = statsText.match(/([\d,.]+[KMB]?)\s*likes/i);
          if (likesMatch) {
            const raw = likesMatch[1].replace(/,/g, '');
            if (raw.includes('K')) likes = parseFloat(raw) * 1000;
            else if (raw.includes('M')) likes = parseFloat(raw) * 1000000;
            else likes = parseInt(raw) || 0;
          }

          // Get caption — try multiple selectors
          const captionEl =
            document.querySelector('h1') ||
            document.querySelector('[class*="Caption"]') ||
            document.querySelector('span[class*="caption"]');
          const caption = captionEl?.textContent?.trim().slice(0, 300) || '';

          return {
            videoUrl: videoUrl || ogVideoUrl,
            views: Math.round(views),
            likes: Math.round(likes),
            caption,
          };
        });

        if (videoData.videoUrl || reelUrl) {
          results.push({
            source: 'instagram',
            videoUrl: videoData.videoUrl || reelUrl, // Fallback to page URL for yt-dlp
            pageUrl: reelUrl,
            views: videoData.views,
            likes: videoData.likes,
            caption: videoData.caption,
            account: account.replace('@', ''),
          });
          log(`  ✓ Extracted reel (${results.length}/${linksToVisit.length}) — views: ${videoData.views}`);
        }
      } catch (e) {
        log(`  ✗ Failed to extract reel: ${(e as Error).message}`);
      }
    }

    await saveCookies(page);
  } catch (e) {
    log(`Error crawling @${account}: ${(e as Error).message}`);
  } finally {
    await context.close();
  }

  return results;
}

/**
 * Main crawl function — orchestrates crawling across all accounts
 */
export async function crawl(
  config: CrawlConfig,
  log: (msg: string) => void,
): Promise<VideoItem[]> {
  ensureDataDirs();

  const allVideos: VideoItem[] = [];
  let browser: Browser | null = null;

  try {
    log('Launching headless browser…');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Proactively check if we need to log in before crawling
    if (!fs.existsSync(COOKIES_PATH)) {
      log('No saved cookies found. Forcing proactive Instagram login…');
      const authContext = await browser.newContext();
      const authPage = await authContext.newPage();
      await handleLogin(authPage, log);
      await authContext.close();
    }

    const perAccountLimit = Math.ceil(config.limit / Math.max(config.accounts.length, 1));

    for (const account of config.accounts) {
      log(`Crawling @${account} (limit: ${perAccountLimit})…`);
      const videos = await crawlAccount(browser, account, perAccountLimit, log);
      allVideos.push(...videos);
    }

    // Sort by views, take top N
    allVideos.sort((a, b) => b.views - a.views);
    const finalVideos = allVideos.slice(0, config.limit);

    log(`Crawling complete: ${finalVideos.length} videos extracted`);
    return finalVideos;
  } catch (e) {
    log(`Crawler error: ${(e as Error).message}`);
    throw e;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Crawl direct reel links — navigate to each URL and extract metadata.
 * These are individual URLs provided by the user (no account scrolling needed).
 */
export async function crawlDirectLinks(
  urls: string[],
  log: (msg: string) => void,
): Promise<VideoItem[]> {
  if (urls.length === 0) return [];

  ensureDataDirs();

  // Proactively check if we need to log in to generate cookies for yt-dlp
  if (!fs.existsSync(COOKIES_PATH)) {
    log('No saved cookies found. Forcing proactive Instagram login for direct links…');
    try {
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const authContext = await browser.newContext();
      const authPage = await authContext.newPage();
      await handleLogin(authPage, log);
      await browser.close();
    } catch (e) {
      log(`Failed proactive login check: ${(e as Error).message}`);
    }
  }

  const results: VideoItem[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // Accept /reel/, /reels/, and /p/ URL patterns
    const isValidIG = /instagram\.com\/(reel|reels|p)\//.test(url);
    // Try to extract account from URL (for /username/reel/ID/ format)
    const accountMatch = url.match(/instagram\.com\/([^/]+)\/(reel|reels|p)\//);

    if (!isValidIG) {
      log(`  ✗ Skipping invalid URL: ${url.slice(0, 60)}`);
      continue;
    }

    results.push({
      source: 'instagram',
      videoUrl: url,
      pageUrl: url,
      views: 0,
      likes: 0,
      caption: '',
      account: accountMatch ? accountMatch[1] : 'direct',
    });
    log(`  ✓ Added direct link ${i + 1}/${urls.length}`);
  }

  return results;
}
