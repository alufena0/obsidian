/*
 * Copy as PNG — Obsidian plugin
 *
 * Renders the active note's Reading View (Mermaid diagrams, syntax-highlighted
 * code blocks, embeds, everything) off-screen and copies it to the clipboard
 * as a PNG.
 *
 * Capture engine: modern-screenshot (domToCanvas), bundled dependency-free
 * below as a global on `window.__modernScreenshot` is NOT used here — this
 * file expects modern-screenshot's `domToCanvas` to be available via the
 * `MODERN_SCREENSHOT` require below. If you rebuild with esbuild, keep that
 * import; this file is otherwise plain, unminified JS on purpose so it's
 * debuggable without a source map.
 *
 * Written from scratch, not bundled/minified, per Anderson's request — easier
 * to read and step through than the esbuild output.
 */

const { Plugin, MarkdownView, MarkdownRenderer, MarkdownRenderChild, Notice } = require("obsidian");
const { domToCanvas } = require("modern-screenshot");

const CAPTURE_WIDTH = 1080;

// Elements whose height is intrinsic (a product of their own content, not of
// text flow) — their pinned height must survive the "unpin" pass below.
const KEEP_PINNED_HEIGHT_TAGS = new Set([
  "IMG", "VIDEO", "CANVAS", "SVG", "IFRAME", "EMBED", "OBJECT",
  "INPUT", "TEXTAREA", "SELECT", "PROGRESS", "METER", "HR",
]);

// Keeps Mermaid diagrams from overflowing the capture width (which would
// otherwise get clipped at CAPTURE_WIDTH instead of scaling down to fit).
//
// Adapted from Anderson's Live Preview snippet (`.cm-embed-block.cm-lang-mermaid`)
// — those selectors target CodeMirror's editor widget wrapper and don't exist
// in our DOM at all, because we render via MarkdownRenderer.render (Reading
// View), not Live Preview. In Reading View a Mermaid block is just a `.mermaid`
// div holding the SVG directly, so the selectors below target that instead.
// Scoped to our own container class so it never leaks into the user's real
// vault-wide CSS snippets.
const MERMAID_WRAP_CSS = `
.copy-as-png-container .mermaid,
.copy-as-png-container .language-mermaid {
  overflow-x: hidden !important;
  max-width: 100% !important;
}
.copy-as-png-container .mermaid svg,
.copy-as-png-container .language-mermaid svg {
  max-width: 100% !important;
  width: 100% !important;
  height: auto !important;
}
`;

