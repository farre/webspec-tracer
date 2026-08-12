// Generates the WebExtension manifest. `TARGET=mv2|mv3` selects the flavour;
// MV2 is the default (persistent background page, install-time host permissions).
// Plain JS so it can be imported by the node-run build script. See docs/design.md.

/**
 * Host permissions: Bugzilla (to insert traces into the comment editor) plus the
 * spec sources the registry resolves and fetches on demand to build the graph.
 * Rationale for each is documented in docs/publishing.md ("Permissions").
 */
const HOST_PERMISSIONS = [
  "https://bugzilla.mozilla.org/*", // insert generated traces into the comment box
  "https://*.spec.whatwg.org/*", // WHATWG living standards (HTML, DOM, URL, Fetch…)
  "https://tc39.es/*", // TC39 / ECMAScript specs and proposals
  "https://*.github.io/*", // W3C/WICG/GPUWeb/WebAssembly editor's drafts
  "https://drafts.csswg.org/*", // CSS WG drafts
  "https://www.w3.org/*", // W3C /TR/ specs and the ReSpec spec-generator
  "https://w3.org/*", // W3C (bare host)
  "https://www.rfc-editor.org/*", // IETF RFCs
  "https://datatracker.ietf.org/*", // IETF drafts
  "https://www.ietf.org/*", // IETF
];

const CONTENT_SCRIPTS = [
  {
    matches: ["https://bugzilla.mozilla.org/*"],
    js: ["content-bugzilla.js"],
  },
];

const ICONS = { 48: "icon.svg", 96: "icon.svg", 128: "icon.svg" };

/**
 * @param {"mv2"|"mv3"} target
 * @param {string} version  from package.json (single source of truth)
 */
export function buildManifest(target, version = "0.0.0") {
  const base = {
    name: "webspec-tracer",
    version,
    description: "Create traces from web specifications.",
    browser_specific_settings: {
      gecko: {
        id: "webspec-tracer@farre.se",
        // The extension sends no user data anywhere; it only fetches public
        // specs and caches them locally.
        data_collection_permissions: { required: ["none"] },
      },
    },
    icons: ICONS,
    sidebar_action: {
      default_title: "webspec-tracer",
      default_panel: "panel.html",
      default_icon: "icon.svg",
    },
    // Keyboard shortcut to toggle the sidebar. Rebind via about:addons →
    // Manage Extension Shortcuts.
    commands: {
      _execute_sidebar_action: {
        suggested_key: { default: "Ctrl+Shift+U", mac: "Command+Shift+U" },
      },
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
