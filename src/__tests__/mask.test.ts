import { expect, test } from "vitest";
import * as z from "zod/v4";
import { mask, parseAndMask, safeParseAndMask, parseAndMaskAsync, safeParseAndMaskAsync, applyMask } from "../index.js";

test("parse ignores mask", () => {
  const schema = z.object({ a: mask(z.string(), "***"), b: mask(z.number(), 0) });
  expect(schema.parse({ a: "real", b: 42 })).toEqual({ a: "real", b: 42 });
});

test("safeParse ignores mask", () => {
  const schema = z.object({ a: mask(z.string(), "***") });
  const r = schema.safeParse({ a: "real" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.a).toBe("real");
});

test("static string mask", () => {
  const schema = z.object({ a: mask(z.string(), "***") });
  expect(parseAndMask(schema, { a: "asdf" })).toEqual({ a: "***" });
});

test("array mask picks deterministically", () => {
  const opts = ["x", "y", "z"];
  const schema = z.object({
    id: z.string(),
    name: mask(z.string(), opts),
  });
  const a = parseAndMask(schema, { id: "1", name: "asdf" });
  const b = parseAndMask(schema, { id: "1", name: "qwer" });
  expect(a.name).toBe(b.name);
  expect(opts).toContain(a.name);
});

test("function mask receives seed", () => {
  const schema = z.object({
    id: z.string(),
    v: mask(z.string(), (seed) => `m-${seed}`),
  });
  expect(parseAndMask(schema, { id: "abc", v: "secret" }).v).toBe("m-abc");
});

test("seed from id field", () => {
  const schema = z.object({
    id: z.string(),
    s: mask(z.string(), (seed) => `s-${seed}`),
  });
  const r = parseAndMask(schema, { id: "id1", s: "hidden" });
  expect(r.s).toBe("s-id1");
  expect(r.id).toBe("id1");
});

test("seed from numeric id field", () => {
  const schema = z.object({
    id: z.number(),
    s: mask(z.string(), (seed) => `s-${seed}`),
  });
  expect(parseAndMask(schema, { id: 42, s: "hidden" }).s).toBe("s-42");
});

test("composite seed when no id", () => {
  const schema = z.object({
    a: mask(z.string(), ["X", "Y"]),
    b: mask(z.string(), ["P", "Q"]),
  });
  const r = parseAndMask(schema, { a: "foo", b: "bar" });
  expect(["X", "Y"]).toContain(r.a);
  expect(["P", "Q"]).toContain(r.b);
});

test("nested objects", () => {
  const schema = z.object({
    inner: z.object({
      id: z.string(),
      s: mask(z.string(), "R"),
    }),
  });
  const r = parseAndMask(schema, { inner: { id: "1", s: "asdf" } });
  expect(r.inner.s).toBe("R");
  expect(r.inner.id).toBe("1");
});

test("array of objects", () => {
  const schema = z.object({
    items: z.array(z.object({ id: z.string(), s: mask(z.string(), "H") })),
  });
  const r = parseAndMask(schema, {
    items: [
      { id: "1", s: "a" },
      { id: "2", s: "b" },
    ],
  });
  expect(r.items[0].s).toBe("H");
  expect(r.items[1].s).toBe("H");
  expect(r.items[0].id).toBe("1");
});

test("array of primitives", () => {
  const schema = z.object({ tags: z.array(mask(z.string(), "*")) });
  expect(parseAndMask(schema, { tags: ["a", "b"] })).toEqual({ tags: ["*", "*"] });
});

test("optional with value", () => {
  const schema = z.object({ a: mask(z.string(), "M").optional() });
  expect(parseAndMask(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("optional undefined passthrough", () => {
  const schema = z.object({ a: mask(z.string(), "M").optional() });
  expect(parseAndMask(schema, {})).toEqual({});
});

test("nullable with value", () => {
  const schema = z.object({ a: mask(z.string(), "M").nullable() });
  expect(parseAndMask(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("nullable null passthrough", () => {
  const schema = z.object({ a: mask(z.string(), "M").nullable() });
  expect(parseAndMask(schema, { a: null })).toEqual({ a: null });
});

test("default wrapper", () => {
  const schema = z.object({ a: mask(z.string(), "M").default("d") });
  expect(parseAndMask(schema, { a: "asdf" })).toEqual({ a: "M" });
  expect(parseAndMask(schema, {})).toEqual({ a: "M" });
});

test("readonly wrapper", () => {
  const schema = z.object({ a: mask(z.string(), "M").readonly() });
  expect(parseAndMask(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("union", () => {
  const schema = z.object({
    v: z.union([
      z.object({ t: z.literal("a"), s: mask(z.string(), "X") }),
      z.object({ t: z.literal("b"), s: mask(z.string(), "Y") }),
    ]),
  });
  expect(parseAndMask(schema, { v: { t: "a", s: "foo" } }).v.s).toBe("X");
  expect(parseAndMask(schema, { v: { t: "b", s: "bar" } }).v.s).toBe("Y");
});

test("discriminated union", () => {
  const schema = z.object({
    v: z.discriminatedUnion("t", [
      z.object({ t: z.literal("a"), s: mask(z.string(), "X") }),
      z.object({ t: z.literal("b"), s: mask(z.string(), "Y") }),
    ]),
  });
  expect(parseAndMask(schema, { v: { t: "a", s: "foo" } }).v.s).toBe("X");
});

test("pipe", () => {
  const schema = z.object({ a: mask(z.string(), "M").pipe(z.string().min(1)) });
  expect(parseAndMask(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("record masks values", () => {
  const schema = z.object({ r: z.record(z.string(), mask(z.string(), "X")) });
  expect(parseAndMask(schema, { r: { a: "1", b: "2" } })).toEqual({ r: { a: "X", b: "X" } });
});

test("tuple masks items", () => {
  const schema = z.object({ t: z.tuple([mask(z.string(), "A"), mask(z.number(), 0)]) });
  expect(parseAndMask(schema, { t: ["hello", 42] })).toEqual({ t: ["A", 0] });
});

test("map masks values", () => {
  const schema = z.object({ m: z.map(z.string(), mask(z.string(), "X")) });
  const r = parseAndMask(schema, { m: new Map([["a", "1"]]) });
  expect(r.m.get("a")).toBe("X");
});

test("set masks values", () => {
  const schema = z.object({ s: z.set(mask(z.string(), "X")) });
  const r = parseAndMask(schema, { s: new Set(["a", "b"]) });
  expect(r.s).toEqual(new Set(["X"]));
});

test("unmasked fields pass through", () => {
  const schema = z.object({ a: z.string(), b: mask(z.string(), "R") });
  const r = parseAndMask(schema, { a: "hello", b: "hidden" });
  expect(r.a).toBe("hello");
  expect(r.b).toBe("R");
});

test("parseAndMask throws on invalid", () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  expect(() => parseAndMask(schema, { a: 123 })).toThrow();
});

test("safeParseAndMask success", () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  const r = safeParseAndMask(schema, { a: "asdf" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.a).toBe("M");
});

test("safeParseAndMask error", () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  const r = safeParseAndMask(schema, { a: 123 });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues.length).toBeGreaterThan(0);
});

test("parseAndMaskAsync success", async () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  expect(await parseAndMaskAsync(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("parseAndMaskAsync throws on invalid", async () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  await expect(parseAndMaskAsync(schema, { a: 123 })).rejects.toThrow();
});

test("safeParseAndMaskAsync success", async () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  const r = await safeParseAndMaskAsync(schema, { a: "asdf" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.a).toBe("M");
});

test("safeParseAndMaskAsync error", async () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  const r = await safeParseAndMaskAsync(schema, { a: 123 });
  expect(r.success).toBe(false);
});

test("no masks acts as normal parse", () => {
  const schema = z.object({ a: z.string(), b: z.number() });
  expect(parseAndMask(schema, { a: "asdf", b: 5 })).toEqual({ a: "asdf", b: 5 });
});

test("deeply nested", () => {
  const schema = z.object({
    l1: z.object({ l2: z.object({ l3: z.object({ s: mask(z.string(), "D") }) }) }),
  });
  expect(parseAndMask(schema, { l1: { l2: { l3: { s: "asdf" } } } }).l1.l2.l3.s).toBe("D");
});

test("number single value mask", () => {
  const schema = z.object({ n: mask(z.number(), 0) });
  expect(parseAndMask(schema, { n: 1234 })).toEqual({ n: 0 });
});

test("number array mask picks deterministically", () => {
  const opts = [10, 20, 30];
  const schema = z.object({ id: z.string(), n: mask(z.number(), opts) });
  const a = parseAndMask(schema, { id: "1", n: 999 });
  const b = parseAndMask(schema, { id: "1", n: 777 });
  expect(a.n).toBe(b.n);
  expect(opts).toContain(a.n);
});

test("number function mask", () => {
  const schema = z.object({ id: z.string(), n: mask(z.number(), () => 42) });
  expect(parseAndMask(schema, { id: "1", n: 999 }).n).toBe(42);
});

test("boolean single value mask", () => {
  const schema = z.object({ b: mask(z.boolean(), false) });
  expect(parseAndMask(schema, { b: true })).toEqual({ b: false });
});

test("boolean array mask picks deterministically", () => {
  const schema = z.object({ id: z.string(), b: mask(z.boolean(), [true, false]) });
  const a = parseAndMask(schema, { id: "1", b: true });
  const b = parseAndMask(schema, { id: "1", b: false });
  expect(a.b).toBe(b.b);
  expect([true, false]).toContain(a.b);
});

test("boolean function mask", () => {
  const schema = z.object({ b: mask(z.boolean(), () => false) });
  expect(parseAndMask(schema, { b: true }).b).toBe(false);
});

// Pinned picks — lock the DJB2 hash + seed + key salting algorithm.
test("pinned string array mask picks", () => {
  const opts = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
  const schema = z.object({ id: z.string(), name: mask(z.string(), opts) });
  expect(parseAndMask(schema, { id: "usr_1", name: "ignored" }).name).toBe("Charlie");
  expect(parseAndMask(schema, { id: "usr_2", name: "ignored" }).name).toBe("Charlie");
  expect(parseAndMask(schema, { id: "usr_3", name: "ignored" }).name).toBe("Bob");
  expect(parseAndMask(schema, { id: "42", name: "ignored" }).name).toBe("Alice");
  expect(parseAndMask(schema, { id: "abc", name: "ignored" }).name).toBe("Charlie");
});

test("pinned number array mask picks", () => {
  const opts = [10, 20, 30];
  const schema = z.object({ id: z.string(), n: mask(z.number(), opts) });
  expect(parseAndMask(schema, { id: "usr_1", n: 999 }).n).toBe(10);
  expect(parseAndMask(schema, { id: "usr_2", n: 999 }).n).toBe(10);
  expect(parseAndMask(schema, { id: "42", n: 999 }).n).toBe(20);
});

test("custom hash function", () => {
  const schema = z.object({
    id: z.string(),
    name: mask(z.string(), ["A", "B", "C"]),
  });
  const always0 = () => 0;
  const r = parseAndMask(schema, { id: "x", name: "y" }, { hash: always0 });
  expect(r.name).toBe("A");
});

test("custom seed", () => {
  const schema = z.object({
    n: mask(z.number(), (seed) => Number(seed) + 1),
  });
  const r = parseAndMask(schema, { n: 42 }, { seed: "100" });
  expect(r.n).toBe(101);
});

test("applyMask standalone on already-parsed data", () => {
  const schema = z.object({ a: mask(z.string(), "M") });
  const parsed = schema.parse({ a: "real" });
  const masked = applyMask(schema, parsed);
  expect(masked.a).toBe("M");
});
