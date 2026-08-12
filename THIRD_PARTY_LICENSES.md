# Third-party licenses and attribution

This project incorporates work from other open-source projects. Their licenses
and required notices are reproduced below.

## webspec-index

webspec-tracer is, in large part, a TypeScript port of the read/query side of
**webspec-index** by jnjaeschke. The following logic is derived from or directly
ported from webspec-index and carries its copyright:

- Cross-reference extraction — `src/parse/references.ts` (from `src/parse/references.rs`)
- Section/algorithm parsing — `src/parse/sections.ts`, `src/parse/algorithms.ts`,
  `src/parse/ietf-sections.ts` (from `src/parse/sections.rs`, `algorithms.rs`, `mod.rs`)
- IDL extraction — `src/parse/idl.ts`, `src/parse/idl-defs.ts` (from `src/parse/idl.rs`, `idl_defs.rs`)
- Spec registry and URL resolution — `src/registry/*` (from `src/spec_registry.rs`, `src/ietf.rs`)
- Graph traversal and ref queries — `src/tracer/graph.ts`, `src/tracer/refs.ts`
  (from `src/lib.rs` `build_graph_from_conn` and `src/db/queries.rs`)
- Output rendering — `src/render/graph-render.ts` (from `src/format.rs`)
- Data model — `src/model/types.ts` (from `src/model.rs`)

In addition, the file **`assets/w3c_specs.json`** is copied verbatim from
webspec-index (`data/w3c_specs.json`).

Individual ported source files carry a header comment pointing at the upstream
Rust module they were derived from.

Upstream project: https://github.com/jnjaeschke/webspec-index

```
MIT License

Copyright (c) 2026 jnjaeschke

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Runtime/build dependencies

Third-party npm dependencies (e.g. `turndown`, `esbuild`, `web-ext`, `vitest`,
`jsdom`) are listed in `package.json` and licensed under their respective terms
(available in `node_modules/<pkg>/LICENSE` after install).
