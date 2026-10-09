# Portierung: Melon Racer als three.js-Anwendung

Stand: 2026-10-09. Noch nichts davon ist umgesetzt. Dieses Dokument hält fest,
was eine Portierung aus CS2 in den Browser (three.js) braucht und was dafür im
Repo schon vorhanden ist.

## Grundidee: `cs_script/point_script` nachbauen, nicht die Spiel-Logik

Die Spiel-Logik in `src/melon_drive/` muss dafür nicht neu geschrieben werden.
Stattdessen bekommt sie ein eigenes Modul `point_script`, das dieselbe API
anbietet wie CS2, intern aber mit **three.js** (Grafik) und **Rapier**
(Physik, WASM, läuft auch in Node) arbeitet. Ein Bundler-Alias (z. B. Vite:
`"cs_script/point_script" → ./engine/index.js`) bindet es ein.

Warum das funktioniert:

- Nur **38 von 136** Dateien in `src/` importieren `cs_script/point_script`.
  Der Rest (`logic.js`, `*-logic.js`, `constants.js`) ist reines JavaScript
  und läuft unverändert im Browser. Das erzwingt
  `test/map/module-layout.test.mjs` schon heute.
- Es gibt bereits eine Engine-Attrappe:
  [test/helpers/cs-script-mock.mjs](test/helpers/cs-script-mock.mjs), etwa
  190 Zeilen. Die Browser-Engine ist im Kern dieselbe Schnittstelle, nur mit
  echter Physik und Grafik dahinter.
- Genutzt wird nur ein kleiner Teil der API. So oft kommt jeder
  `Instance.*`-Aufruf in `src/` vor:

  | Aufruf | Anzahl |
  |---|---|
  | `GetGameTime` | 31 |
  | `ServerCommand` | 14 |
  | `OnScriptInput` | 14 |
  | `Msg` | 10 |
  | `FindEntityByName` | 10 |
  | `EntFireAtTarget` | 8 |
  | `DebugLine` | 5 |
  | `Delay` | 4 |
  | `TraceLine`, `TraceSphere`, `GetSaveData` | je 3 |
  | `SetSaveData`, `SetNextThink`, `OnPlayerReset`, `FindEntitiesByClass`, `ConnectOutput` | je 2 |
  | alle übrigen (`SetThink`, `OnActivate`, `OnCustomHudClicked`, …) | je 1 |

## Was die Engine-Schicht ersetzen muss

| CS2 | im Browser |
|---|---|
| `GetGameTime`, `SetThink`/`SetNextThink`, `Delay` | eigene Tick-Schleife mit festen 64 Hz, angetrieben von `requestAnimationFrame` |
| `prop_physics`-Melone, `Teleport({ velocity })`, `GetAbsVelocity` | Rapier-Rigidbody (Ellipsoid-Collider), `setLinvel`/`setTranslation` |
| `TraceLine` / `TraceSphere` | `world.castRay` / `world.castShape` |
| `trigger_multiple` + `OnScriptInput` | Rapier-Sensor-Collider; bei Start/End-Touch wird das in der Map verdrahtete Input gefeuert |
| `FindEntityByName`, `ConnectOutput`, `EntFireAtName`/`EntFireAtTarget` | Entity-Registry (Name → Objekt) und ein kleiner I/O-Bus |
| `CSPlayerPawn.IsInputPressed`, Blickwinkel, `SetEyeAngles` | Tastatur und Pointer Lock, auf `CSInputs`-Bitflags abgebildet |
| `CustomPlayerCamera` (`FOLLOW_POSITION`, `CONTROLLED`) | eigener Kamera-Controller |
| `custom_hud_layout` (`SetHasClass`, Dialog-Variablen, Klicks, Input Capture) | HTML/CSS-Overlay; `speedometer.xml`/`.css` lassen sich größtenteils übernehmen |
| `SetSaveData`/`GetSaveData` | `localStorage` |
| `DebugLine`/`DebugSphere`/`DebugScreenText` | `THREE.Line`, Helper, DOM-Text |
| `PointTemplate.ForceSpawn` (Partikel, Bruchstücke, Melone) | Factory-Funktionen |
| `ServerCommand` (cvars im Gamemode) | entfällt größtenteils |

Die Einheiten können Source-Units bleiben (1 u ≈ 1,9 cm). Dann gelten alle
Konstanten in den `constants.js` unverändert.

## Map-Export: Erkenntnisse

### Quellen

- **Quell-Map:** [maps/melon_racer.vmap](maps/melon_racer.vmap) plus Prefabs
  unter `maps/prefabs/`, binäres DMX („binary 9“).
- **Kompilierte Map:** `game/csgo_addons/melon_racer/maps/melon_racer.vpk`
  (außerhalb dieses Ordners, entsteht beim Hammer-Compile).

### Die `.vmap` enthält mehr, als die Tests bisher nutzen

[test/helpers/vmap.mjs](test/helpers/vmap.mjs) liest schon:

- alle Elemente (`ReadDmxElements`)
- Entities mit aufgelösten Prefabs und Map-Variablen (`ReadVmapEntities`)
- I/O-Verbindungen (`ReadVmapConnections`)
- Weltpositionen über Prefab-Ketten (`ReadVmapEntityOrigins`)

Neu festgestellt: Auch die **Mesh-Daten sind lesbar**. Die Haupt-Map enthält
122 `CMapMesh`/`CDmePolygonMesh` mit insgesamt 1568
`CDmePolygonMeshDataStream`s. Die Positionen stehen im Stream
`position:0` (Attribut `data`, Liste von Vektoren). Daraus lassen sich ohne
externes Werkzeug bauen:

