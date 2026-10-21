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

## Report formats

`-f, --format` selects how results are rendered. Paths are always relative to
the working directory and use forward slashes, so output is stable across
machines and safe to paste into an issue.

| Format | Use it for |
| --- | --- |
| `text` (default) | Reading in a terminal or a CI log |
| `json` | Scripts, dashboards, `jq` pipelines |
| `markdown` | PR comments and issue reports |

```bash
node src/cli.js -f json . > markers.json
node src/cli.js -f markdown . >> report.md
```

The JSON payload has a stable shape:

```json
{
  "version": 1,
  "total": 2,
  "byMarker": { "TODO": 1, "FIXME": 1, "HACK": 0, "XXX": 0 },
  "hits": [
    { "file": "src/a.js", "line": 3, "column": 5, "marker": "TODO", "text": "wire it up" }
  ]
}
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
import { formatReport } from './src/format.js';

const hits = await scanPaths('src', { markers: ['TODO', 'FIXME'] });
console.log(formatReport(hits, { format: 'markdown', markers: ['TODO', 'FIXME'] }));
```

`scanText(text, file, options)` is the pure core: it takes a string and returns
hits without touching the filesystem, which keeps it cheap to unit test.

## Development

```bash
npm test
```

Tests use the built-in `node:test` runner, so nothing needs to be installed.
