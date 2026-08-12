// Dev-only: (re)download spec HTML fixtures and recapture CLI goldens.
// Requires network and the `webspec-index` CLI on PATH.
//   node test/fixtures/refresh.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const SPECS = [{ name: "HTML", url: "https://html.spec.whatwg.org/" }];

const GOLDENS = [
  {
    file: "golden/graph/HTML__dom-location-assign.json",
    args: [
      "graph", "HTML#dom-location-assign",
      "-d", "outgoing", "--same-spec-only",
      "--max-depth", "2", "--graph-format", "json",
    ],
  },
];

for (const spec of SPECS) {
  const res = await fetch(spec.url);
  const html = await res.text();
  const out = join(HERE, "html", `${spec.name}.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`saved ${out} (${html.length} bytes)`);
}

for (const g of GOLDENS) {
  const json = execFileSync("webspec-index", g.args, { encoding: "utf8", maxBuffer: 64 << 20 });
  const out = join(HERE, g.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log(`saved ${out}`);
}
