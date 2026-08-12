// Build script: bundles the three extension entry points into dist/, copies
// static assets, and writes dist/manifest.json. See docs/design.md.
import * as esbuild from "esbuild";
import { buildManifest } from "./scripts/manifest.mjs";
import { cp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));

const watch = process.argv.includes("--watch");
const run = process.argv.includes("--run");
const target = (process.env.TARGET === "mv3" ? "mv3" : "mv2");
const outdir = "dist";

const entryPoints = {
  background: "src/background/index.ts",
  "comment-insert": "src/content/comment-insert.ts",
  panel: "src/ui/panel.ts",
};

/** Copy static files and emit the manifest. Re-run on each rebuild. */
async function copyStatic() {
  await mkdir(`${outdir}/assets`, { recursive: true });
  await cp("assets/w3c_specs.json", `${outdir}/assets/w3c_specs.json`);
  await cp("assets/icon.svg", `${outdir}/icon.svg`);
  await cp("src/ui/panel.html", `${outdir}/panel.html`);
  await cp("src/ui/panel.css", `${outdir}/panel.css`);
  await writeFile(
    `${outdir}/manifest.json`,
    JSON.stringify(buildManifest(target, pkg.version), null, 2),
  );
}

const staticPlugin = {
  name: "copy-static",
  setup(build) {
    build.onEnd(async (result) => {
      await copyStatic();
      const errs = result.errors.length;
      console.log(
        `[esbuild] ${errs ? `${errs} error(s)` : "build ok"} (${target}) ${new Date().toLocaleTimeString()}`,
      );
    });
  },
};

const options = {
  entryPoints,
  outdir,
  bundle: true,
  format: "iife",
  target: "firefox115",
  sourcemap: true,
  logLevel: "info",
  plugins: [staticPlugin],
};

await rm(outdir, { recursive: true, force: true });

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[esbuild] watching…");
  if (run) {
    const p = spawn("web-ext", ["run", "--source-dir", outdir], {
      stdio: "inherit",
    });
    p.on("exit", () => process.exit());
  }
} else {
  await esbuild.build(options);
}
