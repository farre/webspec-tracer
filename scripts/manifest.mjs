// Generates the WebExtension manifest. `TARGET=mv2|mv3` selects the flavour;
// MV2 is the default (persistent background page, install-time host permissions).
// Plain JS so it can be imported by the node-run build script. See docs/design.md.

/** Host permissions: Bugzilla plus the spec sources the registry can resolve. */
const HOST_PERMISSIONS = [
  "https://bugzilla.mozilla.org/*",
  "https://*.spec.whatwg.org/*",
  "https://tc39.es/*",
  "https://*.github.io/*",
  "https://drafts.csswg.org/*",
  "https://www.w3.org/*",
  "https://w3.org/*",
  "https://www.rfc-editor.org/*",
  "https://datatracker.ietf.org/*",
  "https://www.ietf.org/*",
];

const CONTENT_SCRIPTS = [
  {
    matches: ["https://bugzilla.mozilla.org/*"],
    js: ["content-bugzilla.js"],
  },
];

/** @param {"mv2"|"mv3"} target */
export function buildManifest(target) {
  const base = {
    name: "webspec-tracer",
    version: "0.1.0",
    description: "Create traces from web specifications.",
    browser_specific_settings: {
      gecko: {
        id: "webspec-tracer@mozilla.org",
        // The extension sends no user data anywhere; it only fetches public
        // specs and caches them locally.
        data_collection_permissions: { required: ["none"] },
      },
    },
    sidebar_action: {
      default_title: "webspec-tracer",
      default_panel: "panel.html",
    },
    content_scripts: CONTENT_SCRIPTS,
  };

  if (target === "mv3") {
    return {
      ...base,
      manifest_version: 3,
      permissions: ["storage", "unlimitedStorage"],
      host_permissions: HOST_PERMISSIONS,
      background: { scripts: ["background.js"] },
    };
  }

  // MV2 (default)
  return {
    ...base,
    manifest_version: 2,
    permissions: ["storage", "unlimitedStorage", ...HOST_PERMISSIONS],
    background: { scripts: ["background.js"], persistent: true },
  };
}
