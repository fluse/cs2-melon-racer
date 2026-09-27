// Import this before importing any engine-side file from src/ (i.e. one
// that imports "cs_script/point_script"): it redirects that import to the
// fake in cs-script-mock.mjs. Must be a static import that runs first —
// engine files then have to be loaded with a dynamic import() after it.
import { register } from "node:module";

register(new URL("./cs-script-hooks.mjs", import.meta.url));
