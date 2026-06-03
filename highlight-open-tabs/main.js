const { Plugin } = require('obsidian');

module.exports = class HighlightOpenTabsPlugin extends Plugin {
  onload() {
    this.highlightOpenTabs = this.highlightOpenTabs.bind(this);

    // Update on layout or active tab change
    this.registerEvent(this.app.workspace.on('layout-change', this.highlightOpenTabs));
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.highlightOpenTabs));
    this.registerEvent(this.app.workspace.on('file-open', this.highlightOpenTabs));

    // Continuous update every 1s (fallback for events that may fail)
    this.registerInterval(window.setInterval(this.highlightOpenTabs, 1000));

    this.highlightOpenTabs(); // initial run
  }

  onunload() {
    // Clear all classes on unload
    document.querySelectorAll(".nav-file-title.open-in-tab, .nav-file-title.active-tab").forEach(el => {
      el.classList.remove("open-in-tab", "active-tab");
    });
  }

  highlightOpenTabs() {
    // Get all open file paths
    const openPaths = this.app.workspace
      .getLeavesOfType("markdown")
      .map(leaf => leaf.view?.file?.path)
      .filter(Boolean);

    // Get currently active file
    const activeFile = this.app.workspace.getActiveFile();
    const activePath = activeFile ? activeFile.path : null;

    // Update all file explorer elements
    document.querySelectorAll(".nav-file-title").forEach(el => {
      const path = el.getAttribute("data-path");

      // Remove all classes first
      el.classList.remove("open-in-tab", "active-tab");

      if (openPaths.includes(path)) {
        if (path === activePath) {
          // Active file — special class
          el.classList.add("active-tab");
        } else {
          // Open but not active
          el.classList.add("open-in-tab");
        }
      }
    });
  }
};
