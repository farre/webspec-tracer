/**
 * Sidebar trace console (interactive step-through). Enter a start anchor, then
 * click through a node's outgoing calls — rendered as the real spec steps — to
 * grow a trace one hop at a time. The rendered trace can be inserted into the
 * active tab's focused text field or copied.
 */
import { send } from "./api.js";
import type { EdgesResponse } from "../background/messages.js";
import type { TraceNode } from "../tracer/trace.js";
import { renderPath } from "../render/trace-render.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("trace-form");
const startInput = $<HTMLInputElement>("start");
const generateBtn = $<HTMLButtonElement>("generate");
const insertBtn = $<HTMLButtonElement>("insert");
const copyBtn = $<HTMLButtonElement>("copy");
const resetBtn = $<HTMLButtonElement>("reset");
const status = $<HTMLParagraphElement>("status");
const out = $<HTMLPreElement>("out");
const interactiveView = $<HTMLElement>("interactive-view");
const currentEl = $<HTMLParagraphElement>("current");
const stepsEl = $<HTMLDivElement>("steps");
const callsFallback = $<HTMLDivElement>("calls-fallback");
const edgesEl = $<HTMLUListElement>("edges");
const backBtn = $<HTMLButtonElement>("back");

let lastText = "";
const baseMap = new Map<string, string | null>();
let chain: TraceNode[] = [];

function setResult(text: string) {
  lastText = text;
  out.textContent = text;
  const has = text.length > 0;
  insertBtn.disabled = !has;
  copyBtn.disabled = !has;
}

const baseUrlFor = (spec: string) => baseMap.get(spec) ?? null;
const label = (spec: string, anchor: string, contextSpec: string) =>
  spec === contextSpec ? `#${anchor}` : `${spec}#${anchor}`;

function renderInteractiveTrace() {
  setResult(chain.length >= 2 ? renderPath(chain, baseUrlFor) : "");
}

/** Strip anything script-like from spec HTML before injecting it. */
function sanitize(container: HTMLElement) {
  container.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((e) => e.remove());
  for (const e of container.querySelectorAll("*")) {
    for (const attr of [...e.attributes]) {
      if (attr.name.startsWith("on")) e.removeAttribute(attr.name);
    }
  }
}

function toNode(
  spec: string,
  anchor: string,
  title: string | null,
  viaCallSiteIds: string[],
): TraceNode {
  return { id: `${spec}#${anchor}`, spec, anchor, title, children: [], viaCallSiteIds };
}

/** Render the section's source HTML with in-algorithm calls clickable. Returns
 * true if it produced at least one clickable call. */
function renderSteps(
  res: EdgesResponse,
  byCallSite: Map<string, (typeof res.edges)[number]>,
): boolean {
  stepsEl.textContent = "";
  if (!res.contentHtml) return false;

  // Parse in an inert document (no script execution), then adopt the nodes —
  // avoids assigning untrusted HTML to innerHTML.
  const parsed = new DOMParser().parseFromString(res.contentHtml, "text/html");
  const container = document.createElement("div");
  while (parsed.body.firstChild) container.appendChild(parsed.body.firstChild);
  sanitize(container);

  let clickable = 0;
  for (const a of container.querySelectorAll("a")) {
    const id = a.getAttribute("id");
    const edge = id ? byCallSite.get(id) : undefined;
    const href = a.getAttribute("href");
    if (href?.startsWith("#") && res.baseUrl) a.setAttribute("href", `${res.baseUrl}${href}`);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    if (edge) {
      clickable++;
      a.classList.add("call");
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        void addHop(edge.toSpec, edge.toAnchor, edge.title, edge.callSiteIds);
      });
    }
  }

  if (clickable === 0) return false;
  stepsEl.appendChild(container);
  return true;
}

