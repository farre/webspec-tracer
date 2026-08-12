/** Loads the bundled w3c_specs.json (extension runtime) and builds a Registry. */
import { Registry, type SpecEntry } from "./registry.js";

/** Fetch the bundled spec list and construct a Registry. */
export async function loadRegistry(): Promise<Registry> {
  const url = browser.runtime.getURL("assets/w3c_specs.json");
  const specs = (await (await fetch(url)).json()) as SpecEntry[];
  return new Registry(specs);
}
