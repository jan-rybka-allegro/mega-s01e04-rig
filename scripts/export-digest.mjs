#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [pageUrl, outputPath, ...extraArgs] = process.argv.slice(2);

if (!pageUrl || !outputPath || extraArgs.length > 0) {
  console.error('Usage: node scripts/export-digest.mjs <page-url> <output-path>');
  process.exit(2);
}

try {
  const response = await fetch(pageUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/^text\/html(?:\s*;|$)/i.test(contentType)) {
    throw new Error(`Expected text/html, received ${contentType || 'no Content-Type'}`);
  }

  const html = new Uint8Array(await response.arrayBuffer());
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html);
  console.log(`Saved HTML to ${destination}`);
} catch (error) {
  console.error(`Digest export failed: ${error.message}`);
  process.exitCode = 1;
}
