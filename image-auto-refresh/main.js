const { Plugin } = require('obsidian');

const IMAGE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'
]);

class ImageAutoRefreshPlugin extends Plugin {
    async onload() {
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (!file || !file.extension) return;
                if (!IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) return;
                this.refreshImages(file);
            })
        );
    }

    refreshImages(file) {
        const timestamp = Date.now();
        const resourcePath = this.app.vault.getResourcePath(file);
        const baseResource = resourcePath.split('?')[0];

        document.querySelectorAll('img').forEach((img) => {
            const baseSrc = (img.getAttribute('src') || '').split('?')[0];
            if (baseSrc === baseResource) {
                img.onload = () => {
                    // Force Obsidian to recalculate layout after the new image loads.
                    // Without this, CodeMirror keeps stale line-height calculations,
                    // causing visual glitches especially on tall images.
                    window.dispatchEvent(new Event('resize'));
                };
                img.src = baseResource + '?t=' + timestamp;
            }
        });
    }
}

module.exports = ImageAutoRefreshPlugin;