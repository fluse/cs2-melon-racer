// The normal chase camera's position.

// Offsets for CameraFollowConfig — behind and above the melon. cameraOffset
// is rotated by the player's eye angles: x is forward (negative = behind),
// z is up. The same for every player (see GetCameraOffsetFor in
// camera/follow/follow.js); lift and camera zones zoom out/in from there.
export const FOLLOW_OFFSET = { x: 0, y: 0, z: 20 };
export const CAMERA_LATERAL = 0;
// How far behind the melon the chase camera sits.
// Higher: more overview, the melon gets smaller on screen.
// Lower: closer, more speed feel; walls and slopes block the view sooner.
export const CAMERA_DISTANCE = 50;
// How high above FOLLOW_OFFSET it sits.
// Higher: looks down on the melon — a better view ahead over hills.
// Lower: flat, close-to-the-ground view.
export const CAMERA_HEIGHT = 0;
