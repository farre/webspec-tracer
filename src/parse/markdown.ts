/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/parse/markdown.rs
 *
 * HTML→Markdown conversion via turndown, replacing the upstream `htmd` crate.
 * Byte-for-byte parity with htmd is not a goal (see docs/design.md parity tiers);
 * these rules reproduce the spec-aware handling: self-link/biblio links,
 * absolutized `#anchor` hrefs, and `code`/`var`/`dfn` inline styling.
 */
import TurndownService from "turndown";

/** Pull `text`/`url` out of a `[text](url)` markdown link, else null. */
function extractMarkdownLink(s: string): { text: string; url: string } | null {
  const m = /^\[(.*)\]\((.*)\)$/s.exec(s.trim());
  return m ? { text: m[1]!, url: m[2]! } : null;
}

/** A turndown converter configured for spec content; `baseUrl` absolutizes `#` links. */
export function buildConverter(baseUrl: string): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  td.addRule("spec-anchor", {
    filter: "a",
    replacement(content, node) {
      const el = node as unknown as Element;
      if (el.classList.contains("self-link")) return "";
      if (el.getAttribute("data-link-type") === "biblio") return content;
      const href = el.getAttribute("href");
      if (!href) return content;
      const url = href.startsWith("#") ? `${baseUrl}${href}` : href;
      return `[${content}](${url})`;
    },
  });

  td.addRule("spec-code", {
    filter: "code",
    replacement(content) {
      if (!content) return "";
      const link = extractMarkdownLink(content);
      return link ? `[\`${link.text}\`](${link.url})` : `\`${content}\``;
    },
  });

  td.addRule("spec-var", {
    filter: "var",
    replacement(content) {
      if (!content) return "";
      const link = extractMarkdownLink(content);
      return link ? `[*${link.text}*](${link.url})` : `*${content}*`;
    },
  });

  td.addRule("spec-dfn", {
    filter: "dfn",
    replacement(content) {
      return content ? `**${content}**` : "";
    },
  });

  return td;
}

/** Convert an element (including itself) to trimmed markdown. */
export function elementToMarkdown(el: Element, td: TurndownService): string {
  return td.turndown(el.outerHTML).trim();
}

/** Convert an HTML fragment to trimmed markdown. */
export function elementToMarkdownFromHtml(html: string, td: TurndownService): string {
  return td.turndown(html).trim();
}
