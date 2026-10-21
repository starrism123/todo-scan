import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  FORMATS,
  formatJson,
  formatMarkdown,
  formatReport,
  formatText,
} from '../src/format.js';

const cwd = path.resolve('repo-root');

function hit(file, line, marker, text) {
  return { file: path.join(cwd, file), line, column: 1, marker, text, raw: '' };
}

const hits = [hit('src/a.js', 3, 'TODO', 'wire it up'), hit('lib/b.js', 9, 'FIXME', 'slow path')];

test('formatText renders location, marker and summary', () => {
  const lines = formatText(hits, { cwd }).split('\n');

  assert.equal(lines[0], 'src/a.js:3:1  TODO  wire it up');
  assert.equal(lines[1], 'lib/b.js:9:1  FIXME slow path');
  assert.equal(lines[2], '');
  assert.equal(lines[3], '2 marker(s) TODO: 1  FIXME: 1  HACK: 0  XXX: 0');
});

test('formatText reports an empty result without a summary', () => {
  assert.equal(formatText([], { cwd }), 'No markers found.');
});

test('formatJson emits relative paths and a summary', () => {
  const payload = JSON.parse(formatJson(hits, { cwd }));

  assert.equal(payload.version, 1);
  assert.equal(payload.total, 2);
  assert.deepEqual(payload.byMarker, { TODO: 1, FIXME: 1, HACK: 0, XXX: 0 });
  assert.deepEqual(payload.hits[0], {
    file: 'src/a.js',
    line: 3,
    column: 1,
    marker: 'TODO',
    text: 'wire it up',
  });
});

test('formatJson is valid JSON for an empty result', () => {
  const payload = JSON.parse(formatJson([], { cwd }));
  assert.equal(payload.total, 0);
  assert.deepEqual(payload.hits, []);
});

test('formatMarkdown renders a table with a total line', () => {
  const markdown = formatMarkdown(hits, { cwd });
  const lines = markdown.split('\n');

  assert.equal(lines[0], '## todo-scan report');
  assert.equal(lines[2], '| File | Line | Marker | Text |');
  assert.equal(lines[3], '| --- | ---: | --- | --- |');
  assert.equal(lines[4], '| `src/a.js` | 3 | TODO | wire it up |');
  assert.equal(markdown.includes('**Total: 2** — TODO: 1  FIXME: 1'), true);
});

test('formatMarkdown escapes pipe characters inside cells', () => {
  const markdown = formatMarkdown([hit('a.js', 1, 'TODO', 'left | right')], { cwd });
  assert.equal(markdown.includes('left \\| right'), true);
});

test('formatMarkdown handles an empty result', () => {
  assert.equal(formatMarkdown([], { cwd }), '## todo-scan report\n\nNo markers found.');
});

test('formatReport dispatches on the format name', () => {
  assert.equal(formatReport(hits, { format: 'text', cwd }), formatText(hits, { cwd }));
  assert.equal(formatReport(hits, { format: 'json', cwd }), formatJson(hits, { cwd }));
  assert.equal(formatReport(hits, { format: 'markdown', cwd }), formatMarkdown(hits, { cwd }));
  assert.equal(formatReport(hits, { cwd }), formatText(hits, { cwd }));
});

test('formatReport rejects unknown formats', () => {
  assert.throws(() => formatReport(hits, { format: 'xml' }), /Unknown format "xml"/);
  assert.deepEqual(FORMATS, ['text', 'json', 'markdown']);
});
