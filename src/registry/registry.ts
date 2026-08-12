/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/spec_registry.rs
 *
 * Maps spec names to base URLs and resolves full spec URLs to (spec, anchor).
 * M1 covers WHATWG living standards and the W3C specs listed in w3c_specs.json;
 * tc39/IETF/WebGPU/AUTOURL resolution is added in M2.
 */
import type { UrlResolver } from "../parse/references.js";

export interface SpecEntry {
  name: string;
  base_url: string;
  provider: string;
  github_repo?: string;
}

/** WHATWG living standards, mirroring `WHATWG_SPECS`. */
const WHATWG_SPECS = [
  "COMPAT", "COMPRESSION", "CONSOLE", "DOM", "ENCODING", "FETCH", "FS",
  "FULLSCREEN", "HTML", "INFRA", "MIMESNIFF", "NOTIFICATIONS", "QUIRKS",
  "STORAGE", "STREAMS", "TESTUTILS", "URL", "URLPATTERN", "WEBIDL",
  "WEBSOCKETS", "XHR",
];

const WHATWG_SUFFIX = ".spec.whatwg.org";

/** WHATWG hostname subdomain for a spec name (e.g. URLPATTERN -> urlpattern). */
function whatwgHost(name: string): string {
  return name.replace(/-/g, "").toLowerCase();
}

/** Known non-W3C specs seeded like `known_specs()`. */
function knownSpecs(): SpecEntry[] {
  const specs: SpecEntry[] = WHATWG_SPECS.map((name) => ({
    name,
    base_url: `https://${whatwgHost(name)}${WHATWG_SUFFIX}`,
    provider: "whatwg",
  }));
  specs.push({ name: "ECMA-262", base_url: "https://tc39.es/ecma262", provider: "tc39" });
  specs.push({ name: "WEBGPU", base_url: "https://gpuweb.github.io/gpuweb", provider: "gpuweb" });
  specs.push({ name: "WGSL", base_url: "https://gpuweb.github.io/gpuweb/wgsl", provider: "gpuweb" });
  return specs;
}

export class Registry implements UrlResolver {
  private readonly nameToBase = new Map<string, string>();
  private readonly whatwgHostToName = new Map<string, string>();
  /** W3C-style entries sorted by base_url length desc for longest-prefix matching. */
  private readonly byBaseUrl: SpecEntry[];

  constructor(w3cSpecs: SpecEntry[]) {
    const all = [...knownSpecs(), ...w3cSpecs];
    for (const s of all) {
      if (!this.nameToBase.has(s.name)) this.nameToBase.set(s.name, s.base_url);
      if (s.provider === "whatwg") {
        this.whatwgHostToName.set(whatwgHost(s.name), s.name);
      }
    }
    this.byBaseUrl = [...all].sort((a, b) => b.base_url.length - a.base_url.length);
  }

  /** Base URL for a spec name, or null if unknown. */
  baseUrlForSpec(name: string): string | null {
    return this.nameToBase.get(name) ?? null;
  }

  resolveUrl(url: string): { spec: string; anchor: string } | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const anchor = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : "";

    // WHATWG: <host>.spec.whatwg.org
    if (parsed.hostname.endsWith(WHATWG_SUFFIX)) {
      const sub = parsed.hostname.slice(0, -WHATWG_SUFFIX.length);
      const name = this.whatwgHostToName.get(sub);
      if (name) return { spec: name, anchor };
    }

    // W3C and other entries: longest base_url prefix match.
    const noHash = `${parsed.origin}${parsed.pathname}`;
    for (const entry of this.byBaseUrl) {
      const base = entry.base_url.replace(/\/$/, "");
      if (noHash === base || noHash.startsWith(base + "/")) {
        return { spec: entry.name, anchor };
      }
    }

    return null;
  }
}
