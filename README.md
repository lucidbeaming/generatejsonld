# generatejsonld

A headless Node.js CLI that crawls a website, converts each page to Markdown, and uses Mistral AI to generate Schema.org JSON-LD structured data for SEO.

## Features

- Crawls internal pages using Playwright (Chromium, headless)
- Converts HTML to clean Markdown with a YAML metadata header (title, description, OG tags, canonical URL)
- Replaces images and media with inline alt-text placeholders
- Generates JSON-LD snippets via Mistral AI, choosing the most appropriate Schema.org type per page
- Saves everything to a timestamped session folder: `sessions/{hostname}-{timestamp}/`
- Dry-run mode to preview which pages would be processed without writing any files
- Confirmation prompt before AI generation begins

## Requirements

- Node.js 18+
- A [Mistral AI API key](https://console.mistral.ai/api-keys)

## Installation

```bash
git clone https://github.com/lucidbeaming/generatejsonld.git
cd generatejsonld
npm install
npx playwright install chromium
cp .env-example .env
```

Edit `.env` and add your API key:

```
MISTRAL_API_KEY=your_key_here
MISTRAL_MODEL=mistral-large-latest
```

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
| `--model <name>` | `$MISTRAL_MODEL` | Mistral model ID (overrides .env) |
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
      example-com.jsonld
      example-com-about.jsonld
      ...
```

`session.json` records the root URL, start/end times, model used, page count, and per-page file paths.

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

Each `.jsonld` file contains a valid JSON-LD object ready to embed in a `<script type="application/ld+json">` tag.

## Alternative AI Providers

The tool uses Mistral AI by default. To switch providers, update `src/generator.js` with the appropriate SDK and message format. See `.env-example` for notes on using Anthropic Claude or OpenAI.

## Development

```bash
npm run lint          # check for lint errors
npm run lint:fix      # auto-fix lint errors
npm run format        # format source files with Prettier
npm run format:check  # verify formatting (no writes)
```

## License

Apache 2.0
