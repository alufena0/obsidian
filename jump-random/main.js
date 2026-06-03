const { Plugin, MarkdownView, Notice } = require('obsidian');

module.exports = class JumpRandomPlugin extends Plugin {
    onload() {
        // Ribbon icon
        this.addRibbonIcon('dice', 'Jump randomly in file', () =>
            this.jumpRandom()
        );

        // Command with assignable hotkey (set in Settings → Hotkeys)
        this.addCommand({
            id: 'jump-random',
            name: 'Jump to a random location in the file',
            callback: () => this.jumpRandom(),
        });
    }

    onunload() {}

    jumpRandom() {
        try {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) {
                new Notice('No active Markdown file. Open a .md file and try again.');
                return;
            }

            const editor = view.editor;
            const lineCount = editor.lineCount();

            if (lineCount === 0) {
                new Notice('File is empty.');
                return;
            }

            // Pick a random line (0 .. lineCount-1)
            const randomLine = Math.floor(Math.random() * lineCount);

            // Move cursor to the start of the line
            editor.setCursor({ line: randomLine, ch: 0 });

            // Focus the editor
            view.editor.focus();
        } catch (error) {
            console.error('Error running Jump Random:', error);
            new Notice('Error jumping randomly. Check the console for details.');
        }
    }
};

/* nosourcemap */
