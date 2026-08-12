/**
 * Content script for bugzilla.mozilla.org. Injects a quick "Insert spec trace"
 * button near the comment editor, and lets the sidebar insert a rendered trace
 * into the comment box via an `insert` message.
 */
import type { InsertResponse, Request, Response } from "../background/messages.js";

/** Locate the active comment textarea, trying the known selectors in order. */
export function findCommentTextarea(): HTMLTextAreaElement | null {
  const selectors = ["textarea#comment", 'textarea[name="comment"]'];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLTextAreaElement>(sel);
    if (el) return el;
  }
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return active;
  return null;
}

/** Insert `text` at the caret in `textarea`, then fire an input event. */
export function insertAtCaret(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const caret = start + text.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

async function send(req: Request): Promise<Response> {
  return (await browser.runtime.sendMessage(req)) as Response;
}

async function onInsertClick(button: HTMLButtonElement) {
  const input = window.prompt(
    "Outgoing spec trace from (SPEC#anchor):",
    "HTML#dom-location-assign",
  );
  if (!input) return;

  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Tracing…";
  try {
    const res = await send({ kind: "trace", mode: "outgoing", ref: input });
    if (res.kind === "trace") {
      const textarea = findCommentTextarea();
      if (textarea) insertAtCaret(textarea, `\n${res.text}\n`);
    } else if (res.kind === "error") {
      window.alert(`webspec-tracer: ${res.message}`);
    }
  } catch (e) {
    window.alert(`webspec-tracer: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function injectButton(): void {
  const textarea = findCommentTextarea();
  if (!textarea || document.getElementById("webspec-tracer-btn")) return;

  const button = document.createElement("button");
  button.id = "webspec-tracer-btn";
  button.type = "button";
  button.textContent = "Insert spec trace";
  button.style.margin = "0.25rem 0";
  button.addEventListener("click", () => void onInsertClick(button));

  textarea.parentElement?.insertBefore(button, textarea);
}

// Handle insert requests from the sidebar.
browser.runtime.onMessage.addListener((message: unknown): Promise<InsertResponse> | undefined => {
  const req = message as Request;
  if (req.kind !== "insert") return undefined;
  const textarea = findCommentTextarea();
  if (!textarea) {
    return Promise.resolve({ kind: "insert", ok: false, message: "no comment box on this page" });
  }
  insertAtCaret(textarea, `\n${req.text}\n`);
  return Promise.resolve({ kind: "insert", ok: true });
});

injectButton();
// Bugzilla swaps editors in dynamically; retry once the DOM settles.
document.addEventListener("DOMContentLoaded", injectButton);
