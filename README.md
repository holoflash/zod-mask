# zod-mask

Post-validation data masking for [Zod](https://zod.dev) schemas. Annotate fields with replacement values, then parse-and-mask in one step.

```
npm install zod-mask zod
```

`zod` is a peer dependency (`^3.24 || >=4`).

## Usage

```ts
import * as z from "zod/v4";
import { mask, parseAndMask } from "zod-mask";

const User = z.object({
  id: z.string(),
  name: mask(z.string(), "***"),
  email: mask(z.string(), ["a@example.com", "b@example.com"]),
  ssn: mask(z.string(), (seed) => `XXX-XX-${seed.slice(-4)}`),
  age: mask(z.number(), 0),
  isAdmin: mask(z.boolean(), false),
});

parseAndMask(User, rawData);
// { id: "usr_1", name: "***", email: "a@example.com", ssn: "XXX-XX-sr_1", age: 0, isAdmin: false }
```

`mask()` annotates a schema field — it doesn't change parsing behavior. Regular `schema.parse()` still returns real data. Masking only happens when you use the library's parse functions.

## API

### `mask(schema, replacement)`

Annotate a field. Returns the schema unchanged (for inline chaining).

| Form | What happens |
|------|-------------|
| `mask(z.string(), "***")` | Static replacement |
| `mask(z.string(), ["A", "B", "C"])` | Deterministic pick via DJB2 hash |
| `mask(z.string(), (seed) => ...)` | Dynamic — receives a seed string |

Works with `z.string()`, `z.number()`, `z.boolean()`, and anything else.

### Parse + mask

| Function | Description |
|----------|-------------|
| `parseAndMask(schema, data, opts?)` | Parse, then mask. Throws on invalid input. |
| `safeParseAndMask(schema, data, opts?)` | Safe variant — returns `{ success, data/error }`. |
| `parseAndMaskAsync(schema, data, opts?)` | Async — for schemas with async refinements. |
| `safeParseAndMaskAsync(schema, data, opts?)` | Async safe variant. |
| `applyMask(schema, data, opts?)` | Mask already-parsed data (skips parsing). |

### Options

```ts
{
  seed?: string;                    // Base seed for deterministic masking (default: "")
  hash?: (str: string) => number;   // Custom hash fn (default: DJB2)
}
```

## How seeds work

Array and function masks need a seed to produce deterministic output. The seed is resolved per object:

1. If the object has an `id` field → `String(id)` is used
2. Otherwise → masked string field values are concatenated as a composite seed
3. Fallback → `options.seed` (or `""`)

Same `id` = same masked output across runs.

## Supported types

Objects, arrays, records, tuples, maps, sets, unions, discriminated unions, pipes, optionals, nullables, defaults, readonly, catch, lazy, and nested combinations of all of the above.

## License

MIT
