/**
 * Content script for sites where generated traces are inserted (Bugzilla,
 * GitHub, …). It inserts a trace into the text field the user last focused — a
 * comment box or any other textarea / contenteditable — in response to an
 * `insert` message. All trace UI lives in the sidebar panel.
 *
 * Auto-injected via content_scripts, and also injected on demand by the
 * background before an insert; the guard below keeps that idempotent.
 */
import type { InsertResponse, Request } from "../background/messages.js";

declare global {
  interface Window {
    __webspecTracerReady?: boolean;
  }
}

/** Known comment-box selectors, used only when nothing has been focused yet. */
const FALLBACK_SELECTORS = [
  "textarea#comment", // Bugzilla
  'textarea[name="comment"]',
  'textarea[name="comment[body]"]', // GitHub issues/PRs
  "#new_comment_field",
  "textarea.comment-form-textarea",
];

if (!window.__webspecTracerReady) {
  window.__webspecTracerReady = true;

  type Editable = HTMLTextAreaElement | HTMLElement;

  // The last text field the user focused, used as the insert target.
  let lastEditable: Editable | null = null;

  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)) {
      lastEditable = t;
    }
  });

  const fallbackTarget = (): Editable | null => {
    for (const sel of FALLBACK_SELECTORS) {
      const el = document.querySelector<HTMLTextAreaElement>(sel);
      if (el) return el;
    }
    const active = document.activeElement;
    return active instanceof HTMLTextAreaElement ? active : null;
  };

  const insertIntoTextarea = (textarea: HTMLTextAreaElement, text: string) => {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const caret = start + text.length;
    textarea.setSelectionRange(caret, caret);
    textarea.focus();
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };

  const insertIntoContentEditable = (el: HTMLElement, text: string) => {
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
  };

  const insertTrace = (text: string): boolean => {
    const target = lastEditable ?? fallbackTarget();
    if (!target) return false;
    const body = `\n${text}\n`;
    if (target instanceof HTMLTextAreaElement) insertIntoTextarea(target, body);
    else insertIntoContentEditable(target, body);
    return true;
  };

  browser.runtime.onMessage.addListener(
    (message: unknown): Promise<InsertResponse> | undefined => {
      const req = message as Request;
      if (req.kind !== "insert") return undefined;
      const ok = insertTrace(req.text);
      return Promise.resolve(
        ok
          ? { kind: "insert", ok: true }
          : { kind: "insert", ok: false, message: "click into a text field first" },
      );
    },
  );
}
