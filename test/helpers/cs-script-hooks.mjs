// Node module-resolution hook (registered via register-cs-script.mjs):
// points the engine-provided virtual module "cs_script/point_script" at the
// in-process fake in cs-script-mock.mjs, so engine-side files under src/
// can be imported and exercised in node:test.
const MOCK_URL = new URL("./cs-script-mock.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "cs_script/point_script") {
        return { url: MOCK_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
