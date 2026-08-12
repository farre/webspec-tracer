/**
 * Sidebar trace console. Generates a path or outgoing trace via the background,
 * then inserts the rendered text into the active Bugzilla tab (or copies it).
 */
import { send } from "./api.js";
import type { InsertResponse, TraceRequest } from "../background/messages.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("trace-form");
const mode = $<HTMLSelectElement>("mode");
const pathFields = $<HTMLDivElement>("path-fields");
const outgoingFields = $<HTMLDivElement>("outgoing-fields");
const fromInput = $<HTMLInputElement>("from");
const toInput = $<HTMLInputElement>("to");
const refInput = $<HTMLInputElement>("ref");
const generateBtn = $<HTMLButtonElement>("generate");
const insertBtn = $<HTMLButtonElement>("insert");
const copyBtn = $<HTMLButtonElement>("copy");
const status = $<HTMLParagraphElement>("status");
const out = $<HTMLPreElement>("out");

let lastText = "";

function syncModeFields() {
  const isPath = mode.value === "path";
  pathFields.hidden = !isPath;
  outgoingFields.hidden = isPath;
}
mode.addEventListener("change", syncModeFields);
syncModeFields();

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const req = buildRequest();
  if (!req) return;

  generateBtn.disabled = true;
  status.textContent = "Generating… (first fetch of a spec can take a few seconds)";
  out.textContent = "";
  insertBtn.disabled = true;
  copyBtn.disabled = true;
  try {
    const res = await send(req);
    if (res.kind === "trace") {
      lastText = res.text;
      out.textContent = res.text;
      status.textContent = "";
      insertBtn.disabled = false;
      copyBtn.disabled = false;
    } else if (res.kind === "error") {
      status.textContent = res.message;
    }
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    generateBtn.disabled = false;
  }
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
