// The hub's "Start Grand Prix" window (hud/hub-modal/hub-modal.js). Its
// heat cards are "hub_heat_<trackId>" for every track id up to MAX_TRACKS,
// each with its route's icon from tools/images/make-route-icons.mjs.

// This many rows in its racer list, "hub_racer_0" .. "hub_racer_{N-1}" in
// melon_racer.xml (built from this count, src/panorama/melon_racer/hub-modal.xml). With
// more players in the start area the viewer's own row takes the last one,
// and "+N MORE" counts the rest.
export const HUB_RACER_ROWS = 8;
