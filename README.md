# todo-scan

Scan a codebase for `TODO` / `FIXME` / `HACK` markers and report them.

Zero dependencies, ESM, Node.js 20+.

## Usage

```bash
node src/cli.js .                   # scan the current directory
node src/cli.js src lib             # scan several paths
node src/cli.js -m TODO,PERF .      # custom marker set
node src/cli.js --ignore vendor .   # extra directories to skip
node src/cli.js --exclude '*.min.js',vendor/** .   # skip files by pattern
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

## Excluding files

`--exclude` takes comma-separated glob patterns. A pattern with no slash is
matched against the bare file name at any depth; a pattern with a slash is
matched against the path relative to the scanned directory.

| Pattern | Skips |
| --- | --- |
| `*.test.js` | every `*.test.js` file, anywhere |
| `src/*.js` | `.js` files directly inside `src/`, but not deeper |
| `**/fixtures/**` | everything under any `fixtures/` directory |
| `?eadme.md` | `readme.md` and `README.md`, one character wildcard |

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

## Configuration

Drop a `.todo-scan.json` (or `todo-scan.json`) in the directory you run the
tool from and it is picked up automatically. Pass `--config <file>` to point at
a specific file instead.

```json
{
  "markers": ["TODO", "FIXME", "PERF"],
  "ignore": ["vendor", "fixtures"],
  "format": "markdown",
  "failOn": ["FIXME"],
  "max": 0,
  "paths": ["src"]
}
```

Every key is optional, and CLI flags win over config values:

| Key | Type | Meaning |
| --- | --- | --- |
| `markers` | string[] | Markers to look for |
| `ignore` | string[] | Extra directory names to skip |
| `exclude` | string[] | Glob patterns of files to skip |
| `format` | `text` \| `json` \| `markdown` | Report format |
| `failOn` | string[] | Markers that must not appear at all |
| `max` | integer | Maximum total markers allowed |
| `paths` | string[] | Default paths when none are given |

Unknown keys are an error rather than being ignored, so a misspelled `failon`
cannot silently disable the gate.

## CI gate

`--fail-on` and `--max` turn the scan into a gate:

```bash
node src/cli.js --fail-on FIXME src        # fail if a single FIXME exists
node src/cli.js --max 0 .                  # fail on any marker at all
```

| Exit code | Meaning |
| --- | --- |
| 0 | Scan finished and the gate passed |
| 1 | The gate tripped (the report is still printed) |
| 2 | Usage error: bad flag, malformed config, unknown format |

A minimal GitHub Actions job:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '24' }
- run: node src/cli.js --fail-on FIXME src
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
