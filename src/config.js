import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { FORMATS } from './format.js';
import { DEFAULT_MARKERS } from './scanner.js';

/** Config file names that are discovered automatically, in priority order. */
export const CONFIG_FILENAMES = ['.todo-scan.json', 'todo-scan.json'];

const ALLOWED_KEYS = new Set(['markers', 'ignore', 'exclude', 'format', 'failOn', 'max', 'paths']);

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

/**
 * Validate a parsed config object.
 *
 * Unknown keys are rejected instead of silently ignored, because a typo such
 * as `failon` would otherwise disable the CI gate without any warning.
 *
 * @param {unknown} raw
 * @param {string} source
 * @returns {object}
 */
export function validateConfig(raw, source = 'config') {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${source} must contain a JSON object.`);
  }

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(
        `Unknown key "${key}" in ${source}. Allowed keys: ${[...ALLOWED_KEYS].join(', ')}.`,
      );
    }
  }

  if (raw.markers !== undefined && !isStringArray(raw.markers)) {
    throw new Error(`"markers" in ${source} must be a non-empty array of strings.`);
  }
  if (raw.ignore !== undefined && !isStringArray(raw.ignore)) {
    throw new Error(`"ignore" in ${source} must be an array of strings.`);
  }
  if (raw.exclude !== undefined && !isStringArray(raw.exclude)) {
    throw new Error(`"exclude" in ${source} must be an array of strings.`);
  }
  if (raw.paths !== undefined && !isStringArray(raw.paths)) {
    throw new Error(`"paths" in ${source} must be an array of strings.`);
  }
  if (raw.failOn !== undefined && !isStringArray(raw.failOn)) {
    throw new Error(`"failOn" in ${source} must be an array of strings.`);
  }
  if (raw.format !== undefined && !FORMATS.includes(raw.format)) {
    throw new Error(
      `"format" in ${source} must be one of: ${FORMATS.join(', ')}.`,
    );
  }
  if (raw.max !== undefined && (!Number.isInteger(raw.max) || raw.max < 0)) {
    throw new Error(`"max" in ${source} must be a non-negative integer.`);
  }

  return raw;
}

function parseConfigText(text, source) {
  // Windows editors happily write a UTF-8 BOM (sometimes more than one); strip
  // them all so the file still parses.
  const cleaned = text.replace(/^\uFEFF+/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Invalid JSON in ${source}: ${error.message}`);
  }
  return validateConfig(parsed, source);
}

/**
 * Load a config file.
 *
 * With an explicit `filename` the file must exist; otherwise each name in
 * CONFIG_FILENAMES is probed and the first match wins.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string} [options.filename] Explicit path, as passed by --config.
 * @returns {Promise<{config: object, source: string|null}>}
 */
export async function loadConfig(options = {}) {
  const cwd = options.cwd ?? process.cwd();

  if (options.filename) {
    const resolved = path.resolve(cwd, options.filename);
    let text;
    try {
      text = await readFile(resolved, 'utf8');
    } catch {
      throw new Error(`Cannot read config file: ${resolved}`);
    }
    return { config: parseConfigText(text, resolved), source: resolved };
  }

  for (const name of CONFIG_FILENAMES) {
    const candidate = path.join(cwd, name);
    let text;
    try {
      text = await readFile(candidate, 'utf8');
    } catch {
      continue;
    }
    return { config: parseConfigText(text, candidate), source: candidate };
  }

  return { config: {}, source: null };
}

/**
 * Merge CLI values over config values over defaults.
 *
 * @param {object} input
 * @param {object} [input.cli] Values parsed from argv.
 * @param {object} [input.config] Values loaded from a config file.
 * @returns {{markers: string[], ignore: string[]|undefined, exclude: string[], format: string, failOn: string[], max: number|null, paths: string[]}}
 */
export function resolveOptions({ cli = {}, config = {} } = {}) {
  return {
    markers: cli.markers?.length ? cli.markers : (config.markers ?? DEFAULT_MARKERS),
    ignore: cli.ignore?.length ? cli.ignore : config.ignore,
    exclude: cli.exclude?.length ? cli.exclude : (config.exclude ?? []),
    format: cli.format ?? config.format ?? 'text',
    failOn: (cli.failOn?.length ? cli.failOn : (config.failOn ?? [])).map((marker) =>
      marker.toUpperCase(),
    ),
    max: cli.max ?? config.max ?? null,
    paths: cli.paths?.length ? cli.paths : (config.paths ?? ['.']),
  };
}

/**
 * Decide whether the CI gate trips.
 *
 * @param {{total: number, byMarker: Record<string, number>}} summary
 * @param {object} rules
 * @param {string[]} [rules.failOn]
 * @param {number|null} [rules.max]
 * @returns {string|null} A human-readable reason, or null when the gate passes.
 */
export function evaluateGate(summary, { failOn = [], max = null } = {}) {
  if (max !== null && summary.total > max) {
    return `found ${summary.total} marker(s), which exceeds --max ${max}`;
  }

  for (const marker of failOn) {
    const count = summary.byMarker[marker] ?? 0;
    if (count > 0) {
      return `found ${count} ${marker} marker(s), which --fail-on forbids`;
    }
  }

  return null;
}
