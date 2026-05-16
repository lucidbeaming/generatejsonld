import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const td = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

td.remove(['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'iframe', 'form']);

td.addRule('images', {
  filter: 'img',
  replacement: (_content, node) => {
    const alt = node.getAttribute('alt') || node.getAttribute('title') || 'image';
    return alt.trim() ? `[Image: ${alt.trim()}]` : '[Image]';
  },
});

td.addRule('media', {
  filter: ['video', 'audio', 'picture', 'source'],
  replacement: (_content, node) => {
    const label = node.getAttribute('aria-label') || node.getAttribute('title') || 'media';
    return `[Media: ${label.trim()}]`;
  },
});

export function convertToMarkdown({ url, html }) {
  const $ = cheerio.load(html);

  const get = (selector, attr) => {
    const el = $(selector).first();
    return attr ? el.attr(attr) : el.text().trim();
  };

  const title =
    get('meta[property="og:title"]', 'content') ||
    get('meta[name="twitter:title"]', 'content') ||
    get('title');

  const description =
    get('meta[name="description"]', 'content') ||
    get('meta[property="og:description"]', 'content') ||
    get('meta[name="twitter:description"]', 'content') ||
    '';

  const canonical = get('link[rel="canonical"]', 'href') || url;

  const ogTitle = get('meta[property="og:title"]', 'content') || '';
  const ogDescription = get('meta[property="og:description"]', 'content') || '';
  const ogType = get('meta[property="og:type"]', 'content') || '';
  const ogUrl = get('meta[property="og:url"]', 'content') || '';

  const hints = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}');
      const entries = Array.isArray(data) ? data : [data];
      for (const entry of entries) {
        if (entry['@type']) hints.push({ type: entry['@type'], name: entry.name || '' });
      }
    } catch {}
  });

  const hintsYaml = hints.length
    ? 'structured_data_hints:\n' + hints.map((h) => `  - type: ${h.type}\n    name: "${h.name}"`).join('\n')
    : 'structured_data_hints: []';

  const frontMatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `url: "${url}"`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    `canonical: "${canonical}"`,
    `og:title: "${ogTitle.replace(/"/g, '\\"')}"`,
    `og:description: "${ogDescription.replace(/"/g, '\\"')}"`,
    `og:type: "${ogType}"`,
    `og:url: "${ogUrl}"`,
    hintsYaml,
    `scraped_at: "${new Date().toISOString()}"`,
    '---',
  ].join('\n');

  $('nav, header, footer, aside, script, style, noscript, iframe, form').remove();

  const bodyHtml = $('body').html() || '';
  const content = td.turndown(bodyHtml).trim();

  return `${frontMatter}\n\n# ${title}\n\n${content}\n`;
}
