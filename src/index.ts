import type * as z from "zod/v4";
import { applyMask, applyMaskAsync, type MaskOptions } from "./apply.js";
import { setMask, type MaskValue } from "./registry.js";

export function mask<S extends z.ZodType>(schema: S, value: MaskValue<z.output<S>>): S {
  setMask(schema, value);
  return schema;
}

export function parseAndMask<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: MaskOptions
): z.output<T> {
  const parsed = schema.parse(data);
  return applyMask(schema, parsed, options, undefined, undefined, data);
}

export function safeParseAndMask<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: MaskOptions
): z.ZodSafeParseResult<z.output<T>> {
  const result = schema.safeParse(data);
  if (!result.success) return result;
  return { success: true, data: applyMask(schema, result.data, options, undefined, undefined, data) };
}

export async function parseAndMaskAsync<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: MaskOptions
): Promise<z.output<T>> {
  const parsed = await schema.parseAsync(data);
  return applyMaskAsync(schema, parsed, options, undefined, undefined, data);
}

export async function safeParseAndMaskAsync<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options?: MaskOptions
): Promise<z.ZodSafeParseResult<z.output<T>>> {
  const result = await schema.safeParseAsync(data);
  if (!result.success) return result;
  return { success: true, data: await applyMaskAsync(schema, result.data, options, undefined, undefined, data) };
}

export { applyMask, applyMaskAsync, type MaskOptions } from "./apply.js";
export { type MaskValue } from "./registry.js";
