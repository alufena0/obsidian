'use strict';

const { Plugin, PluginSettingTab, Setting } = require('obsidian');

const DEFAULTS = {
    deadzone:      5,
    linear:        0.15,
    quad:          0.001,
    toggleThresh:  6,    // px — if moved less than this before release, becomes toggle
    toggleMs:      300,  // ms — time window to consider a "quick click"
};

class MCSSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Middle Click Scroll' });
        containerEl.createEl('p', {
            text: 'Calibrate the speed curve. Default values mimic native Windows auto-scroll.',
            cls: 'setting-item-description',
        });

        new Setting(containerEl)
            .setName('Dead zone (px)')
            .setDesc('Minimum distance the cursor must move from the click point before scrolling starts. Default: 5')
            .addSlider(s => s.setLimits(0, 30, 1).setValue(this.plugin.settings.deadzone).setDynamicTooltip()
                .onChange(async v => { this.plugin.settings.deadzone = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName('Base speed (linear)')
            .setDesc('Linear component of the speed. Default: 0.15')
            .addSlider(s => s.setLimits(0, 1, 0.01).setValue(this.plugin.settings.linear).setDynamicTooltip()
                .onChange(async v => { this.plugin.settings.linear = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName('Acceleration (quadratic)')
            .setDesc('How much speed increases as you move the cursor further. Default: 0.001')
            .addSlider(s => s.setLimits(0, 0.02, 0.0005).setValue(this.plugin.settings.quad).setDynamicTooltip()
                .onChange(async v => { this.plugin.settings.quad = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName('Toggle movement threshold (px)')
            .setDesc('If moved less than this before release, activates toggle mode (keeps scrolling). Default: 6')
            .addSlider(s => s.setLimits(0, 30, 1).setValue(this.plugin.settings.toggleThresh).setDynamicTooltip()
                .onChange(async v => { this.plugin.settings.toggleThresh = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName('Toggle time window (ms)')
            .setDesc('If released within this time without much movement, activates toggle mode. Default: 300')
            .addSlider(s => s.setLimits(100, 800, 50).setValue(this.plugin.settings.toggleMs).setDynamicTooltip()
                .onChange(async v => { this.plugin.settings.toggleMs = v; await this.plugin.saveSettings(); }));

        const preview = containerEl.createEl('div', { cls: 'setting-item-description' });
        const s = this.plugin.settings;
        const rows = [20, 40, 60, 100, 150].map(d => {
            const raw = Math.max(d - s.deadzone, 0);
            const vel = raw * s.linear + raw * raw * s.quad;
            return d + 'px -> ' + vel.toFixed(1) + ' px/frame';
        }).join('  |  ');
        preview.setText('Curve: ' + rows);

        new Setting(containerEl)
            .setName('Restore defaults')
            .addButton(btn => btn.setButtonText('Reset').onClick(async () => {
                this.plugin.settings = Object.assign({}, DEFAULTS);
                await this.plugin.saveSettings();
                this.display();
            }));
    }
}

module.exports = class MiddleClickScrollPlugin extends Plugin {

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new MCSSettingTab(this.app, this));

        this.active      = false;
        this.toggleMode  = false;   // true = toggle mode (quick click), false = hold mode
        this.originX     = 0;
        this.originY     = 0;
        this.pressTime   = 0;       // mousedown timestamp
        this.maxMoveDist = 0;       // maximum distance moved since mousedown
        this.velX        = 0;
        this.velY        = 0;
        this.scroller    = null;
        this.rafId       = null;
        this.indicator   = null;

        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp   = this._onMouseUp.bind(this);
        this._onKeyDown   = this._onKeyDown.bind(this);
        this._loop        = this._loop.bind(this);

        this.registerDomEvent(document, 'mousedown', this._onMouseDown, true);
        this.registerDomEvent(window,   'blur',      () => this._deactivate());
    }

    onunload() { this._deactivate(); }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    }

    async saveSettings() { await this.saveData(this.settings); }

    /* —— MOUSE DOWN: start scroll —— */
    _onMouseDown(e) {
        if (e.button !== 1) return;

        const mdSelectors = ['.cm-editor', '.markdown-reading-view', '.markdown-preview-view', '.markdown-source-view'];
        const insideMd = mdSelectors.some(sel => e.target.closest(sel));

        // If already active (toggle mode), any middle click deactivates
        if (this.active) {
            e.preventDefault();
            e.stopPropagation();
            this._deactivate();
            return;
        }

        if (!insideMd) return; // outside MD: let native event through

        e.preventDefault();
        e.stopPropagation();

        const scroller = this._findScrollable(e.target);
        if (!scroller) return;

        this.active       = true;
        this.toggleMode   = false;  // starts as hold; decided on mouseup
        this.originX      = e.clientX;
        this.originY      = e.clientY;
        this.pressTime    = Date.now();
        this.maxMoveDist  = 0;
        this.velX         = 0;
        this.velY         = 0;
        this.scroller     = scroller;

        this._showIndicator(e.clientX, e.clientY);
        document.body.style.cursor = 'all-scroll';

        document.addEventListener('mousemove', this._onMouseMove, true);
        document.addEventListener('mouseup',   this._onMouseUp,   true);
        document.addEventListener('keydown',   this._onKeyDown,   true);

        this.rafId = requestAnimationFrame(this._loop);
    }

    /* —— MOUSE UP: decide hold vs toggle —— */
    _onMouseUp(e) {
        if (e.button !== 1) return;

        const held = Date.now() - this.pressTime;
        const { toggleMs, toggleThresh } = this.settings;

        // Quick click AND little movement → toggle: remove mouseup listener but keep everything running
        if (held <= toggleMs && this.maxMoveDist <= toggleThresh) {
            this.toggleMode = true;
            // Don't deactivate — only remove mouseup listener; future mousedown will deactivate
            document.removeEventListener('mouseup', this._onMouseUp, true);
            return;
        }

        // Normal hold: release button to stop scroll
        this._deactivate();
    }

    /* —— MOUSE MOVE: update velocity and track maximum distance —— */
    _onMouseMove(e) {
        if (!this.active) return;
        const { deadzone, linear, quad } = this.settings;
        const dx = e.clientX - this.originX;
        const dy = e.clientY - this.originY;

        // Track how far moved since press (to detect toggle)
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.maxMoveDist) this.maxMoveDist = dist;

        const rawX = Math.max(Math.abs(dx) - deadzone, 0);
        const rawY = Math.max(Math.abs(dy) - deadzone, 0);
        this.velX = rawX > 0 ? Math.sign(dx) * (rawX * linear + rawX * rawX * quad) : 0;
        this.velY = rawY > 0 ? Math.sign(dy) * (rawY * linear + rawY * rawY * quad) : 0;
        this._updateIndicator(dx, dy);
    }

    /* —— RAF LOOP —— */
    _loop() {
        if (!this.active) return;
        if (this.scroller) {
            this.scroller.scrollLeft += this.velX;
            this.scroller.scrollTop  += this.velY;
        }
        this.rafId = requestAnimationFrame(this._loop);
    }

    /* —— ESC cancels —— */
    _onKeyDown(e) { if (e.key === 'Escape') this._deactivate(); }

    /* —— DEACTIVATE —— */
    _deactivate() {
        if (!this.active) return;
        this.active     = false;
        this.toggleMode = false;
        this.velX       = 0;
        this.velY       = 0;
        this.scroller   = null;
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        this._removeIndicator();
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', this._onMouseMove, true);
        document.removeEventListener('mouseup',   this._onMouseUp,   true);
        document.removeEventListener('keydown',   this._onKeyDown,   true);
    }

    /* —— FIND SCROLLABLE —— */
    _findScrollable(el) {
        let node = el;
        while (node && node !== document.documentElement) {
            if (this._isScrollable(node)) return node;
            node = node.parentElement;
        }
        const fallbacks = ['.cm-scroller', '.markdown-reading-view', '.markdown-preview-view', '.view-content'];
        for (const sel of fallbacks) {
            const found = document.querySelector(sel);
            if (found && this._isScrollable(found)) return found;
        }
        return null;
    }

    _isScrollable(el) {
        const oy = window.getComputedStyle(el).overflowY;
        return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2;
    }

    /* —— VISUAL INDICATOR —— */
    _showIndicator(x, y) {
        const el = document.createElement('div');
        Object.assign(el.style, {
            position: 'fixed', left: x + 'px', top: y + 'px',
            transform: 'translate(-50%, -50%)',
            width: '20px', height: '20px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.92)',
            border: '2px solid rgba(80,80,80,0.7)',
            pointerEvents: 'none', zIndex: '2147483647',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', color: '#333',
            boxShadow: '0 0 5px rgba(0,0,0,0.2)', userSelect: 'none',
        });
        el.textContent = '\u229A';
        document.body.appendChild(el);
        this.indicator = el;
    }

    _updateIndicator(dx, dy) {
        if (!this.indicator || !this.scroller) return;
        const dz  = this.settings.deadzone;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        const canV = this.scroller.scrollHeight > this.scroller.clientHeight + 2;
        const canH = this.scroller.scrollWidth  > this.scroller.clientWidth  + 2;
        let sym = '\u229A';
        if (adx > dz || ady > dz) {
            if (ady >= adx) {
                sym = canV ? (dy > 0 ? '\u2193' : '\u2191') : '\u229A';
            } else {
                sym = canH ? (dx > 0 ? '\u2192' : '\u2190') : (canV ? (dy > 0 ? '\u2193' : '\u2191') : '\u229A');
            }
        }
        this.indicator.textContent = sym;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.indicator.style.opacity = String(Math.min(0.55 + dist / 250, 1));
    }

    _removeIndicator() {
        if (this.indicator) { this.indicator.remove(); this.indicator = null; }
    }
};
