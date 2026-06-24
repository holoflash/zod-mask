import type * as z from "zod/v4";
import { applyRedact, applyRedactAsync, djb2, type RedactOptions } from "./apply.js";
import { setRedact, type RedactValue } from "./registry.js";

export function redact<S extends z.ZodType>(schema: S, value: RedactValue<z.output<S>>): S {
  setRedact(schema, value);
  return schema;
}

export function parseAndRedact<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: RedactOptions
): z.output<T> {
  const parsed = schema.parse(data);
  return applyRedact(schema, parsed, options, undefined, undefined, data);
}

export function safeParseAndRedact<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: RedactOptions
): z.ZodSafeParseResult<z.output<T>> {
  const result = schema.safeParse(data);
  if (!result.success) return result;
  return { success: true, data: applyRedact(schema, result.data, options, undefined, undefined, data) };
}

export async function parseAndRedactAsync<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: RedactOptions
): Promise<z.output<T>> {
  const parsed = await schema.parseAsync(data);
  return applyRedactAsync(schema, parsed, options, undefined, undefined, data);
}

export async function safeParseAndRedactAsync<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: RedactOptions
): Promise<z.ZodSafeParseResult<z.output<T>>> {
  const result = await schema.safeParseAsync(data);
  if (!result.success) return result;
  return { success: true, data: await applyRedactAsync(schema, result.data, options, undefined, undefined, data) };
}

/**
 * Create a derived redaction function that picks values from multiple arrays
 * (using the same DJB2 hash as the walker) and combines them via a template.
 *
 * The `fields` keys MUST match the schema field names they correlate with,
 * so the hash picks stay in sync with the individual field replacements.
 *
 * ```ts
 * const email = combine(
 *   { firstName: firstNames, lastName: lastNames },
 *   (first, last) => `${first}.${last}@example.com`,
 * );
 * ```
 */
export function combine(
  fields: Record<string, string[]>,
  template: (...values: string[]) => string,
): (seed: string) => string {
  const entries = Object.entries(fields);
  return (seed: string) => {
    const picked = entries.map(
      ([key, arr]) => arr[djb2(seed + key) % arr.length],
    );
    return template(...picked);
  };
}

export { applyRedact, applyRedactAsync, type RedactOptions } from "./apply.js";
export { type RedactValue } from "./registry.js";
