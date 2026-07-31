const { Plugin, Menu } = require('obsidian');

const STYLE_ID = 'click-to-edit-image-styles';

const CSS = `
.internal-embed.image-embed .embed-actions {
    display: none !important;
    pointer-events: none !important;
}
.cm-line:has(.internal-embed.image-embed) {
    cursor: text !important;
}
`;

module.exports = class ClickToEditImage extends Plugin {
    async onload() {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);

        // CLIQUE ESQUERDO
        this.registerDomEvent(document, 'click', (evt) => {
            const cmContent = evt.target.closest?.('.cm-content');
            if (!cmContent) return;
            const clickedLine = evt.target.closest('.cm-line');
            let found = clickedLine?.querySelector('.internal-embed.image-embed') || null;
            if (!found) {
                const allEmbeds = cmContent.querySelectorAll('.internal-embed.image-embed');
                if (!allEmbeds || allEmbeds.length === 0) return;
                for (const embed of allEmbeds) {
                    const rect = embed.getBoundingClientRect();
                    if (evt.clientY >= rect.top && evt.clientY <= rect.bottom) { found = embed; break; }
                }
                if (!found) {
                    let closestDist = 80;
                    for (const embed of allEmbeds) {
                        const rect = embed.getBoundingClientRect();
                        const dist = Math.abs(evt.clientY - (rect.top + rect.height / 2));
                        if (dist < closestDist) { closestDist = dist; found = embed; }
                    }
                }
            }
            if (!found) return;
            const editBtn = found.querySelector('.edit-block-button');
            if (!editBtn) return;
            evt.preventDefault();
            evt.stopPropagation();
            editBtn.click();
        }, false);

        // CLIQUE DIREITO
        this.registerDomEvent(document, 'contextmenu', (evt) => {
            const img = evt.target.closest?.('.cm-content img');
            if (!img) return;
            const embed = img.closest('.internal-embed');
            if (!embed) return;
            const src = embed.getAttribute('src');
            if (!src) return;
            const activeFile = this.app.workspace.getActiveFile();
            const file = this.app.metadataCache.getFirstLinkpathDest(src, activeFile?.path ?? '');
            if (!file) return;
            evt.preventDefault();
            evt.stopPropagation();
            evt.stopImmediatePropagation();
            const menu = new Menu();
            this.app.workspace.trigger('file-menu', menu, file, 'more-options');
            menu.showAtMouseEvent(evt);
        }, true);

        // AUTO-ESC NO SCROLL — salva e restaura scrollTop em vez de depender do evento sintético
        this.registerDomEvent(document, 'wheel', (evt) => {
            const scroller = evt.target.closest?.('.cm-scroller');
            if (!scroller) return;
            const openEmbedLine = scroller.querySelector('.cm-line.cm-active .cm-formatting-embed');
            if (!openEmbedLine) return;

            const savedScrollTop = scroller.scrollTop;

            const escEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true,
            });
            document.activeElement?.dispatchEvent(escEvent);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    scroller.scrollTop = savedScrollTop;
                });
            });
        }, { passive: true, capture: true });
    }

    onunload() {
        document.getElementById(STYLE_ID)?.remove();
    }
};
