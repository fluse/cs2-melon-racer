// A small Markdown -> HTML renderer for the docs the GitHub Page publishes
// (docs/mapping-api/*.md, docs/TRACK_CREATION.md, CHANGELOG.md). It covers
// exactly what those files use — headings (with GitHub-style ids), paragraphs,
// "-"/"1." lists nested by indent, pipe tables, ``` fences, "---", and inline
// `code`, **bold**, *italic*, [links](…) — rather than pulling in a Markdown
// package. test/site/site.test.mjs builds the whole site and checks every
// link and #anchor in it resolves, which is what catches a construct this
// doesn't handle.

/** @param {string} text */
export function EscapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * A heading's anchor, the same rule test/map/mapping-api-doc.test.mjs checks
 * the docs' own #links against: lower case, punctuation dropped, spaces to "-".
 * @param {string} heading the heading's Markdown text
 */
export function Slug(heading) {
    return heading
        .trim()
        .toLowerCase()
        .replace(/[`*_]/g, "")
        .replace(/[^\p{L}\p{N} -]/gu, "")
        .replace(/ /g, "-");
}

/**
 * @typedef {(href: string) => string} LinkResolver maps a link target as written in the Markdown to the one on the page
 * @param {string} text one line (or a joined paragraph) of Markdown
 * @param {LinkResolver} [resolveLink]
 */
export function RenderInline(text, resolveLink = (href) => href) {
    /** @type {string[]} */
    const codes = [];
    // Code spans first, so nothing inside them is read as emphasis or a link.
    const protectedText = text.replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);
    return EscapeHtml(protectedText)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${EscapeHtml(resolveLink(href.replace(/&amp;/g, "&")))}">${label}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, "$1<em>$2</em>")
        // Long entity names may wrap after an underscore (narrow table columns), nowhere else.
        .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${EscapeHtml(codes[Number(i)]).replace(/_(?=.)/g, "_<wbr>")}</code>`);
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const isBlank = (/** @type {string | undefined} */ line) => line === undefined || line.trim() === "";
const indentOf = (/** @type {string} */ line) => line.match(/^\s*/)[0].length;

/** Splits a table row on its unescaped pipes; "\|" is a literal pipe (also inside code). */
function tableCells(line) {
    return line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/(?<!\\)\|/)
        .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

/**
 * @typedef {{ level: number, text: string, id: string }} Heading
 * @param {string} markdown
 * @param {{ resolveLink?: LinkResolver }} [options]
 * @returns {{ html: string, headings: Heading[] }}
 */
export function RenderMarkdown(markdown, { resolveLink } = {}) {
    const lines = markdown.split(/\r?\n/);
    const inline = (/** @type {string} */ text) => RenderInline(text, resolveLink);
    /** @type {Heading[]} */
    const headings = [];
    /** @type {string[]} */
    const out = [];

    const startsBlock = (/** @type {string} */ line, /** @type {string | undefined} */ next) =>
        /^(#{1,6} |```|---\s*$)/.test(line) || LIST_ITEM.test(line) || (line.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(next ?? ""));

    /** @returns {number} the index after the list */
    function renderList(start, indent) {
        const ordered = /\d/.test(lines[start].match(LIST_ITEM)[2]);
        out.push(ordered ? "<ol>" : "<ul>");
        let i = start;
        while (i < lines.length) {
            const item = lines[i].match(LIST_ITEM);
            if (!item || item[1].length !== indent) break;
            const textIndent = item[1].length + item[2].length + 1;
            let text = item[3];
            i++;
            /** @type {string[]} */
            const nested = [];
            for (;;) {
                const line = lines[i];
                if (isBlank(line)) {
                    // A blank line only continues the list if more of it follows.
                    let j = i;
                    while (j < lines.length && isBlank(lines[j])) j++;
                    if (j < lines.length && indentOf(lines[j]) >= indent && (LIST_ITEM.test(lines[j]) || indentOf(lines[j]) >= textIndent)) {
                        i = j;
                        continue;
                    }
                    break;
                }
                const sub = line.match(LIST_ITEM);
                if (sub && sub[1].length > indent) {
                    const before = out.length;
                    i = renderList(i, sub[1].length);
                    nested.push(...out.splice(before));
                    continue;
                }
                if (sub || indentOf(line) <= indent || /^\s*```/.test(line)) break;
                text += " " + line.trim();
                i++;
            }
            out.push(`<li>${inline(text)}${nested.join("")}</li>`);
        }
        out.push(ordered ? "</ol>" : "</ul>");
        return i;
    }

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (isBlank(line)) {
            i++;
            continue;
        }
        if (/^```/.test(line)) {
            const code = [];
            for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
            i++;
            out.push(`<pre><code>${EscapeHtml(code.join("\n"))}</code></pre>`);
            continue;
        }
        const heading = line.match(/^(#{1,6}) (.+)$/);
        if (heading) {
            const level = heading[1].length;
            const text = heading[2].trim();
            const id = Slug(text);
            headings.push({ level, text, id });
            out.push(`<h${level} id="${EscapeHtml(id)}">${inline(text)}<a class="anchor" href="#${EscapeHtml(id)}" aria-label="Link to this section">#</a></h${level}>`);
            i++;
            continue;
        }
        if (/^---\s*$/.test(line)) {
            out.push("<hr>");
            i++;
            continue;
        }
        if (line.trim().startsWith("|") && startsBlock(line, lines[i + 1])) {
            const head = tableCells(line);
            const align = tableCells(lines[i + 1]).map((c) => (/^:.*:$/.test(c) ? "center" : /:$/.test(c) ? "right" : ""));
            const cell = (tag, text, col) => `<${tag}${align[col] ? ` style="text-align:${align[col]}"` : ""}>${inline(text)}</${tag}>`;
            const rows = [];
            for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) {
                rows.push(`<tr>${tableCells(lines[i]).map((c, col) => cell("td", c, col)).join("")}</tr>`);
            }
            out.push(
                `<div class="table-wrap"><table><thead><tr>${head.map((c, col) => cell("th", c, col)).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`,
            );
            continue;
        }
        const item = line.match(LIST_ITEM);
        if (item) {
            i = renderList(i, item[1].length);
            continue;
        }
        const paragraph = [line.trim()];
        for (i++; i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i], lines[i + 1]); i++) paragraph.push(lines[i].trim());
        out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    }
    return { html: out.join("\n"), headings };
}
