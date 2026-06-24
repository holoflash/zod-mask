import type * as z from "zod/v4";
import { getRedact } from "./registry.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RedactOptions {
  /** Initial seed string for deterministic redaction. Defaults to "". */
  seed?: string;
  /** Custom hash function. Must return a non-negative integer. Defaults to DJB2. */
  hash?: (str: string) => number;
}

// ---------------------------------------------------------------------------
// DJB2 hash — frozen; exact picks from array replacements are pinned in tests.
// ---------------------------------------------------------------------------

export function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Seed resolution
// ---------------------------------------------------------------------------

function resolveSeed(
  shape: Record<string, z.ZodType>,
  data: Record<string, unknown>,
  parentSeed: string
): string {
  const id = data.id;
  if (id != null && (typeof id === "string" || typeof id === "number" || typeof id === "bigint"))
    return String(id);
  let composite = "";
  for (const key in shape) {
    if (getRedact(shape[key]!) && typeof data[key] === "string") composite += data[key];
  }
  return composite || parentSeed;
}

// ---------------------------------------------------------------------------
// Tree introspection helpers
// ---------------------------------------------------------------------------

function hasRedactInTree(schema: z.ZodType, seen: WeakSet<z.ZodType> = new WeakSet()): boolean {
  if (seen.has(schema)) return false;
  seen.add(schema);
  if (getRedact(schema) !== undefined) return true;
  const def: any = (schema as any)._zod.def;
  switch (def.type) {
    case "object":
      for (const k in def.shape) {
        if (hasRedactInTree(def.shape[k]!, seen)) return true;
      }
      return false;
    case "array":
      return hasRedactInTree(def.element, seen);
    case "record":
      return hasRedactInTree(def.valueType, seen);
    case "tuple":
      if (def.items.some((item: z.ZodType) => hasRedactInTree(item, seen))) return true;
      return def.rest ? hasRedactInTree(def.rest, seen) : false;
    case "map":
      return hasRedactInTree(def.valueType, seen);
    case "set":
      return hasRedactInTree(def.valueType, seen);
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
    case "catch":
    case "nonoptional":
    case "prefault":
      return hasRedactInTree(def.innerType, seen);
    case "pipe":
      return hasRedactInTree(def.in, seen) || hasRedactInTree(def.out, seen);
    case "union":
      return def.options.some((o: z.ZodType) => hasRedactInTree(o, seen));
    case "lazy":
      return hasRedactInTree(def.getter(), seen);
    default:
      return false;
  }
}

function inputSchema(schema: z.ZodType): z.ZodType {
  const def: any = (schema as any)._zod.def;
  switch (def.type) {
    case "pipe":
      return inputSchema(def.in);
    case "transform":
      return schema;
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
    case "catch":
    case "nonoptional":
    case "prefault":
      return inputSchema(def.innerType);
    case "lazy":
      return inputSchema(def.getter());
    default:
      return schema;
  }
}

// ---------------------------------------------------------------------------
// applyRedact — post-parse tree walker
// ---------------------------------------------------------------------------

export function applyRedact<T>(
  schema: z.ZodType,
  data: T,
  options: RedactOptions = {},
  _seed?: string,
  _key?: string,
  _input?: unknown
): T {
  const seed = _seed ?? options.seed ?? "";
  const key = _key ?? "";
  const hashFn = options.hash ?? djb2;

  return walk(schema, data, seed, key, _input, hashFn);
}

