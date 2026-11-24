# generatejsonld

CLI that crawls a site and generates Schema.org JSON-LD with Mistral.

Documentation: [joshuacurry.dev/generatejsonld](https://joshuacurry.dev/generatejsonld)

Given a bakery's home page that says *"Neighborhood bakery at 412 Harbor Street, Oakland, CA 94607. Open Tuesday to Sunday, 7am to 3pm."*, it writes:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Bakery",
  "name": "Harbor Street Bakery",
  "url": "https://harborstreet.example/",
  "description": "Neighborhood bakery in Oakland baking sourdough, croissants and seasonal pies daily.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "412 Harbor Street",
    "addressLocality": "Oakland",
    "addressRegion": "CA",
    "postalCode": "94607",
    "addressCountry": "US"
  },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "opens": "07:00",
    "closes": "15:00"
  }
}
</script>
```

(Real output from `mistral-large-latest` for a two-page test site, with the URL changed and the day list put on one line.)

A headless Node.js CLI that crawls a website, converts each page to Markdown, and uses Mistral AI to generate Schema.org JSON-LD structured data for SEO.

## Features

- Crawls internal pages using Playwright (Chromium, headless)
- Converts HTML to clean Markdown with a YAML metadata header (title, description, OG tags, canonical URL)
- Replaces images and media with inline alt-text placeholders
- Generates JSON-LD snippets via Mistral AI, choosing the most appropriate Schema.org type per page and only using facts that appear on the page
- Saves everything to a timestamped session folder: `sessions/{hostname}-{timestamp}/`
- Dry-run mode to preview which pages would be processed without writing any files
- Confirmation prompt before AI generation begins

## Requirements

- Node.js 22.12+
- A [Mistral AI API key](https://console.mistral.ai/api-keys)

## Installation

```bash
git clone https://github.com/lucidbeaming/generatejsonld.git
cd generatejsonld
npm install
npx playwright install chromium
cp .env-example .env
```

## Configuration

Edit `.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_KEY` | Yes | — | Mistral API key |
| `MISTRAL_CHAT_MODEL` | No | `mistral-large-latest` | Mistral model ID; `--model` overrides it per run |

```
API_KEY=your_mistral_api_key_here
MISTRAL_CHAT_MODEL=mistral-large-latest
```

Reasoning models such as `mistral-large-latest` work, and so do faster ones like `mistral-small-latest`.

## Usage

```bash
node index.js --url https://example.com
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--url <url>` | *(required)* | Root URL to crawl |
| `--dry-run` | false | Spider only — list pages without writing files |
| `--max-pages <n>` | 100 | Maximum pages to crawl |
| `--concurrency <n>` | 3 | Parallel browser pages during crawl |
| `--output <path>` | `./sessions` | Parent directory for session output |
| `--selector <css>` | `body` | CSS selector for the content to convert (e.g. `main`, to skip headers and footers) |
| `--model <name>` | `$MISTRAL_CHAT_MODEL` | Mistral model ID (overrides .env) |
| `--no-confirm` | false | Skip the confirmation prompt |

### Examples

```bash
# Preview pages without writing anything
node index.js --url https://example.com --dry-run

# Full run, cap at 20 pages
node index.js --url https://example.com --max-pages 20

# Skip confirmation prompt (useful in scripts)
node index.js --url https://example.com --no-confirm

# Use a specific model for this run
node index.js --url https://example.com --model mistral-small-latest

# Only convert each page's <main> element
node index.js --url https://example.com --selector main
```

## Output Structure

Each run creates a session folder under `sessions/`:

```
sessions/
  example-com-2024-01-15T12-00-00/
    session.json          ← crawl metadata and page manifest
    markdown/
      example-com.md
      example-com-about.md
      ...
    jsonld/
      example-com.html
      example-com-about.html
      ...
```

`session.json` records the root URL, start/end times, model used, page and JSON-LD counts, and for each page its Markdown and JSON-LD file paths plus any error.

Each `.md` file has a YAML front matter block followed by the page content:

```markdown
---
title: "About Us"
url: "https://example.com/about"
description: "..."
og:type: "website"
structured_data_hints:
  - type: AboutPage
scraped_at: "2024-01-15T12:00:00.000Z"
---

# About Us

...
```

Each file in `jsonld/` holds one `<script type="application/ld+json">` tag with the JSON-LD object, ready to paste into the page's `<head>`. Check it with the [Schema.org validator](https://validator.schema.org/) or Google's [Rich Results Test](https://search.google.com/test/rich-results) before publishing.

## How it works

1. **Crawl** (`src/scraper.js`): headless Chromium starts at `--url` and follows same-origin links, up to `--max-pages`, with `--concurrency` pages at a time.
2. **Convert** (`src/converter.js`): each page's `--selector` element becomes Markdown, with a YAML header of title, description, Open Graph tags, canonical URL and any existing structured-data hints. Images and media become alt-text placeholders.
3. **Generate** (`src/generator.js`): each Markdown file goes to Mistral in JSON mode with a system prompt that picks the Schema.org type and forbids invented facts. Failed calls are retried up to 3 times with exponential backoff, and a page that still fails is recorded in `session.json` without stopping the run.

## Alternative AI Providers

The tool uses Mistral AI by default. To switch providers, update `src/generator.js` with the appropriate SDK and message format. See `.env-example` for notes on using Anthropic Claude or OpenAI.

## Development

```bash
npm run lint          # check for lint errors
npm run lint:fix      # auto-fix lint errors
npm run format        # format source files with Prettier
npm run format:check  # verify formatting (no writes)
```

## Related projects

- [alt-tagger](https://github.com/lucidbeaming/alt-tagger): generates and pushes image alt text with a vision model
- [chatjc](https://github.com/lucidbeaming/chatjc): RAG chatbot API over a developer's résumé, also built on Mistral

## License

[MIT](LICENSE). Releases before this change were published under Apache-2.0, and those copies keep that license.
