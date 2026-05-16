import fs from 'fs/promises';
import path from 'path';
import { Mistral } from '@mistralai/mistralai';
import { writeFile } from './utils.js';

const SYSTEM_PROMPT = `You are a structured data specialist with deep expertise in Schema.org JSON-LD markup.

Your task is to analyze a web page's content (provided as Markdown with a YAML metadata header) and produce a valid, complete JSON-LD snippet appropriate for that page.

Rules you MUST follow:
1. Output ONLY a single valid JSON object — no prose, no markdown code fences, no explanation.
2. Always include "@context": "https://schema.org" at the top level.
3. Always include "@type" — choose the most specific applicable Schema.org type (e.g. Article, Product, FAQPage, Organization, LocalBusiness, BreadcrumbList, WebPage, etc.).
4. Populate as many Schema.org properties as the content supports. Do not invent data not present in the content.
5. If the page metadata includes existing structured data hints (from the "structured_data_hints" field), use those @type values as strong signals — but you may upgrade to a more specific subtype if warranted.
6. For pages that are primarily navigation or listing pages (e.g. a blog index), use "CollectionPage" or "ItemList".
7. The "url" property must exactly match the URL provided in the metadata header.
8. Include "dateModified" or "datePublished" only if clearly present in the content.
9. Nest related entities inline (e.g. "author": {"@type": "Person", "name": "..."}).
10. Do not hallucinate prices, addresses, phone numbers, or other facts not visible in the content.`;

function buildUserPrompt(markdownContent, url) {
  return `Analyze the following web page and produce a JSON-LD snippet.

Page URL: ${url}

--- PAGE CONTENT START ---
${markdownContent}
--- PAGE CONTENT END ---

Respond with only the JSON-LD object. No explanation. No markdown formatting.`;
}

async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

export async function generateJsonLd(markdownContent, url, { model, apiKey }) {
  const client = new Mistral({ apiKey });

  const raw = await withRetry(async () => {
    const response = await client.chat.complete({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(markdownContent, url) },
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0.1,
    });
    return response.choices[0].message.content;
  });

  JSON.parse(raw);
  return raw;
}

export async function generateAllJsonLd(sessionFolder, markdownFiles, { model, apiKey, onProgress }) {
  const completedFiles = [];

  for (let i = 0; i < markdownFiles.length; i++) {
    const { mdPath, url } = markdownFiles[i];
    const stem = path.basename(mdPath, '.md');
    const jsonldPath = path.join(sessionFolder, 'jsonld', `${stem}.jsonld`);

    try {
      const markdownContent = await fs.readFile(mdPath, 'utf8');
      const jsonld = await generateJsonLd(markdownContent, url, { model, apiKey });
      await writeFile(jsonldPath, jsonld + '\n');
      completedFiles.push({ url, jsonldFile: path.relative(sessionFolder, jsonldPath) });
    } catch (err) {
      completedFiles.push({ url, error: err.message });
    }

    if (onProgress) onProgress(url, i + 1, markdownFiles.length);
  }

  return completedFiles;
}
