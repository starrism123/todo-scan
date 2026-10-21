# todo-scan

Scan a codebase for `TODO` / `FIXME` / `HACK` markers and report them.

Zero dependencies, ESM, Node.js 20+.

## Usage

```bash
node src/cli.js .                 # scan the current directory
node src/cli.js src lib           # scan several paths
node src/cli.js -m TODO,PERF .    # custom marker set
node src/cli.js --ignore vendor . # extra directories to skip
```

Output looks like:

```
src/cli.js:42:3     TODO  support config files
src/scanner.js:88:5 FIXME handle symlinks
```

A summary line follows the hits:

```
5 marker(s) TODO: 3  FIXME: 2  HACK: 0  XXX: 0
```

## What gets skipped

The scanner never descends into `node_modules`, `dist`, `build`, `coverage`,
`.git`, `.next`, `.nuxt`, `vendor`, `target` or `__pycache__`. Binary files and
files larger than 2 MiB are skipped as well.

Missing paths are ignored instead of being fatal, so pointing the tool at a
stale build directory does not abort the run.

## Library use

```js
import { scanPaths, summarize } from './src/scanner.js';

const hits = await scanPaths('src', { markers: ['TODO', 'FIXME'] });
console.log(summarize(hits));
```

`scanText(text, file, options)` is the pure core: it takes a string and returns
hits without touching the filesystem, which keeps it cheap to unit test.

## Development

```bash
npm test
```

Tests use the built-in `node:test` runner, so nothing needs to be installed.
