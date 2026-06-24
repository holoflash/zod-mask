import type * as z from "zod/v4";

// ---------------------------------------------------------------------------
// Redact registry — a WeakMap to store per-field redaction metadata.
// This follows the maintainer-recommended pattern: metadata lives in a
// registry, not on _zod.bag or as a no-op check.
// ---------------------------------------------------------------------------

export type RedactValue<T = unknown> = T | T[] | ((seed: string) => T);

interface RedactMeta {
  redact: RedactValue;
}

const redactRegistry = new WeakMap<z.ZodType, RedactMeta>();

/** Retrieve the redact metadata for a schema node, if any. */
export function getRedact(schema: z.ZodType): RedactValue | undefined {
  return redactRegistry.get(schema)?.redact;
}

/** Store redact metadata for a schema node. */
export function setRedact(schema: z.ZodType, value: RedactValue): void {
  redactRegistry.set(schema, { redact: value });
}
