# melon_racer — Agent Guide

CS2 Hammer addon for a custom **racing map** ("Melon Racer"). This is a
Workshop Tools content addon, not a normal source-code repo: most of the
"real" content lives in binary/KeyValues3 assets edited through Hammer, and
the only parts an agent can freely own as plain text are the `cs_script`
JavaScript files described below plus a few KV3 data files.

@GAMEPLAY.md

This file covers the CS2 engine/`cs_script` API and addon-editing rules.
Everything about the game itself — concept, round flow, checkpoint/timing
logic, open design questions — lives in [GAMEPLAY.md](GAMEPLAY.md) (imported
above, so it's always loaded together with this file). Put gameplay-design
changes there, not here. For the Hammer-side steps to build a new track
(entity names, triggers, I/O wiring) rather than the design rationale, see
[TRACK_CREATION.md](docs/TRACK_CREATION.md). The full map↔script contract —
every entity name, name pattern and `RunScriptInput` parameter the script
knows — is the [Mapping API](docs/mapping-api/README.md), one page per topic
with tables for names, patterns and values: when you add, rename or remove
one in `src/`, update its page and the index tables there too, and a changed
tunable's value in its page's "Values" table (`test/map/mapping-api-doc.test.mjs` checks
the `*_NAME`/`*_NAME_PATTERN` constants and script inputs are listed, and that
every link and `#anchor` between the pages resolves).

Current addon contents:

```
CHANGELOG.md                             # player-facing changes per release (git tag v<version>), written by the /release skill
docs/TRACK_CREATION.md                   # step-by-step Hammer guide for a new track
docs/GAME_CI.md                          # the map's color palette (guide lines, heal, checkpoint, start gate) — use it for new materials/models/HUD
docs/valve/scripting_api.html            # saved copy of Valve's cs_script API wiki page (the site blocks automated fetches)
docs/mapping-api/*.md                    # Mapping API (map↔script contract): README.md = index of every input/name/pattern,
                                          #   01-…21-*.md one page per topic, each with setup / name-variant / "Values" tables
maps/melon_racer.vmap                    # main map (binary DMX, Hammer-authoritative)
maps/prefabs/*.vmap                      # prefabs placed in melon_racer.vmap (hub, routes, gates, jump pads); the start/checkpoint/finish gates and jump_pad are set up by a
                                          #   map variable per copy (docs/mapping-api/14-prefabs.md) — test/helpers/vmap.mjs reads prefabs, overrides resolved
maps/content_examples/lighting_info.vmap
maps/scripts/*.js                        # AUTO-GENERATED bundle output, see below — don't hand-edit
maps/scripts/point_script.d.ts           # cs_script API type declarations (copied from cs_script_demo)
postprocess/melon_racer.vpost            # post-processing volume settings (KV3)
postprocess/basic_linear_post.vpost
soundevents/soundevents_addon.vsndevts   # sound event defs (KV3)
sounds/*.wav                             # ambience: birds, interior, vent
src/tsconfig.json                        # editor tooling config for src/**/*.js (references ../maps/scripts/point_script.d.ts)
src/gamemode/index.js                    # gamemode entry: a single small file
src/panorama/melon_racer/*.xml, *.css    # the HUD layout's parts, each part's styles next to it (melon_racer.xml/.css = the main files, one part per panel,
                                          #   user-menu/ = the menu's columns and pages): build-panorama.mjs puts them together into
                                          #   panorama/layout/custom_game/melon_racer.xml and panorama/styles/custom_game/melon_racer.css;
                                          #   locals.mjs = the values they're built with (every constant by name + skinPages, statRows, … for loops;
                                          #   styleVariables: $rating-*, $color-* from the script for the CSS)
src/panorama/components/*.xml, *.css     # reusable HUD components with attributes as values, their styles next to them (toggle, action-button,
                                          #   tuning-row, tuning-page, key-hint, skin-button, group-header): <module href="…/components/toggle.xml" id="…" name="…" />
src/panorama/tokens.css                  # the HUD's colors as $variables ($gold, $mint, $panel, …), imported first by every layout's .css
src/melon_drive/index.js                 # melon_drive entry — wiring only: tick loop, hot-reload snapshot, each domain's Register*Inputs()
src/melon_drive/<domain>/                # one folder per domain, each with an index.js (its public API); bigger
                                          #   domains have one subfolder per feature (see "Folder layout" below):
                                          #   core/      kart-registry.js (Kart type, karts map, moderator), think.js (per-tick driver), trace.js, debug.js
                                          #   kart/      spawn.js (melon spawn, frozen pawn, intro logo), spawn-points.js (+ spawn-points-logic.js), join-spot.js (+ -logic.js: tutorial or hub on join), teleport.js (checkpoint respawn,
                                          #              generic teleport), look.js (+ look-logic.js: paint color + outline glow, the user menu's glow colors), skin.js (+ skin-logic.js: the user menu's melon skins, SetModel),
                                          #              player-settings-logic.js (per-player settings in the save data, for join-spot, skin + glow color), inputs.js (player reset/disconnect, melon_paint)
                                          #   movement/  driving/ (drive.js = UpdateKart, the per-tick order; steering), contact/ (floor/wall probes),
                                          #              jump/, wall-bounce/, attack-boost/, momentum/
                                          #   health/    damage/ (impacts, flat landings), breaking/ (break, effects at the crash site, respawn, melon_break),
                                          #              heal/ (heal zones, full health on respawn)
                                          #   zones/     registry.js (which zones a melon is in, the WallRules that follow), inputs.js (every *_enter/*_leave),
                                          #              lift/, jump-pad/ (launch + no-damage flight), camera-zone/, side-view/ (2D: A/D-only screen-axis driving, plane lock, W/S depth zones),
                                          #              water/ (stop on entry, no impacts inside), jump-recharge/ (wall-jump charges kept full inside),
                                          #              gravity/ (lower/higher gravity, less rolling loss: gravity_zone_<gravity>[_roll<roll>]), teleport/ (melon_teleport)
                                          #   race/      track-config.js (tracks from trigger names), checkpoints/ (progress, start_/checkpoint_/finish_ inputs),
                                          #              time-trial/ (run clock + saved best times), heat/ (hub/countdown/racing/break flow, hub inputs),
                                          #              grand-prix/ (places + points per heat, standings over the heats), podium/ (top 3 held on the hub podium),
                                          #              stats/ (saved all-time player stats: time on the server, crashes, finishes, boost time, PERFECT hits),
                                          #              level/ (saved XP per player, levels, skins unlocked by level, the level-up message's timing),
                                          #              spectate/ (finished racers watch the others in the finish window, "Watch Grand Prix" from outside: the camera on another melon)
                                          #   camera/    follow/ (chase camera, the only SetFollowConfig), wall-clip/ (eased pull-in at walls), break-zoom/, lift-zoom/, podium-zoom/, zone-zoom/,
                                          #              side-view/ (fixed side camera, CONTROLLED mode)
                                          #   hud/       layout.js (the custom_hud_layout), one folder per panel with its own rules: speedometer/ (km/h, health bar, jump dots),
                                          #              track/ (time trial + checkpoint strip), scoreboard/ (Tab: Grand Prix standings / best times per track,
                                          #              in place of CS2's own), leaderboards/ (the user menu's page: one leaderboard per tab, top 20),
                                          #              profile/ (top of the user menu's right column: own melon big, own stats + ranks),
                                          #              hub-modal/ ("Start Grand Prix": heat cards + who rides along; routes.js is generated); one file per panel without: bounce-panel.js, level-up-panel.js, xp-gain-panel.js (the XP notifier, top right), user-menu.js;
                                          #              inputs.js (every button click: one table per kind of button, HandleHudClick dispatches)
                                          #   fx/        particles.js (spawning/placing/starting/stopping/removing every point_template particle effect),
                                          #              boost-trail/, prediction/ (the guide line)
                                          #   dev/       collision-debug.js (the user-menu collision debug view), free-look.js (+ drone-logic.js: the user menu's "Drone Mode" in ACTIONS, flying a drone,
                                          #              kept inside its info_visibility_box: visibility-boxes.js, generated by build-map-data.mjs),
                                          #              camera-tuning.js (the user-menu camera page, own chase camera distance/height),
                                          #              physics-tuning.js (+ -logic.js: the user-menu physics page, every melon's physics in percent),
                                          #              tuning-scale.js (+ -logic.js: the slider both pages share), test-effects.js (Test Break/Perfect Bounce/Heal), attack-debug.js
                                          #   world/     mover/ (func_movelinear "mover…" started and kept going back and forth),
                                          #              spike-spring/ (prop_dynamic "spike_spring…": rise/sink on the script's clock, breaks melons on its spikes),
                                          #              ball-pit/ (ball_pit_enter/leave: balls that leave the trigger steered back or dropped back in),
                                          #              ball-spawner/ (template_ball copied at spawn_ball at random intervals, removed after a lifetime, capped)
                                          #              balloon/ (every ball with the ball model floats like a balloon: sinks slowly, knocked far, slowed by air drag)
                                          #              bouncer/ (prop_dynamic with the bouncer model: "swing" loop started once, at a random time within one swing, on the script's clock — delayed inputs arrived all at once)
                                          #              catapult/ (base prop_physics + animated arm prop_dynamic, paired by model; a melon inside the bucket sits in it, jump fires: carried along the swing, thrown; roll.js (+ roll-logic.js): the base rolls on when bumped, kept upright)
src/melon_drive/constants/index.js       # re-exports every folder's constants.js (tunables + Hammer names) — import constants from here
test/<domain>/*.test.mjs                 # node:test tests (`npm test`), one folder per src/melon_drive/ domain (movement/, race/, …): unit tests
                                          #   for the pure files, engine-side tests against the fake engine (filed under the domain they're mainly about)
test/map/*.test.mjs                      # checks of the .vmap/.xml/docs/mapping-api/ the script relies on, and module-layout.test.mjs (the folder rules below)
test/helpers/vmap.mjs                    # minimal binary-DMX reader so tests can check .vmap entities (+ world positions/prefab chains for make-route-icons.mjs)
test/helpers/cs-script-mock.mjs          # fake "cs_script/point_script" (+ register-cs-script.mjs hook) for testing engine-side files
test/helpers/fake-hud.mjs                # fake custom_hud_layout: per-slot classes, dialog variables, input capture
build.mjs, package.json                  # Rollup build wiring src/ -> maps/scripts/*.js
build-map-data.mjs                       # map data the script can't ask the engine for, read from the .vmap (test/helpers/vmap.mjs) into a generated src/ file, run by build.mjs:
                                          #   src/melon_drive/dev/visibility-boxes.js (every info_visibility_box, turned with its prefab: the drone's limits) — written only on change
build-panorama.mjs                       # PostHTML/PostCSS build src/panorama/<layout>/ -> panorama/layout/custom_game/<layout>.xml + styles/…/<layout>.css (+ resourcecompiler), run by build.mjs
site/*.html, style.css, build.mjs        # GitHub Page: `npm run site` -> site/dist/ (gitignored): index.html (+ version, CHANGELOG.md),
                                          #   connect/ (steam://connect), mapping-api/ (every docs/mapping-api/*.md + TRACK_CREATION.md,
                                          #   via site/markdown.mjs — test/site/ checks every link/#anchor); .github/workflows/pages.yml deploys on push to main
tools/                                    # generators, `node tools/<folder>/<file>.mjs`, one folder per kind of output; each writes its files relative to the addon root:
                                          #   lib/ shared helpers (no output of their own), models/, materials/, images/ (panorama PNGs), media/ (GIFs); a new tool goes
                                          #   into the fitting one, never loose in tools/
tools/lib/font.mjs                        # shared by the text-cutting model generators (logo, podiums, signs): a line of text in a font (Bungee) as 2D shapes, GrowShapes (clipper offset)
tools/lib/model.mjs                       # shared by the model generators: mesh builder (extrude, triangles, Mesh.Face: a flat polygon with its own UVs), Mesh.Tube/Cone, Mesh.Surface (a smooth grid: canopy, flag), Helix, V3 vector math, 2D outlines (Shape, Circle,
                                          #   RadialOutline for teeth/stars, Slot, ChamferedRect), SeededRandom (same output every run), .obj/.smd/.vmdl/.dmx/.vmat writers (SmdText + SmdAnimationText + VmdlText's
                                          #   animations for skinned, animated models) — reuse them before writing a generator-local helper
tools/lib/png.mjs                         # the PNG encoder make-icons.mjs uses
tools/lib/inflatable.mjs                  # shared by the inflatable hub decoration (gate, pavilion, tree, hedge, inflatable podium): SegmentedTube (pinched seams,
                                          #   a strap around each), SquashedRing/InflatableFoot, InflatableBlock + BlockOutline (a soft superellipsoid box), Pillow (a lathed ellipsoid with a pinched seam: tree crowns, hedge foliage), GuyRope + RopeLoop, Blower, PolylinePath;
                                          #   the faceted ones (rocks, mountain): PolytopePlanes + Polytope (a convex polytope from seeded planes), Panel (a face puffed between pinched seams),
                                          #   PanelPuff/PuffLift, PolytopeCollision, SidePoint
tools/models/make-ball-model.mjs          # a ball-pit ball as models/melon_racer/ball.vmdl (+ ball.obj): 320-triangle icosphere in inflatable.vmat,
                                          #   a sphere primitive for collision, light (mass_override) — color each prop_physics by its render color
tools/models/make-bouncer-model.mjs       # a foam swinger on a spring as models/melon_racer/bouncer/bouncer.vmdl: a tall flat pink ribbed foam paddle,
                                          #   lime top edge, upright on a chrome coil skinned to a bone chain; looping "swing" (side to side, the coil bending
                                          #   along) + "idle"; a prop_dynamic, animations left empty — world/bouncer/ starts the swing at a random point (SWING_SECONDS imported from there) — an obstacle in the air; collision: base + coil
                                          #   static, the paddle on the "head" bone (VmdlText physicsObj as [{ file, bone }]); materials/melon_racer/bouncer/
tools/models/make-boutique-model.mjs      # the hub's Melon Boutique, a kit in models/melon_racer/boutique/: the booth (origin: floor, middle of its open front, facing +X, 534 wide, 459 deep) —
                                          #   boutique_frame (inflatable tube loop on four legs, feet, blower; 3.5k), _wall (inflatable back wall), _awning + _awning_stripes (striped,
                                          #   scalloped, each tinted on its own), _sign (MELON BOUTIQUE, both sides) — and the display: boutique_tier_<16..128> (stage-look step blocks
                                          #   128 x 64 to stack into the level ladder), boutique_ring (a swim ring a melon sits in, its origin 9.4 above), boutique_plate_<skin> (name + level
                                          #   from MELON_SKIN_NAMES/_LEVELS, re-run for a new skin); the melons are prop_dynamics placed by hand; materials/melon_racer/boutique/
tools/models/make-basketball-hoop-model.mjs # a court's basketball hoop as models/melon_racer/basketball_hoop/basketball_hoop.vmdl (1.6k triangles): graphite post on a foot plate,
                                          #   navy pad, gooseneck arm + brace, white backboard with black frame and shooter's square, orange rim on a bracket, white cord
                                          #   net in diamonds; sized to the melon as the ball (rim RIM_HEIGHT 178 up = 3.05 m, 24 across inside, 94 in front of the post);
                                          #   collision post, arm, board, rim (no net: a melon drops through); origin on the floor under the post, facing +X;
                                          #   materials/melon_racer/basketball_hoop/
tools/models/make-buffer-stop-model.mjs   # a buffer stop (Prellbock) as models/melon_racer/buffer_stop/buffer_stop.vmdl: magenta beam with a white chevron,
                                          #   two buffers, bent grey legs on crossbars (696 triangles); a track obstacle, coarser _physics.obj collision; materials/melon_racer/buffer_stop/
tools/models/make-catapult-model.mjs     # a wooden catapult a melon rides in, models/melon_racer/catapult/: catapult_base (prop_physics, 1216 triangles: frame on four iron-tyred
                                          #   wheels, A-frames, rope skeins on the pivot axle, padded crossbar, rest beam, winch; convex hulls clear of the bucket's swing, 2 kg)
                                          #   and catapult_arm (prop_dynamic, 232: tapered beam, iron bands and cap, braces, box bucket; collision on its bone: bucket + outer beam, checked over the swing to stay 0.5 clear of the base's (ArmClearance); skinned .smd written turned back (Unturn), animations idle/fire/
                                          #   fired/reload from world/catapult/'s ArmAngle — pivot, length, angles, timing imported from its constants.js); materials/melon_racer/catapult/
tools/models/make-checkpoint-model.mjs    # the checkpoint gate's frame (glowing pillars, beam, floating diamond) as models/melon_racer/checkpoint_gate.vmdl
                                          #   (+ _physics.obj collision, materials/melon_racer/checkpoint_gate/checkpoint_gate_{body,trim,glow}.vmat); same footprint as the prefab's old poles
tools/models/make-half-pipe-model.mjs     # a half-pipe slide as mesh geometry, models/melon_racer/half_pipe.dmx for Hammer's File → Import (DmxText in model.mjs): a U-shaped
                                          #   sky blue shell (RADIUS 64, ARC_HALF_ANGLE up each side) down along +X: the slide (LENGTH 1024, DROP 256, smootherstep), a curve over
                                          #   the edge, a STEEP_DROP 1000 drop at STEEP_ANGLE 58 (over 60 it'd count as a wall), a wide bottom curve up into a KICK_ANGLE 15 kicker;
                                          #   rounded white lips, graphite legs (2.9k triangles); materials/melon_racer/half_pipe/ — the top 30 degrees of each side count as walls (bounces)
tools/models/make-parkour-model.mjs       # a vertical parkour race track shaped like a snail shell, mesh geometry, models/melon_racer/parkour.dmx for Hammer's File → Import (DmxText in model.mjs):
                                          #   laid out along the course (s along, t across, z up; horizontal sizes x SCALE 0.8) and wound counter-clockwise round a central spire,
                                          #   the radius shrinking SPIRAL.shrink per turn (1200 -> ~570 world, 1.3 turns) so each turn runs inside and above the last; start deck
                                          #   384 up -> summit 2048 up: floating jump platforms (+64 each), a curved canyon gap between tall orange walls (wall jumps/bounces),
                                          #   a tower climbed without a lift zone (a spiral staircase of corner ledges, +64 each, wall jumps skip some), a deck with magenta
                                          #   chicanes + hurdles, ledges on alternating sides between two walls up to the summit; a round catch floor (3.6k triangles, every
                                          #   solid its own shell, curves in SPIRAL.stepDegrees pieces); prints position + yaw for start, checkpoints, respawn and finish;
                                          #   materials/melon_racer/parkour/
tools/models/make-bridge-model.mjs        # a cable-stayed bridge after Cologne's Severinsbruecke as a race track, mesh geometry, models/melon_racer/bridge.dmx for Hammer's File → Import
                                          #   (DmxText in model.mjs): a straight steel deck LENGTH 6000 along +X, the road DECK_HEIGHT 800 up, ROAD_WIDTH 512 between parapets (40, the walls
                                          #   melons bounce off) with a railing to 96 (over a ground jump), asphalt with white markings, street lamps; under the slab two trapezoid box girders,
                                          #   cross girders, a stringer, a stiffener + cantilever bracket every BAY; an A-pylon (PYLON_TOP 2000, cross ties) whose legs stand on a long low
                                          #   stone pier in the river (the Sockel, masonry texture), 12 stays of 3 ropes each in two inclined planes from its head to brackets outside the deck
                                          #   (194+ over the road), a lower stone river pier, concrete plinths on land, each pier with two steel struts leaning out to the girders; all steel
                                          #   #87CC96, cables included (4k triangles); origin on the floor (river bed) under the road's start, the river along Y;
                                          #   materials/melon_racer/bridge/ — needs a melon_respawn trigger below and a func_water under FOUNDATION_TOP
tools/models/make-hohenzollern-bridge-model.mjs # Cologne's Hohenzollernbruecke as a race track, mesh geometry, models/melon_racer/hohenzollern_bridge.dmx for Hammer's File → Import
                                          #   (DmxText in model.mjs): SECTIONS 3 bridges side by side, each its own deck 432 wide between two truss planes (neighbours share
                                          #   the one between them: 4 planes), LENGTH 9360 along +X, DECK_HEIGHT 560 up, under 3 steel arch trusses (SPANS: 2600 - 3680 - 2600, the middle one higher, crown 800 vs 560):
                                          #   curved top chord + lower arch chord (bands extruded across, smooth), verticals from the deck up, zigzag diagonals, per section cross
                                          #   beams + diagonals bracing its top chords near the crown (BRACE.minShare); ties along every truss foot (40 high, the walls melons bounce off), two
                                          #   tracks per deck laid flat (ballast + sleeper texture, rails as single faces), outside the outer trusses a walkway with the love lock
                                          #   fence (lock texture) and a parapet + handrail to 96; two stone river piers with cutwaters, stone abutments; over the abutments the ties
                                          #   end, decks and walkways meet; grey green steel (5.4k triangles); origin on the floor (river bed) under the decks' start, in the middle
                                          #   section's middle, the river along Y; materials/melon_racer/hohenzollern_bridge/ — needs a melon_respawn trigger below
tools/models/make-kranhaus-model.mjs      # a crane house after Cologne's Kranhaeuser as mesh geometry, models/melon_racer/kranhaus.dmx for Hammer's File → Import (DmxText in model.mjs):
                                          #   an upside-down L HEIGHT 1600 tall, 17 floors: a tower, on top the 7-floor arm along +X, carried by a glass stair tower (an open passage under the arm between it and the tower),
                                          #   cantilevering past them, a canyon splitting the arm's end down the middle, concrete slab included; checkered balconies (white slabs only) on every glass facade, a white concrete frame inside the L (pillar at the tower's inner edge, slab under the arm), a slimmer stair tower, parapet round
                                          #   the flat roof (drivable); lengths in window modules so the 4 x 4-module facade textures line up (1.6k triangles); origin on the floor in
                                          #   the middle of the tower's outer face; materials/melon_racer/kranhaus/
tools/models/make-highrise-model.mjs      # a high-rise under construction (Rohbau) round the side-view track as models/melon_racer/highrise/highrise.vmdl, a prop_static, and as models/melon_racer/highrise.dmx for Hammer's File → Import (covered faces toolsnodraw)
                                          #   (collision highrise_physics.obj: closed floors, slabs, columns, core, scaffold decks): the track's volume (TRACK 912 wide, 256 deep, 944 high, open towards +X) left free, CLEARANCE 2 all round;
                                          #   7 closed floors of formwork concrete round it (wings, back, the floor over it with a plain front band for the logo), dark window
                                          #   openings (an atlas: empty, plywood, foil, taped off), proud slab edges; 2 bare skeleton floors on top (perimeter columns, slabs,
                                          #   a stair/lift core, red/white safety rails, rebar out of the roof's columns), a scaffold up one side (2.6k triangles, covered faces left out); origin on the
                                          #   floor in the middle of the track's open face; materials/melon_racer/highrise/ — the tower crane goes on the core's head (the output says where)
tools/models/make-tower-crane-model.mjs   # a tower crane for the high-rise's roof as models/melon_racer/tower_crane/tower_crane.vmdl (1.9k triangles): lattice mast on a cross base
                                          #   with ballast, turntable, cab, pyramid tower head, triangular lattice jib (720) with trolley and hook, counter-jib with counterweights, tie bars;
                                          #   bones root/slew/trolley, looping "slew" (+-70 degrees over 60 s, the trolley running in and out) + "idle"; a prop_dynamic, no collision;
                                          #   steel and cab white, tinted per prop (render color); materials/melon_racer/tower_crane/
tools/models/make-colonius-model.mjs     # Cologne's TV tower, the Colonius, as mesh geometry, models/melon_racer/colonius.dmx for Hammer's File → Import (DmxText in model.mjs):
                                          #   HEIGHT 3000 to the mast's tip, shrunk by SCALE (2/9: 667 high): an 8-sided concrete shaft tapering up, the pulpit basket (flat underneath and narrowest
                                          #   there, sides leaning out to the roof, two window bands, 1778..2000, 536 across; proportions measured off a side-on photo), two open steel platforms (no struts, antennas or rails),
                                          #   the white upper shaft with the glowing magenta Telekom T on four faces (laid flat onto them, LOGO_*), into the mast with orange and white bands
                                          #   (~450 triangles, TRIANGLE_BUDGET: for the 3D skybox); origin on the floor in the shaft's middle;
                                          #   materials/melon_racer/colonius/
tools/models/make-cologne-cathedral-model.mjs # Cologne Cathedral for the 3D skybox as mesh geometry, models/melon_racer/cologne_cathedral.dmx for Hammer's File → Import
                                          #   (DmxText in model.mjs), ~700 triangles (TRIANGLE_BUDGET): two west towers (three square stages set back, wimpergs + corner pinnacles on each step,
                                          #   octagon with a gable per face, spire, finial; 157 m = 1771 high), nave + choir under one lead roof hipped over the apse, transept with gables
                                          #   and corner turrets, crossing turret, low aisles + chevet, rows of buttress pinnacles, wimpergs on the choir's eaves; the rest is texture
                                          #   (lancet windows with tracery, blind tracery, openwork) on faces with their own UVs (Mesh.Face); metres at the Colonius' scale (11.28 u/m);
                                          #   origin on the floor in the crossing, choir +X, towers -X; materials/melon_racer/cologne_cathedral/
tools/models/make-harbor-dock-model.mjs   # the dock of Cologne's Rheinauhafen for the 3D skybox (the peninsula between harbor basin and Rhine, tip at the Schokoladenmuseum) as mesh geometry,
                                          #   models/melon_racer/harbor_dock.dmx for Hammer's File → Import (DmxText in model.mjs): the outline traced off a top-down map (OUTLINE in image
                                          #   pixels, as is, no smoothing), turned straight along Y and stretched to LENGTH 24000 x WIDTH 3600, HEIGHT 50: stone quay walls, a flat paved top;
                                          #   north +Y, the Rhine on +X like bridge.dmx; origin on the floor in the middle of the south end (96 triangles); materials/melon_racer/harbor_dock/
tools/models/make-chocolate-museum-model.mjs # Cologne's Schokoladenmuseum for the 3D skybox (on harbor_dock's tip) as mesh geometry, models/melon_racer/chocolate_museum.dmx for Hammer's
                                          #   File → Import (DmxText in model.mjs), ~190 triangles (TRIANGLE_BUDGET): the old customs house (two sandstone wings under slate hip roofs,
                                          #   a glass link, a brick tower and a round turret), the low glass hall, the new part — a hall under a curved glass roof, a tall white drum,
                                          #   a white slab, the glazed drum of floors, the white prow; windows, bands and panes only in the textures; metres at the cathedral's scale
                                          #   (11.28 u/m, 121 m = 1365 long); origin on the floor in the middle of its length, the prow +Y, the Rhine side +X like harbor_dock.dmx;
                                          #   materials/melon_racer/chocolate_museum/
tools/models/make-heal-tent-model.mjs     # the hub's first-aid tent, models/melon_racer/heal_tent/heal_tent_<piece>.vmdl, all at one origin (floor, middle; the tunnel along X):
                                          #   _frame (two inflatable arches in the gates' style, feet, guy ropes, blower; solid), _canvas (white canvas down to the floor, green pharmacy
                                          #   crosses on both walls and the roof, a HEAL sign under each arch; walls + roof solid), _floor (a 1-high mat with a glowing cross: the
                                          #   heal_zone_full trigger goes over it), _cross (an inflatable green cross on a mast on the roof, its own bone: looping "spin", a prop_dynamic;
                                          #   skinned .smd turned back like the pavilion flag); ~5k triangles in all; materials/melon_racer/heal_tent/
tools/models/make-hub-gate-model.mjs      # the hub's route gate, one model for every route: an inflatable event arch as models/melon_racer/hub_gate/hub_gate.vmdl (2.7k triangles)
                                          #   (a fat tube bent into a U in the white surfaces/inflatable.vmat, tinted by the prop's render color, pinched seams with dark straps, squashed rings on base plates as feet, guy ropes to stakes,
                                          #   a blower with its duct at the right foot; the inflatable vinyl's roughness; collision hub_gate_physics.obj: tube, feet, blower), and
                                          #   a name sign per route prefab (not the tutorial), hub_gate_name_<route>.vmdl (2.4-3.2k, no collision): curved dark boards on brackets
                                          #   front and back with the name in white Bungee, bent along the arch — same origin, placed onto the gate; materials/melon_racer/hub_gate/
                                          #   — re-run after adding or renaming a route
tools/models/make-pavilion-model.mjs      # the hub's Grand Prix pavilion: an inflatable spider tent in the gates' style (lib/inflatable.mjs) — four legs curving in to a crown,
                                          #   a white canvas canopy under them with arched openings and dark hem piping, a checkered flag on top (waving: skinned .smd, looping "wave"), pennant bunting, a "GRAND PRIX"
                                          #   sign over the +X entrance (both sides), a glowing light ring inside (9.1k triangles placed). Split into
                                          #   models/melon_racer/pavilion/pavilion_<piece>.vmdl so each is tinted on its own (render color: vinyl, canvas, pennants, letters,
                                          #   light ring; never the dark parts), repeated ones built once: leg (4x), canopy (4x), bunting (3x), sign, crown, flag, light,
                                          #   blower — all at the pavilion's origin, only turned in 90 degree steps; leg + blower solid; materials/melon_racer/pavilion/
tools/models/make-tree-model.mjs          # inflatable trees for the hub's decoration, three variants (VARIANTS: round, slim _2, wide _3; ~3.5k triangles each), in the gates' style (lib/inflatable.mjs, the white tinted vinyl):
                                          #   models/melon_racer/tree/tree_trunk<suffix>.vmdl (swaying segmented trunk, straps, branches, foot ring on a plate, three guy ropes,
                                          #   a valve; solid: trunk + foot) and tree_crown<suffix>.vmdl (puffy pillows with a pinched seam, not solid) — same origin, tinted on their own
tools/models/make-tree-bed-model.mjs      # the beds the trees stand in, around a tree's origin (136 across, every variant's stakes inside), hard parts, flat-shaded: models/melon_racer/tree/
                                          #   tree_bed_wall (low wall of 12 curved stone blocks, 10 high; 528 triangles), tree_bed_fence (picket fence on the wall; 944) / tree_bed_fence_ground
                                          #   (the same on the floor), tree_bed_mulch / tree_bed_grass (the fill, a low mound; 216) — mixed freely, all solid; stone + wood tinted per prop
tools/models/make-hedge-model.mjs         # inflatable hedges for the hub, three variants (VARIANTS: box, bushy _2, topiary _3; 128 long along +X from the origin, chain them like the park walls),
                                          #   two models each, tinted on their own, same origin: hedge_foliage<suffix> (box chambers or the trees' crown pillows, held up off the ground,
                                          #   a valve; solid: a box from the ground up + the topiary balls) and hedge_branches<suffix> (a row of plants: trunks flared at the foot,
                                          #   branches up into the foliage, twigs, the topiaries' stems, a dark ground strip; no collision); ~2-3k triangles a hedge;
                                          #   models/melon_racer/hedge/, materials/melon_racer/hedge/
tools/models/make-park-model.mjs          # hard park furniture for the hub (not inflatable), models/melon_racer/park/park_<piece>.vmdl: wall / wall_64 (stone blocks in a running bond, mortar joints,
                                          #   cap stones; 128 / 64 long along +X from the origin, chain them; 39 high: 652 / 360 triangles), wall_tall / wall_tall_64 (82 high; 1352 / 696),
                                          #   wall_pillar / wall_pillar_tall (ends + corners, a stone ball on top; 60 / 104 high; 540 / 820),
                                          #   fence (picket fence, 128 long, its post at the start; 420) + fence_post (the far end; 60), bench (wooden slats on cast-iron frames, faces +Y; ~1.2k);
                                          #   collision a box or two each; stone + paint tinted per prop; materials/melon_racer/park/
tools/models/make-mountain-model.mjs      # an inflatable mountain kit for the backdrop (scenery, coarse convex collision), the rocks' faceted panels, models/melon_racer/mountain/mountain_<piece>.vmdl:
                                          #   peak + peak_2 (panels on a jagged cone; ~0.85-1k triangles), shoulder, ridge, foothill (~1-1.2k) — overlap and turn them to build a mountain;
                                          #   peak, peak_2, ridge with a snow cap, <piece>_snow.vmdl (same origin, tinted on its own; ~0.6-0.8k): the panels above the snow line, scalloped lower edge
tools/models/make-rock-model.mjs          # inflatable rocks for the map borders, four variants (VARIANTS: boulder, spire _2, slab _3, small _4; ~400-530 triangles each): a convex polytope
                                          #   cut by seeded random planes, each face a vinyl panel puffed out between pinched seams on its edges, sunk into the floor, a valve, two tie-downs;
                                          #   models/melon_racer/rock/rock<suffix>.vmdl, tinted per prop, collision the polytope (convex); a jump reaches their tops — back a border with a clip brush
tools/models/make-inflatable-podium-model.mjs # an inflatable winners' podium, the solid podium's footprint and heights (its podium_spawn_<place> fit): per place
                                          #   inflatable_podium_body_<n> (soft block sunk into the floor, corner piping, seam band, grab loops, valve; solid), _top_<n> (cushion with piping;
                                          #   solid), _number_<n> (puffed Bungee digit on a round badge), + _base (ground mat, D-rings, stakes) and _blower —
                                          #   models/melon_racer/inflatable_podium/, all at one origin, each tinted on its own (10.4k triangles in all)
tools/models/make-stage-model.mjs         # the round stage under the pavilion: a deck (radius 272, 16 high; panel joints, a checkered ring, a dark inlay ring), low steps round
                                          #   it (4 x 4 units: melons roll up) with an LED strip on every riser and dark anti-slip edges, and a platform reaching out at each
                                          #   opening (+-X, +-Y) with front steps, LEDs and two bollards with glowing caps —
                                          #   models/melon_racer/stage/stage_{deck,steps,step_lights,thrust,thrust_lights}.vmdl, the repeated ones built once (a quarter, the +X
                                          #   platform; 4x by yaw), all at one origin, each tinted on its own (9k triangles placed; flat markings are single faces); deck, steps, platforms, bollards solid;
                                          #   + stage_platform(_lights).vmdl, its own origin: the backdrop platform (448 x 832, steps across its front) the hub's podium, rocks and trees stand on
tools/models/make-drone-model.mjs         # the free-look drone as models/melon_racer/drone/drone.vmdl (~3.6k triangles): white shell stepped over a carbon chassis
                                          #   (twill color + normal map), canopy, vents, battery, antennas, camera gimbal with a blinking red recording light (own bone, in "spin"), amber lights,
                                          #   about a melon in size (SPAN 16 across), four rotors in guard rings, each on its own bone, looping "spin" (diagonal pairs the other way), "spindown" -> "landed" on touching down, "spinup" taking off, + "idle";
                                          #   no collision (the script traces it against the world); in the point_template template_drone; materials/melon_racer/drone/
tools/models/make-drone-display-model.mjs # the hub's drone show: models/melon_racer/drone_display/drone_display_table.vmdl (a round table, a landing pad with an H on top,
                                          #   an LED ring; 616 triangles) to put a prop_dynamic drone on (Default Animation "landed", 34.5 above its origin), and _sign.vmdl
                                          #   (a graphite board between two posts, both sides: drone icon, DRONE MODE, EXPLORE THE WORLD FROM ABOVE, E > ACTIONS > DRONE MODE
                                          #   as flat Bungee faces; 2.7k); in the stage's look, collision simple boxes/cylinders; materials/melon_racer/drone_display/
tools/models/make-floor-spotlight-model.mjs # an event floor spotlight for the hub (e.g. round the pavilion): models/melon_racer/floor_spotlight/floor_spotlight.vmdl (graphite yoke and head
                                          #   tilted TILT 15 degrees towards +X, cooling fins, glowing warm white lens, a light grey base tinted per prop; 820 triangles, solid) and
                                          #   floor_spotlight_beam.vmdl (same origin: two open cones out of the lens, 1536 long, in an additive two-sided csgo_effects material like
                                          #   Valve's materials/effects/smoke/lightshaft_*: fresnel edges, depth feather, fading along U; 64 triangles, no collision) — the beam
                                          #   lights nothing: a light_spot at the lens (the output says where); materials/melon_racer/floor_spotlight/
tools/models/make-laser-model.mjs         # one segment of the drone's laser as models/melon_racer/laser/laser.vmdl: a thin glowing red rod
                                          #   DRONE_LASER_SEGMENT long (imported from src/melon_drive/dev/constants.js), no collision; in template_drone_laser
tools/models/make-logo-model.mjs          # extrudes MELON RACER (Bungee, slanted like the logo, lime green outline ring around them) into mesh geometry,
                                          #   models/melon_racer/logo_text.dmx for Hammer's File → Import (DmxText in model.mjs),
                                          #   + materials/melon_racer/logo/logo_text_{face,outline,holo}.vmat (holo = an opaque copy of holo_dashes for the letter fronts) (opentype.js + earcut + clipper-lib, devDependencies)
tools/models/make-podium-model.mjs        # the hub podium (steps 2-1-3 in the docs/GAME_CI.md colors, glowing Bungee place numbers) as mesh geometry,
                                          #   models/melon_racer/podium.dmx for Hammer's File → Import (DmxText in model.mjs), + materials/melon_racer/podium/podium_*.vmat; prints where the podium_spawn_<place> info_targets go
tools/models/make-saw-blade-model.mjs     # a circular saw blade as models/melon_racer/saw_blade/saw_blade.vmdl (DIAMETER 36, scaled in the script — never non-uniformly in Hammer): 24 hooked teeth with wider carbide tips,
                                          #   expansion slots, red ring, flange + hex nut (1292 triangles); one bone, looping "spin" animation (+ "idle") around Y, a prop_dynamic
                                          #   with Idle Animation "spin", Idle Animation Loop Mode "Loop"; origin at the center, collision a thicker plain disc; materials/melon_racer/saw_blade/
tools/models/make-spin-hammer-model.mjs   # a spinning sledgehammer as models/melon_racer/spin_hammer/spin_hammer.vmdl: steel octagon head with red rubber faces just above
                                          #   the floor, its wooden handle the arm sweeping around a low pedestal (304 triangles); one bone ("arm") turning around Z, looping
                                          #   "spin" (+ "idle"), a prop_dynamic with Idle Animation "spin", Loop Mode "Loop"; collision: pedestal static, hub + handle + head on "arm";
                                          #   origin on the floor at the axis; materials/melon_racer/spin_hammer/
tools/models/make-spawn-pad-model.mjs     # the pad marking hub_spawn, in the stage's look: models/melon_racer/spawn_pad/spawn_pad.vmdl (a low round disc, 88 across, two 1-unit steps
                                          #   a melon rolls over, dark inlay ring, a dark spot with a white ring in the middle, white chevrons pointing +X = the spawn's facing;
                                          #   ~600 triangles, solid) + spawn_pad_light.vmdl (the glowing ring, tinted on its own); both on the floor under hub_spawn, its yaw; materials/melon_racer/spawn_pad/
tools/models/make-shopping-cart-model.mjs # a shopping cart a melon rides in as models/melon_racer/shopping_cart/shopping_cart.vmdl (1620 triangles): chrome wire basket (floor 30 x 22 at 12,
                                          #   rim 16 higher), chassis with a wire rack, four casters with rubber wheels, back legs up to the handle; plastic (grip, front plate,
                                          #   caster caps) tinted per prop; a prop_physics, MASS_KG 3, collision convex hulls, one .obj each (VmdlText's `hulls` + `body`:
                                          #   a moving body can't use a concave mesh); plain physics, no script; materials/melon_racer/shopping_cart/
tools/models/make-spike-spring-model.mjs  # a spike spring trap as models/melon_racer/spike_spring/spike_spring.vmdl: spiked steel plate on a chrome coil in a shaft
                                          #   with a magenta rim (1248 triangles); the spring skinned between root and plate; animations cycle (looping), rise, sink, up, down;
                                          #   no collision (an optional 32x32 floor hole needs a nodraw lid); timing imported from src/melon_drive/world/spike-spring/constants.js; materials/melon_racer/spike_spring/
tools/materials/make-decal.mjs            # generates materials/melon_racer/decals/<decal>_{color,trans}.png for every decal in its DECALS list
                                          #   (HUD logo, rawDecals/*.png|jpg — JPG via Windows System.Drawing; can key out a baked-in checkerboard, writes <name>_transparent.png)
tools/materials/make-holo.mjs             # the gates' hologram textures (materials/melon_racer/holo/holo_*: color, trans, illum; the material scrolls them)
                                          #   + the heal cross particle sprite (materials/melon_racer/particles/particle_heal_cross) — `node … <name>` writes only that one
tools/materials/make-inflatable.mjs       # materials/melon_racer/surfaces/inflatable.vmat: the glossy vinyl of an inflatable pool mattress — no shapes, only
                                          #   how it reflects (a roughness map); plain white, so it can be tinted (g_vColorTint or an entity render color)
tools/materials/make-melon-skins.mjs      # the melon skins (gold, football, golf — dimples as a tangent-space normal map —, honey (the yellow honey melon's net), camo, strawberry (seeds in pits, calyx), pumpkin (ribs, a carved face glowing through a self-illum mask), pineapple (fruitlets on the Fibonacci spiral, bracts), zebra (warped stripes, fur); SKINS list): recolors melon_default_color.png (same UVs, same stripes) or paints
                                          #   by place on the melon (`surface`: melon.dmx's triangles drawn into texture space, via test/helpers/vmap.mjs) into
                                          #   materials/melon_racer/melon/melon_<skin>.vmat (+ textures; tint 0, paint doesn't change them) and
                                          #   models/melon_racer/melon/melon_<skin>.vmdl (melon.vmdl, material remapped) — add a skin there, re-run, compile
tools/images/make-icons.mjs               # generates panorama/images/custom_game/icons/*.png (user menu icons, checkpoint strip flags) — edit shapes there, re-run with node
tools/images/make-logo.mjs                # renders the logo (melon slice + slanted MELON RACER banner, an SVG in the file) into
                                          #   panorama/images/custom_game/logo_melon_racer.png (846x295: intro screen, user menu, GitHub page) —
                                          #   then re-run make-decal.mjs for the map decal; font tools/lib/fonts/Bungee-Regular.ttf (OFL), renderer @resvg/resvg-js (devDependency)
tools/images/make-route-icons.mjs         # generates the hub window's route cards from the .vmap: an icon per track, picked by its name (ROUTE_ICONS)
                                          #   (panorama/images/custom_game/routes/route_<trackId>.png) + route names (src/melon_drive/hud/hub-modal/routes.js,
                                          #   from route_<name>.vmap) — re-run after adding/renaming a route (test/map/route-icons.test.mjs)
tools/media/make-gif.mjs                  # an OBS recording -> gameplay GIF (ffmpeg, two-pass palette) + a <name>_steam.gif under 2 MB; driven by the /gif skill
tools/bin/                                # downloaded tools, gitignored: source2viewer/Source2Viewer-CLI.exe (ValveResourceFormat 20.0) decompiles game assets
                                          #   (-i game/csgo/pak01_dir.vpk -f <path> -d -o <out> --game game/csgo/gameinfo.gi; .vmat fails on new shaders — read -b DATA instead)
rawDecals/*.png                          # new source images for decals (make-decal.mjs input); once done, the tool moves
                                          #   them (+ their _transparent.png) to rawDecals/done/ and reads them from there
particles/melon_racer/*.vpcf             # the addon's own particle effects (KV3, hand-written): boost_trail + boost_trail_juice (two separate info_particle_systems in one template — a child system doesn't render);
                                          #   rising_dust (ambient, not script-driven — a map-placed info_particle_system, Start Active;
                                          #   square specks from materials/melon_racer/particles/particle_square.vtex + .png, a 16x16 white square);
                                          #   lift_updraft + lift_updraft_streaks (ambient, same way: two info_particle_systems at the bottom of a lift shaft —
                                          #   soft swaying glow motes + faint fast rising air streaks);
                                          #   jump_pad_rings + jump_pad_sparks (ambient, same way: two info_particle_systems on a jump pad —
                                          #   flat lime rings shooting up and widening + fast rising lime sparks);
                                          #   jump_recharge_rings + jump_recharge_sparks (ambient, same way: the jump pad's two in health blue, on a jump recharge zone);
                                          #   heal_crosses (script-driven, the effect in particle_health_template: a burst of
                                          #   rising "+" crosses in holo_heal's green/mint, sprite particle_heal_cross.vtex from tools/materials/make-holo.mjs)
                                          #   Write the editor source format, not resourceinfo's compiled dump — see the comments in boost_trail.vpcf;
                                          #   compile with resourcecompiler.exe (-f) like Panorama
models/melon_racer/melon/melon.vmdl      # the melon as our own copy: CS2's italy_food_melon decompiled (melon.dmx mesh, same sphere collision,
                                          #   prop_data and break pieces; its fixed mass 2.0 added by hand — the decompiler drops mass_override), material remapped to materials/melon_racer/melon/melon_default.vmat —
                                          #   the base for melon skins (no SetMaterialGroup in cs_script: one .vmdl per skin, swapped by SetModel)
materials/melon_racer/<folder>/          # every material + its textures, one folder per use: holo/ (the gates' holo_* surfaces), decals/, melon/ (melon skins),
                                          #   logo/ (logo_text_*), podium/, hub_gate/, pavilion/, heal_tent/, tree/, hedge/, rock/, mountain/, park/, inflatable_podium/, stage/, bouncer/, shopping_cart/, catapult/, drone/, drone_display/, spawn_pad/, floor_spotlight/, half_pipe/, parkour/, bridge/, hohenzollern_bridge/, kranhaus/, highrise/, tower_crane/, colonius/, harbor_dock/, cologne_cathedral/, chocolate_museum/, laser/, buffer_stop/, basketball_hoop/, saw_blade/, spike_spring/, spin_hammer/, surfaces/ (rubber004, ambientCG CC0; inflatable from make-inflatable.mjs), particles/ (particle sprites .vtex + .png),
                                          #   checkpoint_gate/ — a new material goes into the fitting one, never loose in materials/melon_racer/
materials/melon_racer/decals/*_decal.vmat # decals (csgo_static_overlay, translucent): logo_melon_racer_decal, press_use_decal, jump_decal, arrow_decal, wall_jump_decal, attack_for_boost_decal — textures from make-decal.mjs
```

`src/<entry>/` is where gameplay code goes — one directory per `point_script`
entity (currently `src/melon_drive/` and `src/gamemode/`), with `index.js` as
that entry's actual module entry point, kept a thin wiring layer over
`Instance.On*`/`OnScriptInput` registration. Import between files as normal
ES modules, plus `import ... from "cs_script/point_script"` as usual — that
specifier is a virtual module the CS2 engine provides at runtime, not a real
package, so leave it as a bare import. A JSDoc-only type from another file
(no runtime import needed) is referenced as
`@param {import("../core/kart-registry.js").Kart}`.

### Folder layout (`src/melon_drive/` is the reference)

- **Domains, then features, at most two levels.** Each top-level folder is a
  domain (`kart/`, `movement/`, `race/`, …, see the tree above); a domain
  that holds several mechanics has one subfolder per feature
  (`movement/wall-bounce/`, `zones/jump-pad/`, …). Nothing but `index.js`
  sits loose in `src/melon_drive/` (`test/map/module-layout.test.mjs`).
- **Every feature folder has the same shape** (`health/heal/` is the
  reference): `constants.js` (tunables, Hammer names), `logic.js` (pure
  rules), engine-side files named by what they do, `inputs.js` exporting a
  `Register…Inputs()` for its `OnScriptInput`s, and an `index.js` for its
  public API where it has more than one consumer. A folder with several pure
  rule files names them `<topic>-logic.js` next to the engine file they
  serve (`kart/spawn-points.js` ↔ `kart/spawn-points-logic.js`) — but when a
  domain's mechanics each get their own rules, they get their own folders
  instead (`camera/lift-zoom/`, `camera/wall-clip/`, …).
- **A new feature is a new folder** in the fitting domain, registered
  through that domain's `index.js` (inputs) or `core/think.js` (per-tick
  update) — nothing else central needs to change. Add its `constants.js`
  to `constants/index.js`.
