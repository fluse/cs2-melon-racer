import { Instance, CSInputs } from "cs_script/point_script";
import { DEBUG, Debug } from "./debug.js";
import { HEARTBEAT_INTERVAL } from "./constants.js";
import { karts, EnsureModerator } from "./kart-registry.js";
import { UpdateUserMenu, UpdateSpeedHud, UpdateJumpHud, UpdateCheckpointHud, ApplyHubModalState } from "./hud.js";
import { UpdateKart } from "./kart-physics.js";
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
        if (!kart.melon.IsValid() || !kart.pawn.IsValid()) {
            Debug(`Think: slot ${slot} melon/pawn no longer valid, dropping kart`);
            karts.delete(slot);
            continue;
        }
        UpdateUserMenu(slot, kart); // checked before UpdateKart's locked/breaking early-returns — USE works as an unstuck button
        UpdateKart(slot, kart, dt);
        UpdateSpeedHud(slot, kart.melon);
        UpdateJumpHud(slot, kart);
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
    }
    EnsureModerator();
    UpdateRaceFlow(now);
    // Re-think as soon as possible (every engine tick) rather than on a fixed
    // interval — WasInputJustPressed only reports a button edge for the
    // specific tick it happened on, so polling any slower than the engine's
    // own tick rate means some jump presses land on a tick we never check and
    // are silently lost. Same pattern as cs_script_demo's input.js.
    Instance.SetNextThink(Instance.GetGameTime());
}
