// The custom HUD (panorama/layout/custom_game/speedometer.xml), one file per
// panel: speedometer.js (speed, jump and health bars), bounce-panel.js,
// track.js (time trial clock + checkpoint strip), hub-modal.js, user-menu.js.
// layout.js finds the custom_hud_layout entity; inputs.js handles every
// button click.
export { GetSpeedHud } from "./layout.js";
export { UpdateSpeedHud, UpdateJumpHud, UpdateHealthHud } from "./speedometer.js";
export { UpdateBounceHud } from "./bounce-panel.js";
export { UpdateCheckpointHud } from "./track.js";
export { ApplyHubModalState, ShowHubModal, HideHubModal } from "./hub-modal.js";
export { SetUserMenuOpen, UpdateMelonGlowHud, UpdatePredictionHud, UpdateCollisionDebugHud, UpdateUserMenu } from "./user-menu.js";
export { RegisterHudInputs } from "./inputs.js";
