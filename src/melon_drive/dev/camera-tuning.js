// Camera tuning: the user menu's "Camera Settings" page (DEVELOPER column)
// sets the chase camera's distance and height for the clicking player only
// (kart.cameraTuning, read by GetCameraOffsetFor in camera/follow/follow.js),
// to try out values for CAMERA_DISTANCE/CAMERA_HEIGHT in-game. Lift, podium
// and camera-zone zooms still add on top. Not saved: gone on reconnect or a
// map restart — every change is logged to the console, ready to copy into
// camera/follow/constants.js.
import { Instance } from "cs_script/point_script";
import { GetSpeedHud } from "../hud/layout.js";
import { ClampCameraTuning, CameraTuningSegmentCount, CameraTuningSegmentValue, IsCameraTuningSegmentLit } from "./camera-tuning-logic.js";
import { CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_TUNING_STEP, CAMERA_TUNING_FINE_STEP } from "../constants/index.js";

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
 * Sets one value (kept on the scale) and shows it. Back on both defaults,
 * the kart drops its tuning again.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {CameraTuningAxis} axis @param {number} value
 */
function SetCameraTuning(slot, kart, axis, value) {
    const tuning = { ...GetCameraTuning(kart), [axis]: ClampCameraTuning(value) };
    kart.cameraTuning = tuning.distance === CAMERA_DISTANCE && tuning.height === CAMERA_HEIGHT ? undefined : tuning;
    Instance.Msg(`[camera tuning] slot ${slot}: distance ${tuning.distance}, height ${tuning.height} (CAMERA_DISTANCE/CAMERA_HEIGHT)`);
    UpdateCameraTuningHud(slot, kart);
}

/**
 * Switches the user menu between its normal columns and the camera page.
 * The menu always opens on its columns (SetUserMenuOpen).
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {boolean} open
 */
export function SetCameraTuningPage(slot, kart, open) {
    kart.cameraTuningPage = open;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "usermenu_main_page", "Hidden", open);
    hud.SetHasClassForPlayer(slot, "usermenu_camera_page", "Hidden", !open);
    if (open) {
        UpdateCameraTuningHud(slot, kart);
    }
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
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_step", `${CAMERA_TUNING_STEP}`);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_camera_page", "camtune_fine_step", `${CAMERA_TUNING_FINE_STEP}`);
    for (const axis of AXES) {
        for (let i = 0; i < CameraTuningSegmentCount(); i++) {
            hud.SetHasClassForPlayer(slot, `camtune_${axis}_seg_${i}`, "On", IsCameraTuningSegmentLit(i, tuning[axis]));
        }
    }
}

/**
 * A click on the camera page (every button id starts with "camtune_"):
 * back, reset, − / + (big or fine step) on an axis, or a segment of its scale.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {string} buttonId
 * @returns {boolean} whether it was one of the page's buttons
 */
export function HandleCameraTuningClick(slot, kart, buttonId) {
    if (buttonId === "camtune_back_button") {
        SetCameraTuningPage(slot, kart, false);
        return true;
    }
    if (buttonId === "camtune_reset_button") {
        SetCameraTuning(slot, kart, "distance", CAMERA_DISTANCE);
        SetCameraTuning(slot, kart, "height", CAMERA_HEIGHT);
        return true;
    }
    const match = /^camtune_(distance|height)_(minus|plus|minus_fine|plus_fine|seg_(\d+))$/.exec(buttonId);
    if (!match) {
        return false;
    }
    const axis = /** @type {CameraTuningAxis} */ (match[1]);
    const current = GetCameraTuning(kart)[axis];
    if (match[2] === "minus") {
        SetCameraTuning(slot, kart, axis, current - CAMERA_TUNING_STEP);
    } else if (match[2] === "plus") {
        SetCameraTuning(slot, kart, axis, current + CAMERA_TUNING_STEP);
    } else if (match[2] === "minus_fine") {
        SetCameraTuning(slot, kart, axis, current - CAMERA_TUNING_FINE_STEP);
    } else if (match[2] === "plus_fine") {
        SetCameraTuning(slot, kart, axis, current + CAMERA_TUNING_FINE_STEP);
    } else {
        SetCameraTuning(slot, kart, axis, CameraTuningSegmentValue(Number(match[3])));
    }
    return true;
}
