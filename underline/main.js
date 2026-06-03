'use strict';

var obsidian = require('obsidian');
var cmView   = require('@codemirror/view');
var cmState  = require('@codemirror/state');

// ── Regex ──────────────────────────────────────────────────────────────────
const INS_RE = /\+\+([^+\n]+)\+\+/g;

// ── CM6 Decorations (Live Preview) ────────────────────────────────────────
const insMark = cmView.Decoration.mark({ class: 'cm-ins' });

function buildDecos(v) {
    const sel    = v.state.selection;
    const ranges = [];

    for (const { from, to } of v.visibleRanges) {
        const text = v.state.doc.sliceString(from, to);
        INS_RE.lastIndex = 0;
        let m;

        while ((m = INS_RE.exec(text)) !== null) {
            const s  = from + m.index;
            const s2 = s  + 2;
            const e2 = s2 + m[1].length;
            const e  = e2 + 2;

            // Show raw text if cursor is inside the block
            const cursorInside = sel.ranges.some(r => r.from <= e && r.to >= s);
            if (cursorInside) continue;

            ranges.push({ from: s,  to: s2, deco: cmView.Decoration.replace({}) });
            ranges.push({ from: s2, to: e2, deco: insMark });
            ranges.push({ from: e2, to: e,  deco: cmView.Decoration.replace({}) });
        }
    }

    ranges.sort((a, b) => a.from - b.from || a.to - b.to);

    const builder = new cmState.RangeSetBuilder();
    for (const { from, to, deco } of ranges) {
        builder.add(from, to, deco);
    }
    return builder.finish();
}

const insDecoPlugin = cmView.ViewPlugin.fromClass(
    class {
        constructor(v) { this.decorations = buildDecos(v); }
        update(u) {
            if (u.docChanged || u.viewportChanged || u.selectionSet) {
                this.decorations = buildDecos(u.view);
            }
        }
    },
    { decorations: p => p.decorations }
);

// ── Auto-Wrap: select text → press + → wraps as ++text++ ──────────────────
const wrapKeymap = cmView.keymap.of([{
    key: '+',
    run(editorView) {
        const { state } = editorView;
        const sel = state.selection;

        // No selection at all: default + behavior
        if (sel.ranges.every(r => r.empty)) return false;

        const changes   = [];
        const newRanges = [];

        for (const range of sel.ranges) {
            if (range.empty) {
                // Cursor with no selection: normal +
                changes.push({ from: range.from, insert: '+' });
                newRanges.push(cmState.EditorSelection.cursor(range.from + 1));
            } else {
                // Has selection: wrap with ++ on each side
                // CM6 uses original doc positions; maps automatically.
                changes.push({ from: range.from, insert: '++' }); // open
                changes.push({ from: range.to,   insert: '++' }); // close

                // Cursor after closing ++ in new doc:
                // +2 from opening ++ (shift) + 2 from closing ++ = +4
                newRanges.push(cmState.EditorSelection.cursor(range.to + 4));
            }
        }

        editorView.dispatch({
            changes,
            selection: cmState.EditorSelection.create(newRanges),
            userEvent: 'input'
        });

        return true; // event consumed — does not insert loose +
    }
}]);

// ── Post-Processor: Reading Mode ───────────────────────────────────────────
function processInsMarkup(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes  = [];
    let n;

    while ((n = walker.nextNode())) {
        if (n.nodeValue?.includes('++')) nodes.push(n);
    }

    for (const node of nodes) {
        const text = node.nodeValue;
        INS_RE.lastIndex = 0;
        if (!INS_RE.test(text)) continue;
        INS_RE.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let last = 0, m;

        while ((m = INS_RE.exec(text)) !== null) {
            if (m.index > last) {
                frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            }
            const ins = document.createElement('ins');
            ins.textContent = m[1];
            frag.appendChild(ins);
            last = INS_RE.lastIndex;
        }

        if (last < text.length) {
            frag.appendChild(document.createTextNode(text.slice(last)));
        }

        node.parentNode?.replaceChild(frag, node);
    }
}

// ── Main Plugin ────────────────────────────────────────────────────────────
class InsUnderlinePlugin extends obsidian.Plugin {
    async onload() {
        this.registerMarkdownPostProcessor(processInsMarkup);
        this.registerEditorExtension([insDecoPlugin, wrapKeymap]);
    }

    onunload() {}
}

module.exports = InsUnderlinePlugin;
