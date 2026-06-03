const { Plugin } = require("obsidian");

module.exports = class TabPathTooltipPlugin extends Plugin {

  async onload() {
    this.tip = document.createElement("div");
    Object.assign(this.tip.style, {
      display: "none", position: "fixed", zIndex: "99999",
      padding: "5px 10px", borderRadius: "5px",
      fontSize: "var(--font-smaller, 12px)", fontFamily: "var(--font-interface, var(--default-font))", lineHeight: "1.5",
      maxWidth: "700px", wordBreak: "break-all", pointerEvents: "none",
      background: "#1e1e1e", color: "#e8e8e8",
      border: "1px solid #555", boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
    });
    document.body.appendChild(this.tip);

    this._enter = this._enter.bind(this);
    this._move  = this._move.bind(this);
    this._leave = this._leave.bind(this);

    document.addEventListener("mouseenter", this._enter, true);
    document.addEventListener("mousemove",  this._move,  true);
    document.addEventListener("mouseleave", this._leave, true);

    const clearAll = () => this.clearNativeTooltips();
    this.registerEvent(this.app.workspace.on("layout-change",      clearAll));
    this.registerEvent(this.app.workspace.on("active-leaf-change", clearAll));
    this.app.workspace.onLayoutReady(clearAll);
    if (this.app.workspace.layoutReady) clearAll();
  }

  clearNativeTooltips() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const el = leaf.tabHeaderEl;
      if (!el) return;
      el.removeAttribute("aria-label");
      el.querySelectorAll("[aria-label]").forEach(c => c.removeAttribute("aria-label"));
    });
  }

  onunload() {
    this.tip?.remove();
    document.removeEventListener("mouseenter", this._enter, true);
    document.removeEventListener("mousemove",  this._move,  true);
    document.removeEventListener("mouseleave", this._leave, true);
  }

  _enter(e) {
    const tabEl = e.target?.closest?.(".workspace-tab-header");
    if (!tabEl) return;
    const path = this._getPath(tabEl);
    if (!path) return;
    this.tip.textContent = path;
    this.tip.style.display = "block";
    this._pos(e);
  }

  _move(e) {
    if (this.tip.style.display === "none") return;
    this._pos(e);
  }

  _leave(e) {
    if (e.target?.closest?.(".workspace-tab-header")) {
      this.tip.style.display = "none";
    }
  }

  _getPath(tabEl) {
    let found = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found) return;
      if (leaf.tabHeaderEl !== tabEl) return;

      // Active tab: file loaded normally
      if (leaf.view?.file?.path) {
        found = leaf.view.file.path;
        return;
      }

      // Inactive tabs: get path from saved view state
      try {
        const state = leaf.getViewState();
        if (state?.state?.file) {
          found = state.state.file;
        }
      } catch (_) {}
    });
    return found;
  }

  _pos(e) {
    const m = 14;
    let x = e.clientX + m;
    let y = e.clientY + m;
    if (x + this.tip.offsetWidth  > window.innerWidth)  x = e.clientX - this.tip.offsetWidth  - m;
    if (y + this.tip.offsetHeight > window.innerHeight) y = e.clientY - this.tip.offsetHeight - m;
    this.tip.style.left = x + "px";
    this.tip.style.top  = y + "px";
  }
};
