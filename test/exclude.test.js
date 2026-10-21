import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { compileExcludePattern, scanPaths } from '../src/scanner.js';
import { resolveOptions, validateConfig } from '../src/config.js';

async function withTree(build) {
  const root = await mkdtemp(path.join(tmpdir(), 'todo-scan-exclude-'));
  try {
    await build(root);
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function seed(root) {
  await mkdir(path.join(root, 'src', 'deep'), { recursive: true });
  await mkdir(path.join(root, 'nested'), { recursive: true });
  await writeFile(path.join(root, 'src', 'a.js'), '// TODO a\n');
  await writeFile(path.join(root, 'src', 'a.test.js'), '// TODO test\n');
  await writeFile(path.join(root, 'src', 'deep', 'b.js'), '// TODO b\n');
  await writeFile(path.join(root, 'nested', 'c.js'), '// TODO c\n');
}

const rel = (root, hits) => hits.map((hit) => path.relative(root, hit.file).split(path.sep).join('/'));

test('compileExcludePattern marks slash-free patterns as basename matches', () => {
  assert.equal(compileExcludePattern('*.test.js').basenameOnly, true);
  assert.equal(compileExcludePattern('src/*.js').basenameOnly, false);
});

test('basename patterns exclude matching files at any depth', async () => {
  const root = await withTree(seed);
  try {
    const hits = await scanPaths(root, { exclude: ['*.test.js'] });
    assert.deepEqual(rel(root, hits), ['nested/c.js', 'src/a.js', 'src/deep/b.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('path patterns only match at the given depth', async () => {
  const root = await withTree(seed);
  try {
    const hits = await scanPaths(root, { exclude: ['src/*.js'] });
    assert.deepEqual(rel(root, hits), ['nested/c.js', 'src/deep/b.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('** matches across directory boundaries', async () => {
  const root = await withTree(seed);
  try {
    const hits = await scanPaths(root, { exclude: ['**/nested/**'] });
    assert.deepEqual(rel(root, hits), ['src/a.js', 'src/a.test.js', 'src/deep/b.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('exclude applies to a single file target', async () => {
  const root = await withTree(seed);
  try {
    assert.deepEqual(await scanPaths(path.join(root, 'src', 'a.js'), { exclude: ['*.js'] }), []);
    assert.equal((await scanPaths(path.join(root, 'src', 'a.js'))).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('two patterns combine', async () => {
  const root = await withTree(seed);
  try {
    const hits = await scanPaths(root, { exclude: ['*.test.js', 'nested/**'] });
    assert.deepEqual(rel(root, hits), ['src/a.js', 'src/deep/b.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validateConfig accepts exclude and rejects malformed values', () => {
  assert.deepEqual(validateConfig({ exclude: ['*.min.js'] }), { exclude: ['*.min.js'] });
  assert.throws(() => validateConfig({ exclude: '*.js' }), /"exclude"/);
  assert.throws(() => validateConfig({ exclude: [''] }), /"exclude"/);
});

test('resolveOptions merges exclude from CLI over config', () => {
  assert.deepEqual(resolveOptions().exclude, []);
  assert.deepEqual(resolveOptions({ config: { exclude: ['*.md'] } }).exclude, ['*.md']);
  assert.deepEqual(
    resolveOptions({ cli: { exclude: ['*.test.js'] }, config: { exclude: ['*.md'] } }).exclude,
    ['*.test.js'],
  );
});
