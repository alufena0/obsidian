'use strict';

var obsidian = require('obsidian');
const fs   = require('fs');
const path = require('path');

const HANDLE_R  = 6;
const ZOOM_MIN  = 0.1;
const ZOOM_MAX  = 16;
const ZOOM_STEP = 0.2;

class CropModal extends obsidian.Modal {
  constructor(app, absPath) {
    super(app);
    this.absPath = absPath;
    this.ext = path.extname(absPath).toLowerCase().replace('.', '');
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:16px;min-width:520px';
    contentEl.createEl('h3', { text: 'Crop Image', attr: { style: 'margin:0' } });

    // ── Row 1: Auto-trim + Tolerance + Zoom buttons ───────────────────────────
    const row1 = contentEl.createDiv({ attr: { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' } });
    const btnAuto = row1.createEl('button', { text: 'Auto-trim' });
    const tolWrap = row1.createDiv({ attr: { style: 'display:flex;gap:4px;align-items:center;font-size:.82em;color:var(--text-muted)' } });
    tolWrap.createSpan({ text: 'Tolerance:' });
    const tolInput = tolWrap.createEl('input', { attr: { type:'range', min:'0', max:'80', value:'20', style:'width:70px;cursor:pointer' } });
    const tolVal   = tolWrap.createSpan({ text: '20' });

    const zoomWrap = row1.createDiv({ attr: { style: 'display:flex;gap:4px;align-items:center;font-size:.82em;color:var(--text-muted);margin-left:8px' } });
    const btnZoomOut = zoomWrap.createEl('button', { text: '-', attr: { style: 'width:26px;height:26px;padding:0;cursor:pointer;border-radius:4px;font-size:1.1em' } });
    const zoomLabel  = zoomWrap.createSpan({ text: '100%', attr: { style: 'min-width:42px;text-align:center' } });
    const btnZoomIn  = zoomWrap.createEl('button', { text: '+', attr: { style: 'width:26px;height:26px;padding:0;cursor:pointer;border-radius:4px;font-size:1.1em' } });

    // ── Canvas area ────────────────────────────────────────────────────────────
    const wrap = contentEl.createDiv();
    wrap.style.cssText = 'position:relative;overflow:auto;height:62vh;border:1px solid var(--background-modifier-border);border-radius:6px;background:repeating-conic-gradient(#555 0% 25%,#333 0% 50%) 0 0/16px 16px';

    const inner = wrap.createDiv();
    inner.style.cssText = 'position:relative;display:inline-block';

    const canvas  = inner.createEl('canvas', { attr: { style: 'display:block' } });
    const overlay = inner.createEl('canvas', { attr: { style: 'position:absolute;top:0;left:0;cursor:crosshair' } });

    const info = contentEl.createEl('p', { text: 'Loading...', attr: { style: 'margin:0;font-size:.8em;color:var(--text-muted)' } });

    // ── Row 2: Undo / Redo / Save ──────────────────────────────────────────────
    const row2 = contentEl.createDiv({ attr: { style: 'display:flex;gap:6px;align-items:center' } });
    const btnUndo = row2.createEl('button', { text: 'Undo', attr: { style: 'font-size:.82em' } });
    const btnRedo = row2.createEl('button', { text: 'Redo', attr: { style: 'font-size:.82em' } });
    const btnSave = row2.createEl('button', { text: 'Save' });
    btnSave.style.cssText = 'margin-left:auto;background:var(--interactive-accent);color:var(--text-on-accent);border:none;padding:5px 16px;border-radius:5px;cursor:pointer;font-weight:600';

    // ── State ──────────────────────────────────────────────────────────────────
    let srcFull = null;   // canvas at 1:1 original resolution
    let W = 0, H = 0;
    let baseScale = 1;    // fit-to-window factor
    let zoom = 1;
    let sel  = null;      // { x, y, w, h } in original pixels — null = no selection
    let autoTrimActive = false;
    let dragState = null; // { type:'new'|'handle'|'move', ... }

    // Undo/redo
    const history = [];
    let histIdx = -1;
    const pushHistory = (s) => {
      if (!s) return;
      history.splice(histIdx + 1);
      history.push({ ...s });
      histIdx = history.length - 1;
    };

    const ds = () => baseScale * zoom;

    // ── Handles ────────────────────────────────────────────────────────────────
    const getHandles = () => {
      if (!sel) return [];
      const d = ds();
      const sx = sel.x*d, sy = sel.y*d, sw = sel.w*d, sh = sel.h*d;
      return [
        { id:'nw', x:sx,      y:sy,      cursor:'nw-resize' },
        { id:'n',  x:sx+sw/2, y:sy,      cursor:'n-resize'  },
        { id:'ne', x:sx+sw,   y:sy,      cursor:'ne-resize' },
        { id:'e',  x:sx+sw,   y:sy+sh/2, cursor:'e-resize'  },
        { id:'se', x:sx+sw,   y:sy+sh,   cursor:'se-resize' },
        { id:'s',  x:sx+sw/2, y:sy+sh,   cursor:'s-resize'  },
        { id:'sw', x:sx,      y:sy+sh,   cursor:'sw-resize' },
        { id:'w',  x:sx,      y:sy+sh/2, cursor:'w-resize'  },
      ];
    };

    const hitHandle = (px, py) => {
      for (const h of getHandles()) {
        if (Math.abs(px-h.x) <= HANDLE_R+3 && Math.abs(py-h.y) <= HANDLE_R+3) return h;
      }
      return null;
    };

    const inSel = (px, py) => {
      if (!sel) return false;
      const d = ds(), pad = HANDLE_R + 3;
      return px > sel.x*d+pad && px < (sel.x+sel.w)*d-pad &&
             py > sel.y*d+pad && py < (sel.y+sel.h)*d-pad;
    };

    // ── RAF-throttled redraw ───────────────────────────────────────────────────
    let rafPending = false;
    const scheduleRedraw = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; redraw(); });
    };

    const redraw = () => {
      if (!srcFull) return;
      const PW = canvas.width, PH = canvas.height;
      const octx = overlay.getContext('2d');
      octx.clearRect(0, 0, PW, PH);

      if (!sel) {
        info.textContent = `Original: ${W} x ${H} px — drag to select`;
        return;
      }

      const d = ds();
      const sx = Math.round(sel.x*d), sy = Math.round(sel.y*d);
      const sw = Math.round(sel.w*d), sh = Math.round(sel.h*d);

      octx.fillStyle = 'rgba(0,0,0,.45)';
      octx.fillRect(0, 0, PW, PH);
      octx.clearRect(sx, sy, sw, sh);

      octx.strokeStyle = '#fff'; octx.lineWidth = 1.5; octx.setLineDash([5,3]);
      octx.strokeRect(sx+.5, sy+.5, sw-1, sh-1);

      octx.setLineDash([]); octx.lineWidth = 1;
      for (const h of getHandles()) {
        octx.fillStyle = '#fff'; octx.strokeStyle = '#333';
        octx.fillRect  (h.x-HANDLE_R, h.y-HANDLE_R, HANDLE_R*2, HANDLE_R*2);
        octx.strokeRect(h.x-HANDLE_R, h.y-HANDLE_R, HANDLE_R*2, HANDLE_R*2);
      }

      info.textContent = `Selection: ${sel.w} x ${sel.h} px  (original: ${W} x ${H} px)`;
    };

    // Resize canvas to current zoom and repaint at full resolution (no blur)
    const updateCanvas = () => {
      if (!srcFull) return;
      const d  = ds();
      const PW = Math.max(1, Math.round(W * d));
      const PH = Math.max(1, Math.round(H * d));
      canvas.width  = PW; canvas.height  = PH;
      overlay.width = PW; overlay.height = PH;
      inner.style.width  = PW + 'px';
      inner.style.height = PH + 'px';
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(srcFull, 0, 0, PW, PH);
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
    };

    // ── Image load ─────────────────────────────────────────────────────────────
    const img = new Image();
    img.onload = () => {
      W = img.naturalWidth; H = img.naturalHeight;
      srcFull = Object.assign(document.createElement('canvas'), { width:W, height:H });
      srcFull.getContext('2d').drawImage(img, 0, 0);
      const maxW = Math.max(480, contentEl.offsetWidth - 32);
      const maxH = wrap.offsetHeight || window.innerHeight * 0.62;
      baseScale = Math.min(1, maxW / W, maxH / H);
      zoom = 1;
      updateCanvas();
      redraw();
    };
    img.onerror = () => { info.textContent = 'Error: failed to load image.'; };

    try {
      const raw  = fs.readFileSync(this.absPath);
      const mime = this.ext === 'jpg' ? 'jpeg' : this.ext;
      img.src = `data:image/${mime};base64,${raw.toString('base64')}`;
    } catch(e) { info.textContent = 'Error: ' + e.message; return; }

    // ── Zoom ───────────────────────────────────────────────────────────────────
    const applyZoom = (newZoom, cursorXInWrap, cursorYInWrap) => {
      newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
      if (cursorXInWrap !== undefined) {
        // Keep the image point under the cursor fixed while zooming
        const ratio = newZoom / zoom;
        const absX  = wrap.scrollLeft + cursorXInWrap;
        const absY  = wrap.scrollTop  + cursorYInWrap;
        zoom = newZoom;
        updateCanvas();
        wrap.scrollLeft = absX * ratio - cursorXInWrap;
        wrap.scrollTop  = absY * ratio - cursorYInWrap;
      } else {
        zoom = newZoom;
        updateCanvas();
      }
      redraw();
    };

    btnZoomIn.onclick  = () => applyZoom(zoom + ZOOM_STEP);
    btnZoomOut.onclick = () => applyZoom(zoom - ZOOM_STEP);

    // Scroll wheel zooms (no Ctrl needed), centered on cursor
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = wrap.getBoundingClientRect();
      applyZoom(
        zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
        e.clientX - rect.left,
        e.clientY - rect.top
      );
    }, { passive: false });

    // ── Mouse interaction ──────────────────────────────────────────────────────
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const mousePos = (e) => {
      const r = overlay.getBoundingClientRect();
      return {
        px: clamp(e.clientX - r.left, 0, overlay.width  - 1),
        py: clamp(e.clientY - r.top,  0, overlay.height - 1)
      };
    };

    // Hover cursor
    overlay.addEventListener('mousemove', e => {
      if (dragState) return;
      const { px, py } = mousePos(e);
      const h = hitHandle(px, py);
      if      (h)             overlay.style.cursor = h.cursor;
      else if (inSel(px, py)) overlay.style.cursor = 'move';
      else                    overlay.style.cursor = 'crosshair';
    });

    overlay.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const { px, py } = mousePos(e);
      const h = hitHandle(px, py);

      if (h) {
        dragState = { type:'handle', handle:h, startSel:{ ...sel }, startPx:px, startPy:py };
      } else if (inSel(px, py)) {
        dragState = { type:'move', startSel:{ ...sel }, startPx:px, startPy:py };
        overlay.style.cursor = 'grabbing';
      } else {
        autoTrimActive = false;
        dragState = { type:'new', startPx:px, startPy:py };
        sel = null;
        redraw();
      }
    });

    window.addEventListener('mousemove', e => {
      if (!dragState || !srcFull) return;
      const { px, py } = mousePos(e);
      const d = ds();

      if (dragState.type === 'new') {
        const x0 = Math.round(dragState.startPx / d);
        const y0 = Math.round(dragState.startPy / d);
        const x1 = clamp(Math.round(px / d), 0, W);
        const y1 = clamp(Math.round(py / d), 0, H);
        sel = { x:Math.min(x0,x1), y:Math.min(y0,y1), w:Math.max(1,Math.abs(x1-x0)), h:Math.max(1,Math.abs(y1-y0)) };

      } else if (dragState.type === 'move') {
        const ddx = Math.round((px - dragState.startPx) / d);
        const ddy = Math.round((py - dragState.startPy) / d);
        const s   = dragState.startSel;
        sel = { x:clamp(s.x+ddx,0,W-s.w), y:clamp(s.y+ddy,0,H-s.h), w:s.w, h:s.h };

      } else if (dragState.type === 'handle') {
        const ddx = Math.round((px - dragState.startPx) / d);
        const ddy = Math.round((py - dragState.startPy) / d);
        const s = dragState.startSel, id = dragState.handle.id;
        let { x, y, w, h } = s;
        if (id.includes('w')) { x = s.x+ddx; w = s.w-ddx; }
        if (id.includes('e')) { w = s.w+ddx; }
        if (id.includes('n')) { y = s.y+ddy; h = s.h-ddy; }
        if (id.includes('s')) { h = s.h+ddy; }
        if (w < 1) { if (id.includes('w')) x = s.x+s.w-1; w = 1; }
        if (h < 1) { if (id.includes('n')) y = s.y+s.h-1; h = 1; }
        const cx = clamp(x, 0, W-1), cy = clamp(y, 0, H-1);
        sel = { x:cx, y:cy, w:clamp(w,1,W-cx), h:clamp(h,1,H-cy) };
      }

      scheduleRedraw();
    });

    window.addEventListener('mouseup', () => {
      if (!dragState) return;
      if (sel && sel.w > 4 && sel.h > 4) pushHistory(sel);
      dragState = null;
      overlay.style.cursor = 'crosshair';
    });

    // ── Undo / Redo ────────────────────────────────────────────────────────────
    btnUndo.onclick = () => {
      if (histIdx <= 0) { sel = null; if (histIdx === 0) histIdx = -1; redraw(); return; }
      histIdx--;
      sel = { ...history[histIdx] };
      redraw();
    };
    btnRedo.onclick = () => {
      if (histIdx >= history.length - 1) return;
      histIdx++;
      sel = { ...history[histIdx] };
      redraw();
    };
    contentEl.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); btnUndo.click(); }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); btnRedo.click(); }
    });

    // ── Auto-trim ──────────────────────────────────────────────────────────────
    const runAutoTrim = (silent = false) => {
      if (!srcFull) return;
      const data = srcFull.getContext('2d').getImageData(0, 0, W, H).data;
      const tolerance = parseInt(tolInput.value);

      // Detect background color from opaque corners only.
      // Transparent corners are excluded — their RGB = (0,0,0) after premultiplication,
      // which would poison the average and make bg detection fail.
      const sampleCorner = (x, y) => {
        const i = (y * W + x) * 4;
        return { r:data[i], g:data[i+1], b:data[i+2], a:data[i+3] };
      };
      const allCorners    = [ sampleCorner(0,0), sampleCorner(W-1,0), sampleCorner(0,H-1), sampleCorner(W-1,H-1) ];
      const opaqueCorners = allCorners.filter(c => c.a >= 10);
      const bg = opaqueCorners.length > 0 ? [
        Math.round(opaqueCorners.reduce((s,c) => s+c.r, 0) / opaqueCorners.length),
        Math.round(opaqueCorners.reduce((s,c) => s+c.g, 0) / opaqueCorners.length),
        Math.round(opaqueCorners.reduce((s,c) => s+c.b, 0) / opaqueCorners.length)
      ] : [255, 255, 255];

      // Generous fixed threshold to tolerate JPEG compression artifacts
      const COLOR_THRESHOLD = 40;

      const isBg = (i) => {
        if (data[i+3] < 10) return true; // transparent pixel = always background
        return Math.abs(data[i]  -bg[0]) <= COLOR_THRESHOLD &&
               Math.abs(data[i+1]-bg[1]) <= COLOR_THRESHOLD &&
               Math.abs(data[i+2]-bg[2]) <= COLOR_THRESHOLD;
      };

      // Tolerance slider controls the % of pixels per row/col that must be bg:
      // tolerance=0  → 100% required (strict — only pure borders)
      // tolerance=80 → 70%  required (aggressive — rows mostly filled with bg)
      const requiredRatio = 1 - (tolerance / 80) * 0.30;

      const isRowEmpty = (y) => {
        let m = 0;
        for (let x = 0; x < W; x++) { if (isBg((y*W+x)*4)) m++; }
        return (m / W) >= requiredRatio;
      };
      const isColEmpty = (x) => {
        let m = 0;
        for (let y = 0; y < H; y++) { if (isBg((y*W+x)*4)) m++; }
        return (m / H) >= requiredRatio;
      };

      let top=0, bot=H-1, left=0, right=W-1;
      while (top  < bot   && isRowEmpty(top))   top++;
      while (bot  > top   && isRowEmpty(bot))   bot--;
      while (left < right && isColEmpty(left))  left++;
      while (right > left && isColEmpty(right)) right--;

      if (top >= bot || left >= right) {
        if (!silent) new obsidian.Notice('Nothing found — reduce the tolerance.');
        return;
      }
      sel = { x:left, y:top, w:right-left+1, h:bot-top+1 };
      autoTrimActive = true;
      pushHistory(sel);
      redraw();
    };

    btnAuto.onclick = runAutoTrim;

    // Slider updates live after auto-trim was run at least once
    tolInput.oninput = () => {
      tolVal.textContent = tolInput.value;
      if (autoTrimActive) runAutoTrim(true);
    };

    // ── Save ───────────────────────────────────────────────────────────────────
    btnSave.onclick = () => {
      if (!srcFull || !sel || sel.w < 2 || sel.h < 2) {
        new obsidian.Notice('No selection — make a crop first.');
        return;
      }
      const out = Object.assign(document.createElement('canvas'), { width:sel.w, height:sel.h });
      out.getContext('2d').drawImage(srcFull, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
      const isJpeg = ['jpg','jpeg'].includes(this.ext);
      out.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            fs.writeFileSync(this.absPath, Buffer.from(reader.result));
            new obsidian.Notice(`Saved: ${sel.w} x ${sel.h} px`);
            const rel = path.relative(this.app.vault.adapter.getBasePath(), this.absPath).replace(/\\/g, '/');
            const tf  = this.app.vault.getAbstractFileByPath(rel);
            if (tf) this.app.vault.trigger('raw', tf);
          } catch(e) { new obsidian.Notice('Error: ' + e.message); }
          this.close();
        };
        reader.readAsArrayBuffer(blob);
      }, isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.85 : undefined);
    };
  }

  onClose() { this.contentEl.empty(); }
}

class CropImageEdgesPlugin extends obsidian.Plugin {
  async onload() {
    console.log('crop-image-edges: loaded');
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!file || !(file instanceof obsidian.TFile)) return;
        if (!['jpg','jpeg','png','webp','gif','bmp'].includes(file.extension.toLowerCase())) return;
        menu.addItem(item =>
          item.setTitle('Crop empty edges…').setIcon('scissors').onClick(() => {
            new CropModal(this.app, this.app.vault.adapter.getFullPath(file.path)).open();
          })
        );
      })
    );
  }
  onunload() { console.log('crop-image-edges: unloaded'); }
}

module.exports = CropImageEdgesPlugin;
