'use strict';

var obsidian = require('obsidian');

class CopyImageContextMenuPlugin extends obsidian.Plugin {

  async onload() {
    console.log('copy-image-context-menu: loaded');

    const SELECTOR = '.markdown-preview-view, .cm-content, .canvas-node-content, .markdown-reading-view';

    const onMousedown = (evt) => {
      if (evt.button !== 2) return;
      const img = evt.target?.closest?.('img');
      if (!img || !img.closest(SELECTOR)) return;
      evt.stopImmediatePropagation();
    };

    const onContextmenu = (evt) => {
      const img = evt.target?.closest?.('img');
      if (!img || !img.closest(SELECTOR)) return;

      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();

      const menu = new obsidian.Menu();
      const file = this._resolve(img);

      menu.addItem(item =>
        item.setTitle('Copy image').setIcon('copy').onClick(() => this._copy(img.src))
      );

      if (file) {
        menu.addSeparator();
        this.app.workspace.trigger('file-menu', menu, file, 'copy-image-plugin', null);
      }

      menu.showAtMouseEvent(evt);
    };

    window.addEventListener('mousedown',   onMousedown,   { capture: true });
    window.addEventListener('contextmenu', onContextmenu, { capture: true });

    this.register(() => {
      window.removeEventListener('mousedown',   onMousedown,   { capture: true });
      window.removeEventListener('contextmenu', onContextmenu, { capture: true });
    });
  }

  _resolve(img) {
    try {
      const src = img.getAttribute('src') || '';
      if (!src) return null;
      if (src.startsWith('app://')) {
        const pathname = decodeURIComponent(new URL(src).pathname);
        return this.app.vault.getFiles().find(f =>
          pathname.endsWith('/' + f.path) || pathname === f.path
        ) ?? null;
      }
      const f = this.app.vault.getAbstractFileByPath(src);
      if (f instanceof obsidian.TFile) return f;
    } catch (_) {}
    return null;
  }

  async _copy(src) {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        new obsidian.Notice('Image copied to clipboard');
        return;
      } catch (_) {}

      const bmp    = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width  = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);

      canvas.toBlob(async (png) => {
        if (!png) { new obsidian.Notice('Failed to generate PNG.'); return; }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
          new obsidian.Notice('Image copied to clipboard');
        } catch (e) {
          new obsidian.Notice('Clipboard error: ' + e.message);
        }
      }, 'image/png');

    } catch (e) {
      new obsidian.Notice('Error: ' + e.message);
    }
  }

  onunload() {
    console.log('copy-image-context-menu: unloaded');
  }
}

module.exports = CopyImageContextMenuPlugin;
