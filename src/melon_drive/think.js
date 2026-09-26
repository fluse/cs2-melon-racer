import { Instance, CSInputs } from "cs_script/point_script";
import { DEBUG, Debug } from "./debug.js";
import { HEARTBEAT_INTERVAL } from "./constants.js";
import { karts, EnsureModerator } from "./kart-registry.js";
import { UpdateUserMenu, UpdateSpeedHud, UpdateJumpHud, UpdateHealthHud, UpdateCheckpointHud, ApplyHubModalState } from "./hud.js";
import { UpdateKart, HandleMelonLost } from "./kart-physics.js";
import { phase, UpdateRaceFlow } from "./race-flow.js";

let lastHeartbeatTime = 0;
// Real elapsed time since the last Think, used for the movement math below —
// see the SetNextThink call at index.js's Think wiring for why this isn't a
// fixed interval.
let lastThinkTime = Instance.GetGameTime();

export function Think() {
    const now = Instance.GetGameTime();
    const dt = now - lastThinkTime;
    lastThinkTime = now;

    const heartbeat = DEBUG && now - lastHeartbeatTime >= HEARTBEAT_INTERVAL;
    if (heartbeat) {
        lastHeartbeatTime = now;
        Debug(`Think: ${karts.size} kart(s) tracked`);
    }

    for (const [slot, kart] of karts) {
        if (!kart.pawn.IsValid()) {
            Debug(`Think: slot ${slot} pawn no longer valid, dropping kart`);
            karts.delete(slot);
            continue;
        }
        if (!kart.melon.IsValid()) {
            // The melon (a prop_physics_multiplayer) can be destroyed for
            // real by the engine's own physics damage on a hard enough
            // impact — separate from (and sometimes faster than) our own
            // scripted BreakMelon/health system. HandleMelonLost runs it
            // through the same particle + delay + checkpoint-respawn
            // sequence as a script-detected break instead of leaving it
            // gone for good — nothing else would ever call GetOrCreateKart
            // again while the player's pawn stays alive (no round restarts,
            // no fall/weapon damage — see gamemode/index.js).
            HandleMelonLost(slot, kart);
            // Still lets USE work as an unstuck button while waiting on the
            // respawn above — it only touches kart.userMenuOpen/the pawn,
            // never the (currently missing) melon.
            UpdateUserMenu(slot, kart);
            continue;
        }
        kart.lastKnownPosition = kart.melon.GetAbsOrigin();
        kart.lastKnownAngles = kart.melon.GetAbsAngles();
        // One kart's update throwing for any other reason must not take down
        // every other player's kart with it — and, critically, must not skip
        // the SetNextThink call below, which would silently freeze the
        // *entire* gamemode (no more movement, HUD, or user-menu input for
        // anyone) until the next map/script reload.
        try {
            UpdateUserMenu(slot, kart); // checked before UpdateKart's locked/breaking early-returns — USE works as an unstuck button
            UpdateKart(slot, kart, dt);
            UpdateSpeedHud(slot, kart.melon);
            UpdateJumpHud(slot, kart);
            UpdateHealthHud(slot, kart);
            UpdateCheckpointHud(slot, kart);
            if (kart.inHub) {
                ApplyHubModalState(slot, phase);
            }
            if (heartbeat) {
                const vel = kart.melon.GetAbsVelocity();
                Debug(
                    `Think: slot ${slot} velocity=(${vel.x.toFixed(0)}, ${vel.y.toFixed(0)}, ${vel.z.toFixed(0)}) ` +
                    `melonPos=${JSON.stringify(kart.melon.GetAbsOrigin())} eyeYaw=${kart.pawn.GetEyeAngles().yaw.toFixed(0)} ` +
                    `input(F/B/L/R/Jump)=${kart.pawn.IsInputPressed(CSInputs.FORWARD)}/${kart.pawn.IsInputPressed(CSInputs.BACK)}/` +
                    `${kart.pawn.IsInputPressed(CSInputs.LEFT)}/${kart.pawn.IsInputPressed(CSInputs.RIGHT)}/` +
                    `${kart.pawn.IsInputPressed(CSInputs.JUMP)}`
                );
            }
        } catch (err) {
            Debug(`Think: slot ${slot} update threw, dropping kart to keep the gamemode alive for everyone else: ${err}`);
            karts.delete(slot);
        }
    }
    EnsureModerator();
    // Same reasoning as the per-kart try/catch above: a race-flow transition
    // throwing (e.g. teleporting a kart whose melon just got destroyed) must
    // never skip the SetNextThink below and freeze the gamemode for everyone.
    try {
        UpdateRaceFlow(now);
    } catch (err) {
        Debug(`Think: UpdateRaceFlow threw: ${err}`);
    }
    // Re-think as soon as possible (every engine tick) rather than on a fixed
    // interval — WasInputJustPressed only reports a button edge for the
    // specific tick it happened on, so polling any slower than the engine's
    // own tick rate means some jump presses land on a tick we never check and
    // are silently lost. Same pattern as cs_script_demo's input.js.
    Instance.SetNextThink(Instance.GetGameTime());
}
