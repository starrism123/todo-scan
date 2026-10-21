import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Markers that are reported by default. */
export const DEFAULT_MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX'];

/** Directory names that are never descended into. */
export const DEFAULT_IGNORED_DIRS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'vendor',
  'target',
  '__pycache__',
];

/** Files above this size are treated as generated and skipped. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(markers) {
  const alternatives = markers.map(escapeRegExp).join('|');
  return new RegExp(`\\b(${alternatives})\\b[\\s:：\\-]*(.*)$`, 'i');
}

function normalizeMarkers(markers) {
  if (!Array.isArray(markers) || markers.length === 0) {
    return [...DEFAULT_MARKERS];
  }
  return markers.map((marker) => String(marker).toUpperCase());
}

/**
 * Find the first marker on every line of an in-memory text blob.
 *
 * This is the pure core of the scanner: no filesystem access, so it is cheap
 * to unit test and safe to call from editor integrations.
 *
 * @param {string} text
 * @param {string} [file] Path recorded on each hit.
 * @param {object} [options]
 * @param {string[]} [options.markers]
 * @returns {Array<{file: string, line: number, column: number, marker: string, text: string, raw: string}>}
 */
export function scanText(text, file = '<text>', options = {}) {
  const markers = normalizeMarkers(options.markers);
  const matcher = buildMatcher(markers);
  const hits = [];

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const match = matcher.exec(raw);
    if (!match) continue;

    hits.push({
      file,
      line: index + 1,
      column: match.index + 1,
      marker: match[1].toUpperCase(),
      text: (match[2] ?? '').trim() || raw.trim(),
      raw,
    });
  }

  return hits;
}

/**
 * Aggregate hits per marker, preserving the canonical marker order.
 *
 * @param {Array<{marker: string}>} hits
 * @param {string[]} [markers]
 * @returns {{total: number, byMarker: Record<string, number>}}
 */
export function summarize(hits, markers = DEFAULT_MARKERS) {
  const byMarker = {};
  for (const marker of markers) byMarker[marker] = 0;
  for (const hit of hits) {
    byMarker[hit.marker] = (byMarker[hit.marker] ?? 0) + 1;
  }
  return { total: hits.length, byMarker };
}

async function readTextFile(file) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0 || info.size > MAX_FILE_BYTES) return null;

    const buffer = Buffer.alloc(info.size);
    const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
    const chunk = buffer.subarray(0, bytesRead);
    if (chunk.includes(0)) return null; // binary
    return chunk.toString('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * Scan a single file.
 *
 * @param {string} file
 * @param {object} [options]
 * @returns {Promise<Array>}
 */
export async function scanFile(file, options = {}) {
  const text = await readTextFile(file);
  if (text === null) return [];
  return scanText(text, file, options);
}

/**
 * Translate an exclude pattern into a matcher.
 *
 * Supports `*` (one path segment), `?` (one character) and `**` (any depth).
 * A pattern without a slash also matches on the bare file name, so
 * `--exclude *.test.js` behaves the way people expect.
 *
 * @param {string} pattern
 * @returns {{regex: RegExp, basenameOnly: boolean}}
 */
export function compileExcludePattern(pattern) {
  // Two passes: first escape literal characters while parking the wildcards as
  // placeholders, then expand the placeholders. Doing it in one pass lets the
  // generated "[^/]*" be rewritten again by the next replacement.
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '\u0002')
    .replace(/\?/g, '\u0003')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*')
    .replace(/\u0002/g, '[^/]*')
    .replace(/\u0003/g, '[^/]');

  return {
    regex: new RegExp(`^${source}$`),
    basenameOnly: !pattern.includes('/'),
  };
}

function isExcluded(relativePath, basename, matchers) {
  return matchers.some((matcher) =>
    matcher.basenameOnly ? matcher.regex.test(basename) : matcher.regex.test(relativePath),
  );
}

async function walk(target, root, settings, hits) {
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const full = path.join(target, entry.name);
    const relativePath = path.relative(root, full).split(path.sep).join('/');

    if (isExcluded(relativePath, entry.name, settings.excludeMatchers)) continue;

    if (entry.isDirectory()) {
      if (settings.ignoreDirs.has(entry.name)) continue;
      await walk(full, root, settings, hits);
      continue;
    }
    if (!entry.isFile()) continue;

    let fileHits;
    try {
      fileHits = await scanFile(full, { markers: settings.markers });
    } catch {
      continue;
    }
    if (fileHits.length > 0) {
      hits.push(...fileHits);
      if (settings.onChange) settings.onChange(fileHits);
    }
  }
}

/**
 * Recursively scan one or more files or directories.
 *
 * Missing paths are skipped rather than fatal, so the CLI can be pointed at a
 * directory that casually contains stale build folders.
 *
 * @param {string|string[]} targets
 * @param {object} [options]
 * @param {string[]} [options.markers]
 * @param {string[]} [options.ignoreDirs]
 * @param {string[]} [options.exclude] Glob patterns to skip.
 * @param {(hits: Array) => void} [options.onChange]
 * @returns {Promise<Array>}
 */
export async function scanPaths(targets, options = {}) {
  const list = Array.isArray(targets) ? targets : [targets];
  const settings = {
    markers: normalizeMarkers(options.markers),
    ignoreDirs: new Set(options.ignoreDirs ?? DEFAULT_IGNORED_DIRS),
    excludeMatchers: (options.exclude ?? []).map(compileExcludePattern),
    onChange: options.onChange,
  };

  const hits = [];
  for (const target of list) {
    const resolved = path.resolve(target);
    let stats;
    try {
      stats = await stat(resolved);
    } catch {
      continue;
    }

    if (stats.isFile()) {
      const basename = path.basename(resolved);
      if (isExcluded(basename, basename, settings.excludeMatchers)) continue;
      hits.push(...(await scanFile(resolved, { markers: settings.markers })));
    } else if (stats.isDirectory()) {
      await walk(resolved, resolved, settings, hits);
    }
  }
  return hits;
}
