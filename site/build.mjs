// Builds the Melon Racer GitHub Page into site/dist/:
// - index.html: the hand-written site/index.html, with the version from
//   package.json and the release history from CHANGELOG.md filled in;
// - connect/index.html: site/connect.html, straight to Steam's join link;
// - mapping-api/*.html: every docs/mapping-api/*.md page plus
//   docs/TRACK_CREATION.md, rendered into site/doc.html with a sidebar. Links
//   between them stay on the site; links to anything else in the repo go to
//   GitHub;
// - style.css, favicon.svg, the images the pages use out of the addon (logo,
//   gameplay gifs for the slider, HUD icons) and everything in site/images/.
// site/dist/ is gitignored — the GitHub Actions workflow
// (.github/workflows/pages.yml) runs this script and deploys the result.
//
// Usage: node site/build.mjs   (or npm run site) — then open site/dist/index.html

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EscapeHtml, RenderInline, RenderMarkdown } from "./markdown.mjs";

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(siteDir);

const REPO_URL = "https://github.com/fluse/cs2-melon-racer";
/** Steam Workshop item page; the "Subscribe" button is left out while this is empty. */
const WORKSHOP_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3808250578";
const SERVER_ADDRESS = "tante.io:27015";
/** Opens CS2 through Steam and joins the server — the hero's join button and the /connect/ page. */
const STEAM_CONNECT_URL = `steam://connect/${SERVER_ADDRESS}`;

/** published page (under dist/) -> its template (under site/); "connect/index.html" makes the page's URL …/connect/ */
const PAGES = {
    "index.html": "index.html",
    "connect/index.html": "connect.html",
};

/** Docs rendered with site/doc.html: source (repo path) -> published page (under dist/), in sidebar order. */
const DOC_PAGES = {
    "docs/mapping-api/README.md": "mapping-api/index.html",
    ...Object.fromEntries(
        readdirSync(path.join(rootDir, "docs", "mapping-api"))
            .filter((f) => /^\d+-.+\.md$/.test(f))
            .sort()
            .map((f) => [`docs/mapping-api/${f}`, `mapping-api/${f.replace(/\.md$/, ".html")}`]),
    ),
    "docs/TRACK_CREATION.md": "mapping-api/track-creation.html",
};

/** published path (under dist/) -> source path (under the repo root) */
const COPIED_IMAGES = {
    "images/logo.png": "panorama/images/custom_game/logo_melon_racer.png",
    "images/track-start.png": "panorama/images/custom_game/icons/track-start.png",
    "images/track-finish.png": "panorama/images/custom_game/icons/track-finish.png",
};

/**
 * The home page's gameplay slider, in order: the full-quality GIFs from
 * docs/gifs/ (not the *_steam.gif copies, those are for the Workshop's 2 MB
 * limit), each published as images/gameplay-<n>.gif.
 * @type {{ source: string, alt: string, caption: string }[]}
 */
const GAMEPLAY_GIFS = [
    {
        source: "docs/gifs/2026-10-04_21-05-46.gif",
        alt: "A side view of a melon wall-jumping up a narrow shaft between neon-edged concrete walls, a time trial clock running top left",
        caption: "The new Side Slice route — a 2D jump & run, wall-jumping up the shaft.",
    },
    {
        source: "docs/gifs/2026-10-03_14-01-55.gif",
        alt: "A melon crossing water, climbing ramps, rolling through a heal gate and bouncing between two walls",
        caption: "A time trial run — over the water, up the ramps, through a heal gate and between the walls.",
    },
    {
        source: "docs/gifs/2026-09-29_21-24-54.gif",
        alt: "A melon rolling down a neon-lit corridor towards a checkpoint gate",
        caption: "In-game footage — a melon on its way through a checkpoint gate.",
    },
];

/** The slides plus, with more than one GIF, prev/next buttons and one dot per slide (driven by the script in index.html). */
function renderGameplay() {
    const slides = GAMEPLAY_GIFS.map(
        (gif, i) => `<figure class="slide" id="gameplay-${i + 1}">
            <img src="images/gameplay-${i + 1}.gif" alt="${EscapeHtml(gif.alt)}" width="480" height="270" loading="lazy">
            <figcaption>${EscapeHtml(gif.caption)}</figcaption>
          </figure>`,
    ).join("\n          ");
    const track = `<div class="slider-track" tabindex="0" aria-label="Gameplay clips">
          ${slides}
        </div>`;
    if (GAMEPLAY_GIFS.length < 2) return `<div class="slider">\n        ${track}\n      </div>`;
    const dots = GAMEPLAY_GIFS.map(
        (_, i) => `<a class="slider-dot" href="#gameplay-${i + 1}" aria-label="Clip ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}></a>`,
    ).join("");
    return `<div class="slider" data-slider>
        ${track}
        <button class="slider-arrow slider-prev" type="button" aria-label="Previous clip" data-step="-1">‹</button>
        <button class="slider-arrow slider-next" type="button" aria-label="Next clip" data-step="1">›</button>
        <div class="slider-dots">${dots}</div>
      </div>`;
}