- die **Trigger-Volumen** (Bounding Box oder konvexe Hülle der Vertices, mit
  der Transformation der Entity und der Prefab-Kette)
- die **Collision-Geometrie** der Welt (Dreiecke aus Faces und Vertices) als
  Rapier-Trimesh

Ungeklärt: ob die aus der `.vmap` gebaute Collision genau der kompilierten
entspricht (Clip-Brushes, Nodraw-Flächen, `prop_static`-Modelle haben in der
`.vmap` keine Geometrie). Das muss gegen den Export der `.vpk` geprüft
werden. Bei Abweichungen kommt die Collision ebenfalls aus der `.vpk`.

Typen in der Haupt-Map, zur Orientierung: 89 `CMapEntity`, 122 `CMapMesh`,
13 `CMapInstance`, 22 `CMapGroup`, 8 `CMapPrefab`, 6 `DmeConnectionData`.

### Optik: Source 2 Viewer

Texturen, Materialien und Modelle stehen nur in der kompilierten Map
sinnvoll zur Verfügung. **Source 2 Viewer (ValveResourceFormat)** exportiert
sie per Kommandozeile (`Source2Viewer-CLI`, Open Source, GitHub-Release) als
glTF/GLB. .NET ist auf dem Entwicklungsrechner installiert. Das Werkzeug
selbst ist noch **nicht** heruntergeladen.

### Geplantes Exportskript `tools/export-web-map.mjs`

Ein Befehl nach jedem Hammer-Compile:

1. `melon_racer.vmap` samt Prefabs lesen, mit derselben Prefab- und
   Variablen-Auflösung wie in den Tests.
2. `map.json` schreiben: alle Entities (Name, Klasse, Position, Winkel,
   Keyvalues), alle I/O-Verbindungen und für jeden Trigger sein Volumen.
3. `collision.bin` schreiben: die Welt-Geometrie als Dreiecke.
4. `Source2Viewer-CLI` aufrufen: kompilierte Map → `map.glb`.
5. Ein Test prüft, dass jeder Trigger, den das Skript kennt (`start_*`,
   `checkpoint_*`, Zonen, …), mit Volumen in `map.json` steht.

## Was neu gebaut werden muss

- **Physik-Tuning:** der heikelste Teil. Aufpralle, Wand- und Bodenkontakt
  werden aus der Differenz zwischen befohlener und tatsächlicher
  Geschwindigkeit gemessen (`movement/contact/`, `health/damage/`). Rapier
  verhält sich anders als Source 2, also müssen die Schwellwerte
  (`IMPACT_DAMAGE_THRESHOLD`, `FREE_FALL_FRACTION`, `WALL_CONTACT_*`, …) neu
  eingestellt werden. Masse, Reibung und Restitution der Melone ebenso.
- **HUD:** `speedometer.xml`/`.css` als DOM nachbauen. Panorama-CSS ist nah an
  Web-CSS; Klassen-Toggles und Animationen funktionieren fast genauso.
- **Partikel:** `.vpcf` ist nicht übertragbar. Boost-Trail, PERFECT-Funke,
  Heal-Kreuze, Bruch und die Zonen-Effekte neu bauen, z. B. mit
  `three.quarks` oder einfachen Sprite-Systemen.
- **Sounds:** die eigenen `.wav` lassen sich übernehmen (Web Audio).

## Lizenz: Valve-Assets dürfen nicht mit

Die Melone (`models/cs_italy/italy_food_melon/...`), ihre Bruchstücke und die
CS2-Materialien in der Map gehören Valve. Für lokales Testen ist das
glTF-Export in Ordnung, **eine öffentliche Web-App darf sie nicht
ausliefern**. Eigene Modelle und Texturen sind also Pflicht. Eigene Assets
(Logo, Decals, Icons aus `tools/`, Sounds, eigene Partikel-Texturen) können
bleiben.

## Multiplayer

CS2 liefert Netzwerk, Spieler-Slots und Lobby mit, der Browser nicht.

- **Zuerst Einzelspieler:** Zeitfahren und Bestzeiten funktionieren damit
  sofort.
- **Später Multiplayer:** ein autoritativer Node-Server (z. B. Colyseus oder
  reines WebSocket), der dieselbe Engine-Schicht und dieselbe Logik mit
  Rapier in Node ausführt. Hub, Grand Prix, Moderator und Podium hängen
  daran.

## Reihenfolge

1. Vite-Projekt mit three.js und Rapier, Alias auf die eigene
   `point_script`-Schicht; `npm test` läuft weiter.
2. Map-Export (`map.json`, `collision.bin`, `map.glb`). Die Melone fährt mit
   der echten `UpdateKart` auf einer Testfläche: Fahren, Springen, Kamera.
3. Trigger und I/O: Checkpoints, Start/Ziel, Zeitfahren, HUD.
4. Wall Bounce, Wall Jump und Schaden in Rapier abstimmen (der größte
   Zeitaufwand).
5. Zonen (Lift, Jump Pad, Wasser, Kamera, Side-View, Heal, Teleporter),
   Partikel, eigene Assets.
6. Multiplayer, Hub und Grand Prix.

Grobe Schätzung: einige Wochen bis zu einem spielbaren
Einzelspieler-Zeitfahren, Multiplayer deutlich mehr.

## Offene Entscheidungen

- Darf `Source2Viewer-CLI` heruntergeladen werden (Vorschlag: nach
  `tools/bin/`, in `.gitignore`)? Ohne ihn entstehen zunächst nur `map.json`
  und die Collision aus der `.vmap`, ohne Texturen.
- Wo liegt das three.js-Projekt? Vorschlag: `web/` in diesem Repo, damit es
  dieselben `src/`-Dateien nutzt. Alternative: ein eigenes Repo.
