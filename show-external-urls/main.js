const { Plugin, MarkdownView } = require("obsidian");
const { ViewPlugin, Decoration, WidgetType } = require("@codemirror/view");
const { RangeSetBuilder } = require("@codemirror/state");

const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

class UrlWidget extends WidgetType {
    constructor(url) {
        super();
        this.url = url;
    }

    toDOM() {
        const span = document.createElement("span");
        span.className = "show-external-url-suffix";
        span.textContent = ` (${this.url})`;
        return span;
    }

    eq(other) {
        return this.url === other.url;
    }

    ignoreEvent() {
        return true;
    }
}

function buildDecorations(view) {
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;

    for (const { from, to } of view.visibleRanges) {
        const text = doc.sliceString(from, to);
        MD_LINK_RE.lastIndex = 0;
        let match;

        while ((match = MD_LINK_RE.exec(text)) !== null) {
            const url = match[2];
            const end = from + match.index + match[0].length;
            builder.add(
                end,
                end,
                Decoration.widget({ widget: new UrlWidget(url), side: 1 })
            );
        }
    }

    return builder.finish();
}

const editorPlugin = ViewPlugin.fromClass(
    class {
        constructor(view) {
            this.decorations = buildDecorations(view);
        }

        update(update) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    { decorations: (v) => v.decorations }
);

module.exports = class ShowExternalUrlsPlugin extends Plugin {
    async onload() {
        // editor (source + live preview)
        this.registerEditorExtension(editorPlugin);

        // reading mode
        this.registerMarkdownPostProcessor((el) => {
            el.querySelectorAll("a.external-link").forEach((a) => {
                if (a.dataset.urlSuffixDone) return;
                a.dataset.urlSuffixDone = "1";
                const span = document.createElement("span");
                span.className = "show-external-url-suffix";
                span.textContent = ` (${a.href})`;
                a.after(span);
            });
        });
    }
};
