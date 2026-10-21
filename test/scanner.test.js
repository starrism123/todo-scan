import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_MARKERS,
  scanFile,
  scanPaths,
  scanText,
  summarize,
} from '../src/scanner.js';

test('detects default markers with line and column', () => {
  const source = ['const a = 1;', '// TODO: tune this', 'let b = 2; // FIXME later'].join('\n');
  const hits = scanText(source, 'a.js');

  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.map((hit) => ({ line: hit.line, column: hit.column, marker: hit.marker })),
    [
      { line: 2, column: 4, marker: 'TODO' },
      { line: 3, column: 15, marker: 'FIXME' },
    ],
  );
  assert.equal(hits[0].text, 'tune this');
  assert.equal(hits[1].text, 'later');
});

test('markers are matched case-insensitively and normalized to uppercase', () => {
  const hits = scanText('// todo: lowercase', 'a.js');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].marker, 'TODO');
  assert.equal(hits[0].text, 'lowercase');
});

test('accepts custom marker sets', () => {
  const hits = scanText('NOTE: keep in sync\n// TODO: ignored', 'a.js', { markers: ['NOTE'] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].marker, 'NOTE');
  assert.equal(hits[0].text, 'keep in sync');
});

test('falls back to default markers for an empty marker list', () => {
  const hits = scanText('// XXX broken', 'a.js', { markers: [] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].marker, 'XXX');
});

test('does not match markers embedded inside longer words', () => {
  const hits = scanText('const TODOLOGY = 1; // MASTODON', 'a.js');
  assert.deepEqual(hits, []);
});

test('keeps the whole line when the marker has no trailing comment', () => {
  const hits = scanText('TODO', 'a.js');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, 'TODO');
  assert.equal(hits[0].column, 1);
});

test('summarize counts hits per marker and keeps the marker order', () => {
  const hits = scanText('// TODO a\n// TODO b\n// HACK c', 'a.js');
  const summary = summarize(hits);
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.byMarker, { TODO: 2, FIXME: 0, HACK: 1, XXX: 0 });
  assert.deepEqual(Object.keys(summary.byMarker), DEFAULT_MARKERS);
});

test('summarize counts markers outside the default set when configured', () => {
  const hits = scanText('// PERF: slow', 'a.js', { markers: ['PERF'] });
  const summary = summarize(hits, ['PERF']);
  assert.deepEqual(summary.byMarker, { PERF: 1 });
});

test('scanPaths walks a directory, skips ignored dirs, and sorts results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'todo-scan-'));
  try {
    await mkdir(path.join(root, 'src'));
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'src', 'b.js'), '// TODO second\n');
    await writeFile(path.join(root, 'src', 'a.js'), '// FIXME first\n');
    await writeFile(path.join(root, 'node_modules', 'dep.js'), '// TODO vendor\n');
    await writeFile(path.join(root, 'clean.js'), 'const ok = 1;\n');

    const hits = await scanPaths(root);
    assert.deepEqual(
      hits.map((hit) => path.relative(root, hit.file)),
      [path.join('src', 'a.js'), path.join('src', 'b.js')],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanPaths honours a custom ignore list', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'todo-scan-'));
  try {
    await mkdir(path.join(root, 'fixtures'));
    await writeFile(path.join(root, 'fixtures', 'x.js'), '// TODO fixture\n');
    await writeFile(path.join(root, 'main.js'), '// TODO real\n');

    const hits = await scanPaths(root, { ignoreDirs: ['fixtures'] });
    assert.deepEqual(hits.map((hit) => path.basename(hit.file)), ['main.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanFile reads a single file and returns [] for binary data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'todo-scan-'));
  try {
    const textFile = path.join(root, 'text.js');
    await writeFile(textFile, '// TODO from file\n');
    const hits = await scanFile(textFile);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].text, 'from file');

    const binaryFile = path.join(root, 'blob.bin');
    await writeFile(binaryFile, Buffer.from([0x00, 0x01, 0x02, 0x00]));
    assert.deepEqual(await scanFile(binaryFile), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanPaths skips paths that do not exist', async () => {
  const hits = await scanPaths(['does-not-exist-anywhere']);
  assert.deepEqual(hits, []);
});
