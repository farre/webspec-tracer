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

function renderNode(res: EdgesResponse) {
  baseMap.set(res.spec, res.baseUrl);
  currentEl.textContent = res.title ? `${res.spec}#${res.anchor} — ${res.title}` : `${res.spec}#${res.anchor}`;

  edgesEl.textContent = "";
  if (res.edges.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "No outgoing references.";
    edgesEl.appendChild(li);
    return;
  }
  for (const edge of res.edges) {
    baseMap.set(edge.toSpec, edge.baseUrl);
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

resetBtn.addEventListener("click", () => {
  chain = [];
  interactiveView.hidden = true;
  edgesEl.textContent = "";
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
    status.textContent = res.ok ? "Inserted into comment." : res.message ?? "Insert failed.";
  } catch {
    status.textContent = "Open a bugzilla.mozilla.org bug with a comment box first.";
  }
});

copyBtn.addEventListener("click", async () => {
  if (!lastText) return;
  await navigator.clipboard.writeText(lastText);
  status.textContent = "Copied to clipboard.";
});

syncModeFields();