class CopyAsPngPlugin extends Plugin {
  async onload() {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, _editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle("Copy note as PNG")
            .setIcon("image")
            .onClick(() => this.copyActiveViewAsPng(view));
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file.extension !== "md") return;
        menu.addItem((item) => {
          item
            .setTitle("Copy note as PNG")
            .setIcon("image")
            .onClick(async () => this.copyFileAsPng(file));
        });
      })
    );

    this.addRibbonIcon("image", "Copy note as PNG", async () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || !view.file) {
        new Notice("No markdown note is open.");
        return;
      }
      await this.copyFileAsPng(view.file);
    });
  }

  async copyActiveViewAsPng(view) {
    if (!view || !view.file) {
      new Notice("No file associated with this view.");
      return;
    }
    await this.copyFileAsPng(view.file);
  }

  cssVar(name, fallback) {
    return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
  }

  async copyFileAsPng(file) {
    new Notice("Rendering note...");

    const { wrap, inner } = this.buildOffscreenContainer();
    document.body.appendChild(wrap);

    try {
      const markdown = await this.app.vault.cachedRead(file);
      const renderChild = new MarkdownRenderChild(inner);
      await MarkdownRenderer.render(this.app, markdown, inner, file.path, renderChild);

      await this.waitForRender(inner);

      // Pin the inner container's height to what its children actually
      // occupy, BEFORE capture. This is the piece our earlier attempts were
      // missing: without it, the container's real layout height can end up
      // taller than the content (e.g. an inherited min-height from Obsidian's
      // real .markdown-reading-view rules, which target 100% of whatever
      // containing block a `position: fixed` element resolves to — the
      // viewport). That inflated height is what left a leftover band at the
      // bottom regardless of which block was actually last in the note.
      const contentHeight = this.measureContentHeight(inner);
      if (contentHeight > 0) {
        inner.style.height = `${contentHeight}px`;
      }

      const bg = this.cssVar("--background-primary", "#ffffff");
      const canvas = await this.renderThemedCanvas(wrap, bg);

      const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
      if (!blob) throw new Error("canvas.toBlob returned null");

      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      new Notice("Note copied to clipboard as PNG!");
    } catch (err) {
      console.error("[copy-as-png]", err);
      new Notice(`Copy as PNG failed: ${err.message}`, 10000);
    } finally {
      wrap.remove();
    }
  }

  // ---- offscreen container -------------------------------------------------

  buildOffscreenContainer() {
    const wrap = document.body.createDiv({ cls: "copy-as-png-container markdown-reading-view" });
    wrap.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: -100000px",
      `width: ${CAPTURE_WIDTH}px`,
      "height: auto",
      "min-height: 0",
      "max-height: none",
      "z-index: 9999",
      "pointer-events: none",
      // Obsidian themes commonly set `container-type: inline-size` on
      // .markdown-reading-view to support the "Readable line length" setting.
      // That makes the text column auto-narrow via CSS container queries
      // regardless of the width we set below — neutralize it.
      "container-type: normal !important",
    ].join(";");

    const inner = wrap.createDiv({ cls: "markdown-preview-view markdown-rendered" });
    inner.style.cssText = [
      "padding: 16px 24px",
      "max-width: none",
      "width: 100%",
      "height: auto",
      "min-height: 0",
      "max-height: none",
    ].join(";");

    const mermaidStyle = wrap.createEl("style");
    mermaidStyle.textContent = MERMAID_WRAP_CSS;

    return { wrap, inner };
  }

  // Walk the direct children and take the furthest-down bottom edge, exactly
  // like the reference plugins do — this is robust to whatever inflated the
  // container's OWN bounding rect (min-height, collapsed flex behavior,
  // etc.), because it never looks at the container's own rect at all.
  measureContentHeight(container) {
    const containerTop = container.getBoundingClientRect().top;
    let bottom = 0;

    for (const child of Array.from(container.children)) {
      if (child.tagName === "STYLE") continue;
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const style = getComputedStyle(child);
      const marginBottom = parseFloat(style.marginBottom) || 0;
      bottom = Math.max(bottom, rect.bottom - containerTop + marginBottom);
    }

    return Math.ceil(bottom);
  }

  // ---- render waits ----------------------------------------------------

  async waitForRender(container) {
    const images = Array.from(container.querySelectorAll("img"));
    await Promise.allSettled(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          })
      )
    );

    await this.waitForMermaid(container);
    await this.waitForCodeblockDecoration(container);
    await new Promise((r) => setTimeout(r, 400));
  }

  waitForMermaid(container) {
    return new Promise((resolve) => {
      if (!container.querySelector(".language-mermaid, .mermaid")) {
        resolve();
        return;
      }
      let ticks = 0;
      const interval = setInterval(() => {
        const nodes = container.querySelectorAll(".language-mermaid, .mermaid");
        const done = Array.from(nodes).every((n) => n.querySelector("svg") !== null);
        ticks++;
        if (done || ticks > 40) {
          clearInterval(interval);
          setTimeout(resolve, 200);
        }
      }, 150);
    });
  }

  waitForCodeblockDecoration(container) {
    return new Promise((resolve) => {
      if (!container.querySelector("pre > code, .code-block, pre[class*='language-']")) {
        resolve();
        return;
      }
      let lastLength = -1;
      let stableTicks = 0;
      let totalTicks = 0;
      const interval = setInterval(() => {
        const length = container.innerHTML.length;
        if (length === lastLength) stableTicks++;
        else {
          stableTicks = 0;
          lastLength = length;
        }
        totalTicks++;
        if (stableTicks >= 3 || totalTicks > 30) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  // ---- capture -----------------------------------------------------------

  // modern-screenshot pins every cloned element's used width AND height as
  // inline styles. Text metrics inside the rasterized <foreignObject> aren't
  // bit-identical to the live document, so a line can wrap one word earlier
  // there; with the block's height pinned, the extra line overflows and the
  // next block paints over it. Un-pin height on text-bearing containers so
  // reflow grows the block instead of overlapping. Width stays pinned — it's
  // what preserves line breaks matching the real column.
  unpinClonedTextHeights(node) {
    if (!(node instanceof HTMLElement)) return;
    if (!node.style.height && !node.style.getPropertyValue("block-size")) return;
    if (KEEP_PINNED_HEIGHT_TAGS.has(node.tagName)) return;
    if (!node.textContent || !node.textContent.trim()) return;
    node.style.removeProperty("height");
    node.style.removeProperty("block-size");
  }

  // With heights un-pinned the content may end lower than expected, so render
  // with bottom headroom, then crop back to the real painted content.
  canvasHeadroom(cssHeight) {
    return Math.min(600, Math.max(96, Math.round(cssHeight * 0.08)));
  }

  async renderThemedCanvas(wrap, bg) {
    const rect = wrap.getBoundingClientRect();
    const cssWidth = Math.ceil(rect.width);
    const cssHeight = Math.ceil(rect.height);
    const padBottomCss = parseFloat(getComputedStyle(wrap).paddingBottom) || 0;

    const canvas = await domToCanvas(wrap, {
      scale: 1,
      backgroundColor: bg,
      width: cssWidth,
      height: cssHeight + this.canvasHeadroom(cssHeight),
      onCloneEachNode: (node) => {
        this.unpinClonedTextHeights(node);
        return true;
      },
    });

    const effScale = cssWidth > 0 ? canvas.width / cssWidth : 1;
    return this.cropCanvasBottom(canvas, padBottomCss * effScale);
  }

  // Scan up from the bottom for the last non-background row and crop to it
  // plus the wrap's own bottom padding.
  //
  // Two changes from our earlier version, both ported from the reference
  // plugin's implementation:
  //  1. The reference color is sampled from the canvas's OWN bottom-right
  //     pixel (guaranteed to sit in the headroom, i.e. guaranteed background)
  //     instead of computed from the `--background-primary` CSS variable
  //     through a throwaway fillStyle. Comparing the canvas against itself
  //     sidesteps any mismatch between how the browser parses/renders a CSS
  //     color string and what modern-screenshot actually painted — color
  //     management, alpha compositing, or scale-dependent rounding could
  //     make those two values differ by more than a few units even though
  //     they're "the same" color.
  //  2. Tolerance widened from 4 to 12, and all 4 channels (RGBA) are
  //     compared instead of just RGB — anti-aliased edges and sub-pixel
  //     blending can land a few units off a flat background even when nothing
  //     is actually there.
  cropCanvasBottom(canvas, padBottomDevice) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || w === 0 || h === 0) return canvas;

    let ref;
    try {
      ref = ctx.getImageData(w - 1, h - 1, 1, 1).data;
    } catch {
      return canvas;
    }
    const tolerance = 12;
    const chunkRows = 256;
    let contentBottom = 0;

    outer: for (let yEnd = h; yEnd > 0; yEnd -= chunkRows) {
      const yStart = Math.max(0, yEnd - chunkRows);
      let data;
      try {
        data = ctx.getImageData(0, yStart, w, yEnd - yStart).data;
      } catch {
        return canvas;
      }
      const rowBytes = w * 4;
      for (let y = yEnd - 1; y >= yStart; y--) {
        const base = (y - yStart) * rowBytes;
        for (let i = base; i < base + rowBytes; i += 4) {
          if (
            Math.abs(data[i] - ref[0]) > tolerance ||
            Math.abs(data[i + 1] - ref[1]) > tolerance ||
            Math.abs(data[i + 2] - ref[2]) > tolerance ||
            Math.abs(data[i + 3] - ref[3]) > tolerance
          ) {
            contentBottom = y + 1;
            break outer;
          }
        }
      }
    }

    if (contentBottom === 0) return canvas;

    const target = Math.min(h, contentBottom + Math.round(padBottomDevice));
    if (target >= h) return canvas;

    const out = canvas.ownerDocument.createElement("canvas");
    out.width = w;
    out.height = target;
    const outCtx = out.getContext("2d");
    if (!outCtx) return canvas;
    outCtx.drawImage(canvas, 0, 0, w, target, 0, 0, w, target);
    return out;
  }
}

module.exports = CopyAsPngPlugin;