- **Each domain's `index.js` is its public API** — other domains and tests
  import from it, except where that would close an import cycle (e.g.
  `hud/speedometer/speedometer.js` takes `GetWallJumpCharges` straight from
  `movement/jump/jump.js`); Rollup prints `Circular dependency` warnings on
  `npm run build` — keep it free of them.

### Build step: `src/` -> `maps/scripts/*.js`

Hammer's own `.js` -> `.vjs_c` compiler does **not** resolve local imports —
it just compiles the single file a `point_script` entity's `cs_script` field
points at. So a Rollup bundler step (`build.mjs`, wired via `npm run build` /
`npm run watch`, `node_modules` gitignored) turns each `src/<entry>/index.js`
tree back into one flat file at `maps/scripts/<entry>.js`, which is the file
Hammer/tools-mode actually reads. `cs_script/point_script` is marked
`external` so that import passes through untouched instead of being
inlined/resolved.

**Implication for editing: change `src/<entry>/index.js` (or its
submodules), never `maps/scripts/<entry>.js` directly** — the latter is
overwritten by the next build and carries an `AUTO-GENERATED` banner. Run
`npm run build` after editing `src/` so the compiled file Hammer/tools-mode
reads is current; `npm run watch` rebuilds on save for iterating against
tools-mode hot reload. The bundler is Rollup because it keeps this
codebase's comments in the output (esbuild strips plain comments even
unminified). Tree-shaking is disabled in `build.mjs`
since each entry is a whole program, not a library with dead exports to
prune, and shaking risks quietly restructuring constant-folded branches
(e.g. `if (DEBUG)`) away from what the source says.

