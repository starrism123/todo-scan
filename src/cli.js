#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_MARKERS, scanPaths, summarize } from './scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const HELP = `todo-scan ${pkg.version}

Usage: todo-scan [options] [paths...]

Scan files for TODO / FIXME / HACK markers.

Options:
  -m, --markers <list>   Comma-separated markers (default: ${DEFAULT_MARKERS.join(',')})
      --ignore <list>    Comma-separated directory names to skip
  -h, --help             Show this help
  -v, --version          Print the version
`;

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      markers: { type: 'string', short: 'm' },
      ignore: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  return { values, positionals };
}

/**
 * Render hits as a human-readable report.
 *
 * @param {Array<{file: string, line: number, column: number, marker: string, text: string}>} hits
 * @param {string} cwd
 * @returns {string}
 */
export function renderText(hits, cwd = process.cwd()) {
  if (hits.length === 0) return 'No markers found.';

  const lines = hits.map((hit) => {
    const relative = path.relative(cwd, hit.file) || hit.file;
    return `${relative}:${hit.line}:${hit.column}  ${hit.marker.padEnd(5)} ${hit.text}`;
  });
  return lines.join('\n');
}

async function main() {
  let parsed;
  try {
    parsed = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  const targets = positionals.length > 0 ? positionals : ['.'];
  const markers = values.markers ? splitList(values.markers) : DEFAULT_MARKERS;
  const ignoreDirs = values.ignore ? splitList(values.ignore) : undefined;

  const hits = await scanPaths(targets, { markers, ignoreDirs });
  const summary = summarize(hits, markers);

  process.stdout.write(`${renderText(hits)}\n\n`);
  const breakdown = markers
    .map((marker) => `${marker}: ${summary.byMarker[marker] ?? 0}`)
    .join('  ');
  process.stdout.write(`${summary.total} marker(s) ${breakdown}\n`);
}

main().catch((error) => {
  process.stderr.write(`todo-scan failed: ${error.message}\n`);
  process.exitCode = 1;
});
