// Builds a floor spotlight for the hub (around the Grand Prix pavilion, the
// stage, anywhere) — `node tools/models/make-floor-spotlight-model.mjs`: an
// event searchlight standing on the floor, its beam shining up into the sky.
//
//   floor_spotlight        the lamp: a round base plate with a turntable, a
//                          graphite yoke, the lamp head between its arms
//                          tilted TILT degrees from straight up towards +X,
//                          cooling fins round its back, a bezel and a glowing
//                          lens at the front; solid (a box round it all)
//   floor_spotlight_beam   the light beam out of the lens: two open cones
//                          (a wide soft one, a narrow bright core) in an
//                          additive csgo_effects material — the way Valve's
//                          own light shafts (materials/effects/smoke/lightshaft_*)
//                          are made: soft edges (fresnel), soft where it
//                          meets geometry (depth feather), fading out along
//                          its length; never solid, no shadow
//
// Both at the same origin (the lamp's middle, on the floor) — place the
// beam on the lamp with the same position and angles. Turn them (yaw) to
// point the beam; scale both alike for a bigger lamp. The beam is only
// drawn light: a light_spot at the lens, pointing the same way, lights the
// surroundings (where: see the output).
// Writes models/melon_racer/floor_spotlight/floor_spotlight{,_beam}.vmdl
// (+ .obj, the lamp's _physics.obj) and
// materials/melon_racer/floor_spotlight/floor_spotlight_<part>.vmat (+ textures).
// Compile the .vmdl files with resourcecompiler (see the output).
import { EncodePng } from "../lib/png.mjs";
import { ChamferedRect, Mesh, ObjText, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- The lamp (units) ---
const TILT = 15; // degrees from straight up, towards +X
const BASE_RADIUS = 9;
const BASE_HEIGHT = 1.5;
const TURNTABLE_RADIUS = 6;
const TURNTABLE_HEIGHT = 2;
const PIVOT_Z = 14; // the head turns around a Y axis this high
const HEAD_RADIUS = 5.5;
const HEAD_BACK = 7; // from the pivot back to the head's end
const HEAD_FRONT = 9; // from the pivot forward to the bezel
const FINS = 4; // cooling fins round the back half
const FIN_RADIUS = HEAD_RADIUS + 0.7;
const FIN_WIDTH = 0.6;
const BEZEL_RADIUS = HEAD_RADIUS + 0.5;
const BEZEL_DEPTH = 1.5;
const LENS_RADIUS = HEAD_RADIUS - 0.6;
const LENS_INSET = 0.4; // the lens sits this far inside the bezel's front
const ARM_GAP = HEAD_RADIUS + 1.2; // from the head's axis to each yoke arm's middle
const ARM_SIZE = [3, 1.6]; // along X, Y
const HEAD_SIDES = 16; // round enough at a few meters
const SMALL_SIDES = 8;

// --- The beam ---
const BEAM_LENGTH = 1536;
const BEAM_SIDES = 16; // the fresnel hides the facets
// [start radius at the lens, end radius, brightness at the lens (0..1)]
const BEAM_CONES = {
    beam: { start: LENS_RADIUS, end: 150, brightness: 0.35 }, // the wide soft glow
    core: { start: LENS_RADIUS * 0.55, end: 45, brightness: 0.55 }, // the bright core
};
const BEAM_FADE_POWER = 1.6; // how quickly it fades along its length (1 = linear)
const BEAM_FADE_IN = 0.015; // fades in over this share of its length, so the lens end has no hard ring
const BEAM_U_MARGIN = 0.02; // the gradient's ends kept off the texture's wrap
const BEAM_TEXTURE_WIDTH = 256;

// tint: whether the prop's render color tints it.
const COLORS = {
    grey: { rgb: [0xd8, 0xdc, 0xe0], tint: 1 }, // the stage's light grey: base plate, turntable, tinted per prop
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // the hub gates' graphite: yoke, head, bezel
    metal: { rgb: [0x8a, 0x90, 0x96], tint: 0 }, // the fins, the pivot knobs
    lens: { rgb: [0xff, 0xf1, 0xd6], tint: 0, glow: 6 }, // warm white, like the pavilion's light ring
};
const BEAM_COLOR = COLORS.lens.rgb;

const NAME = "floor_spotlight";
const MODEL_DIR = "models/melon_racer/floor_spotlight";
const MATERIAL_DIR = "materials/melon_racer/floor_spotlight";
const GENERATOR = "tools/models/make-floor-spotlight-model.mjs";

const tilt = (TILT * Math.PI) / 180;
const AXIS = [Math.sin(tilt), 0, Math.cos(tilt)]; // the way the head points
const PIVOT = [0, 0, PIVOT_Z];
const AlongAxis = d => V3.Add(PIVOT, V3.Scale(AXIS, d));
const LENS_CENTER = AlongAxis(HEAD_FRONT + BEZEL_DEPTH - LENS_INSET);

/** A box from z0 to z1 round (x, y), `size` along X and Y, edges chamfered. */
const Box = (mesh, x, y, size, z0, z1, part, chamfer = 0.4) => mesh.Extrude(Shape(ChamferedRect(x, y, size[0], size[1], chamfer)), z0, z1, part, "z");

function BuildLamp(mesh, physics) {
    // The base plate and the turntable on it.
    mesh.Tube([[0, 0, 0], [0, 0, BASE_HEIGHT]], BASE_RADIUS, HEAD_SIDES, "grey");
    mesh.Tube([[0, 0, BASE_HEIGHT], [0, 0, BASE_HEIGHT + TURNTABLE_HEIGHT]], TURNTABLE_RADIUS, HEAD_SIDES, "grey");
    const deck = BASE_HEIGHT + TURNTABLE_HEIGHT;
    // The yoke: a crossbar on the turntable, an arm up each side to the pivot.
    const armSpan = 2 * ARM_GAP + ARM_SIZE[1];
    Box(mesh, 0, 0, [ARM_SIZE[0], armSpan], deck, deck + 2, "dark");
    for (const side of [-1, 1]) {
        Box(mesh, 0, side * ARM_GAP, ARM_SIZE, deck + 2, PIVOT_Z + 2.5, "dark");
        // The pivot knob outside the arm.
        const y = side * (ARM_GAP + ARM_SIZE[1] / 2);
        mesh.Tube([[0, y, PIVOT_Z], [0, y + side * 1.2, PIVOT_Z]], 1.8, SMALL_SIDES, "metal");
        // An axle stub from the arm into the head.
        mesh.Tube([[0, side * (HEAD_RADIUS - 0.5), PIVOT_Z], [0, y, PIVOT_Z]], 0.9, SMALL_SIDES, "metal", false);
    }
    // The head: a rounded back, the barrel, the bezel.
    const profile = [[-HEAD_BACK, HEAD_RADIUS * 0.55], [-HEAD_BACK + 1, HEAD_RADIUS * 0.85], [-HEAD_BACK + 2.5, HEAD_RADIUS], [HEAD_FRONT, HEAD_RADIUS]];
    mesh.Tube(profile.map(([d]) => AlongAxis(d)), i => profile[i][1], HEAD_SIDES, "dark", true, { slopedNormals: true });
    mesh.Tube([AlongAxis(HEAD_FRONT - 0.2), AlongAxis(HEAD_FRONT + BEZEL_DEPTH)], BEZEL_RADIUS, HEAD_SIDES, "dark");
    // The lens, just inside the bezel's front.
    mesh.Tube([AlongAxis(HEAD_FRONT + BEZEL_DEPTH - LENS_INSET - 0.2), LENS_CENTER], LENS_RADIUS, HEAD_SIDES, "lens");
    // Cooling fins round the back half.
    for (let i = 0; i < FINS; i++) {
        const d = -HEAD_BACK + 3 + i * 2;
        mesh.Tube([AlongAxis(d - FIN_WIDTH / 2), AlongAxis(d + FIN_WIDTH / 2)], FIN_RADIUS, HEAD_SIDES, "metal");
    }
    // Collision: the base, and a box round yoke and head.
    physics.Tube([[0, 0, 0], [0, 0, deck]], BASE_RADIUS, SMALL_SIDES, "grey");
    physics.Tube([AlongAxis(-HEAD_BACK), AlongAxis(HEAD_FRONT + BEZEL_DEPTH)], BEZEL_RADIUS, SMALL_SIDES, "dark");
    Box(physics, 0, 0, [ARM_SIZE[0], armSpan], deck, PIVOT_Z + 2.5, "dark", 0);
}

/** The beam: an open cone per BEAM_CONES entry out of the lens along the head's axis; U runs along it (0 at the lens). */
function BuildBeam(mesh) {
    const end = V3.Add(LENS_CENTER, V3.Scale(AXIS, BEAM_LENGTH));
    for (const [part, { start, end: endRadius }] of Object.entries(BEAM_CONES)) {
        const first = mesh.vt.length;
        mesh.Tube([LENS_CENTER, end], i => (i === 0 ? start : endRadius), BEAM_SIDES, part, false, { slopedNormals: true });
        // Tube's V runs along it (the mesh's uvTile is BEAM_LENGTH: 0..1); move that into U, which no
        // importer flips, kept off the texture's wrap at both ends. Around the cone the texture is the same.
        for (let k = first; k < mesh.vt.length; k++) mesh.vt[k] = [BEAM_U_MARGIN + (1 - 2 * BEAM_U_MARGIN) * mesh.vt[k][1], 0.5];
    }
}

/** The beam's gradient along U: black (additive: nothing) except near the lens, `brightness` times the beam color there. */
function BeamPng(brightness) {
    return EncodePng(BEAM_TEXTURE_WIDTH, 4, x => {
        const u = (x + 0.5) / BEAM_TEXTURE_WIDTH;
        const t = Math.min(Math.max((u - BEAM_U_MARGIN) / (1 - 2 * BEAM_U_MARGIN), 0), 1);
        const fade = Math.min(t / BEAM_FADE_IN, 1) * (1 - t) ** BEAM_FADE_POWER;
        return [...BEAM_COLOR.map(c => Math.round(c * brightness * fade)), 255];
    });
}

/** An additive, two-sided csgo_effects material (like materials/effects/smoke/lightshaft_001): soft edges, soft where it meets geometry, gone up close. */
const BeamVmatText = texture => `// AUTO-GENERATED by ${GENERATOR}

Layer0
{
	shader "csgo_effects.vfx"

	F_ADDITIVE_BLEND 1
	F_DEPTH_FEATHER 1
	F_RENDER_BACKFACES 1

	g_bFogEnabled "1"
	g_flColorBoost "1.000"
	g_flOpacityScale "1.000"
	g_vColorTint "[1.000000 1.000000 1.000000 0.000000]"
	TextureColor "${texture}"
	g_nTextureAddressModeU "0"
	g_nTextureAddressModeV "0"

	g_flFeatherDistance "48.000"
	g_flFeatherFalloff "1.000"

	g_flFresnelExponent "1.200"
	g_flFresnelFalloff "1.000"
	g_flFresnelMin "0.000"
	g_flFresnelMax "1.000"

	g_flFadeDistance "96.000"
	g_flFadeFalloff "1.000"
	g_flFadeMin "0.000"
	g_flFadeMax "1.000"
}
`;

const materials = Object.fromEntries([...Object.keys(COLORS), ...Object.keys(BEAM_CONES)].map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));

