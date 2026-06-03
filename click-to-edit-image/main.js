const { Plugin, Menu } = require('obsidian');

module.exports = class ClickToEditImage extends Plugin {
    async onload() {
        this.registerDomEvent(document, 'click', (evt) => {
            const target = evt.target;
            const isCmContent = target.classList.contains('cm-content');
            const isCmLine = target.classList.contains('cm-line');
            if (!isCmContent && !isCmLine) return;

            const cmContent = target.closest('.cm-content');
            if (!cmContent) return;

            let found = null;

            if (isCmLine) {
                // Clicked a specific line — only activate if that line HAS an embed
                found = target.querySelector('.internal-embed');
                if (!found) return; // header, text, etc. → ignore
            } else {
                // Clicked the general cm-content → search by Y position
                const allEmbeds = cmContent.querySelectorAll('.internal-embed');
                if (!allEmbeds || allEmbeds.length === 0) return;

                for (const embed of allEmbeds) {
                    const rect = embed.getBoundingClientRect();
                    if (evt.clientY >= rect.top && evt.clientY <= rect.bottom) {
                        found = embed;
                        break;
                    }
                }

                // Fallback with distance limit (max 80px)
                if (!found) {
                    let closestDist = 80;
                    for (const embed of allEmbeds) {
                        const rect = embed.getBoundingClientRect();
                        const centerY = rect.top + rect.height / 2;
                        const dist = Math.abs(evt.clientY - centerY);
                        if (dist < closestDist) {
                            closestDist = dist;
                            found = embed;
                        }
                    }
                }
            }

            if (!found) return;
            const editBtn = found.querySelector('.edit-block-button');
            if (!editBtn) return;
            editBtn.click();
        }, false);

        // RIGHT CLICK — unchanged
        this.registerDomEvent(document, 'contextmenu', (evt) => {
            const target = evt.target;
            const img = target.closest('.cm-content img');
            if (!img) return;
            const internalEmbed = img.closest('.internal-embed');
            if (!internalEmbed) return;
            const src = internalEmbed.getAttribute('src');
            if (!src) return;
            const activeFile = this.app.workspace.getActiveFile();
            const sourcePath = activeFile ? activeFile.path : '';
            const file = this.app.metadataCache.getFirstLinkpathDest(src, sourcePath);
            if (!file) return;
            evt.preventDefault();
            evt.stopPropagation();
            evt.stopImmediatePropagation();
            const menu = new Menu();
            this.app.workspace.trigger('file-menu', menu, file, 'more-options');
            menu.showAtMouseEvent(evt);
        }, true);
    }

    onunload() {}
};
