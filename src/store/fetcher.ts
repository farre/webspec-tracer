/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/fetch/mod.rs
 *
 * Fetches a spec's single-page HTML and hashes it. ReSpec re-fetch via the
 * w3.org spec-generator is added in M3 (WHATWG specs used in M1 are Wattsi).
 */

/** Hex sha256 of a string using WebCrypto. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build the document fetch URL from a spec base URL (mirrors fetch/mod.rs). */
export function fetchUrlForBase(baseUrl: string): string {
  if (baseUrl.endsWith(".html") || baseUrl.endsWith(".txt")) return baseUrl;
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export interface FetchedSpec {
  html: string;
  sha: string;
  fetchUrl: string;
}

/** Fetch a spec's HTML from its base URL. */
export async function fetchSpecHtml(baseUrl: string): Promise<FetchedSpec> {
  const fetchUrl = fetchUrlForBase(baseUrl);
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`fetch ${fetchUrl} failed: ${res.status}`);
  const html = await res.text();
  const sha = await sha256Hex(html);
  return { html, sha, fetchUrl };
}
