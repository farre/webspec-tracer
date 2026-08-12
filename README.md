# webspec-tracer

Firefox extension for creating traces from web specifications.

A **spec trace** is a numbered, nested walkthrough of a specification's algorithm
call-chain (e.g. `location.assign(...)` → `#location-object-navigate` → `#navigate`
→ `#checking-if-unloading-is-canceled`). This extension generates them from the live
specs and inserts them into the Bugzilla comment editor, and also offers a sidebar
for browsing spec sections, cross-references, and IDL.

It builds the spec cross-reference graph lazily in the browser (`fetch` + `DOMParser`
\+ IndexedDB) — no bundled database, no WASM, no backend. See [docs/design.md](docs/design.md)
for the full architecture.

## Development

```bash
pnpm install
pnpm build        # esbuild → dist/, generates manifest.json
pnpm dev          # watch build + web-ext run (Firefox dev profile)
pnpm test         # unit tests (vitest)
pnpm parity       # parity tests vs the webspec-index CLI
```

## Credits

webspec-tracer is largely a TypeScript port of the read/query side of
[**webspec-index**](https://github.com/jnjaeschke/webspec-index) by jnjaeschke
(MIT). The spec parsing, cross-reference extraction, URL resolution, graph
traversal, and the bundled `assets/w3c_specs.json` are derived from that project.
See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for full attribution and the
upstream license.

## License

MIT © 2026 Andreas Farre. See [LICENSE](LICENSE).
