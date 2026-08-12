/**
 * Content script for bugzilla.mozilla.org. Its only job is to insert a trace
 * (generated in the sidebar) into the comment box on request, via an `insert`
 * message. All trace UI lives in the sidebar panel.
 */
import type { InsertResponse, Request } from "../background/messages.js";

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
