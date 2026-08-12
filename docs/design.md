# webspec-tracer — Firefox extension for generating spec traces

## Context

Reviewers and spec authors (e.g. the Bugzilla comment at bug 2040963 c4) hand-write
"spec traces": a numbered, nested walkthrough of a specification's algorithm chain —
`location.assign(...)` calls `#location-object-navigate`, which calls `#navigate`,
which calls `#checking-if-unloading-is-canceled`, and so on. Authoring these by hand
is tedious and error-prone. This extension generates them automatically.

A spec trace is fundamentally a **walk over the cross-reference graph** of a spec:
nodes are sections/algorithms (anchors), edges are the `<a href="#...">` links from one
section into another. [jnjaeschke/webspec-index](https://github.com/jnjaeschke/webspec-index)
(Rust, installed locally as v0.12.0, and already built as a Firefox CI toolchain) builds
exactly this graph — but stores it in a 145 MB SQLite DB whose size is dominated by
`content_text` (85 MB) and the FTS5 full-text index (39 MB). The graph we actually need
(`refs` table + section labels) is only ~6 MB raw / ~1 MB gzipped for the specs indexed
so far.

### Key architectural decision

webspec-index needed WASM only because its two core dependencies — the HTTP client
(`reqwest`) and HTML parser (`scraper`) — are native. **A Firefox extension has both
natively:** `fetch` (with host permissions) + `DOMParser` + IndexedDB. So instead of
compiling anything to WASM or shipping a database, the extension **builds the graph
lazily in TypeScript, exactly the way webspec-index builds its SQLite DB**: on demand,
fetch a spec's single-page HTML, parse out sections + cross-references, cache the result,
and traverse. No WASM, no SQLite, no CDN, no shipped DB.

webspec-index is therefore the **reference implementation** we port from and test parity
against — not a runtime dependency.

## Decisions locked with the user

- **Delivery:** lazy, on-demand fetch+parse+cache in the extension (mirrors webspec-index's lazy DB build). No prebuilt/bundled DB, no WASM, no SQLite, no backend.
- **Traversal:** plain TypeScript over the in-memory adjacency graph. No WASM.
- **Trace shapes (both):** (a) outgoing call-tree from one anchor; (b) path between two anchors (BFS + backtrace — no pathfinding exists upstream).
- **Spec scope:** all specs webspec-index supports (~600 in `w3c_specs.json`), reached lazily as traces cross `to_spec` boundaries.
- **Feature scope:** full read suite exposed as a general spec browser — `query` (section content), `anchors` (glob), `list`, `exists`, `refs` — **plus** trace generation. **Include IDL** (`query`/lookup).
- **Cross-spec & search:** stay lazy, but the **storage layer must be pluggable** so a future global/persistent index (and eventually cross-spec incoming-refs + full-text search) can be swapped in. Cross-spec incoming refs are best-effort over specs already fetched in v1; the store interface must allow upgrading to complete coverage later. Global FTS search deferred.
- **UX:** Bugzilla-integrated — content script on bugzilla.mozilla.org that generates a trace and inserts it into the comment editor, rendered like the bug 2040963 c4 format; general browser UI (popup/sidebar) for the read suite.

## Reference implementation — what to port (from the webspec-index checkout), with effort weight

- **Section parsing (~60%, heaviest)** — `src/parse/sections.rs` (100–202, 863–911),
  `algorithms.rs` (58–126), `mod.rs` (95–213). ~2,660 lines, ~350 special cases across 4
  formats: Bikeshed (`div.algorithm`/`data-algorithm`), Wattsi (`<p>To <dfn>:</p>` + sibling
  list), ecmarkup (`emu-clause`/`emu-production`), xml2rfc (`<section>`). Produces section
  `{anchor(id), title, type(Heading|Algorithm|Definition|Idl), parent/prev/next, depth,
  content_text}`. Needs an HTML→Markdown step (upstream `htmd`; TS: `turndown`).
- **References (small, clean)** — `src/parse/references.rs`. Document-order walk tracking
  current Heading/Algorithm scope via element `id`; per `<a href>` skip `class="self-link"`
  and `data-link-type="biblio"`; resolve `#foo`→intra-spec or full URL→registry; dedup by
  (from_anchor, to_spec, to_anchor).
- **Spec registry (~25%, portable)** — `src/spec_registry.rs` (107–332, 766 lines) +
  `data/w3c_specs.json` (85 KB, ~600 entries `{name,base_url,provider,github_repo}`).
  `resolve_url(url)→(spec,anchor)` by hostname/path patterns (WHATWG subdomain, `tc39.es/{seg}`,
  `w3c.github.io/{slug}`, `w3.org/TR/{slug}`, IETF, WebAssembly, WebGPU); `SPLIT_REPO_SPECS`
  cases; `AUTOURL-{hex}` fallback. Bundle the JSON as a static asset; use browser `URL` API.
- **IDL** — `src/parse/idl.rs`, `idl_defs.rs`.
- **Graph traversal (~15%)** — `src/lib.rs` `build_graph_from_conn` (803–1034): BFS,
  direction in/out/both, `max_depth`~2, `max_nodes`~150, include/exclude regex filters,
  `same_spec_only`, shortest-path bridge marking, disconnected pruning. Ref queries in
  `src/db/queries.rs` (269–308). Output `GraphResult{root,nodes,edges,truncated}`; renderers
  in `src/format.rs` (markdown/mermaid/dot/json). **No start→end pathfinding upstream** — add
  BFS + parent-pointer backtrace.

**Hard part in the lazy model:** `get_incoming_refs` JOINs across *all* specs. Lazily we only
know incoming refs from specs already fetched → best-effort in v1, made complete later via the
pluggable store.

## Module layout

TS source tree mirrors the Rust crate module-for-module (keeps the port mechanical and
parity aligned file-by-file):

```
webspec-tracer/
  manifest.json            # generated from src/manifest.config.ts (TARGET=mv2|mv3)
  package.json  tsconfig.json  esbuild.mjs  web-ext-config.mjs
  assets/w3c_specs.json    # copied verbatim from webspec-index/data/w3c_specs.json (~85 KB)
  src/
    model/types.ts         # ParsedSection/Reference/IdlDefinition, ParsedSpec, GraphResult, TraceResult (port model.rs)
    registry/              # registry.ts (resolveUrl/inferBaseUrl), split-repo.ts, ietf.ts, specs-data.ts
    parse/                 # dom.ts (DOMParser helpers), markdown.ts (turndown), sections.ts (THE BIG ONE),
                           #   references.ts, idl.ts, idl-defs.ts, ietf-sections.ts, parse-spec.ts
    store/                 # spec-store.ts (interface), indexeddb-store.ts (default), memory-store.ts (tests),
                           #   backend-store.ts (future stub), fetcher.ts (fetch + sha256 + ReSpec detect)
    tracer/                # graph.ts (BFS, port lib.rs:803), trace.ts (outgoing tree + path backtrace), refs.ts
    render/                # graph-render.ts (md/mermaid/dot/json), trace-render.ts (numbered list → Bugzilla text)
    background/            # index.ts (message router; owns store; does all fetch+parse), messages.ts (typed protocol)
    content/bugzilla.ts    # locate comment textarea, inject "Insert spec trace" button, insert at caret
    ui/                    # panel.html/ts/css (sidebar spec-browser), api.ts (sendMessage client)
  test/                    # fixtures/ (saved spec HTML + golden CLI JSON), parity/, unit/
```

### Pluggable `SpecStore` (the key seam for lazy-now / backend-later)

The tracer only needs three reads: outgoing refs by anchor, incoming refs by target, and
section/node meta — exactly the `db/queries.rs` surface. Formalize that as `SpecStore` so
fetch+parse (in `background` via `fetcher.ts`+`parse-spec.ts`) is decoupled from reads:

```ts
interface SpecStore {
  getSpec/putSpec/isFresh(...)                      // parsed-spec cache (freshness like fetch/mod.rs is_fresh)
  getSection / getNodeMeta(spec, anchor)            // lib.rs section_meta
  getOutgoingRefs(spec, anchor): RefEdge[]          // db/queries get_outgoing_refs
  getIncomingRefs(spec, anchor): RefEdge[]          // db/queries get_incoming_refs
  readonly incomingRefsCoverage: 'fetched-only' | 'complete'
  search?(query, opts)                              // optional; backend-only for now
}
```

- **`LazySpecStore` (IndexedDB, default):** object stores `specs` + denormalized
  `refsBySource`/`refsByTarget` indexes (so ref lookups are index hits, not scans).
  `incomingRefsCoverage='fetched-only'` — best-effort across specs already cached.
- **`BackendSpecStore` (future stub):** same interface, `coverage='complete'`, incoming/search
  hit an HTTP index (a server can literally run `webspec-index`). Swap via one
  `USE_BACKEND` switch in `background/index.ts`. Tracer/UI branch on `incomingRefsCoverage`
  to show a "limited to fetched specs" note.

## Build tooling

- **MV2, MV3-ready.** Recommend MV2 for Firefox: persistent background page holds the graph
  cache + IndexedDB handle, and host permissions are granted at install (no mid-trace prompts
  when crossing into arbitrary `*.github.io`/`w3.org` specs). Keep `background/index.ts`
  side-effect-free so the same code runs as an MV3 event page later; only the manifest differs.
- **esbuild** — 3 entry points (background, content, panel), copies `w3c_specs.json`, writes manifest, `--watch`.
- **turndown** for HTML→Markdown (replaces the `htmd` crate); custom ruleset tuned against fixtures.
- **web-ext** — `run` (dev profile), `lint`, `build`. **tsconfig**: es2022, strict, `lib:[es2022,dom]`, `firefox-webext-browser` types.
- **Permissions:** `storage`, `unlimitedStorage`; host perms for `bugzilla.mozilla.org`,
  `*.spec.whatwg.org`, `tc39.es`, `*.github.io`, `drafts.csswg.org`, `w3.org` (+ spec-generator
  for ReSpec), IETF hosts. UI surface = **`sidebar_action`** (stays open while working the
  Bugzilla textarea, unlike a popup).

## Data flow

- **Trace → Bugzilla:** content-script button → `runtime.sendMessage({kind:'trace',spec,anchor,mode})`
  → background resolves base_url (registry), fetches HTML (ReSpec re-fetch if needed), parses,
  `putSpec`, runs BFS (`tracer/graph.ts`), lazily fetching specs as edges cross `to_spec`.
  `render/trace-render.ts` emits a numbered nested list of `[title](base_url#anchor)` links
  (matches bug c4). Content script inserts at the caret in `textarea#comment`
  (fallbacks: `[name=comment]`, focused textarea, `[contenteditable]`) and dispatches an
  `input` event so Bugzilla preview/autosave updates.
- **Browser UI (sidebar):** tabs map 1:1 to CLI commands — query (section content + nav +
  refs), anchors (glob), list, exists, refs (in/out/both), idl — all via background over the
  store, fetching lazily. "Copy as markdown/mermaid/dot/json" via `render/graph-render.ts`.

## Parity testing

`vitest` on Node with **jsdom** `DOMParser` (matches Firefox document-order semantics that
`references.ts` relies on), `MemorySpecStore` fed from checked-in fixtures (hermetic/offline).
Goldens captured once from the installed CLI (on PATH): `graph … --graph-format json`,
`refs … --format json`, `query … --format json`. Tiered assertions so the parser long tail
doesn't block early milestones:
1. **Structural (strict):** graph node/edge id sets equal the CLI's (validates references + BFS).
2. **Section meta (strict):** type/title/parent/prev/next/depth match `query` JSON.
3. **Content text (fuzzy):** normalized similarity threshold (turndown ≠ htmd byte-for-byte) —
   drives turndown tuning, not build failures.

Seed/acceptance fixture: `HTML#dom-location-assign` outgoing (the `location.assign` →
`#location-object-navigate` → `#navigate` → `#checking-if-unloading-is-canceled` chain).
Fixtures also include a TC39 (ecmarkup) + IETF spec to exercise all four parse formats.

## Phased build order

- **M0 — Scaffold:** package/tsconfig/esbuild/web-ext, manifest generator, `model/types.ts`,
  bundle `w3c_specs.json`, echo message-router. Extension loads; sidebar opens.
- **M1 — Minimal end-to-end (key early win):** registry (WHATWG name→base_url), fetcher,
  dom/markdown, `sections.ts` Bikeshed heading + `div.algorithm` path only, full
  `references.ts`, Lazy/Memory stores, outgoing BFS (`same_spec_only`), trace-render, Bugzilla
  insert. **Acceptance: numbered `location.assign` trace lands in a Bugzilla comment box;
  parity tiers 1–2 pass for the seed fixture.**
- **M2 — Cross-spec outgoing:** full `resolveUrl` port (WHATWG/tc39/github.io/w3.org/IETF/wasm/
  webgpu, SPLIT_REPO, AUTOURL); boundary-crossing lazy fetch; denormalized ref indexes.
- **M3 — Full parser coverage:** remaining `sections.rs` cases (dfn param/var filtering,
  isIdlType, ecmarkup emu-clause/production, Wattsi sibling-ol, IETF), `buildSectionTree`,
  idl parsers; port Rust `#[cfg(test)]` cases; tune turndown (tier-3 content parity).
- **M4 — Full browser UI + graph render:** sidebar tabs (query/anchors/list/exists/refs/idl),
  graph-render (md/mermaid/dot/json), path-to trace mode + bridge marking, include/exclude filters.
- **M5 — Incoming refs + pluggable backend:** best-effort `getIncomingRefs` (fetched-only) + UI
  note; stub `BackendSpecStore` + `USE_BACKEND` switch; INDEX_VERSION-style cache invalidation;
  MV3 manifest variant validated with `web-ext lint`.

## Risks

- **turndown ≠ htmd:** content-text parity is inherently fuzzy — keep out of the strict test tier.
- **jsdom vs Firefox DOMParser:** verify descendant iteration order matches before trusting parity; fall back to linkedom if it diverges.
- **ReSpec specs** need the w3.org spec-generator fetch or they parse to almost nothing.
- **Broad `*.github.io` host permission** is a review/privacy smell; the future backend store is the mitigation.

## Verification

`npm run build && web-ext run` to load the unpacked extension in a Firefox dev profile. Open a
`bugzilla.mozilla.org` bug, trigger an outgoing trace from `HTML#dom-location-assign`, and
confirm the inserted numbered list matches the expected call chain and the bug 2040963 c4 shape.
Run `npm test` (unit) and `npm run parity` (TS vs installed `webspec-index` CLI) — tiers 1–2
strict, tier 3 fuzzy.
