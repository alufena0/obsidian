var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => StickyEditButtonPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var StickyEditButtonPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.domObserver = null;
    this.attached = /* @__PURE__ */ new WeakSet();
  }
  async onload() {
    this.processAll();
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.processAll())
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.processAll())
    );
    this.domObserver = new MutationObserver(() => this.processAll());
    this.domObserver.observe(document.body, { childList: true, subtree: true });
  }
  onunload() {
    var _a;
    (_a = this.domObserver) == null ? void 0 : _a.disconnect();
  }
  // ─── Encontra e anexa todos os botões visíveis ──────────────────────────────
  processAll() {
    document.querySelectorAll(".edit-block-button").forEach((btn) => this.attach(btn));
  }
  // ─── Anexa comportamento sticky a um botão ──────────────────────────────────
  attach(button) {
    if (this.attached.has(button))
      return;
    this.attached.add(button);
    const container = button.parentElement;
    if (!container)
      return;
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    const scrollEl = this.findScrollContainer(button);
    const update = () => this.reposition(button, container, scrollEl);
    update();
    if (scrollEl) {
      scrollEl.addEventListener("scroll", update, { passive: true });
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
  }
  // ─── Recalcula a posição do botão ───────────────────────────────────────────
  reposition(button, container, scrollEl) {
    const containerRect = container.getBoundingClientRect();
    const PAD = 8;
    const btnH = button.offsetHeight || 32;
    let viewTop = 0;
    let viewBottom = window.innerHeight;
    if (scrollEl) {
      const r = scrollEl.getBoundingClientRect();
      viewTop = r.top;
      viewBottom = r.bottom;
    }
    const visibleTop = Math.max(containerRect.top, viewTop);
    const visibleBottom = Math.min(containerRect.bottom, viewBottom);
    if (visibleBottom <= visibleTop)
      return;
    let desiredTop = visibleBottom - containerRect.top - btnH - PAD;
    desiredTop = Math.max(PAD, desiredTop);
    desiredTop = Math.min(containerRect.height - btnH - PAD, desiredTop);
    button.style.position = "absolute";
    button.style.top = `${desiredTop}px`;
    button.style.bottom = "unset";
    button.style.left = `${PAD}px`;
    button.style.right = "unset";
  }
  // ─── Encontra o ancestral que faz scroll ────────────────────────────────────
  findScrollContainer(el) {
    const KNOWN = [
      "markdown-preview-view",
      "markdown-reading-view",
      "cm-scroller",
      "view-content"
    ];
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      for (const cls of KNOWN) {
        if (parent.classList.contains(cls))
          return parent;
      }
      parent = parent.parentElement;
    }
    parent = el.parentElement;
    while (parent && parent !== document.body) {
      const oy = getComputedStyle(parent).overflowY;
      if ((oy === "auto" || oy === "scroll") && parent.scrollHeight > parent.clientHeight) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }
};
