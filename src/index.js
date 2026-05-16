import 'dotenv/config';
import path from 'path';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { crawl } from './scraper.js';
import { convertToMarkdown } from './converter.js';
import { generateAllJsonLd } from './generator.js';
import { createSessionFolder, urlToFilename, writeFile, log } from './utils.js';

const program = new Command();

program
  .name('generatejsonld')
  .description('Scrape a website and generate JSON-LD structured data for each page using AI')
  .version('1.0.1')
  .requiredOption('--url <url>', 'Root URL to crawl (must be http or https)')
  .option('--output <path>', 'Parent directory for session folders', './sessions')
  .option('--dry-run', 'Spider only — print pages that would be processed, then exit')
  .option('--max-pages <n>', 'Maximum number of pages to crawl', '100')
  .option('--concurrency <n>', 'Parallel Playwright pages during crawl', '3')
  .option('--selector <css>', 'CSS selector for content extraction', 'body')
  .option('--model <name>', 'Mistral model ID', process.env.MISTRAL_MODEL || 'mistral-large-latest')
  .option('--no-confirm', 'Skip the confirmation prompt before JSON-LD generation');

program.parse();
const opts = program.opts();

function validateOptions(opts) {
  let parsed;
  try {
    parsed = new URL(opts.url);
  } catch {
    log.error(`Invalid URL: "${opts.url}"`);
    process.exit(1);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    log.error(`URL must use http or https. Got: ${parsed.protocol}`);
    process.exit(1);
  }

  const maxPages = parseInt(opts.maxPages, 10);
  if (isNaN(maxPages) || maxPages < 1) {
    log.error('--max-pages must be a positive integer');
    process.exit(1);
  }

  const concurrency = parseInt(opts.concurrency, 10);
  if (isNaN(concurrency) || concurrency < 1) {
    log.error('--concurrency must be a positive integer');
    process.exit(1);
  }

  return { ...opts, maxPages, concurrency };
}

async function main() {
  const options = validateOptions(opts);

  log.header('generatejsonld');
  log.summary([
    ['Target URL', options.url],
    ['Max pages', options.maxPages],
    ['Concurrency', options.concurrency],
    ['Model', options.model],
    ['Output', options.output],
    ['Mode', options.dryRun ? 'dry run' : 'full'],
  ]);

  if (!process.env.MISTRAL_API_KEY) {
    if (options.dryRun) {
      log.warn(
        'MISTRAL_API_KEY is not set — JSON-LD generation will fail if you proceed past dry run.'
      );
    } else {
      log.error('MISTRAL_API_KEY is not set. Add it to your .env file.');
      process.exit(1);
    }
  }

  let sessionFolder = null;
  if (!options.dryRun) {
    sessionFolder = await createSessionFolder(options.output, options.url);
    log.info(`Session folder: ${sessionFolder}`);
  }

  log.header('Crawling');
  const spinner = ora(`Crawling ${options.url} ...`).start();
  let results;
  try {
    results = await crawl(options.url, {
      maxPages: options.maxPages,
      concurrency: options.concurrency,
      onProgress: (url, i) => {
        spinner.text = `Crawling [${i}]: ${url}`;
      },
    });
  } catch (err) {
    spinner.fail('Crawl failed');
    log.error(err.message);
    process.exit(1);
  }
  spinner.succeed(`Crawled ${results.length} page(s)`);

  if (options.dryRun) {
    log.header('Pages found (dry run)');
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    ok.forEach((r, i) => log.page(i + 1, ok.length, r.url));
    failed.forEach((r) => log.warn(`  skipped: ${r.url} — ${r.error}`));
    log.summary([
      ['Pages found', ok.length],
      ['Errors', failed.length],
      ['Files written', '0 (dry run)'],
    ]);
    log.info('Exiting (dry run). No files written.');
    process.exit(0);
  }

  log.header('Converting to Markdown');
  const mdSpinner = ora('Converting...').start();
  const markdownFiles = [];

  for (const result of results) {
    if (!result.html) {
      mdSpinner.clear();
      log.warn(`Skipping ${result.url} — no HTML (${result.error ?? 'unknown error'})`);
      continue;
    }
    const md = convertToMarkdown(result);
    const stem = urlToFilename(result.url);
    const mdPath = path.join(sessionFolder, 'markdown', `${stem}.md`);
    await writeFile(mdPath, md);
    markdownFiles.push({ mdPath, url: result.url });
    mdSpinner.clear();
    log.page(markdownFiles.length, results.filter((r) => r.html).length, result.url);
  }
  mdSpinner.succeed(`Wrote ${markdownFiles.length} Markdown file(s)`);

  const sessionMeta = {
    rootUrl: options.url,
    startedAt: new Date().toISOString(),
    pageCount: markdownFiles.length,
    model: options.model,
    pages: markdownFiles.map((f) => ({
      url: f.url,
      markdownFile: path.relative(sessionFolder, f.mdPath),
    })),
  };
  await writeFile(
    path.join(sessionFolder, 'session.json'),
    JSON.stringify(sessionMeta, null, 2) + '\n'
  );

  if (options.confirm !== false) {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `Begin JSON-LD generation for ${markdownFiles.length} page(s)?`,
        default: false,
      },
    ]);
    if (!proceed) {
      log.warn('Aborted. Markdown files saved at: ' + path.join(sessionFolder, 'markdown'));
      process.exit(0);
    }
  }

  log.header('Generating JSON-LD');
  const genSpinner = ora('Sending pages to Mistral...').start();
  const jsonldResults = await generateAllJsonLd(sessionFolder, markdownFiles, {
    model: options.model,
    apiKey: process.env.MISTRAL_API_KEY,
    onProgress: (_url, _i, _total) => {
      genSpinner.clear();
    },
  });
  genSpinner.succeed(`JSON-LD generation complete`);

  const jsonldOk = jsonldResults.filter((r) => !r.error).length;
  const jsonldErrors = jsonldResults.filter((r) => r.error);

  const completedAt = new Date().toISOString();
  const updatedMeta = {
    ...sessionMeta,
    completedAt,
    jsonldCount: jsonldOk,
    pages: markdownFiles.map((f, i) => ({
      url: f.url,
      markdownFile: path.relative(sessionFolder, f.mdPath),
      jsonldFile: jsonldResults[i]?.jsonldFile ?? null,
      error: jsonldResults[i]?.error ?? null,
    })),
  };
  await writeFile(
    path.join(sessionFolder, 'session.json'),
    JSON.stringify(updatedMeta, null, 2) + '\n'
  );

  log.header('Summary');
  log.summary([
    ['Pages crawled', results.length],
    ['Markdown files', markdownFiles.length],
    ['JSON-LD files', jsonldOk],
    ['Errors', jsonldErrors.length || 'none'],
    ['Session folder', sessionFolder],
    ['Completed at', completedAt],
  ]);
  log.success('Done!');
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
