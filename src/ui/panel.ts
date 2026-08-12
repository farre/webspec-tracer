/**
 * Sidebar trace console. Three modes:
 *  - path: shortest A → B chain;
 *  - outgoing: depth-limited call tree from one anchor;
 *  - interactive: step through outgoing calls, clicking each hop to grow a trace.
 * The rendered trace can be inserted into the active Bugzilla tab or copied.
 */
import { send } from "./api.js";
import type { EdgesResponse, InsertResponse, TraceRequest } from "../background/messages.js";
import type { TraceNode } from "../tracer/trace.js";
import { renderPath } from "../render/trace-render.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("trace-form");
const mode = $<HTMLSelectElement>("mode");
const pathFields = $<HTMLDivElement>("path-fields");
const outgoingFields = $<HTMLDivElement>("outgoing-fields");
const interactiveFields = $<HTMLDivElement>("interactive-fields");
const fromInput = $<HTMLInputElement>("from");
const toInput = $<HTMLInputElement>("to");
const refInput = $<HTMLInputElement>("ref");
const startInput = $<HTMLInputElement>("start");
const generateBtn = $<HTMLButtonElement>("generate");
const insertBtn = $<HTMLButtonElement>("insert");
const copyBtn = $<HTMLButtonElement>("copy");
const status = $<HTMLParagraphElement>("status");
const out = $<HTMLPreElement>("out");
const interactiveView = $<HTMLElement>("interactive-view");
const currentEl = $<HTMLParagraphElement>("current");
const stepsEl = $<HTMLDivElement>("steps");
const callsFallback = $<HTMLDivElement>("calls-fallback");
const edgesEl = $<HTMLUListElement>("edges");
const backBtn = $<HTMLButtonElement>("back");
const resetBtn = $<HTMLButtonElement>("reset");

let lastText = "";

function setResult(text: string) {
  lastText = text;
  out.textContent = text;
  const has = text.length > 0;
  insertBtn.disabled = !has;
  copyBtn.disabled = !has;
}

function syncModeFields() {
  const m = mode.value;
  pathFields.hidden = m !== "path";
  outgoingFields.hidden = m !== "outgoing";
  interactiveFields.hidden = m !== "interactive";
  generateBtn.textContent = m === "interactive" ? "Start" : "Generate";
  interactiveView.hidden = m !== "interactive" || chain.length === 0;
}
mode.addEventListener("change", () => {
  syncModeFields();
  status.textContent = "";
});

// ── path / outgoing modes ────────────────────────────────────────────────────

function buildRequest(): TraceRequest | null {
  if (mode.value === "path") {
    const from = fromInput.value.trim();
    const to = toInput.value.trim();
    if (!from || !to) {
      status.textContent = "Enter both From and To.";
      return null;
    }
    return { kind: "trace", mode: "path", from, to };
  }
  const ref = refInput.value.trim();
  if (!ref) {
    status.textContent = "Enter an anchor.";
    return null;
  }
  return { kind: "trace", mode: "outgoing", ref };
}

async function generate() {
  const req = buildRequest();
  if (!req) return;
  generateBtn.disabled = true;
  status.textContent = "Generating… (first fetch of a spec can take a few seconds)";
  setResult("");
  try {
    const res = await send(req);
    if (res.kind === "trace") {
      setResult(res.text);
      status.textContent = "";
    } else if (res.kind === "error") {
      status.textContent = res.message;
    }
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    generateBtn.disabled = false;
  }
}

// ── interactive mode ─────────────────────────────────────────────────────────

const baseMap = new Map<string, string | null>();
let chain: TraceNode[] = [];

const baseUrlFor = (spec: string) => baseMap.get(spec) ?? null;
const label = (spec: string, anchor: string, contextSpec: string) =>
  spec === contextSpec ? `#${anchor}` : `${spec}#${anchor}`;

function renderInteractiveTrace() {
  setResult(chain.length >= 2 ? renderPath(chain, baseUrlFor) : "");
}

/** Fetch and display the current node's outgoing edges. */
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

/** Strip anything script-like from spec HTML before injecting it. */
function sanitize(container: HTMLElement) {
  container.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((e) => e.remove());
  for (const e of container.querySelectorAll("*")) {
    for (const attr of [...e.attributes]) {
      if (attr.name.startsWith("on")) e.removeAttribute(attr.name);
    }
  }
}

function renderNode(res: EdgesResponse) {
  baseMap.set(res.spec, res.baseUrl);
  for (const edge of res.edges) baseMap.set(edge.toSpec, edge.baseUrl);
  currentEl.textContent = res.title
    ? `${res.spec}#${res.anchor} — ${res.title}`
    : `${res.spec}#${res.anchor}`;

  // Map each call-site id to its edge, so a link in the steps can descend.
  const byCallSite = new Map<string, (typeof res.edges)[number]>();
  for (const edge of res.edges) {
    for (const id of edge.callSiteIds) byCallSite.set(id, edge);
  }

  const clickable = renderSteps(res, byCallSite);
  stepsEl.hidden = !clickable;
  callsFallback.hidden = clickable;
  if (!clickable) renderEdgeList(res);
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

/** Fallback: a compact list of outgoing calls (used when there are no clickable
 * in-algorithm calls in the rendered steps, e.g. for non-algorithm nodes). */
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

function toNode(
  spec: string,
  anchor: string,
  title: string | null,
  viaCallSiteIds: string[],
): TraceNode {
  return { id: `${spec}#${anchor}`, spec, anchor, title, children: [], viaCallSiteIds };
}

async function startInteractive(ref: string) {
  chain = [];
  const res = await send({ kind: "edges", ref });
  if (res.kind === "error") {
    status.textContent = res.message;
    return;
  }
  if (res.kind !== "edges") return;
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

/** Global reset: clear inputs, output, and interactive state, in any mode. */
resetBtn.addEventListener("click", () => {
  fromInput.value = "";
  toInput.value = "";
  refInput.value = "";
  startInput.value = "";
  chain = [];
  interactiveView.hidden = true;
  edgesEl.textContent = "";
  stepsEl.textContent = "";
  currentEl.textContent = "";
  setResult("");
  status.textContent = "";
});

// ── shared submit + actions ──────────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (mode.value === "interactive") {
    const ref = startInput.value.trim();
    if (!ref) {
      status.textContent = "Enter a start anchor.";
      return;
    }
    generateBtn.disabled = true;
    status.textContent = "Loading… (first fetch of a spec can take a few seconds)";
    try {
      await startInteractive(ref);
    } finally {
      generateBtn.disabled = false;
    }
    return;
  }
  await generate();
});

insertBtn.addEventListener("click", async () => {
  if (!lastText) return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "No active tab.";
    return;
  }
  try {
    const res = (await browser.tabs.sendMessage(tab.id, {
      kind: "insert",
      text: lastText,
    })) as InsertResponse;
    status.textContent = res.ok ? "Inserted." : res.message ?? "Insert failed.";
  } catch {
    status.textContent = "Focus a text field on a bugzilla.mozilla.org page first.";
  }
});

copyBtn.addEventListener("click", async () => {
  if (!lastText) return;
  await navigator.clipboard.writeText(lastText);
  status.textContent = "Copied to clipboard.";
});

syncModeFields();