function walk<T>(
  schema: z.ZodType,
  data: T,
  seed: string,
  key: string,
  input: unknown | undefined,
  hashFn: (str: string) => number
): T {
  if (data == null) return data;

  const replacement = getRedact(schema);
  if (replacement !== undefined) {
    const s = seed || String(data);
    if (typeof replacement === "function") return (replacement as (seed: string) => T)(s);
    if (Array.isArray(replacement)) return replacement[hashFn(s + key) % replacement.length] as T;
    return replacement as T;
  }

  const def: any = (schema as any)._zod.def;
  const inp = input ?? data;
  switch (def.type) {
    case "object": {
      if (typeof data !== "object" || Array.isArray(data)) return data;
      const shape = def.shape as Record<string, z.ZodType>;
      const record = data as Record<string, unknown>;
      const inputRecord = (typeof inp === "object" && inp !== null && !Array.isArray(inp) ? inp : record) as Record<
        string,
        unknown
      >;
      const objectSeed = resolveSeed(shape, record, seed);
      const result = { ...record };
      for (const k in shape) {
        if (k in result && result[k] != null)
          result[k] = walk(shape[k]!, result[k], objectSeed, k, inputRecord[k], hashFn);
      }
      return result as T;
    }
    case "array": {
      if (!Array.isArray(data)) return data;
      const inputArr = Array.isArray(inp) ? inp : data;
      return data.map((item, i) => walk(def.element, item, seed, key, inputArr[i], hashFn)) as T;
    }
    case "record": {
      if (typeof data !== "object" || data === null || Array.isArray(data)) return data;
      const rec = data as Record<string, unknown>;
      const inpRec = (typeof inp === "object" && inp !== null && !Array.isArray(inp) ? inp : rec) as Record<
        string,
        unknown
      >;
      const result: Record<string, unknown> = {};
      for (const k in rec) {
        result[k] = rec[k] != null ? walk(def.valueType, rec[k], seed, k, inpRec[k], hashFn) : rec[k];
      }
      return result as T;
    }
    case "tuple": {
      if (!Array.isArray(data)) return data;
      const inputArr = Array.isArray(inp) ? inp : data;
      const items = def.items as z.ZodType[];
      return data.map((item, i) => {
        const s = i < items.length ? items[i]! : def.rest;
        return s && item != null ? walk(s, item, seed, key, inputArr[i], hashFn) : item;
      }) as T;
    }
    case "map": {
      if (!(data instanceof Map)) return data;
      const inpMap = inp instanceof Map ? inp : data;
      const result = new Map();
      for (const [k, v] of data) {
        result.set(k, v != null ? walk(def.valueType, v, seed, String(k), inpMap.get(k), hashFn) : v);
      }
      return result as T;
    }
    case "set": {
      if (!(data instanceof Set)) return data;
      const inpIter = inp instanceof Set ? inp.values() : data.values();
      const result = new Set();
      for (const v of data) {
        const iv = inpIter.next().value;
        result.add(v != null ? walk(def.valueType, v, seed, key, iv, hashFn) : v);
      }
      return result as T;
    }
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
    case "catch":
    case "nonoptional":
    case "prefault":
      return walk(def.innerType, data, seed, key, inp, hashFn);
    case "pipe":
      if (hasRedactInTree(def.out)) return walk(def.out, data, seed, key, data, hashFn);
      return walk(def.in, data, seed, key, inp, hashFn);
    case "union": {
      for (const option of def.options as z.ZodType[]) {
        const base = inputSchema(option);
        const result = (base as any)._zod.run({ value: inp, issues: [] }, { async: false });
        if (!(result instanceof Promise) && result.issues.length === 0) return walk(option, data, seed, key, inp, hashFn);
      }
      return data;
    }
    case "lazy":
      return walk(def.getter(), data, seed, key, inp, hashFn);
    default:
      return data;
  }
}

// ---------------------------------------------------------------------------
// applyRedactAsync
// ---------------------------------------------------------------------------

export async function applyRedactAsync<T>(
  schema: z.ZodType,
  data: T,
  options: RedactOptions = {},
  _seed?: string,
  _key?: string,
  _input?: unknown
): Promise<T> {
  const seed = _seed ?? options.seed ?? "";
  const key = _key ?? "";
  const hashFn = options.hash ?? djb2;

  return walkAsync(schema, data, seed, key, _input, hashFn);
}

