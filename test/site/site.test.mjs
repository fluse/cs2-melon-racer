// Builds the whole GitHub Page into a temp folder and checks what comes out:
// every page of the Mapping API is there, and every local link (with its
// #anchor) on every page resolves — which is also what catches a Markdown
// construct site/markdown.mjs renders wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Build } from "../../site/build.mjs";
import { RenderMarkdown } from "../../site/markdown.mjs";

const distDir = mkdtempSync(path.join(tmpdir(), "melon-site-"));
const result = Build(distDir);
test.after(() => rmSync(distDir, { recursive: true, force: true }));

test("every Mapping API page and the track guide are published", () => {
    const docs = readdirSync(new URL("../../docs/mapping-api/", import.meta.url)).filter((f) => f.endsWith(".md"));
    for (const file of docs) {
        const page = file === "README.md" ? "mapping-api/index.html" : `mapping-api/${file.replace(/\.md$/, ".html")}`;
        assert.ok(result.pages.includes(page), `${file} -> ${page}`);
    }
    assert.ok(result.pages.includes("mapping-api/track-creation.html"));
    assert.ok(result.pages.includes("connect/index.html"));
});

test("every local link on the site resolves, anchors included", () => {
    const broken = [];
    for (const page of result.pages) {
        const html = readFileSync(path.join(distDir, page), "utf8");
        for (const [, rawHref] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
            const href = rawHref.replace(/&amp;/g, "&");
            if (/^[a-z]+:/.test(href)) continue; // https:, steam:, …
            const [target, anchor] = href.split("#");
            let file = target ? path.join(path.dirname(path.join(distDir, page)), target) : path.join(distDir, page);
            if (target.endsWith("/") || (existsSync(file) && !path.extname(file))) file = path.join(file, "index.html");
            if (!existsSync(file)) {
                broken.push(`${page}: ${href} (no such file)`);
                continue;
            }
            if (anchor && file.endsWith(".html") && !readFileSync(file, "utf8").includes(`id="${anchor}"`)) {
                broken.push(`${page}: ${href} (no such id)`);
            }
        }
    }
    assert.deepEqual(broken, []);
});

test("RenderMarkdown: tables with escaped pipes, nested lists, code and headings", () => {
    const { html: rendered, headings } = RenderMarkdown(
        [
            "# Title `x`",
            "",
            "| A | B |",
            "|---|---|",
            "| `a\\|b` | **bold** and *it* |",
            "",
            "1. One",
            "   continued",
            "   - nested `_*`",
            "2. Two",
            "",
            "```",
            "<Output> → x",
            "```",
        ].join("\n"),
    );
    const html = rendered.replace(/\n/g, "");
    assert.deepEqual(headings, [{ level: 1, text: "Title `x`", id: "title-x" }]);
    assert.match(html, /<td><code>a\|b<\/code><\/td><td><strong>bold<\/strong> and <em>it<\/em><\/td>/);
    assert.match(html, /<ol><li>One continued<ul><li>nested <code>_<wbr>\*<\/code><\/li><\/ul><\/li><li>Two<\/li><\/ol>/);
    assert.match(html, /<pre><code>&lt;Output&gt; → x<\/code><\/pre>/);
});
