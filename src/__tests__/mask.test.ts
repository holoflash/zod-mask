import { expect, test } from "vitest";
import * as z from "zod/v4";
import { redact, parseAndRedact, safeParseAndRedact, parseAndRedactAsync, safeParseAndRedactAsync, applyRedact, combine } from "../index.js";

test("parse ignores redact", () => {
  const schema = z.object({ a: redact(z.string(), "***"), b: redact(z.number(), 0) });
  expect(schema.parse({ a: "real", b: 42 })).toEqual({ a: "real", b: 42 });
});

test("safeParse ignores redact", () => {
  const schema = z.object({ a: redact(z.string(), "***") });
  const r = schema.safeParse({ a: "real" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.a).toBe("real");
});

test("static string redact", () => {
  const schema = z.object({ a: redact(z.string(), "***") });
  expect(parseAndRedact(schema, { a: "asdf" })).toEqual({ a: "***" });
});

test("array redact picks deterministically", () => {
  const opts = ["x", "y", "z"];
  const schema = z.object({
    id: z.string(),
    name: redact(z.string(), opts),
  });
  const a = parseAndRedact(schema, { id: "1", name: "asdf" });
  const b = parseAndRedact(schema, { id: "1", name: "qwer" });
  expect(a.name).toBe(b.name);
  expect(opts).toContain(a.name);
});

test("function redact receives seed", () => {
  const schema = z.object({
    id: z.string(),
    v: redact(z.string(), (seed) => `m-${seed}`),
  });
  expect(parseAndRedact(schema, { id: "abc", v: "secret" }).v).toBe("m-abc");
});

test("seed from id field", () => {
  const schema = z.object({
    id: z.string(),
    s: redact(z.string(), (seed) => `s-${seed}`),
  });
  const r = parseAndRedact(schema, { id: "id1", s: "hidden" });
  expect(r.s).toBe("s-id1");
  expect(r.id).toBe("id1");
});

test("seed from numeric id field", () => {
  const schema = z.object({
    id: z.number(),
    s: redact(z.string(), (seed) => `s-${seed}`),
  });
  expect(parseAndRedact(schema, { id: 42, s: "hidden" }).s).toBe("s-42");
});

test("composite seed when no id", () => {
  const schema = z.object({
    a: redact(z.string(), ["X", "Y"]),
    b: redact(z.string(), ["P", "Q"]),
  });
  const r = parseAndRedact(schema, { a: "foo", b: "bar" });
  expect(["X", "Y"]).toContain(r.a);
  expect(["P", "Q"]).toContain(r.b);
});

test("nested objects", () => {
  const schema = z.object({
    inner: z.object({
      id: z.string(),
      s: redact(z.string(), "R"),
    }),
  });
  const r = parseAndRedact(schema, { inner: { id: "1", s: "asdf" } });
  expect(r.inner.s).toBe("R");
  expect(r.inner.id).toBe("1");
});

test("array of objects", () => {
  const schema = z.object({
    items: z.array(z.object({ id: z.string(), s: redact(z.string(), "H") })),
  });
  const r = parseAndRedact(schema, {
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
  const schema = z.object({ tags: z.array(redact(z.string(), "*")) });
  expect(parseAndRedact(schema, { tags: ["a", "b"] })).toEqual({ tags: ["*", "*"] });
});

test("optional with value", () => {
  const schema = z.object({ a: redact(z.string(), "M").optional() });
  expect(parseAndRedact(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("optional undefined passthrough", () => {
  const schema = z.object({ a: redact(z.string(), "M").optional() });
  expect(parseAndRedact(schema, {})).toEqual({});
});

test("nullable with value", () => {
  const schema = z.object({ a: redact(z.string(), "M").nullable() });
  expect(parseAndRedact(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("nullable null passthrough", () => {
  const schema = z.object({ a: redact(z.string(), "M").nullable() });
  expect(parseAndRedact(schema, { a: null })).toEqual({ a: null });
});

test("default wrapper", () => {
  const schema = z.object({ a: redact(z.string(), "M").default("d") });
  expect(parseAndRedact(schema, { a: "asdf" })).toEqual({ a: "M" });
  expect(parseAndRedact(schema, {})).toEqual({ a: "M" });
});

test("readonly wrapper", () => {
  const schema = z.object({ a: redact(z.string(), "M").readonly() });
  expect(parseAndRedact(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("union", () => {
  const schema = z.object({
    v: z.union([
      z.object({ t: z.literal("a"), s: redact(z.string(), "X") }),
      z.object({ t: z.literal("b"), s: redact(z.string(), "Y") }),
    ]),
  });
  expect(parseAndRedact(schema, { v: { t: "a", s: "foo" } }).v.s).toBe("X");
  expect(parseAndRedact(schema, { v: { t: "b", s: "bar" } }).v.s).toBe("Y");
});

test("discriminated union", () => {
  const schema = z.object({
    v: z.discriminatedUnion("t", [
      z.object({ t: z.literal("a"), s: redact(z.string(), "X") }),
      z.object({ t: z.literal("b"), s: redact(z.string(), "Y") }),
    ]),
  });
  expect(parseAndRedact(schema, { v: { t: "a", s: "foo" } }).v.s).toBe("X");
});

test("pipe", () => {
  const schema = z.object({ a: redact(z.string(), "M").pipe(z.string().min(1)) });
  expect(parseAndRedact(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("record redacts values", () => {
  const schema = z.object({ r: z.record(z.string(), redact(z.string(), "X")) });
  expect(parseAndRedact(schema, { r: { a: "1", b: "2" } })).toEqual({ r: { a: "X", b: "X" } });
});

test("tuple redacts items", () => {
  const schema = z.object({ t: z.tuple([redact(z.string(), "A"), redact(z.number(), 0)]) });
  expect(parseAndRedact(schema, { t: ["hello", 42] })).toEqual({ t: ["A", 0] });
});

test("map redacts values", () => {
  const schema = z.object({ m: z.map(z.string(), redact(z.string(), "X")) });
  const r = parseAndRedact(schema, { m: new Map([["a", "1"]]) });
  expect(r.m.get("a")).toBe("X");
});

test("set redacts values", () => {
  const schema = z.object({ s: z.set(redact(z.string(), "X")) });
  const r = parseAndRedact(schema, { s: new Set(["a", "b"]) });
  expect(r.s).toEqual(new Set(["X"]));
});

test("unredacted fields pass through", () => {
  const schema = z.object({ a: z.string(), b: redact(z.string(), "R") });
  const r = parseAndRedact(schema, { a: "hello", b: "hidden" });
  expect(r.a).toBe("hello");
  expect(r.b).toBe("R");
});

test("parseAndRedact throws on invalid", () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  expect(() => parseAndRedact(schema, { a: 123 })).toThrow();
});

test("safeParseAndRedact success", () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  const r = safeParseAndRedact(schema, { a: "asdf" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.a).toBe("M");
});

test("safeParseAndRedact error", () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  const r = safeParseAndRedact(schema, { a: 123 });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues.length).toBeGreaterThan(0);
});

test("parseAndRedactAsync success", async () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  expect(await parseAndRedactAsync(schema, { a: "asdf" })).toEqual({ a: "M" });
});

test("parseAndRedactAsync throws on invalid", async () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  await expect(parseAndRedactAsync(schema, { a: 123 })).rejects.toThrow();
});

test("safeParseAndRedactAsync success", async () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  const r = await safeParseAndRedactAsync(schema, { a: "asdf" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.a).toBe("M");
});

test("safeParseAndRedactAsync error", async () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  const r = await safeParseAndRedactAsync(schema, { a: 123 });
  expect(r.success).toBe(false);
});

test("no redactions acts as normal parse", () => {
  const schema = z.object({ a: z.string(), b: z.number() });
  expect(parseAndRedact(schema, { a: "asdf", b: 5 })).toEqual({ a: "asdf", b: 5 });
});

test("deeply nested", () => {
  const schema = z.object({
    l1: z.object({ l2: z.object({ l3: z.object({ s: redact(z.string(), "D") }) }) }),
  });
  expect(parseAndRedact(schema, { l1: { l2: { l3: { s: "asdf" } } } }).l1.l2.l3.s).toBe("D");
});

test("number single value redact", () => {
  const schema = z.object({ n: redact(z.number(), 0) });
  expect(parseAndRedact(schema, { n: 1234 })).toEqual({ n: 0 });
});

test("number array redact picks deterministically", () => {
  const opts = [10, 20, 30];
  const schema = z.object({ id: z.string(), n: redact(z.number(), opts) });
  const a = parseAndRedact(schema, { id: "1", n: 999 });
  const b = parseAndRedact(schema, { id: "1", n: 777 });
  expect(a.n).toBe(b.n);
  expect(opts).toContain(a.n);
});

test("number function redact", () => {
  const schema = z.object({ id: z.string(), n: redact(z.number(), () => 42) });
  expect(parseAndRedact(schema, { id: "1", n: 999 }).n).toBe(42);
});

test("boolean single value redact", () => {
  const schema = z.object({ b: redact(z.boolean(), false) });
  expect(parseAndRedact(schema, { b: true })).toEqual({ b: false });
});

test("boolean array redact picks deterministically", () => {
  const schema = z.object({ id: z.string(), b: redact(z.boolean(), [true, false]) });
  const a = parseAndRedact(schema, { id: "1", b: true });
  const b = parseAndRedact(schema, { id: "1", b: false });
  expect(a.b).toBe(b.b);
  expect([true, false]).toContain(a.b);
});

test("boolean function redact", () => {
  const schema = z.object({ b: redact(z.boolean(), () => false) });
  expect(parseAndRedact(schema, { b: true }).b).toBe(false);
});

// Pinned picks — lock the DJB2 hash + seed + key salting algorithm.
test("pinned string array redact picks", () => {
  const opts = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
  const schema = z.object({ id: z.string(), name: redact(z.string(), opts) });
  expect(parseAndRedact(schema, { id: "usr_1", name: "ignored" }).name).toBe("Charlie");
  expect(parseAndRedact(schema, { id: "usr_2", name: "ignored" }).name).toBe("Charlie");
  expect(parseAndRedact(schema, { id: "usr_3", name: "ignored" }).name).toBe("Bob");
  expect(parseAndRedact(schema, { id: "42", name: "ignored" }).name).toBe("Alice");
  expect(parseAndRedact(schema, { id: "abc", name: "ignored" }).name).toBe("Charlie");
});

test("pinned number array redact picks", () => {
  const opts = [10, 20, 30];
  const schema = z.object({ id: z.string(), n: redact(z.number(), opts) });
  expect(parseAndRedact(schema, { id: "usr_1", n: 999 }).n).toBe(10);
  expect(parseAndRedact(schema, { id: "usr_2", n: 999 }).n).toBe(10);
  expect(parseAndRedact(schema, { id: "42", n: 999 }).n).toBe(20);
});

test("custom hash function", () => {
  const schema = z.object({
    id: z.string(),
    name: redact(z.string(), ["A", "B", "C"]),
  });
  const always0 = () => 0;
  const r = parseAndRedact(schema, { id: "x", name: "y" }, { hash: always0 });
  expect(r.name).toBe("A");
});

test("custom seed", () => {
  const schema = z.object({
    n: redact(z.number(), (seed) => Number(seed) + 1),
  });
  const r = parseAndRedact(schema, { n: 42 }, { seed: "100" });
  expect(r.n).toBe(101);
});

test("applyRedact standalone on already-parsed data", () => {
  const schema = z.object({ a: redact(z.string(), "M") });
  const parsed = schema.parse({ a: "real" });
  const redacted = applyRedact(schema, parsed);
  expect(redacted.a).toBe("M");
});

test("combine creates derived redaction function", () => {
  const firstNames = ["Alice", "Bob"];
  const lastNames = ["Smith", "Jones"];

  const fullName = combine(
    { firstName: firstNames, lastName: lastNames },
    (first, last) => `${first} ${last}`,
  );

  const schema = z.object({
    id: z.string(),
    name: redact(z.string(), fullName),
  });

  const r = parseAndRedact(schema, { id: "usr_1", name: "John Doe" });
  expect(r.name).toMatch(/^(Alice|Bob) (Smith|Jones)$/);

  const a = parseAndRedact(schema, { id: "usr_1", name: "A" });
  const b = parseAndRedact(schema, { id: "usr_1", name: "B" });
  expect(a.name).toBe(b.name);
});
