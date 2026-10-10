// Generates the material of an inflatable pool mattress — `node tools/make-inflatable.mjs`:
// no shapes of its own (tubes, seams come from the geometry), only how the
// vinyl reflects: smooth, glossy, not metallic, with a faint, broad
// unevenness in the gloss so highlights don't look perfectly CG. The color
// is plain white on purpose, so it can be tinted afterwards (the material's
// g_vColorTint, or an entity's render color — g_flModelTintAmount is 1).
// Writes
//   materials/melon_racer/surfaces/inflatable.vmat
//   materials/melon_racer/surfaces/inflatable_{color,rough}.png
// The roughness map tiles both ways.
import { EncodePng } from "./png.mjs";
import { VmatText, WriteAddonFile } from "./model.mjs";

const SIZE = 512;
// Glossy but not a mirror: lower showed the map's low-res cubemaps as dark,
// blocky reflections all over a surface; vinyl has broad, soft highlights.
const ROUGHNESS = 0.42;
const ROUGHNESS_VARIATION = 0.04; // ± around it — faint, like a slightly uneven, handled surface
// Broad blotches of that variation: waves per repeat (whole numbers, so it
// tiles) along x and y, and their weight. Low counts = big, soft patches.
const WAVES = [
    { x: 1, y: 2, weight: 1, phase: 0.1 },
    { x: 3, y: 1, weight: 0.6, phase: 0.7 },
    { x: 2, y: 5, weight: 0.35, phase: 0.35 },
    { x: 7, y: 4, weight: 0.2, phase: 0.9 },
];
const GENERATOR = "tools/make-inflatable.mjs";
const DIR = "materials/melon_racer/surfaces";
const NAME = "inflatable";

const totalWeight = WAVES.reduce((sum, w) => sum + w.weight, 0);
const byte = v => Math.round(Math.min(1, Math.max(0, v)) * 255);

// Plain white — tinted in Hammer.
WriteAddonFile(`${DIR}/${NAME}_color.png`, EncodePng(4, 4, () => [255, 255, 255, 255]));

WriteAddonFile(`${DIR}/${NAME}_rough.png`, EncodePng(SIZE, SIZE, (x, y) => {
    let n = 0;
    for (const w of WAVES) {
        n += w.weight * Math.sin(2 * Math.PI * ((x / SIZE) * w.x + (y / SIZE) * w.y + w.phase));
    }
    const r = byte(ROUGHNESS + ROUGHNESS_VARIATION * (n / totalWeight));
    return [r, r, r, 255];
}));

WriteAddonFile(`${DIR}/${NAME}.vmat`, VmatText({
    texture: `${DIR}/${NAME}_color.png`,
    roughness: `${DIR}/${NAME}_rough.png`,
    generator: GENERATOR,
}));
