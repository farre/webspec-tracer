/** Test helpers: parse HTML into a ParsedSpec and load it into a MemorySpecStore. */
import type { ParsedSpec } from "../src/model/types.js";
import { parseSpec } from "../src/parse/parse-spec.js";
import { Registry } from "../src/registry/registry.js";
import { MemorySpecStore } from "../src/store/memory-store.js";

const BASE = "https://test.example.com";

export function parseHtml(
  html: string,
  spec = "TEST",
  base = BASE,
  registry = new Registry([]),
): ParsedSpec {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return parseSpec(doc, spec, base, registry);
}

export async function storeFrom(
  html: string,
  spec = "TEST",
  base = BASE,
): Promise<MemorySpecStore> {
  const store = new MemorySpecStore();
  await store.putSpec({
    specName: spec,
    baseUrl: base,
    contentSha: "test",
    indexVersion: "test",
    fetchedAt: Date.now(),
    parsed: parseHtml(html, spec, base),
  });
  return store;
}
