import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCliArgs } from '../src/cli.js';

test('parseCliArgs defaults to no format and no paths', () => {
  const { values, positionals } = parseCliArgs([]);
  assert.equal(values.format, undefined);
  assert.deepEqual(positionals, []);
});

test('parseCliArgs reads short and long flags', () => {
  assert.equal(parseCliArgs(['-f', 'json']).values.format, 'json');
  assert.equal(parseCliArgs(['--format', 'markdown']).values.format, 'markdown');
  assert.equal(parseCliArgs(['-m', 'TODO,PERF']).values.markers, 'TODO,PERF');
});

test('parseCliArgs keeps positional paths', () => {
  const { positionals } = parseCliArgs(['src', 'lib', '--format', 'json']);
  assert.deepEqual(positionals, ['src', 'lib']);
});

test('parseCliArgs reads gate and config flags', () => {
  assert.equal(parseCliArgs(['--fail-on', 'FIXME']).values['fail-on'], 'FIXME');
  assert.equal(parseCliArgs(['--max', '3']).values.max, '3');
  assert.equal(parseCliArgs(['--config', 'custom.json']).values.config, 'custom.json');
});

test('parseCliArgs reads the quiet flag in both spellings', () => {
  assert.equal(parseCliArgs(['-q']).values.quiet, true);
  assert.equal(parseCliArgs(['--quiet']).values.quiet, true);
  assert.equal(parseCliArgs([]).values.quiet, undefined);
});

test('parseCliArgs rejects unknown flags', () => {
  assert.throws(() => parseCliArgs(['--nope']), /nope/);
});