/**
 * Where a link written in a repo file points on the site: another published
 * doc -> relative to the current page; any other repo file/folder -> GitHub.
 * @param {string} sourceFile repo path of the Markdown file the link is in
 * @param {string} pagePath published path of the page it ends up on
 */
function linkResolverFor(sourceFile, pagePath) {
    return (/** @type {string} */ href) => {
        if (/^[a-z]+:/.test(href) || href.startsWith("#")) return href;
        const [target, anchor] = href.split("#");
        const repoPath = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), target));
        const hash = anchor ? `#${anchor}` : "";
        const published = DOC_PAGES[repoPath];
        if (published) return path.posix.relative(path.posix.dirname(pagePath), published) + hash;
        const kind = target.endsWith("/") ? "tree" : "blob";
        return `${REPO_URL}/${kind}/main/${repoPath.replace(/\/$/, "")}${hash}`;
    };
}

/** The top bar's menu, the same on every page: label -> link from the site root. */
const NAV_LINKS = {
    "How it works": "index.html#race",
    Features: "index.html#features",
    Controls: "index.html#controls",
    Changelog: "index.html#changelog",
    "Mapping API": "mapping-api/index.html",
    GitHub: REPO_URL,
};

/** @param {string} pagePath published path of the page the menu is on */
function navLinksFor(pagePath) {
    const root = "../".repeat(pagePath.split("/").length - 1);
    const items = Object.entries(NAV_LINKS).map(([label, target]) => {
        const external = /^[a-z]+:/.test(target);
        // On the home page its own sections are plain #anchors.
        const href = external ? target : pagePath === "index.html" ? target.replace(/^index\.html(?=#)/, "") : root + target;
        const current = !external && target.startsWith("mapping-api/") && pagePath.startsWith("mapping-api/") ? ' aria-current="page"' : "";
        return `<li><a href="${EscapeHtml(href)}"${current}>${EscapeHtml(label)}</a></li>`;
    });
    return `<ul class="nav-links">\n        ${items.join("\n        ")}\n      </ul>`;
}

/** @param {string} templateFile under site/ @param {Record<string, string>} values */
function fillTemplate(templateFile, values) {
    const template = readFileSync(path.join(siteDir, templateFile), "utf8");
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (!(key in values)) throw new Error(`site/${templateFile}: unknown placeholder ${match}`);
        return values[key];
    });
}