async function walkAsync<T>(
  schema: z.ZodType,
  data: T,
  seed: string,
  key: string,
  input: unknown | undefined,
  hashFn: (str: string) => number
): Promise<T> {
  if (data == null) return data;

  const replacement = getRedact(schema);
  if (replacement !== undefined) {
    const s = seed || String(data);
    if (typeof replacement === "function") return (replacement as (seed: string) => T)(s);
    if (Array.isArray(replacement)) return replacement[hashFn(s + key) % replacement.length] as T;
    return replacement as T;
  }

  const def: any = (schema as any)._zod.def;
  const inp = input ?? data;
  switch (def.type) {
    case "object": {
      if (typeof data !== "object" || Array.isArray(data)) return data;
      const shape = def.shape as Record<string, z.ZodType>;
      const record = data as Record<string, unknown>;
      const inputRecord = (typeof inp === "object" && inp !== null && !Array.isArray(inp) ? inp : record) as Record<
        string,
        unknown
      >;
      const objectSeed = resolveSeed(shape, record, seed);
      const result = { ...record };
      for (const k in shape) {
        if (k in result && result[k] != null)
          result[k] = await walkAsync(shape[k]!, result[k], objectSeed, k, inputRecord[k], hashFn);
      }
      return result as T;
    }
    case "array": {
      if (!Array.isArray(data)) return data;
      const inputArr = Array.isArray(inp) ? inp : data;
      return Promise.all(
        data.map((item, i) => walkAsync(def.element, item, seed, key, inputArr[i], hashFn))
      ) as Promise<T>;
    }
    case "record": {
      if (typeof data !== "object" || data === null || Array.isArray(data)) return data;
      const rec = data as Record<string, unknown>;
      const inpRec = (typeof inp === "object" && inp !== null && !Array.isArray(inp) ? inp : rec) as Record<
        string,
        unknown
      >;
      const result: Record<string, unknown> = {};
      for (const k in rec) {
        result[k] = rec[k] != null ? await walkAsync(def.valueType, rec[k], seed, k, inpRec[k], hashFn) : rec[k];
      }
      return result as T;
    }
    case "tuple": {
      if (!Array.isArray(data)) return data;
      const inputArr = Array.isArray(inp) ? inp : data;
      const items = def.items as z.ZodType[];
      return Promise.all(
        data.map((item, i) => {
          const s = i < items.length ? items[i]! : def.rest;
          return s && item != null ? walkAsync(s, item, seed, key, inputArr[i], hashFn) : item;
        })
      ) as Promise<T>;
    }
    case "map": {
      if (!(data instanceof Map)) return data;
      const inpMap = inp instanceof Map ? inp : data;
      const result = new Map();
      for (const [k, v] of data) {
        result.set(k, v != null ? await walkAsync(def.valueType, v, seed, String(k), inpMap.get(k), hashFn) : v);
      }
      return result as T;
    }
    case "set": {
      if (!(data instanceof Set)) return data;
      const inpIter = inp instanceof Set ? inp.values() : data.values();
      const result = new Set();
      for (const v of data) {
        const iv = inpIter.next().value;
        result.add(v != null ? await walkAsync(def.valueType, v, seed, key, iv, hashFn) : v);
      }
      return result as T;
    }
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
    case "catch":
    case "nonoptional":
    case "prefault":
      return walkAsync(def.innerType, data, seed, key, inp, hashFn);
    case "pipe":
      if (hasRedactInTree(def.out)) return walkAsync(def.out, data, seed, key, data, hashFn);
      return walkAsync(def.in, data, seed, key, inp, hashFn);
    case "union": {
      for (const option of def.options as z.ZodType[]) {
        const base = inputSchema(option);
        let result = (base as any)._zod.run({ value: inp, issues: [] }, { async: true });
        if (result instanceof Promise) result = await result;
        if (result.issues.length === 0) return walkAsync(option, data, seed, key, inp, hashFn);
      }
      return data;
    }
    case "lazy":
      return walkAsync(def.getter(), data, seed, key, inp, hashFn);
    default:
      return data;
  }
}
