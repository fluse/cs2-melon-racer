// Camera tuning: the user menu's "Camera Settings" page (DEVELOPER column)
// sets the chase camera's distance and height for the clicking player only
// (kart.cameraTuning, read by GetCameraOffsetFor in camera/follow/follow.js),
// to try out values for CAMERA_DISTANCE/CAMERA_HEIGHT in-game. Lift, podium
// and camera-zone zooms still add on top. Not saved: gone on reconnect or a
// map restart — every change is logged to the console, ready to copy into
// camera/follow/constants.js. The scale is the shared one
// (tuning-scale-logic.js); opening/closing the page is SetUserMenuPage in
// hud/user-menu.js.
import { Instance } from "cs_script/point_script";
import { GetSpeedHud } from "../hud/layout.js";
import { CAMERA_TUNING_SCALE, ParseTuningButton, TunedValue } from "./tuning-scale-logic.js";
import { UpdateTuningScaleHud } from "./tuning-scale.js";
import { CAMERA_DISTANCE, CAMERA_HEIGHT } from "../constants/index.js";

/** @typedef {"distance" | "height"} CameraTuningAxis */
/** @type {CameraTuningAxis[]} */
const AXES = ["distance", "height"];

/**
 * This player's chase camera distance and height: their tuned values, else
 * the defaults.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function GetCameraTuning(kart) {
    return { distance: kart.cameraTuning?.distance ?? CAMERA_DISTANCE, height: kart.cameraTuning?.height ?? CAMERA_HEIGHT };
}

/**
 * Sets the values and shows them. Back on both defaults, the kart drops its
 * tuning again.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {{ distance: number, height: number }} tuning
 */
function SetCameraTuning(slot, kart, tuning) {
    kart.cameraTuning = tuning.distance === CAMERA_DISTANCE && tuning.height === CAMERA_HEIGHT ? undefined : tuning;
    Instance.Msg(`[camera tuning] slot ${slot}: distance ${tuning.distance}, height ${tuning.height} (CAMERA_DISTANCE/CAMERA_HEIGHT)`);
    UpdateCameraTuningHud(slot, kart);
}

/**
 * The camera page's numbers and its two scales, filled up to the values.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdateCameraTuningHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const tuning = GetCameraTuning(kart);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_distance", `${tuning.distance}`);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_height", `${tuning.height}`);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_distance_default", `${CAMERA_DISTANCE}`);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_height_default", `${CAMERA_HEIGHT}`);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_step", `${CAMERA_TUNING_SCALE.step}`);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_fine_step", `${CAMERA_TUNING_SCALE.fineStep}`);
    for (const axis of AXES) {
        UpdateTuningScaleHud(hud, slot, `camtune_${axis}_`, CAMERA_TUNING_SCALE, tuning[axis]);
    }
}

/**
 * A click on the camera page's controls (button ids "camtune_…"): reset,
 * or − / + (big or fine step) or a segment on an axis.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {string} buttonId
 * @returns {boolean} whether it was one of them
 */
export function HandleCameraTuningClick(slot, kart, buttonId) {
    if (buttonId === "camtune_reset_button") {
        SetCameraTuning(slot, kart, { distance: CAMERA_DISTANCE, height: CAMERA_HEIGHT });
        return true;
    }
    const button = ParseTuningButton("camtune_", buttonId);
    const axis = AXES.find((a) => a === button?.row);
    if (!button || !axis) {
        return false;
    }
    const tuning = GetCameraTuning(kart);
    SetCameraTuning(slot, kart, { ...tuning, [axis]: TunedValue(CAMERA_TUNING_SCALE, tuning[axis], button) });
    return true;
}
