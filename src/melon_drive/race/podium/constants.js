// Podium in the hub: after a Grand Prix that ran to its last track, the top
// three are put on it and held there for a while. See "Podium" in
// GAMEPLAY.md.

// How many places the podium has — one info_target per place.
export const PODIUM_PLACES = 3;
// Where place <n> stands: an info_target named "podium_spawn_<n>"
// ("podium_spawn_1" = the winner's step), on the floor under it. Its yaw is
// the way the podium faces (towards the room): the melon is set down facing
// it, the player's view the other way, so the chase camera looks at the
// podium from the room. A place without one sends that racer to hub_spawn
// like everyone else.
export const PODIUM_SPAWN_NAME_PATTERN = /^podium_spawn_([1-3])$/;
/** @param {number} place */
export function PodiumSpawnName(place) {
    return `podium_spawn_${place}`;
}
// How long they're held on their step (seconds): jumping and looking around
// work, driving and the attack boost don't. The hub/tutorial/respawn buttons
// and any teleport let them go earlier.
export const PODIUM_HOLD_SECONDS = 10;
// How hard a held melon is pulled back over its spot (1/s: units/sec of
// horizontal speed per unit it's off), e.g. after a jump that didn't land
// straight — and at most this fast (units/sec).
export const PODIUM_PULL = 6;
export const PODIUM_PULL_MAX_SPEED = 200;
// Confetti over the podium: every info_particle_system by this name (Start
// Active off) gets Start once the top three are up there, again every
// PODIUM_CONFETTI_INTERVAL seconds (a short Stop first, so a one-off burst
// fires anew), and Stop when their hold ends. Optional.
export const PODIUM_CONFETTI_NAME = "particle_podium_confetti";
export const PODIUM_CONFETTI_INTERVAL = 2; // seconds between bursts
export const PODIUM_CONFETTI_RESTART_GAP = 0.1; // seconds between a burst's Stop and its Start
