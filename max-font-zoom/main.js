const { Plugin } = require('obsidian');

module.exports = class MaxFontZoomPlugin extends Plugin {
    // Maximum font size allowed by Obsidian
    maxFontSize = 30;
    wheelHandler = null;

    async onload() {
        // Create handler once to save memory
        this.wheelHandler = this.handleWheel.bind(this);
        document.addEventListener('wheel', this.wheelHandler, { passive: false, capture: true });
    }

    onunload() {
        // Remove event using the same handler reference
        if (this.wheelHandler) {
            document.removeEventListener('wheel', this.wheelHandler, { passive: false, capture: true });
            this.wheelHandler = null;
        }
    }

    handleWheel(event) {
        // Check if Ctrl is pressed and scroll is upward
        if (event.ctrlKey && event.deltaY < 0) {
            event.preventDefault();
            this.setMaxFontSize();
        }
    }

    setMaxFontSize() {
        try {
            this.app.vault.setConfig("baseFontSize", this.maxFontSize);
        } catch (error) {
            console.error("Error setting maximum font size:", error);
        }
    }
};

/* nosourcemap */
