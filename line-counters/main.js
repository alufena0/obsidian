const { Plugin } = require('obsidian');

module.exports = class LineCounterPlugin extends Plugin {
    statusBarItem = null;

    async onload() {
        // Create status bar item
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('plugin-line-counter');

        // Update count when active file changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateLineCount();
            })
        );

        // Update count when content changes
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                this.updateLineCount();
            })
        );

        // Update count on a short interval
        this.registerInterval(
            window.setInterval(() => {
                this.updateLineCount();
            }, 100)
        );

        // Update on init
        this.updateLineCount();
    }

    onunload() {}

    updateLineCount() {
        const activeView = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);

        if (activeView && activeView.editor) {
            const editor = activeView.editor;
            const selection = editor.getSelection();

            if (selection && selection.length > 0) {
                // Show selected line count
                const selectedLines = this.countSelectedLines(selection);
                const formattedCount = this.formatNumber(selectedLines);
                const lineText = selectedLines === 1 ? 'line' : 'lines';
                this.statusBarItem.setText(`${formattedCount} ${lineText}`);
            } else {
                // Show total line count
                const lineCount = editor.lineCount();
                const formattedCount = this.formatNumber(lineCount);
                const lineText = lineCount === 1 ? 'line' : 'lines';
                this.statusBarItem.setText(`${formattedCount} ${lineText}`);
            }
        } else {
            this.statusBarItem.setText('');
        }
    }

    countSelectedLines(selection) {
        // Count line breaks in selected text
        const lineBreaks = (selection.match(/\n/g) || []).length;
        // Number of lines = line breaks + 1
        return lineBreaks + 1;
    }

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
};
/* nosourcemap */
