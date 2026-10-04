// Chase camera — one folder per feature: follow/ (the normal chase camera and
// the one place that writes the follow config), wall-clip/ (eased pull-in at
// walls), break-zoom/ (pull-back on a break), lift-zoom/ (zoom-out in lift
// zones), zone-zoom/ (zoom in/out in camera zones), side-view/ (the fixed
// side camera in side-view zones). Other parts of
// melon_drive import from here.
export {
    ApplyCameraFollow,
    GetCameraOffsetFor,
    UpdateFollowCamera,
} from "./follow/follow.js";
export { ApplyBreakCameraZoom } from "./break-zoom/break-zoom.js";
export { UpdateLiftCamera } from "./lift-zoom/lift-zoom.js";
export { UpdateZoneCamera } from "./zone-zoom/zone-zoom.js";
export { UpdateSideViewCamera, SideViewCameraOn } from "./side-view/side-view.js";
