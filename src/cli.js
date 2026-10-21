#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORMATS, formatReport } from './format.js';
import { DEFAULT_MARKERS, scanPaths, summarize } from './scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const HELP = `todo-scan ${pkg.version}

Usage: todo-scan [options] [paths...]

Scan files for TODO / FIXME / HACK markers.

Options:
  -m, --markers <list>   Comma-separated markers (default: ${DEFAULT_MARKERS.join(',')})
  -f, --format <name>    Report format: ${FORMATS.join(', ')} (default: text)
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
      format: { type: 'string', short: 'f' },
      ignore: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  return { values, positionals };
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

  const format = values.format ?? 'text';
  if (!FORMATS.includes(format)) {
    process.stderr.write(`Unknown format "${format}". Expected one of: ${FORMATS.join(', ')}.\n`);
    process.exitCode = 2;
    return;
  }

  const targets = positionals.length > 0 ? positionals : ['.'];
  const markers = values.markers ? splitList(values.markers) : DEFAULT_MARKERS;
  const ignoreDirs = values.ignore ? splitList(values.ignore) : undefined;

  const hits = await scanPaths(targets, { markers, ignoreDirs });
  const report = formatReport(hits, { format, cwd: process.cwd(), markers });
  process.stdout.write(`${report}\n`);

  return summarize(hits, markers);
}

// Only run when invoked as a script, so tests and other modules can import
// parseCliArgs() without scanning the working directory as a side effect.
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`todo-scan failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
