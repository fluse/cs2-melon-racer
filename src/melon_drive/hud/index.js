// The custom HUD (panorama/layout/custom_game/speedometer.xml). A panel
// with its own rules has its own folder — speedometer/ (speed, jump and
// health bars), track/ (time trial clock + checkpoint strip), scoreboard/
// (Tab: Grand Prix points, best times), hub-modal/ ("Start Grand
// Prix": the heats and who rides along) — the others are one file each: bounce-panel.js, user-menu.js.
// layout.js finds the custom_hud_layout entity; inputs.js handles every
// button click.
export { GetSpeedHud, ResetHudForPlayer } from "./layout.js";
export { UpdateSpeedHud, UpdateJumpHud, UpdateHealthHud } from "./speedometer/speedometer.js";
export { UpdateBounceHud } from "./bounce-panel.js";
export { UpdateCheckpointHud } from "./track/track.js";
export { UpdateScoreboardHud, UpdateScoreboardInput } from "./scoreboard/scoreboard.js";
export { ApplyHubModalState, ShowHubModal, HideHubModal } from "./hub-modal/hub-modal.js";
export { SetUserMenuOpen, UpdateMelonGlowHud, UpdatePredictionHud, UpdateCollisionDebugHud, UpdateUserMenu } from "./user-menu.js";
export { RegisterHudInputs } from "./inputs.js";
