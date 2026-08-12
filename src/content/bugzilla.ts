/**
 * Content script for bugzilla.mozilla.org. Locates the comment editor and (in
 * M1) injects an "Insert spec trace" affordance that requests a trace from the
 * background and inserts it at the caret. M0: presence log only.
 */

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
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = before + text + after;
  const caret = start + text.length;
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

console.debug("[webspec-tracer] content script loaded");
