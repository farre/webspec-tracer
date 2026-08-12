/**
 * Content script for bugzilla.mozilla.org. Inserts a trace (generated in the
 * sidebar) into the text field the user last focused — the comment box, or any
 * other textarea / contenteditable on the page — in response to an `insert`
 * message. All trace UI lives in the sidebar panel.
 */
import type { InsertResponse, Request } from "../background/messages.js";

type Editable = HTMLTextAreaElement | HTMLElement;

/** The last text field the user focused, used as the insert target. */
let lastEditable: Editable | null = null;

document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)) {
    lastEditable = t;
  }
});

/** Fallback target when nothing has been focused yet: the comment box. */
function fallbackTarget(): Editable | null {
  const selectors = ["textarea#comment", 'textarea[name="comment"]'];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLTextAreaElement>(sel);
    if (el) return el;
  }
  const active = document.activeElement;
  return active instanceof HTMLTextAreaElement ? active : null;
}

function insertIntoTextarea(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const caret = start + text.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function insertIntoContentEditable(el: HTMLElement, text: string): void {
  el.focus();
  const sel = el.ownerDocument.getSelection();
  if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(el.ownerDocument.createTextNode(text));
    range.collapse(false);
  } else {
    el.append(text);
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

/** Insert `text` into the current target; returns false if there is none. */
export function insertTrace(text: string): boolean {
  const target = lastEditable ?? fallbackTarget();
  if (!target) return false;
  const body = `\n${text}\n`;
  if (target instanceof HTMLTextAreaElement) insertIntoTextarea(target, body);
  else insertIntoContentEditable(target, body);
  return true;
}

// Handle insert requests from the sidebar.
browser.runtime.onMessage.addListener((message: unknown): Promise<InsertResponse> | undefined => {
  const req = message as Request;
  if (req.kind !== "insert") return undefined;
  const ok = insertTrace(req.text);
  return Promise.resolve(
    ok ? { kind: "insert", ok: true } : { kind: "insert", ok: false, message: "click into a text field first" },
  );
});
