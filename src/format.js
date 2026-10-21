import path from 'node:path';

import { summarize } from './scanner.js';

/** Report formats understood by the CLI and by formatReport(). */
export const FORMATS = ['text', 'json', 'markdown'];

const MARKER_WIDTH = 5;

function toRelative(file, cwd) {
  const relative = path.relative(cwd, file) || file;
  // Reports are pasted into issues and CI logs, so keep them platform-neutral.
  return relative.split(path.sep).join('/');
}

function singleLine(text) {
  return String(text).replace(/\r?\n/g, ' ');
}

function breakdown(summary, markers) {
  return markers.map((marker) => `${marker}: ${summary.byMarker[marker] ?? 0}`).join('  ');
}

function summaryLine(summary, markers) {
  return `${summary.total} marker(s) ${breakdown(summary, markers)}`;
}

/**
 * Plain-text report, one hit per line, followed by a summary.
 *
 * The layout is stable so it can be diffed in CI logs.
 *
 * @param {Array} hits
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string[]} [options.markers]
 * @returns {string}
 */
export function formatText(hits, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const markers = options.markers ?? Object.keys(summarize(hits).byMarker);

  if (hits.length === 0) return 'No markers found.';

  const lines = hits.map((hit) => {
    const location = `${toRelative(hit.file, cwd)}:${hit.line}:${hit.column}`;
    return `${location}  ${hit.marker.padEnd(MARKER_WIDTH)} ${singleLine(hit.text)}`;
  });

  return [...lines, '', summaryLine(summarize(hits, markers), markers)].join('\n');
}

/**
 * Machine-readable report.
 *
 * Paths are relative to `cwd` so the output stays stable across machines.
 *
 * @param {Array} hits
 * @param {object} [options]
 * @returns {string}
 */
export function formatJson(hits, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const markers = options.markers ?? Object.keys(summarize(hits).byMarker);
  const summary = summarize(hits, markers);

  return JSON.stringify(
    {
      version: 1,
      total: summary.total,
      byMarker: summary.byMarker,
      hits: hits.map((hit) => ({
        file: toRelative(hit.file, cwd),
        line: hit.line,
        column: hit.column,
        marker: hit.marker,
        text: singleLine(hit.text),
      })),
    },
    null,
    2,
  );
}

function escapeCell(value) {
  return singleLine(value).replace(/\|/g, '\\|');
}

/**
 * Markdown report, suitable for pasting into an issue or a PR comment.
 *
 * @param {Array} hits
 * @param {object} [options]
 * @returns {string}
 */
export function formatMarkdown(hits, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const markers = options.markers ?? Object.keys(summarize(hits).byMarker);
  const summary = summarize(hits, markers);

  if (hits.length === 0) {
    return '## todo-scan report\n\nNo markers found.';
  }

  const rows = hits.map(
    (hit) =>
      `| \`${escapeCell(toRelative(hit.file, cwd))}\` | ${hit.line} | ${hit.marker} | ${escapeCell(hit.text)} |`,
  );

  return [
    '## todo-scan report',
    '',
    '| File | Line | Marker | Text |',
    '| --- | ---: | --- | --- |',
    ...rows,
    '',
    `**Total: ${summary.total}** — ${breakdown(summary, markers)}`,
  ].join('\n');
}

/**
 * Render hits in the requested format.
 *
 * @param {Array} hits
 * @param {object} [options]
 * @param {'text'|'json'|'markdown'} [options.format]
 * @returns {string}
 */
export function formatReport(hits, options = {}) {
  const format = options.format ?? 'text';

  switch (format) {
    case 'text':
      return formatText(hits, options);
    case 'json':
      return formatJson(hits, options);
    case 'markdown':
      return formatMarkdown(hits, options);
    default:
      throw new Error(`Unknown format "${format}". Expected one of: ${FORMATS.join(', ')}.`);
  }
}
