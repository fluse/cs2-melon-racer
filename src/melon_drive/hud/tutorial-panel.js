import { GetSpeedHud } from "./layout.js";
import { TutorialView } from "../tutorial/logic.js";
import { GetKartFinishedStations } from "../tutorial/tutorial.js";
import { TUTORIAL_MAX_STEPS, TUTORIAL_KEYS, TUTORIAL_DIAGRAMS, TUTORIAL_PROGRESS_SEGMENTS, TUTORIAL_HUD_UPDATE_SECONDS, HUD_RESEND_SECONDS } from "../constants/index.js";

/**
 * The tutorial card (tutorial_panel in melon_racer.xml, left middle) while a
 * melon is in a tutorial station: the station's title, its steps with the
 * current one lit and the finished ones ticked, how to do the current one
 * (help text, the keys lit on the keyboard, an animated diagram) and its
 * progress bar, the row of all stations (finished ones gold) — then "STATION
 * COMPLETE" for a moment. Rebuilt every TUTORIAL_HUD_UPDATE_SECONDS, each
 * class/variable sent on change and all of them again every HUD_RESEND_SECONDS.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {number} now
 */
export function UpdateTutorialHud(slot, kart, now) {
    if (now < (kart.tutorialNextUpdate ?? 0)) {
        return;
    }
    kart.tutorialNextUpdate = now + TUTORIAL_HUD_UPDATE_SECONDS;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const resend = now >= (kart.tutorialResendAt ?? 0);
    if (resend) {
        kart.tutorialResendAt = now + HUD_RESEND_SECONDS;
        kart.tutorialShown = {};
    }
    const shown = (kart.tutorialShown ??= {});
    /** @param {string} panel @param {string} cls @param {boolean} on */
    const Class = (panel, cls, on) => {
        const key = `${panel}.${cls}`;
        if (shown[key] !== String(on)) {
            shown[key] = String(on);
            hud.SetHasClassForPlayer(slot, panel, cls, on);
        }
    };
    /** @param {string} variable @param {string} value */
    const Text = (variable, value) => {
        if (shown[variable] !== value) {
            shown[variable] = value;
            hud.SetDialogVariableStringForPlayer(slot, "tutorial_panel", variable, value);
        }
    };

    const view = kart.tutorial ? TutorialView(kart.tutorial, GetKartFinishedStations(kart)) : undefined;
    Class("tutorial_panel", "Hidden", !view);
    if (!view) {
        return;
    }
    Class("tutorial_panel", "Complete", view.complete);
    Text("tutorial_kicker", view.kicker);
    Text("tutorial_title", view.title);
    Text("tutorial_help", view.help);
    Text("tutorial_message", view.message);
    Class("tutorial_xp", "Hidden", !view.firstTime);
    for (const station of view.stationRow) {
        Class(`tutorial_station_${station.id}`, "Done", station.done);
        Class(`tutorial_station_${station.id}`, "Current", station.current);
    }
    for (let i = 0; i < TUTORIAL_MAX_STEPS; i++) {
        const step = view.steps[i];
        Class(`tutorial_step_${i}`, "Hidden", !step);
        Class(`tutorial_step_${i}`, "Done", step?.state === "done");
        Class(`tutorial_step_${i}`, "Current", step?.state === "current");
        if (step) {
            Text(`tutorial_step_${i}_text`, step.text);
        }
    }
    Class("tutorial_keys", "Hidden", view.keys.length === 0);
    for (const { key } of TUTORIAL_KEYS) {
        Class(`tutorial_key_${key}`, "Lit", view.keys.includes(key));
    }
    for (const diagram of TUTORIAL_DIAGRAMS) {
        Class(`tutorial_diagram_${diagram}`, "Hidden", view.diagram !== diagram);
    }
    Class("tutorial_diagrams", "Hidden", view.diagram === undefined);
    for (let i = 0; i < TUTORIAL_PROGRESS_SEGMENTS; i++) {
        Class(`tutorial_progress_${i}`, "Lit", i < view.segments);
    }
}
