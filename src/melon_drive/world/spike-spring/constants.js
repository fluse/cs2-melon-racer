// Spike springs: a prop_dynamic with the spike spring model whose name starts
// with "spike_spring" pops its spikes out of the floor again and again — the
// script plays its animations on a fixed clock and breaks every melon over
// it while the spikes are out. No logic_timer or trigger in Hammer needed.
// Rule: world/spike-spring/logic.js, applied by world/spike-spring/spike-spring.js.
// The animation lengths are shared with the model's generator,
// tools/models/make-spike-spring-model.mjs (it imports them from here):
// change one, re-run it and recompile the model.

// The class the script looks for spike springs in.
export const SPIKE_SPRING_CLASS = "prop_dynamic";
// "spike_spring" or "spike_spring_<parts>", parts split by "_": the first two
// numbers in a row are seconds down and seconds up, "offset<seconds>" is how
// far its clock runs ahead of the others, words are ignored — e.g.
// "spike_spring_2_1", "spike_spring_downtime_uptime_1.5_0.5_offset0.3_left".
export const SPIKE_SPRING_NAME_PATTERN = /^spike_spring(?:_.*)?$/;
// Seconds a spike spring without "_<down>_<up>" in its name stays down / up.
export const SPIKE_SPRING_DOWN_SECONDS = 1.6;
export const SPIKE_SPRING_UP_SECONDS = 1;
// How often the map is searched for spike springs again, so one that spawned
// after the script's first look (or after a round restart) isn't missed.
export const SPIKE_SPRING_SCAN_SECONDS = 2;

// The model's animations: "rise" pops the spikes out (the first
// SPIKE_SPRING_POP_SECONDS of it), "sink" pulls them back in; "up"/"down" hold.
export const SPIKE_SPRING_RISE_SECONDS = 0.7;
export const SPIKE_SPRING_POP_SECONDS = 0.12;
export const SPIKE_SPRING_SINK_SECONDS = 0.45;
// While sinking the spikes still hurt for this share of it.
export const SPIKE_SPRING_SINK_LETHAL_SHARE = 0.5;

// Where a melon counts as "on the spikes", in the prop's own frame (any
// rotation: floor, wall, ceiling), around its origin (the surface, the
// shaft's middle): half the side of a square (the 32-unit shaft plus about a
// melon's radius) and how far out its center can be (the spikes reach 35,
// plus a melon's radius).
export const SPIKE_SPRING_HALF_SIZE = 19;
export const SPIKE_SPRING_HEIGHT = 44;
// …and how far behind the surface (a melon sunk into the lid a little).
export const SPIKE_SPRING_DEPTH = 8;
