// Renders the Melon Racer logo — `node tools/make-logo.mjs`: a watermelon
// slice seen from the side (like the 🍉 emoji) behind a slanted red banner
// reading MELON RACER, on transparent, into
// panorama/images/custom_game/logo_melon_racer.png (846x295, the size the
// intro screen's CSS and the GitHub page expect). That PNG is the source for
// everything else: the user menu and intro screen show it, site/build.mjs
// copies it, and tools/make-decal.mjs turns it into the map decal — re-run
// that after this. The logo is the SVG below; the banner's font is Bungee
// (tools/fonts/, SIL Open Font License), rendered with @resvg/resvg-js.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const OUT = new URL("../panorama/images/custom_game/logo_melon_racer.png", import.meta.url);
const FONT = fileURLToPath(new URL("./fonts/Bungee-Regular.ttf", import.meta.url));
const WIDTH = 846;
const HEIGHT = 295;

const SEED = (x, y) => `<path d="M${x} ${y} q2 6 0 9 q-2 -3 0 -9z"/>`;

// The slice on a 100x100 grid: rind down, flesh up, tilted like the emoji.
const SLICE = `
<g transform="rotate(-18 50 50)">
  <path d="M4 42 A46 46 0 0 0 96 42 Z" fill="#2f7a2f"/>
  <path d="M11 42 A39 39 0 0 0 89 42 Z" fill="#cfe8a8"/>
  <path d="M16 42 A34 34 0 0 0 84 42 Z" fill="#ff5a5f"/>
  <rect x="16" y="40" width="68" height="3" fill="#ff7a7e"/>
  <g fill="#1e1818">${SEED(32, 50)}${SEED(50, 52)}${SEED(68, 50)}${SEED(41, 62)}${SEED(59, 62)}</g>
</g>`;

// Laid out around (0, 0) — the banner's top center — then scaled into the picture.
const LOGO = `
<g transform="translate(-135 -205) scale(2.7)">${SLICE}</g>
<g transform="skewX(-10)">
  <polygon points="-250,10 250,10 232,66 -268,66" fill="#ff5a5f" stroke="#0b0f0a" stroke-width="5" stroke-linejoin="round"/>
  <text x="-9" y="54" text-anchor="middle" font-family="Bungee" font-size="44" fill="#eef4e8" stroke="#7a1b1f" stroke-width="3" paint-order="stroke">MELON RACER</text>
</g>`;

// The layout's extent (units): x from the banner's skewed left end to its
// right end, y from the slice's top to the banner's bottom, plus a margin.
const BOX = { x0: -284, x1: 256, y0: -130, y1: 70 };
const MARGIN = 6;
const scale = Math.min((WIDTH - 2 * MARGIN) / (BOX.x1 - BOX.x0), (HEIGHT - 2 * MARGIN) / (BOX.y1 - BOX.y0));
const cx = (BOX.x0 + BOX.x1) / 2;
const cy = (BOX.y0 + BOX.y1) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<g transform="translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${scale}) translate(${-cx} ${-cy})">${LOGO}</g>
</svg>`;

const png = new Resvg(svg, {
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: "Bungee" },
    fitTo: { mode: "original" },
}).render().asPng();
writeFileSync(OUT, png);
console.log(`wrote panorama/images/custom_game/logo_melon_racer.png (${WIDTH}x${HEIGHT})`);