## Gameplay logic = `cs_script` (plain JavaScript)

CS2's scripting system is **`cs_script`**: plain JavaScript modules attached
to `point_script` entities (not Squirrel VScript like Dota 2). The local
example addon at `content/csgo_addons/cs_script_demo/maps/scripts/` is the
best reference — when in doubt, read its `.js` files and `point_script.d.ts`
rather than guessing.

The API reference is `maps/scripts/point_script.d.ts`, a copy of the demo
addon's: Valve maintains that one as the API changes, so when the demo's
copy is newer, copy it over (it's types only — `npm test`/`npm run build`
don't read it). The wiki page
(https://developer.valvesoftware.com/wiki/Counter-Strike_2_Workshop_Tools/Scripting/API)
has the same content in tables, with a few extra notes (e.g. `Delay` and
`SetNextThink` land on the *nearest* tick, earlier or later). It blocks
automated fetches, so a saved copy lives at
[docs/valve/scripting_api.html](docs/valve/scripting_api.html) — read that
instead; if it looks older than the d.ts, ask the user to save it again.

### How it fits together

- Write a `.js` file that does `import { Instance, ... } from "cs_script/point_script"`.
- Place a `point_script` entity in the `.vmap` (via Hammer) and set its
  **cs_script** field to the compiled `.vjs` asset for that file (Hammer
  compiles `.js` → `.vjs_c` at map build/load time — you don't invoke a
  compiler by hand).
- When the `point_script` entity spawns, the top-level scope of the file
  runs once; everything else happens through callbacks registered on
  `Instance`.
- **Each `point_script` entity gets its own `Instance`, its own globals, and
  its own set of entity-variable identities.** A script error in one doesn't
  take down the others, so independent subsystems get their own. This addon
  has two: `gamemode` (cvars, teams, no damage) and `melon_drive_script`
  (everything tied to the karts — driving, checkpoints, race flow, HUD,
  effects — since those share kart state).
- Entity variables are reference-stable: two JS variables pointing at the
  same game entity are `===`. Extra properties attached to an entity
  variable persist as long as you keep fetching the *same* variable, but a
  fresh `FindEntityByName` call returns an object that may not carry
  properties you stuffed onto a previous lookup — cache the variable, don't
  re-look-it-up-and-expect-state.
- **Tools mode**: saving a `.js` file hot-reloads it — clears that script's
  registered callbacks and re-runs its top-level scope, but *module-level
  variables persist across the reload* (danger: stale references to
  previous-iteration closures/entities). Use `Instance.OnScriptReload({
  before, after })` to snapshot/restore state you care about across a
  reload (see `trace.js` in the demo addon for the pattern).

### Core `Instance` API (from `point_script.d.ts`)

Besides `Instance` the module exports **`Console`** (logging, convars,
commands) and **`GameRules`** (warmup, rounds, team score/money). Valve
moved several `Instance` methods there (`Msg` became `Console.Log`); the old
names still work but are marked `@deprecated` in the d.ts —
`test/map/deprecated-api.test.mjs` fails on any of them in `src/`.

- **Logging/debug** (debug draws only work in dev environments):
  `Console.Log`, `DebugScreenText`, `DebugLine`, `DebugSphere`, `DebugBox`.
- **Persistence**: `SetSaveData(string)` / `GetSaveData()` — synchronous
  read/write to disk, scoped to the addon. Holds the time trial's best
  times (`race/time-trial/`), the player stats (`race/stats/`), the XP (`race/level/`) and
  per-player settings (`kart/`), each under its own key.
- **Scheduling**: `SetThink(fn)` + `SetNextThink(time)` (tick-driven, time
  in `GetGameTime()` units), `Delay(seconds)` (returns a `Promise`),
  `QueueAfterThinks(fn)` (runs once after all entities'
  think functions this tick).
- **Lifecycle**: `OnActivate(fn)` (point_script activated),
  `OnScriptInput(name, fn)` (fires when the point_script entity receives a
  Hammer I/O `RunScriptInput` input whose parameter matches `name` — this
  is how Hammer trigger outputs call into script), `OnScriptReload(...)`.
- **Player lifecycle**: `OnPlayerConnect`, `OnPlayerActivate`,
  `OnPlayerDisconnect` (gets only `playerSlot` — the controller is gone),
  `OnPlayerTeamChanged` (`{ player, oldTeam }`), `OnPlayerReset` (fires on
  every spawn, team change and round restart). In this addon `OnPlayerReset` only re-freezes the pawn
  and re-attaches the camera; it never spawns or moves a melon (see
  GAMEPLAY.md, "Spawn points").
- **Round lifecycle**: `OnRoundStart`, `OnRoundEnd`, `OnBeginRoundRestart`.
- **Combat/movement events** (mostly irrelevant to a pure race map, but
  available): `OnModifyPlayerDamage`, `OnPlayerDamage`, `OnPlayerKill`,
  `OnPlayerJump`, `OnPlayerLand`, `OnPlayerChat`, `OnPlayerPing`,
  `OnGunReload`, `OnGunFire`, `OnBulletImpact`, `OnWeaponDrop/Pickup`,
  `OnGrenadeThrow/Bounce`, `OnKnifeAttack`, bomb events. `gamemode`'s
  `OnModifyPlayerDamage` returns `{ abort: true }`: players take no damage
  at all.
- **Entity I/O bridge** (this is the JS equivalent of classic Source
  `EntFire`/`AddOutput`): `EntFireAtName`/`EntFireAtTarget` to fire an
  entity's input from script, `ConnectOutput(target, output, callback)` /
  `DisconnectOutput(id)` to react to a Hammer entity output from script.
- **Finding entities**: `FindEntityByName`/`FindEntitiesByName`,
  `FindEntityByClass`/`FindEntitiesByClass`, `GetPlayerController(slot)`,
  `GetAllPlayerControllers()` (includes disconnected players).
- **Tracing**: `TraceLine`, `TraceSphere`, `TraceBox`, `TracePlayer`,
  `TraceBullet` — for ground checks, respawn placement and collision logic
  beyond what triggers give you. Two engine limits: a `TraceSphere` started
  at a prop's center finds nothing, and no trace can hit the melon's own
  surface — so contact probes are `TraceLine`s, and contact with the melon
  is measured from velocity (`movement/contact/`). The fake engine in tests
  can't reproduce either.
- **Game state**: `GetGameTime()`, `IsDedicatedServer()`,
  `GetGameMode()`/`GetGameType()`, `GetMapName()`; on `GameRules`:
  `IsWarmupPeriod()`, `StartWarmup()`/`EndWarmup()`, `IsFreezePeriod()`,
  `IsTeamIntroPeriod()`, `GetRoundRemainingTime()`/`SetRoundRemainingTime()`,
  `GetRoundsPlayed()`, `GetTeamScore`/`AddTeamScore`, `TerminateRound(reason)`,
  `AddTeamMoney`.
- **Console**: `Console.GetConvarBoolean/Number/String/Vector/QAngle/Color(name)`,
  `Console.SetConvar(name, value)` — synchronous and not restricted by
  `sv_cheats`; `gamemode` sets its cvars this way —, `Console.ClientCommand(slot, cmd)`,
  `Console.ServerCommand(cmd)`, `Console.RegisterCheatCommand(name, fn)`
  (only fires with `sv_cheats 1` — good for dev/test commands, not shipped
  gameplay).
- **Precache** (experimental): `Precache({ resources: [...] })` loads
  `.vmdl`/`.vpcf`/`.vmat`/`.vsnd` on server and clients ahead of use, so a
  first `SetModel` or particle doesn't hitch; the returned `CSPrecache`
  says when it's loaded (`IsLoadedForAll()`, …) and `Release()`s it. Not
  used yet.

### Class hierarchy (all imported from `"cs_script/point_script"`)

`Entity` (base: `GetAbsOrigin/GetAbsAngles/GetAbsVelocity`,
`Teleport({position,angles,velocity,angularVelocity})` — resets client
interpolation, use for checkpoint resets — `Move(...)` — same but keeps
interpolation, use for smooth scripted motion —, `GetMoveType`/`SetMoveType`,
`GetHealth`/`SetHealth`, `TakeDamage`, `Kill`, `Remove`, `IsValid`,
`IsWorld`, `GetGroundEntity`, `SetParent`/`GetParent`)
→ `BaseModelEntity` (`SetModel`, `SetModelScale`, `SetColor`,
`Glow`/`Unglow`)
→ `CSWeaponBase` → `C4`.
Also from `Entity`: `CSGrenadeProjectileBase`, `CSPlantedC4`.
Also from `Entity`: `CSRadarPoint` (an icon on the radar/overview, per
team) and `CSObservablePoint` (something spectators can watch).
Also from `BaseModelEntity`: `CSHostage` (+ `OnHostage*` events; not used here).
Also from `BaseModelEntity`: `CSObserverPawn`, `CSPlayerPawn` (movement
input state via `IsInputPressed`/`WasInputJustPressed`/`WasInputJustReleased`
+ `CSInputs` bitflags, weapon access incl. `DestroyWeapons()`,
`SetEyeAngles(angles)` to turn the player's view, `GetCustomCamera()`).
`CSPlayerController extends Entity` (`GetPlayerSlot`, `GetPlayerName`,
`GetPlayerPawn`, `GetScore`/`AddScore`, `JoinTeam`, money functions) — the
persistent per-client identity; **pawn** is the physical body that respawns.
`PointTemplate extends Entity` — `ForceSpawn(origin?, angle?)`: spawns a
Hammer `point_template`'s entities. Each spawned entity keeps its Hammer
offset from the template, so script moves the copies into place afterwards
(`fx/particles.js`). Used for every player's melon (`melon_template`) and
every particle effect.
`CustomPlayerCamera` — scripted camera control via
`SetMode`/`SetFollowConfig` (modes: `DISABLED`, `CONTROLLED`,
`CONTROLLED_POSITION`, `FOLLOW_POSITION`). The chase camera is
`FOLLOW_POSITION` on the melon (`camera/follow/follow.js`). `CameraFollowConfig`:
`followEntity`, `followOffset` (from its origin, or eyes with `followEyes`),
`cameraOffset` (rotated by the eye angles: x forward, y left, z up),
`clipCameraOffset` (pull the camera in at walls) and
`cameraOffsetReturnStrength` (how fast it returns after being pulled in —
default 1, instant).
`CustomHudLayout extends Entity` — see next section.

### Custom HUD (`custom_hud_layout`)

CS2 supports a scripted custom UI via Panorama, wired through the same
`cs_script` system. This addon's whole HUD is one layout: `speed_hud` with
`melon_racer.xml`/`.css` (driven from `hud/`).

**`panorama/layout/custom_game/melon_racer.xml` and
`panorama/styles/custom_game/melon_racer.css` are generated — edit their
parts in `src/panorama/`**, then `npm run build` (or `npm run watch`).
`build-panorama.mjs` puts them together with PostHTML:

- `<module href="part.xml" />` is replaced by that file, relative to the file
  it's in. Not `<include>`: that's Panorama's own, for the CSS in `<styles>`.
- **Components** (`src/panorama/components/`): a `<module>`'s other
  attributes are values inside it (`{{ name }}`), and a `<content />` in it
  takes what's written between `<module>` and `</module>` (`tuning-page.xml`).
  Optional attributes: `typeof x === 'string'` in an `<if condition>` or an
  expression; an attribute that ends up empty (`id="{{ typeof id === 'string' ? id : '' }}"`)
  is left out. A component's comments document it and don't reach the output.
  Never name an attribute `class` (a JS keyword in `{{ }}`) — `extra` is used.
- `{{ }}`, `<each loop="i in range(N)">`, `<if>`/`<elseif>`/`<else>`
  (posthtml-expressions) work everywhere, with every script constant by name
  (`src/panorama/melon_racer/locals.mjs`): **panels the script fills in by
  count or list (rows, segments, skins, stats, colors) are built from its
  constants, never written out** — a new skin, stat or row count needs no XML.
  A `{{ }}` without a value fails the build.
- The output is laid out by nesting depth, so files are written at column 0.

**Styles** (PostCSS): every part and component has its `.css` next to its
`.xml`; the layout's main `.css` is only `@import`s (postcss-import inlines
them **in that order — it's the cascade's order**: a rule that overrides
another comes in a later file). Colors are `$variables`
(postcss-simple-vars, Panorama has no `var()`): the palette in
`src/panorama/tokens.css`, with alpha appended as `$(gold)26`; colors the
script uses too come from it (`styleVariables` in `locals.mjs`:
`$rating-perfect` … from `BOUNCE_RATINGS`, `$color-<key>` from
`COLOR_PRESETS`). A new color with a meaning goes into `tokens.css`, not
as a literal; a `$variable` without a value fails the build. **Font sizes**
are the type scale's steps in `tokens.css` (`$font-mini` 11 … `$font-display`
56): pick a step for new text, never a size of its own (the countdown's 240px
is the one exception).

A changed layout or style is compiled for the game right away
(`resourcecompiler.exe`, see below); `test/map/hud-layout-build.test.mjs`
fails while a generated file is out of date.

- Layout: `panorama/layout/custom_game/<name>.xml` (compiles to `.vxml`).
- Style: `panorama/styles/custom_game/<name>.css` (compiles to `.vcss`).
- Panorama files (and images only referenced from CSS) are **not**
  recompiled on save: after an edit, compile them with `resourcecompiler.exe`
  from `game/bin/win64`
  (`-game csgo -addon melon_racer -i "<path to the .css/.xml under content/>"`,
  add `-f` if it reports "skipped"), then reload the map.
- Supported tags only: `<Panel>` (`id`, `class`, `hittest`), `<Label>`
  (+ `text`), `<Image>` (+ `src`; size it in CSS — `texturewidth`/
  `textureheight` made the whole HUD vanish in-game, no error anywhere),
  `<Button>` (`id`, `class` only). No client-side scripting or events
  inside the layout itself — all interactivity goes through `Instance`.
- The engine sets these classes on an ancestor panel, for CSS to react to:
  `HUD_TEAMINTRO_VISIBLE`, `HUD_BUYMENU_VISIBLE`, `HUD_SCOREBOARD_VISIBLE`,
  `HUD_WINPANEL_VISIBLE`, `HUD_ENDOFMATCH_VISIBLE`, `HUD_TEAMMENU_VISIBLE`,
  `HUD_CHAT_VISIBLE` (e.g.
  `.HUD_SCOREBOARD_VISIBLE #some_panel { opacity: 0; }`). There's no API to
  replace CS2's scoreboard; `#scoreboard` (`hud/scoreboard/scoreboard.js`) is shown by
  `HUD_SCOREBOARD_VISIBLE` and covers it with a near-opaque backdrop.
- Place a `custom_hud_layout` point entity in the map, set its `layout`
  property to the `.vxml` asset.
- Drive it from script: `SetHasClass`/`SetHasClassForPlayer`,
  `SetDialogVariableString`/`...ForPlayer` (for text like a timer value),
  `SetInputCaptureEnabled` (mouse-driven menus), and listen for clicks via
  `Instance.OnCustomHudClicked`. `Reset()`/`ResetForPlayer(slot)` drop the
  overrides again. All per-player state is kept **per slot**, not per
  player, so `OnPlayerDisconnect` resets the slot (`ResetHudForPlayer` in
  `hud/layout.js`) — otherwise the next player in that slot inherits it.
- See `cs_script_demo`'s `welcome_layout` (`custom_hud_layout` entity) +
  `panorama/layout/custom_game/welcome.xml` + `.../welcome.css` +
  `maps/scripts/setup.js` for a complete worked example (dismissible dialog
  driven entirely from script).

### Local reference material

`content/csgo_addons/cs_script_demo/maps/scripts/` has full working
examples — read these instead of guessing signatures:
- `hello.js` — minimal script.
- `setup.js` — player-join flow, `OnModifyPlayerDamage`/`OnPlayerDamage`,
  `CustomHudLayout` usage, `RegisterCheatCommand`.
- `input.js` — reading player movement input (`CSInputs`,
  `IsInputPressed`/`WasInputJustPressed`) — directly relevant to any custom
  racer-vehicle-feel input handling.
- `mdlchange.js` — `OnScriptInput` pattern for triggering behavior from
  Hammer I/O, prop model/scale/glow changes.
- `trace.js` — all five trace types, vector math helpers, and the
  `OnScriptReload` save/restore pattern.
- `grenadetraining.js` — `EntFireAtName` used extensively to drive Hammer
  logic entities (`logic_timer`, `logic_relay`, teleports, world text) from
  script — the closest existing example to a checkpoint/round-timer flow.

## Generic scripting pattern used throughout this addon

- **Triggers as the backbone**: `trigger_multiple` outputs
  (`OnStartTouch`/`OnEndTouch`) call `RunScriptInput` on the
  `melon_drive_script` `point_script`, handled via
  `Instance.OnScriptInput(name, ...)` — the standard way Hammer geometry
  drives script logic (see `mdlchange.js`, `grenadetraining.js`). Every
  input this addon has (checkpoints, zones, teleporters, …) is listed in the
  [Mapping API](docs/mapping-api/README.md).

## Editing rules for this addon

- `maps/*.vmap`, `postprocess/*.vpost`, `soundevents/*.vsndevts` are
  Hammer-authoritative (the `.vmap` is binary DMX, not hand-editable text at
  all; the `.vpost`/`.vsndevts` files are KV3 text but get reformatted by
  Hammer on save). Make geometry/entity/postfx/soundevent changes in Hammer
  itself; only hand-edit the KV3 files for small targeted additions and
  expect the next Hammer save to reformat them.
- `src/<entry>/*.js` are plain text and fully agent-owned — normal code,
  normal editing rules apply. `maps/scripts/*.js` are generated from them
  (see "Build step" above) — edit `src/`, then `npm run build`, never the
  generated files directly. `point_script.d.ts`/`src/tsconfig.json` give
  editors type-checking against the real API; keep them in sync if Valve
  updates the demo addon's copies.
- **Models stay cheap — watch the polygon count.** Every model a `tools/`
  generator builds (or one brought in from outside) gets as few triangles
  as it needs to read right at play distance: tessellation (sides around a
  tube, rings along it, sphere subdivisions) is a named constant at the top
  of the generator, set to the lowest value that still looks round, not
  the smoothest. Props placed many times stay in the hundreds of triangles
  (the ball-pit ball: 320); a single decorative set piece in the low
  thousands at most (the foam bouncer: ~3.1k). Collision is a separate,
  much coarser mesh or a primitive (sphere, capsule), never the render
  mesh. Every generator prints its triangle count — check it, and say it
  when handing over a model.
- **Material/model sources are plain ASCII** (`.vmat`, `.vmdl`, `.obj`, `.smd`,
  comments included): one non-ASCII character such as a "—" compiles "OK"
  but renders as the error checkerboard. `WriteAddonFile` (`tools/lib/model.mjs`)
  refuses them, `test/map/asset-ascii.test.mjs` checks every file.
- **Pure logic goes in the feature's `logic.js` (or `<topic>-logic.js`),
  with tests.** Game rules that are just math/state transitions (no traces,
  entities, HUD calls) live in those files, which — like every
  `constants.js` — must **not** import `cs_script/point_script` (or any
  file that does — only other `constants.js`/`logic.js`/`*-logic.js` files
  and `constants/index.js`), so Node can load them;
  `test/map/module-layout.test.mjs` enforces it. The engine-side files next to
  them call into them and handle the side effects (e.g.
  `race/checkpoints/checkpoints.js` logs/`FinishKart`s based on the result
  string `ApplyCheckpointTouch` returns). Each has a `test/<domain>/<name>.test.mjs`
  using the built-in `node:test` runner — run `npm test` after touching
  them, and add/adjust a test when changing a rule. Write assertions in
  terms of the constants (`WALL_BOUNCE_OPTIMAL_ANGLE`, ...) rather than
  their current values, so retuning a `constants.js` doesn't break tests.
- **Engine-side files can be tested against a fake engine** when a rule
  spans them (e.g. `test/kart/view-facing.test.mjs`: every teleport/spawn path
  turns the player's view): `import "./helpers/register-cs-script.mjs"`
  first, then load `src/` files with dynamic `await import(...)` —
  `cs_script/point_script` resolves to `test/helpers/cs-script-mock.mjs`,
  whose `world` holds fake entities (`Entity`, `CSPlayerPawn`,
  `PointTemplate`) and records every `Instance.On*` registration in
  `world.handlers`. It's a stub, not a simulation (traces never hit,
  `Delay` resolves immediately) — prefer pure `logic.js` tests, and extend
  the mock only as far as a test needs.
- Beyond that, verifying a gameplay change means loading the map in Hammer
  / launching CS2 in-game (`map melon_racer`), which only the user can do.
  Don't claim a gameplay change "works" without that manual check having
  happened.
