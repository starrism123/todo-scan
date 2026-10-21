#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateGate, loadConfig, resolveOptions } from './config.js';
import { FORMATS, formatReport } from './format.js';
import { DEFAULT_MARKERS, scanPaths, summarize } from './scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Strip a BOM: PowerShell's Set-Content and a few editors add one, and it makes
// JSON.parse throw.
const pkg = JSON.parse(
  readFileSync(path.join(here, '..', 'package.json'), 'utf8').replace(/^\uFEFF+/, ''),
);

const HELP = `todo-scan ${pkg.version}

Usage: todo-scan [options] [paths...]

Scan files for TODO / FIXME / HACK markers.

Options:
  -m, --markers <list>   Comma-separated markers (default: ${DEFAULT_MARKERS.join(',')})
  -f, --format <name>    Report format: ${FORMATS.join(', ')} (default: text)
      --ignore <list>    Comma-separated directory names to skip
      --exclude <list>   Comma-separated glob patterns to skip (*, ?, **)
      --fail-on <list>   Exit 1 when any of these markers is found
      --max <n>          Exit 1 when more than n markers are found
      --config <file>    Use a specific config file
  -q, --quiet            Print nothing on success; only gate errors
  -h, --help             Show this help
  -v, --version          Print the version

A .todo-scan.json file in the working directory is loaded automatically.

Exit codes: 0 ok, 1 gate tripped, 2 usage error.
`;

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--max expects a non-negative integer, got "${value}".`);
  }
  return parsed;
}

export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      markers: { type: 'string', short: 'm' },
      format: { type: 'string', short: 'f' },
      ignore: { type: 'string' },
      exclude: { type: 'string' },
      'fail-on': { type: 'string' },
      max: { type: 'string' },
      config: { type: 'string' },
      quiet: { type: 'boolean', short: 'q' },
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

  let cli;
  try {
    cli = {
      markers: values.markers ? splitList(values.markers) : undefined,
      ignore: values.ignore ? splitList(values.ignore) : undefined,
      exclude: values.exclude ? splitList(values.exclude) : undefined,
      format: values.format,
      failOn: values['fail-on'] ? splitList(values['fail-on']) : undefined,
      max: values.max === undefined ? undefined : parseCount(values.max),
      paths: positionals,
    };
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  let options;
  try {
    const { config } = await loadConfig({ cwd: process.cwd(), filename: values.config });
    options = resolveOptions({ cli, config });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (!FORMATS.includes(options.format)) {
    process.stderr.write(
      `Unknown format "${options.format}". Expected one of: ${FORMATS.join(', ')}.\n`,
    );
    process.exitCode = 2;
    return;
  }

  const hits = await scanPaths(options.paths, {
    markers: options.markers,
    ignoreDirs: options.ignore,
    exclude: options.exclude,
  });

  // --quiet is for pipelines: the exit code carries the answer, so the report
  // would only add noise to the CI log.
  if (!values.quiet) {
    const report = formatReport(hits, {
      format: options.format,
      cwd: process.cwd(),
      markers: options.markers,
    });
    process.stdout.write(`${report}\n`);
  }

  const summary = summarize(hits, options.markers);
  const reason = evaluateGate(summary, options);
  if (reason) {
    process.stderr.write(`todo-scan: ${reason}\n`);
    process.exitCode = 1;
  }
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
