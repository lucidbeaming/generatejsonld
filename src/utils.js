import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export const log = {
  info: (msg) => console.log(chalk.cyan('[info]'), msg),
  success: (msg) => console.log(chalk.green('[done]'), msg),
  warn: (msg) => console.log(chalk.yellow('[warn]'), msg),
  error: (msg) => console.error(chalk.red('[error]'), msg),
  dim: (msg) => console.log(chalk.dim(msg)),
  page: (i, total, url) =>
    console.log(
      chalk.dim(`  [${String(i).padStart(String(total).length)}/${total}]`),
      chalk.white(url)
    ),
  retry: (attempt, max, reason) =>
    console.log(chalk.yellow(`  [retry ${attempt}/${max}]`), chalk.dim(reason)),
  header: (msg) => console.log('\n' + chalk.bold.underline(msg)),
  summary: (rows) => {
    console.log('');
    for (const [label, value] of rows) {
      console.log(' ', chalk.dim(label.padEnd(20)), chalk.white(value));
    }
    console.log('');
  },
};

export async function createSessionFolder(baseOutput, rootUrl) {
  const { hostname } = new URL(rootUrl);
  const slug = hostname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
  const folderName = `${slug}-${ts}`;
  const sessionPath = path.resolve(baseOutput, folderName);

  await fs.mkdir(path.join(sessionPath, 'markdown'), { recursive: true });
  await fs.mkdir(path.join(sessionPath, 'jsonld'), { recursive: true });

  return sessionPath;
}

export function urlToFilename(url) {
  const { hostname, pathname } = new URL(url);
  const raw = hostname + pathname;
  return raw
    .replace(/\/+$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export async function writeFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}
