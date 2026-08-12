/**
 * Content script for bugzilla.mozilla.org. Injects an "Insert spec trace"
 * button near the comment editor; on click it prompts for a start anchor,
 * requests an outgoing trace from the background, and inserts it at the caret.
 */
import type { Request, Response } from "../background/messages.js";

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
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

/** Split a "SPEC#anchor" string into its parts. */
export function parseRef(input: string): { spec: string; anchor: string } | null {
  const hash = input.indexOf("#");
  if (hash <= 0 || hash === input.length - 1) return null;
  return { spec: input.slice(0, hash).trim(), anchor: input.slice(hash + 1).trim() };
}

async function send(req: Request): Promise<Response> {
  return (await browser.runtime.sendMessage(req)) as Response;
}

async function onInsertClick(textarea: HTMLTextAreaElement, button: HTMLButtonElement) {
  const input = window.prompt(
    "Spec trace start (SPEC#anchor):",
    "HTML#dom-location-assign",
  );
  if (!input) return;
  const ref = parseRef(input);
  if (!ref) {
    window.alert("Expected SPEC#anchor, e.g. HTML#dom-location-assign");
    return;
  }

  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Tracing…";
  try {
    const res = await send({ kind: "trace", mode: "outgoing", ...ref });
    if (res.kind === "trace") {
      insertAtCaret(textarea, `\n${res.text}\n`);
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
  button.addEventListener("click", () => void onInsertClick(textarea, button));

  textarea.parentElement?.insertBefore(button, textarea);
}

injectButton();
// Bugzilla swaps editors in dynamically; retry once the DOM settles.
document.addEventListener("DOMContentLoaded", injectButton);
