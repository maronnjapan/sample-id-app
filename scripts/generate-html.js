#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const markdownHtml = require('zenn-markdown-html');

const BLOG_DIR = path.resolve(__dirname, '../blog');
const OUTPUT_DIR = path.resolve(__dirname, '../blog/html');
const CSS_PATH = path.resolve(__dirname, '../node_modules/zenn-content-css/lib/index.css');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildHtml(title, bodyHtml, css) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
${css}
  </style>
  <style>
    body {
      max-width: 860px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
  </style>
</head>
<body>
  <div class="znc">
${bodyHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : 'Document';
}

async function main() {
  ensureDir(OUTPUT_DIR);

  const css = fs.readFileSync(CSS_PATH, 'utf-8');

  const mdFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));

  if (mdFiles.length === 0) {
    console.log('No markdown files found in blog/');
    return;
  }

  for (const file of mdFiles) {
    const inputPath = path.join(BLOG_DIR, file);
    const outputFile = file.replace(/\.md$/, '.html');
    const outputPath = path.join(OUTPUT_DIR, outputFile);

    const markdown = fs.readFileSync(inputPath, 'utf-8');
    const bodyHtml = await markdownHtml.default(markdown);
    const title = extractTitle(markdown);
    const html = buildHtml(title, bodyHtml, css);

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Generated: blog/html/${outputFile}`);
  }

  console.log(`\nDone. ${mdFiles.length} file(s) converted.`);
}

main();
