# Contributing

Thanks for taking a look. This project is intentionally small, so the rules are
short.

## Getting started

```bash
git clone https://github.com/starrism123/todo-scan.git
cd todo-scan
npm test
```

There is nothing to install: the project has no dependencies and the tests use
the `node:test` runner that ships with Node.js 20+.

## Ground rules

1. **No dependencies.** A scanner that runs in CI should not download a
   dependency tree. If something can be written in 20 lines, write it.
2. **ESM only.** Every file uses `import`/`export`; there is no CommonJS build.
3. **Every behaviour gets a test.** New options, new output fields and new
   failure modes all need a case in `test/`.
4. **Exit codes are part of the API.** `0` success, `1` gate tripped, `2` usage
   error. Do not reuse them for anything else.

## Branching and commits

Branch off `main` and open a pull request when the change is ready:

```bash
git switch main
git pull
git switch -c feature/short-name
```

Commit messages follow `type: summary`, where type is one of `feat`, `fix`,
`docs`, `test`, `refactor` or `chore`:

```
feat: skip files with --exclude glob patterns
docs: explain exit codes in the README
fix: do not crash on a file that disappears mid-scan
```

Write the summary as an instruction ("skip files…"), not as a status report
("skipped some files"). The body should explain *why* the change is needed.

## Pull requests

- Keep one concern per pull request.
- The CI workflow must be green before merging; it runs the test suite on
  Node.js 20, 22 and 24.
- Merging uses a merge commit (`--merge`), not squash, so the branch shape stays
  visible in `Insights → Network`.

## Reporting a bug

Open an issue with the command you ran, the output you expected and the output
you got. If the scan is involved, a minimal directory tree that reproduces it is
worth more than a screenshot.
