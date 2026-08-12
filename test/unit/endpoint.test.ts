/** Endpoint parsing: SPEC#anchor, full URL, and default-spec fragments. */
import { describe, expect, it } from "vitest";
import { resolveEndpoint } from "../../src/registry/endpoint.js";
import { Registry } from "../../src/registry/registry.js";

const registry = new Registry([]);

describe("resolveEndpoint", () => {
  it("parses SPEC#anchor", () => {
    expect(resolveEndpoint("HTML#dom-location-assign", registry)).toEqual({
      spec: "HTML",
      anchor: "dom-location-assign",
    });
  });

  it("resolves a full WHATWG URL", () => {
    expect(resolveEndpoint("https://dom.spec.whatwg.org/#concept-node", registry)).toEqual({
      spec: "DOM",
      anchor: "concept-node",
    });
  });

  it("uses the default spec for a bare #anchor", () => {
    expect(resolveEndpoint("#navigate", registry, "HTML")).toEqual({
      spec: "HTML",
      anchor: "navigate",
    });
    expect(resolveEndpoint("navigate", registry, "HTML")).toEqual({
      spec: "HTML",
      anchor: "navigate",
    });
  });

  it("rejects a bare anchor with no default spec", () => {
    expect(resolveEndpoint("navigate", registry)).toBeNull();
    expect(resolveEndpoint("", registry)).toBeNull();
  });
});
