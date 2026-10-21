import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CONFIG_FILENAMES,
  evaluateGate,
  loadConfig,
  resolveOptions,
  validateConfig,
} from '../src/config.js';
import { DEFAULT_MARKERS } from '../src/scanner.js';

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'todo-scan-config-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('validateConfig accepts a complete config', () => {
  const config = {
    markers: ['TODO', 'PERF'],
    ignore: ['vendor'],
    format: 'json',
    failOn: ['FIXME'],
    max: 10,
    paths: ['src'],
  };
  assert.equal(validateConfig(config), config);
});

test('validateConfig rejects non-objects', () => {
  assert.throws(() => validateConfig(null), /must contain a JSON object/);
  assert.throws(() => validateConfig([]), /must contain a JSON object/);
  assert.throws(() => validateConfig('text'), /must contain a JSON object/);
});

test('validateConfig rejects unknown keys such as a misspelled failOn', () => {
  assert.throws(() => validateConfig({ failon: ['FIXME'] }, 'cfg.json'), /Unknown key "failon"/);
});

test('validateConfig rejects malformed values', () => {
  assert.throws(() => validateConfig({ markers: 'TODO' }), /"markers"/);
  assert.throws(() => validateConfig({ markers: [''] }), /"markers"/);
  assert.throws(() => validateConfig({ ignore: [1] }), /"ignore"/);
  assert.throws(() => validateConfig({ failOn: null }), /"failOn"/);
  assert.throws(() => validateConfig({ format: 'xml' }), /"format"/);
  assert.throws(() => validateConfig({ max: -1 }), /"max"/);
  assert.throws(() => validateConfig({ max: 1.5 }), /"max"/);
});

test('loadConfig discovers .todo-scan.json in the working directory', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '.todo-scan.json'), JSON.stringify({ format: 'markdown' }));
    const { config, source } = await loadConfig({ cwd: dir });
    assert.deepEqual(config, { format: 'markdown' });
    assert.equal(source, path.join(dir, CONFIG_FILENAMES[0]));
  });
});

test('loadConfig tolerates a UTF-8 BOM written by Windows editors', async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, '.todo-scan.json'),
      `\uFEFF${JSON.stringify({ failOn: ['FIXME'] })}`,
      'utf8',
    );
    const { config } = await loadConfig({ cwd: dir });
    assert.deepEqual(config, { failOn: ['FIXME'] });
  });
});

test('loadConfig tolerates a duplicated BOM', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '.todo-scan.json'), '\uFEFF\uFEFF{"max":0}', 'utf8');
    const { config } = await loadConfig({ cwd: dir });
    assert.deepEqual(config, { max: 0 });
  });
});

test('loadConfig returns an empty config when no file exists', async () => {
  await withTempDir(async (dir) => {
    const { config, source } = await loadConfig({ cwd: dir });
    assert.deepEqual(config, {});
    assert.equal(source, null);
  });
});

test('loadConfig reports invalid JSON with the file name', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '.todo-scan.json'), '{ nope');
    await assert.rejects(() => loadConfig({ cwd: dir }), /Invalid JSON in/);
  });
});

test('loadConfig throws when an explicit config file is missing', async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(
      () => loadConfig({ cwd: dir, filename: 'missing.json' }),
      /Cannot read config file/,
    );
  });
});

test('loadConfig uses the explicit file and ignores discovery', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '.todo-scan.json'), JSON.stringify({ format: 'json' }));
    await writeFile(path.join(dir, 'custom.json'), JSON.stringify({ format: 'markdown' }));
    const { config, source } = await loadConfig({ cwd: dir, filename: 'custom.json' });
    assert.deepEqual(config, { format: 'markdown' });
    assert.equal(source, path.join(dir, 'custom.json'));
  });
});

test('resolveOptions falls back to defaults', () => {
  const options = resolveOptions();
  assert.deepEqual(options.markers, DEFAULT_MARKERS);
  assert.equal(options.format, 'text');
  assert.equal(options.max, null);
  assert.deepEqual(options.failOn, []);
  assert.deepEqual(options.paths, ['.']);
  assert.equal(options.ignore, undefined);
});

test('resolveOptions prefers CLI values over config values', () => {
  const options = resolveOptions({
    cli: { markers: ['PERF'], format: 'json', max: 3, failOn: ['hack'], paths: ['src'] },
    config: { markers: ['TODO'], format: 'markdown', max: 99, failOn: ['FIXME'], paths: ['lib'] },
  });
  assert.deepEqual(options.markers, ['PERF']);
  assert.equal(options.format, 'json');
  assert.equal(options.max, 3);
  assert.deepEqual(options.failOn, ['HACK']);
  assert.deepEqual(options.paths, ['src']);
});

test('resolveOptions uses config values when CLI is silent', () => {
  const options = resolveOptions({
    config: { markers: ['PERF'], ignore: ['vendor'], format: 'markdown', failOn: ['fixme'], max: 0 },
  });
  assert.deepEqual(options.markers, ['PERF']);
  assert.deepEqual(options.ignore, ['vendor']);
  assert.equal(options.format, 'markdown');
  assert.deepEqual(options.failOn, ['FIXME']);
  assert.equal(options.max, 0);
});

test('evaluateGate passes when no rule is configured', () => {
  assert.equal(evaluateGate({ total: 42, byMarker: { TODO: 42 } }), null);
});

test('evaluateGate trips when the count exceeds max', () => {
  const summary = { total: 5, byMarker: { TODO: 5 } };
  assert.equal(evaluateGate(summary, { max: 5 }), null);
  assert.match(evaluateGate(summary, { max: 4 }), /exceeds --max 4/);
});

test('evaluateGate trips when a forbidden marker is present', () => {
  const summary = { total: 2, byMarker: { TODO: 1, FIXME: 1 } };
  assert.match(evaluateGate(summary, { failOn: ['FIXME'] }), /1 FIXME marker/);
  assert.equal(evaluateGate(summary, { failOn: ['HACK'] }), null);
  assert.equal(evaluateGate(summary, { failOn: [] }), null);
});

test('evaluateGate checks max before marker rules', () => {
  const summary = { total: 9, byMarker: { FIXME: 1, TODO: 8 } };
  assert.match(evaluateGate(summary, { failOn: ['FIXME'], max: 1 }), /exceeds --max/);
});
