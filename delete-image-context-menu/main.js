'use strict';

var obsidian = require('obsidian');

class DeleteImageContextMenuPlugin extends obsidian.Plugin {

  async onload() {
    console.log('delete-image-context-menu: loaded');

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof obsidian.TFile)) return;
        if (!['jpg','jpeg','png','webp','gif','bmp','svg','avif'].includes(file.extension.toLowerCase())) return;

        menu.addItem(item =>
          item.setTitle('Delete').setIcon('trash').onClick(async () => {
            await this._deleteAndClean(file);
          })
        );
      })
    );
  }

  async _deleteAndClean(file) {
    const filename = file.name;

    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Matches only the embed syntax — the line itself survives as an empty line.
    const embedRegex = new RegExp(
      `!\\[\\[${escaped}(?:\\|[^\\]]*)?\\]\\]`,
      'g'
    );

    const markdownFiles = this.app.vault.getMarkdownFiles();
    for (const md of markdownFiles) {
      const content = await this.app.vault.read(md);
      if (!embedRegex.test(content)) continue;
      embedRegex.lastIndex = 0;
      const cleaned = content.replace(embedRegex, '');
      await this.app.vault.modify(md, cleaned);
    }

    try {
      await this.app.vault.trash(file, true);
    } catch (e) {
      setTimeout(() => new obsidian.Notice('Delete error: ' + e.message, 5000), 200);
      return;
    }
    setTimeout(() => new obsidian.Notice(`${filename} deleted`, 5000), 200);
  }

  onunload() {
    console.log('delete-image-context-menu: unloaded');
  }
}

module.exports = DeleteImageContextMenuPlugin;
