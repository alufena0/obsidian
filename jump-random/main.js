const { Plugin, MarkdownView, Notice } = require('obsidian');

module.exports = class JumpRandomPlugin extends Plugin {
    onload() {
        this._lastJump = 0;

        // ── Hold-to-repeat configuration ─────────────────────────────────────
        // Must match the hotkey you set in Settings → Hotkeys.
        // Change these four constants if you ever reassign the shortcut.
        const HOLD_KEY   = '4';      // the bare key
        const HOLD_ALT   = true;
        const HOLD_CTRL  = false;
        const HOLD_SHIFT = false;

        // Fires jumpRandom() on every OS key-repeat event (i.e., while held).
        // evt.repeat is false on the initial press, so that press is still
        // handled normally by the command below (which fires on keyup).
        this.registerDomEvent(document, 'keydown', (evt) => {
            if (!evt.repeat)                    return;
            if (evt.key !== HOLD_KEY)           return;
            if (!!evt.altKey   !== HOLD_ALT)    return;
            if (!!evt.ctrlKey  !== HOLD_CTRL)   return;
            if (!!evt.shiftKey !== HOLD_SHIFT)  return;
            evt.preventDefault();
            this.jumpRandom();
        });
        // ─────────────────────────────────────────────────────────────────────

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
        // Throttle: ignore calls faster than 250 ms apart.
        // Keeps OS key-repeat at ~4 jumps/s — responsive but not chaotic.
        const now = Date.now();
        if (now - this._lastJump < 250) return;
        this._lastJump = now;

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
            const pos = { line: randomLine, ch: 0 };

            // Move cursor to the start of the line
            editor.setCursor(pos);

            // Center the viewport on the jumped line
            editor.scrollIntoView({ from: pos, to: pos }, true);

            // Focus the editor
            editor.focus();
        } catch (error) {
            console.error('Error running Jump Random:', error);
            new Notice('Error jumping randomly. Check the console for details.');
        }
    }
};

/* nosourcemap */