/** Fallback: a compact list of outgoing calls (for non-algorithm nodes). */
function renderEdgeList(res: EdgesResponse) {
  edgesEl.textContent = "";
  if (res.edges.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "No outgoing references.";
    edgesEl.appendChild(li);
    return;
  }
  for (const edge of res.edges) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    const name = label(edge.toSpec, edge.toAnchor, res.spec);
    const count = edge.callSiteIds.length > 1 ? ` (${edge.callSiteIds.length}×)` : "";
    btn.textContent = edge.title ? `${name} — ${edge.title}${count}` : `${name}${count}`;
    btn.addEventListener("click", () =>
      void addHop(edge.toSpec, edge.toAnchor, edge.title, edge.callSiteIds),
    );
    li.appendChild(btn);
    edgesEl.appendChild(li);
  }
}

function renderNode(res: EdgesResponse) {
  baseMap.set(res.spec, res.baseUrl);
  for (const edge of res.edges) baseMap.set(edge.toSpec, edge.baseUrl);
  currentEl.textContent = res.title
    ? `${res.spec}#${res.anchor} — ${res.title}`
    : `${res.spec}#${res.anchor}`;

  const byCallSite = new Map<string, (typeof res.edges)[number]>();
  for (const edge of res.edges) {
    for (const id of edge.callSiteIds) byCallSite.set(id, edge);
  }

  const clickable = renderSteps(res, byCallSite);
  stepsEl.hidden = !clickable;
  callsFallback.hidden = clickable;
  if (!clickable) renderEdgeList(res);
}

/** Fetch and display a node's outgoing edges. */
async function showNode(spec: string, anchor: string) {
  status.textContent = "Loading calls…";
  edgesEl.textContent = "";
  const res = await send({ kind: "edges", ref: `${spec}#${anchor}` });
  if (res.kind === "error") {
    status.textContent = res.message;
    return;
  }
  if (res.kind !== "edges") return;
  status.textContent = "";
  renderNode(res);
}

async function startInteractive(ref: string) {
  chain = [];
  const res = await send({ kind: "edges", ref });
  if (res.kind === "error") {
    status.textContent = res.message;
    return;
  }
  if (res.kind !== "edges") return;
  status.textContent = "";
  interactiveView.hidden = false;
  chain = [toNode(res.spec, res.anchor, res.title, [])];
  renderNode(res);
  renderInteractiveTrace();
}

async function addHop(spec: string, anchor: string, title: string | null, callSiteIds: string[]) {
  chain.push(toNode(spec, anchor, title, callSiteIds));
  renderInteractiveTrace();
  await showNode(spec, anchor);
}

backBtn.addEventListener("click", () => {
  if (chain.length <= 1) return;
  chain.pop();
  const cur = chain[chain.length - 1]!;
  renderInteractiveTrace();
  void showNode(cur.spec, cur.anchor);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ref = startInput.value.trim();
  if (!ref) {
    status.textContent = "Enter a start anchor.";
    return;
  }
  generateBtn.disabled = true;
  status.textContent = "Loading… (first fetch of a spec can take a few seconds)";
  try {
    await startInteractive(ref);
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    generateBtn.disabled = false;
  }
});

insertBtn.addEventListener("click", async () => {
  if (!lastText) return;
  try {
    const res = await send({ kind: "insert", text: lastText });
    if (res.kind === "insert") {
      status.textContent = res.ok ? "Inserted." : res.message ?? "Insert failed.";
    } else if (res.kind === "error") {
      status.textContent = res.message;
    }
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : String(e);
  }
});

copyBtn.addEventListener("click", async () => {
  if (!lastText) return;
  await navigator.clipboard.writeText(lastText);
  status.textContent = "Copied to clipboard.";
});

/** Global reset: clear input, output, and interactive state. */
resetBtn.addEventListener("click", () => {
  startInput.value = "";
  chain = [];
  interactiveView.hidden = true;
  edgesEl.textContent = "";
  stepsEl.textContent = "";
  currentEl.textContent = "";
  setResult("");
  status.textContent = "";
});
