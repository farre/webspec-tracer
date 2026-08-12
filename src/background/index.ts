/**
 * Background page: message router. Owns the SpecStore and performs all
 * fetch+parse (host permissions live here). M0 scaffold: only answers `ping`;
 * `trace` is wired up in M1.
 *
 * Kept side-effect-free at module top level (only registers a listener) so the
 * same code runs unchanged as an MV3 event page. See docs/design.md.
 */
import type { Request, Response } from "./messages.js";

async function handle(req: Request): Promise<Response> {
  switch (req.kind) {
    case "ping":
      return { kind: "ping", ok: true, echo: req.payload };
    case "trace":
      return { kind: "error", message: "trace not implemented until M1" };
    default:
      return { kind: "error", message: `unknown request: ${JSON.stringify(req)}` };
  }
}

browser.runtime.onMessage.addListener((message: unknown): Promise<Response> => {
  return handle(message as Request);
});
