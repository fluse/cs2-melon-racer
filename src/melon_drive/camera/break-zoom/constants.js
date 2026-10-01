// The break camera (camera/break-zoom/break-zoom.js) uses the engine's own
// wall clipping, unlike the normal chase camera (camera/wall-clip/) — this is
// how fast it returns after a wall pulled it in
// (CameraFollowConfig.cameraOffsetReturnStrength; 1 = instantly, the
// engine's default; pulling in is always instant). How far it pulls back is
// BREAK_CAMERA_* in health/breaking/constants.js.
export const CAMERA_OFFSET_RETURN_STRENGTH = 0.2;
