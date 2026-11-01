// A tiny prefab to check that Hammer opens .vmap files written by
// tools/lib/vmap.mjs: a floor (world mesh), a corner side-view trigger with
// its outputs, an info_target, a prop_static and a placed checkpoint gate with
// its override. `node tools/maps/make-generator-test-prefab.mjs` writes
// maps/prefabs/generator_test.vmap (+ its keyvalues2 text, to compare).
import { Vmap, BoxPolygons } from "../lib/vmap.mjs";

const map = new Vmap("maps/prefabs/generator_test.vmap");
map.Mesh(BoxPolygons([-256, -256, -16], [256, 256, 0], "materials/concrete/vertigo_concretefloorc.vmat"), [0, 0, 0], { world: true });
map.ZoneTrigger("side_view_corner_180_270", "side_view_enter", "side_view_leave", [0, 0, 0], [256, 256, 256], [0, 0, 0]);
map.Entity("info_target", { targetname: "generator_test_target" }, { origin: [-128, 0, 8], angles: [0, 90, 0] });
map.Entity("prop_static", { model: "models/melon_racer/buffer_stop/buffer_stop.vmdl", solid: "6", rendercolor: "255 255 255 255" }, { origin: [-128, -128, 0] });
map.Prefab("maps/prefabs/checkpoint_gate.vmap", [128, -128, 0], [0, 0, 0], { checkpoint: "checkpoint_6_1" });
map.Write("maps/prefabs/generator_test.vmap", { keepText: true });
