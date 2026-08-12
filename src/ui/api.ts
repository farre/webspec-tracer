/** Thin client: sends typed requests to the background page. */
import type { Request, Response } from "../background/messages.js";

export async function send(req: Request): Promise<Response> {
  return (await browser.runtime.sendMessage(req)) as Response;
}
