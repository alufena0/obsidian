'use strict';

var obsidian = require('obsidian');

const SUPPORTED = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
  'mp4', 'webm', 'ogv', 'mov', 'mkv', 'avi',
]);

const DEFAULT_SETTINGS = {
  sortOrder: 'name-asc', // 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'
};

class SortedImportSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new obsidian.Setting(containerEl)
      .setName('Sort order')
      .setDesc('How imported files are ordered before inserting embeds.')
      .addDropdown(drop => drop
        .addOption('name-asc',  'Name (A → Z)')
        .addOption('name-desc', 'Name (Z → A)')
        .addOption('date-asc',  'Date modified (oldest first)')
        .addOption('date-desc', 'Date modified (newest first)')
        .setValue(this.plugin.settings.sortOrder)
        .onChange(async (value) => {
          this.plugin.settings.sortOrder = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

class SortedImportPlugin extends obsidian.Plugin {

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SortedImportSettingTab(this.app, this));

    this.addRibbonIcon('file-input', 'Insert embeds', () => {
      this.openPicker();
    });

    this.addCommand({
      id: 'sorted-import-open',
      name: 'Insert embeds in alphabetical order',
      callback: () => this.openPicker(),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  openPicker() {
    const input = document.createElement('input');
    input.type     = 'file';
    input.multiple = true;
    input.accept   = [...SUPPORTED].map(e => '.' + e).join(',');

    input.addEventListener('change', async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return;
      await this.importFiles(files);
    });

    input.click();
  }

  async importFiles(rawFiles) {
    const files = rawFiles.slice().sort((a, b) => {
      switch (this.settings.sortOrder) {
        case 'name-desc':
          return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'date-asc':
          return a.lastModified - b.lastModified;
        case 'date-desc':
          return b.lastModified - a.lastModified;
        default: // name-asc
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) {
      new obsidian.Notice('Open a note first.');
      return;
    }

    const editor = view.editor;
    const note   = view.file;
    const attachFolder = await this.resolveAttachFolder(note);
    const embeds = [];
    const progressNotice = new obsidian.Notice(`Importing 0 / ${files.length}…`, 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      progressNotice.setMessage(`Importing ${i + 1} / ${files.length}… (${file.name})`);

      const ext = file.name.split('.').pop().toLowerCase();
      if (!SUPPORTED.has(ext)) {
        new obsidian.Notice(`Skipping unsupported file "${file.name}"`);
        continue;
      }

      try {
        const dest = await this.saveFile(file, attachFolder);
        const linkText = this.app.metadataCache.fileToLinktext(dest, note.path, true);
        embeds.push(`![[${linkText}]]`);
      } catch (e) {
        new obsidian.Notice(`Failed to import "${file.name}": ${e.message}`);
        console.error('sorted-import error', e);
      }
    }

    progressNotice.hide();
    if (!embeds.length) return;

    editor.replaceSelection(embeds.join('\n\n'));
    new obsidian.Notice(`Inserted ${embeds.length} embed(s)`);
  }

  // Save a browser File object to the vault and return the TFile
  async saveFile(file, folder) {
    const buf = await file.arrayBuffer();

    // Resolve a unique path — mirrors Obsidian native collision behaviour
    const target = this.resolveUniquePath(file.name, folder);

    // Create parent folders if needed
    await this.ensureFolder(folder);

    return await this.app.vault.createBinary(target, buf);
  }

  // Returns the first non-colliding vault path for a given filename.
  // Pattern: 'Untitled16.png' -> 'Untitled16 1.png' -> 'Untitled16 2.png' ...
  resolveUniquePath(filename, folder) {
    const dotIndex = filename.lastIndexOf('.');
    const base = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;
    const ext  = dotIndex !== -1 ? filename.slice(dotIndex) : '';

    const candidate = (n) => {
      const name = n === 0 ? `${base}${ext}` : `${base} ${n}${ext}`;
      return folder ? `${folder}/${name}` : name;
    };

    let n = 0;
    while (this.app.vault.getAbstractFileByPath(candidate(n))) {
      n++;
    }

    return candidate(n);
  }

  async ensureFolder(path) {
    if (!path) return;
    const exists = this.app.vault.getAbstractFileByPath(path);
    if (!exists) await this.app.vault.createFolder(path);
  }

  async resolveAttachFolder(note) {
    // @ts-ignore — internal API, stable across versions
    const raw = this.app.vault.getConfig('attachmentFolderPath') ?? '';

    if (!raw || raw === '/') return '';
    if (raw.startsWith('./')) {
      const noteDirParts = note.path.split('/');
      noteDirParts.pop();
      const noteDir = noteDirParts.join('/');
      const rel     = raw.slice(2);
      return noteDir ? `${noteDir}/${rel}` : rel;
    }
    return raw;
  }

  onunload() {}
}

module.exports = SortedImportPlugin;