// The lamp.
{
    const mesh = new Mesh(16);
    const physics = new Mesh();
    BuildLamp(mesh, physics);
    const obj = `${MODEL_DIR}/${NAME}.obj`;
    const physicsObj = `${MODEL_DIR}/${NAME}_physics.obj`;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, surfaceProp: "metal", materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    console.log(`  ${NAME}.vmdl: ${mesh.triangleCount} triangles (collision ${physics.triangleCount})`);
}
// The beam.
{
    const mesh = new Mesh(BEAM_LENGTH);
    BuildBeam(mesh);
    const obj = `${MODEL_DIR}/${NAME}_beam.obj`;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${NAME}_beam.vmdl`, VmdlText({ name: NAME, mesh: obj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    console.log(`  ${NAME}_beam.vmdl: ${mesh.triangleCount} triangles, no collision`);
}

for (const [part, { rgb, tint, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint, glow }));
}
for (const [part, { brightness }] of Object.entries(BEAM_CONES)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, BeamPng(brightness));
    WriteAddonFile(materials[part], BeamVmatText(texture));
}

const fmt = p => p.map(n => n.toFixed(1)).join(" ");
const top = AlongAxis(HEAD_FRONT + BEZEL_DEPTH)[2] + BEZEL_RADIUS * Math.sin(tilt);
console.log(`lamp ${2 * BASE_RADIUS} across, ${top.toFixed(0)} high, head tilted ${TILT} degrees towards +X; beam ${BEAM_LENGTH} long, ${2 * BEAM_CONES.beam.end} wide at its end`);
console.log(`light_spot: at ${fmt(LENS_CENTER)} from the origin (before yaw), pitch ${-(90 - TILT)} (yaw = the props' yaw)`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}{,_beam}.vmdl"`);
