const { Plugin } = require('obsidian');

module.exports = class MaxFontZoomPlugin extends Plugin {
    // Font size settings
    fontSizes = { max: 30, default: 18 };
    wheelHandler = null;

    async onload() {
        // Create handler with bind only once
        this.wheelHandler = this.handleWheel.bind(this);
        document.addEventListener('wheel', this.wheelHandler, { passive: false, capture: true });
    }

    onunload() {
        document.removeEventListener('wheel', this.wheelHandler, { passive: false, capture: true });
        this.wheelHandler = null;
    }

    handleWheel(event) {
        if (!event.ctrlKey) return;

        if (event.deltaY !== 0) {
            event.preventDefault();
            const size = event.deltaY < 0 ? this.fontSizes.max : this.fontSizes.default;
            this.setFontSize(size);
        }
    }

    setFontSize(size) {
        try {
            const exactSize = Number(size);

            if (exactSize === this.fontSizes.default) {
                this.app.vault.setConfig("baseFontSize", 18);
            } else {
                this.app.vault.setConfig("baseFontSize", exactSize);
            }

            setTimeout(() => {
                const currentSize = this.app.vault.getConfig("baseFontSize");
                if (exactSize === this.fontSizes.default && currentSize !== 18) {
                    this.app.vault.setConfig("baseFontSize", "18");
                    if (this.app.vault.getConfig("baseFontSize") !== 18) {
                        this.app.vault.setConfig("baseFontSize", 18.01);
                    }
                }
            }, 50);

        } catch (error) {
            console.error(`Error setting font size to ${size}px:`, error);
        }
    }
};
/* nosourcemap */
