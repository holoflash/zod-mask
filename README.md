# zod-redact

[![bundle size](https://deno.bundlejs.com/badge?q=zod-redact)](https://bundlejs.com/?q=zod-redact)

Post-validation data redaction for [Zod](https://zod.dev) schemas. Annotate fields with replacement values, then parse-and-redact in one step.

```
pnpm install zod-redact
```

Requires `zod` as a peer dependency.

## Usage

```ts
import * as z from "zod/v4";
import { redact, parseAndRedact } from "zod-redact";

const User = z.object({
  id: z.string(),
  name: redact(z.string(), "***"),
  email: redact(z.string(), ["a@example.com", "b@example.com"]),
  ssn: redact(z.string(), (seed) => `XXX-XX-${seed.slice(-4)}`),
  age: redact(z.number(), 0),
  isAdmin: redact(z.boolean(), false),
});

parseAndRedact(User, rawData);
// { id: "usr_1", name: "***", email: "a@example.com", ssn: "XXX-XX-sr_1", age: 0, isAdmin: false }
```

`redact()` annotates a schema field — it doesn't change parsing behavior. Regular `schema.parse()` still returns real data. Redaction only happens when you use the library's parse functions.

## API

### `redact(schema, replacement)`

Annotate a field. Returns the schema unchanged (for inline chaining).

| Form | What happens |
|------|-------------|
| `redact(z.string(), "***")` | Static replacement |
| `redact(z.string(), ["A", "B", "C"])` | Deterministic pick via DJB2 hash |
| `redact(z.string(), (seed) => ...)` | Dynamic — receives a seed string |

Works with `z.string()`, `z.number()`, `z.boolean()`, and anything else.

### Parse + redact

| Function | Description |
|----------|-------------|
| `parseAndRedact(schema, data, opts?)` | Parse, then redact. Throws on invalid input. |
| `safeParseAndRedact(schema, data, opts?)` | Safe variant — returns `{ success, data/error }`. |
| `parseAndRedactAsync(schema, data, opts?)` | Async — for schemas with async refinements. |
| `safeParseAndRedactAsync(schema, data, opts?)` | Async safe variant. |
| `applyRedact(schema, data, opts?)` | Redact already-parsed data (skips parsing). |

### `combine(fields, template)`

Create a derived redaction function that picks from multiple arrays and combines them. Useful for generating realistic fake data like full names or emails from component arrays.

```ts
import { combine, redact } from "zod-redact";

const fullName = combine(
  { firstName: firstNames, lastName: lastNames },
  (first, last) => `${first} ${last}`,
);

const email = combine(
  { firstName: firstNames, lastName: lastNames },
  (first, last) => `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
);

const schema = z.object({
  name: redact(z.string(), fullName),
  email: redact(z.string(), email),
});
```

### Options

```ts
{
  seed?: string;                    // Base seed for deterministic redaction (default: "")
  hash?: (str: string) => number;   // Custom hash fn (default: DJB2)
}
```

## How seeds work

Array and function replacements need a seed to produce deterministic output. The seed is resolved per object:

1. If the object has an `id` field → `String(id)` is used
2. Otherwise → redacted string field values are concatenated as a composite seed
3. Fallback → `options.seed` (or `""`)

Same `id` = same redacted output across runs.

## Supported types

Objects, arrays, records, tuples, maps, sets, unions, discriminated unions, pipes, optionals, nullables, defaults, readonly, catch, lazy, and nested combinations of all of the above.

## License

MIT
