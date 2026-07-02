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
// Handles ++text++ even when inline markdown (bold, italic, links, etc.)
// has already split the content across multiple sibling nodes, by scanning
// at the DOM level (walking through element boundaries) instead of
// per isolated text node.
function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
            // Skip text already inside code blocks or an <ins> we created.
            if (n.parentElement?.closest('code, pre, ins')) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
}

function processInsMarkup(el) {
    // Loop because each match mutates the DOM; re-scan from scratch each
    // time and resume right after the last inserted <ins>.
    let resumeAfter = null;

    while (true) {
        const textNodes = collectTextNodes(el);

        let startIdx = 0;
        if (resumeAfter) {
            const pos = textNodes.indexOf(resumeAfter);
            startIdx = pos === -1 ? 0 : pos;
        }

        let openNodeIdx = -1, openIdx = -1;
        for (let i = startIdx; i < textNodes.length; i++) {
            const from = (textNodes[i] === resumeAfter) ? 0 : 0;
            const idx = textNodes[i].nodeValue.indexOf('++', from);
            if (idx !== -1) { openNodeIdx = i; openIdx = idx; break; }
        }

        if (openNodeIdx === -1) break; // no more opening markers

        // Find the matching closing "++": rest of this node, or a later node.
        let closeNodeIdx = -1, closeIdx = -1;
        const sameNodeClose = textNodes[openNodeIdx].nodeValue.indexOf('++', openIdx + 2);
        if (sameNodeClose !== -1) {
            closeNodeIdx = openNodeIdx;
            closeIdx = sameNodeClose;
        } else {
            for (let j = openNodeIdx + 1; j < textNodes.length; j++) {
                const idx = textNodes[j].nodeValue.indexOf('++');
                if (idx !== -1) { closeNodeIdx = j; closeIdx = idx; break; }
            }
        }

        if (closeNodeIdx === -1) {
            // Unmatched opener: nothing more we can do with it, stop scanning.
            break;
        }

        const openNode  = textNodes[openNodeIdx];
        const closeNode = textNodes[closeNodeIdx];

        // Split the open node right at the marker; drop the "++" prefix.
        const afterOpen = openNode.splitText(openIdx);
        afterOpen.nodeValue = afterOpen.nodeValue.slice(2);

        let closeTarget = closeNode;
        let closeAt = closeIdx;
        if (closeNode === openNode) {
            closeTarget = afterOpen;
            closeAt = closeIdx - openIdx - 2;
        }

        const afterClose = closeTarget.splitText(closeAt);
        afterClose.nodeValue = afterClose.nodeValue.slice(2);

        // Wrap everything from afterOpen (inclusive) up to afterClose (exclusive),
        // preserving any element nodes (like <strong>) in between.
        const range = document.createRange();
        range.setStartBefore(afterOpen);
        range.setEndBefore(afterClose);

        const ins = document.createElement('ins');
        try {
            range.surroundContents(ins);
        } catch (e) {
            const frag = range.extractContents();
            ins.appendChild(frag);
            range.insertNode(ins);
        }

        // Resume scanning right after the newly created <ins>.
        resumeAfter = afterClose;
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