/** @param {string} markdown a heading's Markdown -> plain text */
const plainText = (markdown) => markdown.replace(/[`*]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

/**
 * @typedef {{ title: string, items: string[] }} ChangelogSection
 * @typedef {{ version: string, date: string, name: string, sections: ChangelogSection[] }} Release
 * @param {string} markdown CHANGELOG.md
 * @returns {Release[]} newest first, as in the file
 */
export function ParseChangelog(markdown) {
    /** @type {Release[]} */
    const releases = [];
    /** @type {string[] | null} */
    let items = null;
    for (const line of markdown.split(/\r?\n/)) {
        const release = line.match(/^## \[([^\]]+)\]\s*—\s*([^—]+?)\s*(?:—\s*(.+))?$/);
        if (release) {
            releases.push({ version: release[1], date: release[2], name: release[3] ?? "", sections: [] });
            items = null;
            continue;
        }
        const current = releases.at(-1);
        if (!current) continue; // the intro above the first release
        const section = line.match(/^### (.+)$/);
        if (section) {
            items = [];
            current.sections.push({ title: section[1].trim(), items });
            continue;
        }
        const item = line.match(/^- (.+)$/);
        if (item && items) items.push(item[1].trim());
        else if (/^\s+\S/.test(line) && items?.length) items[items.length - 1] += " " + line.trim();
        // anything else (blank lines, "Commit `…`." / "Tag `…`.") isn't shown
    }
    return releases;
}

/** @param {Release[]} releases @param {(text: string) => string} inline */
function renderChangelog(releases, inline) {
    return releases
        .map((release, i) => {
            const sections = release.sections
                .map((s) => {
                    const dev = /mapping|dev/i.test(s.title);
                    return `<section class="cl-section${dev ? " cl-dev" : ""}">
            <h4>${inline(s.title)}</h4>
            <ul>${s.items.map((item) => `\n              <li>${inline(item)}</li>`).join("")}
            </ul>
          </section>`;
                })
                .join("\n          ");
            return `<details class="release"${i === 0 ? " open" : ""}>
        <summary>
          <span class="release-version">v${EscapeHtml(release.version)}</span>
          <span class="release-name">${inline(release.name)}</span>
          <time datetime="${EscapeHtml(release.date)}">${EscapeHtml(release.date)}</time>
        </summary>
        <div class="release-body">
          ${sections}
        </div>
      </details>`;
        })
        .join("\n      ");
}

/** Renders every DOC_PAGES entry. @returns {Record<string, string>} published path -> HTML */
function renderDocs(common) {
    const docs = Object.entries(DOC_PAGES).map(([source, published]) => {
        const markdown = readFileSync(path.join(rootDir, source), "utf8");
        const { html, headings } = RenderMarkdown(markdown, { resolveLink: linkResolverFor(source, published) });
        const h1 = headings.find((h) => h.level === 1);
        return { source, published, html, title: plainText(h1?.text ?? path.basename(source, ".md")) };
    });
    /** @type {Record<string, string>} */
    const out = {};
    for (const doc of docs) {
        const nav = docs
            .map((other) => {
                const label = other.published.endsWith("/index.html") ? "Overview" : other.title.replace(/^Melon Racer — /, "");
                const href = path.posix.relative(path.posix.dirname(doc.published), other.published);
                const current = other === doc ? ' aria-current="page"' : "";
                return `<li><a href="${EscapeHtml(href)}"${current}>${EscapeHtml(label)}</a></li>`;
            })
            .join("\n          ");
        out[doc.published] = fillTemplate("doc.html", {
            ...common,
            NAV_LINKS: navLinksFor(doc.published),
            ROOT: "../".repeat(doc.published.split("/").length - 1),
            TITLE: EscapeHtml(doc.title),
            NAV: `<ul>\n          ${nav}\n        </ul>`,
            CONTENT: doc.html,
            SOURCE_PATH: EscapeHtml(doc.source),
            SOURCE_URL: `${REPO_URL}/blob/main/${doc.source}`,
        });
    }
    return out;
}

/** @param {string} [distDir] where to build (tests build into a temp folder) */
export function Build(distDir = path.join(siteDir, "dist")) {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
    const releases = ParseChangelog(readFileSync(path.join(rootDir, "CHANGELOG.md"), "utf8"));
    const latest = releases[0];
    const changelogInline = (/** @type {string} */ text) => RenderInline(text, linkResolverFor("CHANGELOG.md", "index.html"));

    const common = { REPO_URL, YEAR: String(new Date().getFullYear()) };
    /** @type {Record<string, string>} */
    const values = {
        ...common,
        VERSION: EscapeHtml(pkg.version),
        LATEST_NAME: latest ? changelogInline(latest.name) : "",
        LATEST_DATE: latest ? EscapeHtml(latest.date) : "",
        SERVER_ADDRESS: EscapeHtml(SERVER_ADDRESS),
        STEAM_CONNECT_URL: EscapeHtml(STEAM_CONNECT_URL),
        WORKSHOP_BUTTON: WORKSHOP_URL ? `<a class="button button-primary" href="${EscapeHtml(WORKSHOP_URL)}">Subscribe on the Workshop</a>` : "",
        CHANGELOG: renderChangelog(releases, changelogInline),
        GAMEPLAY: renderGameplay(),
    };

    /** @type {Record<string, string>} published path -> HTML */
    const pages = { ...renderDocs(common) };
    for (const [to, from] of Object.entries(PAGES)) pages[to] = fillTemplate(from, { ...values, NAV_LINKS: navLinksFor(to) });

    rmSync(distDir, { recursive: true, force: true });
    mkdirSync(path.join(distDir, "images"), { recursive: true });
    for (const [to, html] of Object.entries(pages)) {
        mkdirSync(path.dirname(path.join(distDir, to)), { recursive: true });
        writeFileSync(path.join(distDir, to), html);
    }
    cpSync(path.join(siteDir, "style.css"), path.join(distDir, "style.css"));
    cpSync(path.join(siteDir, "favicon.svg"), path.join(distDir, "favicon.svg"));
    for (const [to, from] of Object.entries(COPIED_IMAGES)) cpSync(path.join(rootDir, from), path.join(distDir, to));
    GAMEPLAY_GIFS.forEach((gif, i) => cpSync(path.join(rootDir, gif.source), path.join(distDir, "images", `gameplay-${i + 1}.gif`)));
    const ownImages = path.join(siteDir, "images");
    if (existsSync(ownImages)) cpSync(ownImages, path.join(distDir, "images"), { recursive: true });
    writeFileSync(path.join(distDir, ".nojekyll"), ""); // serve the files as they are, no Jekyll pass

    return { version: pkg.version, releases: releases.length, pages: Object.keys(pages) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = Build();
    console.log(`site: built v${result.version} with ${result.releases} releases, ${result.pages.length} pages -> site/dist/`);
}
