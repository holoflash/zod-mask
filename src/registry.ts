import type * as z from "zod/v4";

// ---------------------------------------------------------------------------
// Mask registry — a dedicated z.registry() to store per-field mask metadata.
// This follows the maintainer-recommended pattern: metadata lives in a
// registry, not on _zod.bag or as a no-op check.
// ---------------------------------------------------------------------------

export type MaskValue<T = unknown> = T | T[] | ((seed: string) => T);

interface MaskMeta {
  mask: MaskValue;
}

const maskRegistry = new WeakMap<z.ZodType, MaskMeta>();

/** Retrieve the mask metadata for a schema node, if any. */
export function getMask(schema: z.ZodType): MaskValue | undefined {
  return maskRegistry.get(schema)?.mask;
}

/** Store mask metadata for a schema node. */
export function setMask(schema: z.ZodType, value: MaskValue): void {
  maskRegistry.set(schema, { mask: value });
}
