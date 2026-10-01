import { Instance } from "cs_script/point_script";

// Free-look melon driving: each player gets their own prop_physics melon
// (spawned from a point_template placed in Hammer). Steering direction comes
// from where the player is looking (mouse), not a separate turn control:
// W/S push the melon forward/back along the camera's look direction, A/D
// strafe it left/right relative to that same direction, and Space jumps.
// The player's own pawn is frozen (and hidden) at its spawn position and
// left there — it deliberately does NOT track the melon's position. Doing
// that used to make the pawn's solid hitbox constantly overlap the melon's
// physics collision, and the two would fight/shove each other every tick.
// The camera follows the melon directly (CustomPlayerCamera), so the pawn
// doesn't need to be anywhere near it for the view to work.
//
// This file only wires things up: the per-tick driver (core/think.js), the
// hot-reload snapshot, and each domain's script inputs. The domains:
//   core/      kart registry, tick loop, traces, Debug
//   kart/      spawning, spawn points, teleporting, paint + glow
//   movement/  driving, contact, jumping, wall bounce, attack boost, momentum
//   health/    damage, breaking, healing
//   zones/     lift, jump pad, camera zone, teleporter triggers
//   race/      tracks, checkpoints, time trial, hub/heat flow
//   camera/    chase camera and its zooms
//   hud/       one file per HUD panel, button clicks
//   fx/        particles, boost trail, guide line
//   dev/       debug views
// Tunables: each folder's constants.js, all re-exported by constants/index.js.

import { Debug } from "./core/debug.js";
import { karts, moderatorSlot, SetModeratorSlot } from "./core/kart-registry.js";
import { Think } from "./core/think.js";
import { RegisterKartInputs } from "./kart/index.js";
import { RegisterBreakInputs } from "./health/index.js";
import { RegisterZoneInputs } from "./zones/index.js";
import { phase, activeTrackId, phaseEndTime, RestoreRaceFlowSnapshot, RegisterRaceInputs } from "./race/index.js";
import { RegisterHudInputs } from "./hud/index.js";
import { RegisterAttackDebug } from "./dev/index.js";

Instance.SetThink(Think);
Instance.SetNextThink(Instance.GetGameTime());

// Tools-mode hot reload re-runs this whole file top-to-bottom, which would
// otherwise reset `karts` to an empty Map while the previously spawned
// melons are still alive in the world — the next respawn would then spawn
// a *second* melon on top of the orphaned one and the two would violently
// shove each other apart. Carry the existing tracking across the reload.
// Race-flow phase/activeTrackId/phaseEndTime are carried the same way, so
// reloading mid-heat during dev iteration doesn't strand locked racers in a
// phase that's forgotten it's supposed to unlock/advance them.
Instance.OnScriptReload({
    before: () => ({ karts, phase, activeTrackId, phaseEndTime, moderatorSlot }),
    after: (memory) => {
        if (memory?.karts) {
            for (const [slot, kart] of memory.karts) {
                karts.set(slot, kart);
            }
            RestoreRaceFlowSnapshot(memory);
            SetModeratorSlot(memory.moderatorSlot);
            Debug(`OnScriptReload: restored ${karts.size} kart(s), phase=${phase}, activeTrackId=${activeTrackId}, moderatorSlot=${moderatorSlot}`);
        }
    },
});

RegisterKartInputs(); // OnPlayerReset/OnPlayerDisconnect, melon_paint
RegisterRaceInputs(); // start_/checkpoint_/finish_<trackId>, hub_enter/hub_leave/hub_teleport
RegisterZoneInputs(); // heal/lift/camera/jump pad *_enter/*_leave, melon_teleport
RegisterBreakInputs(); // melon_break
RegisterHudInputs(); // OnCustomHudClicked
RegisterAttackDebug();
