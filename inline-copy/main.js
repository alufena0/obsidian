const { Plugin, Notice } = require('obsidian');

module.exports = class InlineCopyPlugin extends Plugin {
    async onload() {
        this._handler = (evt) => {
            const t = evt.target;
            if (!t) return;
            const text = this._getText(t);
            if (!text) return;

            try { require('electron').clipboard.writeText(text); }
            catch(e) { navigator.clipboard.writeText(text).catch(() => {}); }

            new Notice('Copied to clipboard', 1800);
            this._flash(t);
        };

        document.addEventListener('click', this._handler, true);
    }

    _getText(t) {
        // CodeBlock Customizer wrapper (Source + Live Preview + Reading)
        if (t.classList.contains('codeblock-customizer-inline-code-wrapper')) {
            const inner = t.querySelector('code') || t.querySelector('.cm-inline-code') || t;
            return (inner.innerText || inner.textContent || '').replace(/^`+|`+$/g, '').trim();
        }

        // Reading mode
        if (t.tagName === 'CODE' && !t.closest('pre')) {
            return (t.innerText || t.textContent || '').trim();
        }

        if (!t.classList.contains('cm-inline-code')) return null;

        // Live Preview / Source mode — content span (no backtick)
        if (!t.classList.contains('cm-formatting')) {
            return (t.innerText || t.textContent || '').trim();
        }

        // Source mode — clicked on backtick, find content in both directions
        const parent = t.parentElement;
        if (!parent) return null;
        const children = Array.from(parent.children);
        const idx = children.indexOf(t);

        // Forward (opening backtick)
        const fwd = [];
        for (let i = idx + 1; i < children.length; i++) {
            const s = children[i];
            if (!s.classList.contains('cm-inline-code')) break;
            if (s.classList.contains('cm-formatting')) break;
            fwd.push(s.innerText || s.textContent || '');
        }
        if (fwd.length) return fwd.join('').trim();

        // Backward (closing backtick)
        const bwd = [];
        for (let i = idx - 1; i >= 0; i--) {
            const s = children[i];
            if (!s.classList.contains('cm-inline-code')) break;
            if (s.classList.contains('cm-formatting')) break;
            bwd.unshift(s.innerText || s.textContent || '');
        }
        return bwd.join('').trim() || null;
    }

    _flash(t) {
        const orig = t.style.cssText;
        t.style.cssText += ';background:var(--color-accent)!important;color:var(--text-on-accent)!important;transition:background 0.15s;';
        setTimeout(() => { t.style.cssText = orig; }, 500);
    }

    onunload() {
        document.removeEventListener('click', this._handler, true);
    }
};
