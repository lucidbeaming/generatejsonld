import { chromium } from 'playwright';
import { log } from './utils.js';

const SKIP_EXTENSIONS =
  /\.(pdf|zip|png|jpg|jpeg|gif|webp|svg|css|js|xml|json|ico|woff|woff2|ttf|eot|mp4|mp3|avi|mov)$/i;

export async function crawl(rootUrl, { maxPages = 100, concurrency = 3, onProgress } = {}) {
  const origin = new URL(rootUrl).origin;
  const visited = new Set();
  const queue = [normalizeUrl(rootUrl)];
  const results = [];

  visited.add(normalizeUrl(rootUrl));

  const browser = await chromium.launch({ headless: true });

  let active = 0;

  async function processUrl(url) {
    active++;
    let html;
    let statusCode;

    try {
      const page = await browser.newPage();

      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      page.setDefaultNavigationTimeout(15000);

      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      statusCode = response?.status() ?? null;
      if (statusCode && statusCode >= 400) {
        log.warn(`HTTP ${statusCode}: ${url}`);
      }
      html = await page.content();

      const links = await page.evaluate((pageOrigin) => {
        // eslint-disable-next-line no-undef
        return Array.from(document.querySelectorAll('a[href]'))
          .map((a) => {
            try {
              // eslint-disable-next-line no-undef
              const u = new URL(a.href, window.location.href);
              return u.origin === pageOrigin ? u.href : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }, origin);

      for (const link of links) {
        const norm = normalizeUrl(link);
        if (
          !visited.has(norm) &&
          results.length + queue.length < maxPages &&
          !SKIP_EXTENSIONS.test(new URL(link).pathname)
        ) {
          visited.add(norm);
          queue.push(norm);
        }
      }

      await page.close();
    } catch (err) {
      results.push({ url, html: null, statusCode: null, error: err.message });
      active--;
      return;
    }

    results.push({ url, html, statusCode });
    if (onProgress) onProgress(url, results.length, visited.size);
    active--;
  }

  const workers = [];

  async function drain() {
    while (active > 0 || (queue.length > 0 && results.length < maxPages)) {
      while (queue.length > 0 && active < concurrency && results.length + active < maxPages) {
        const url = queue.shift();
        workers.push(processUrl(url));
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await Promise.all(workers);
  }

  await drain();
  await browser.close();

  return results;
}

function normalizeUrl(url) {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  let path = u.pathname.replace(/\/+$/, '') || '/';
  u.pathname = path;
  return u.toString();
}
