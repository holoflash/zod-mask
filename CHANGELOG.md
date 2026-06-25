# Changelog

## 1.0.2

- Ship CJS source map (`dist/index.cjs.map`) alongside ESM source map.
- Add CHANGELOG.
- Add package manager specification to `package.json`.

## 1.0.1

- Updated README.

## 1.0.0

- Initial release.
- `redact()` — annotate schema fields with static, array, or function replacements.
- `parseAndRedact()` / `safeParseAndRedact()` — parse-then-redact in one step.
- `parseAndRedactAsync()` / `safeParseAndRedactAsync()` — async variants.
- `applyRedact()` — redact already-parsed data.
- `combine()` — derived multi-field redaction from component arrays.
- DJB2-based deterministic seeding with automatic `id` field resolution.
- Supports objects, arrays, records, tuples, maps, sets, unions, pipes, optionals, nullables, defaults, readonly, catch, lazy, and nested combinations.
