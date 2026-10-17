# Architecture

Semesta City is a single-page three.js game bundled by Vite. It has no framework and no server: the build output in `dist/` is a static site.

## Conventions

- 1 unit = 1 metre, **Y up**, ground at `y = 0` (sidewalks are raised 0.15).
- Characters face **+Z** when `rotation.y = 0`. The cast is about **1.35 m** tall: chibi proportions at `CHAR_SCALE = 0.82`, with a head about 35% of the body.
- The city uses `MeshStandardMaterial` for wet PBR asphalt and emissive neon. Characters and robots use toon materials with inverted-hull outlines (`src/gfx/toon.js`).
- Anything that animates exposes `update(dt, time)`, and anything that allocates GPU memory exposes `dispose()`.
- There are few real-time lights. The moon is the only shadow caster; neon glow comes from emissive materials, bloom and light-pool decals.

## Boot

`src/main.js → boot()` runs behind the cinematic loading screen (`src/ui/loading.js`):

1. It starts downloading the eight character GLBs right away (`preloadCharacterModels`). Download progress, by bytes, drives 40% of the bar.
2. It waits for fonts, then builds the city (`buildCity`) and the collision world.
3. It bakes an environment map from a small neon scene (PMREM).
4. It creates the player avatar, the NPCs and Spider. NPCs use their GLB once it has loaded, and fall back to the procedural avatar otherwise.
5. It warms up shaders and textures, enters the title screen, and only then fades out the loader.

The brand images load with `onload` plus a timeout rather than `img.decode()`, because `decode()` never settles while the tab is in the background.

## State machine

`G.state` is one of the following:

| State | What runs |
|---|---|
| `title` | Orbiting title camera and the main menu |
| `creator` | Character creator, with its own scene (`src/ui/creator.js`) |
| `explore` | Player controller, NPCs, Spider, interact prompts, HUD, minimap |
| `dialog` | Conversation camera rig and dialog box; the player is frozen |
| `ui` | Wallet or gacha overlay open |
| `paused` | Pause menu |
| `transition` | Fades between explore and battle |
| `battle` | Holo-table robot battle (`src/combat/battle.js`) |

`frame(dt)` advances the current state, then updates every NPC, then Spider, then the per-frame hooks (`onFrame`), then the HUD, and finally renders.

## Modules

### `src/core`

| File | Role |
|---|---|
| `renderer.js` | `WebGLRenderer` and the post chain: ink pass (depth-based outlines), bloom, colour grade and vignette. Has quality presets. |
| `player.js` | Third-person controller and orbit follow camera with collision, roof detection for the umbrella, and jumping. |
| `input.js` | Keyboard and mouse with per-frame edge detection, plus a virtual-key layer and stick axis for touch. |
| `collision.js` | 2D boxes and circles with a vertical extent. `resolve()` pushes characters out, `pointBlocked()` checks camera and spawn spots, and `segmentBlocked()` hides name tags behind walls. |
| `audio.js` | Synthesized music loops, rain ambience and every sound effect (WebAudio). |
| `state.js` | Settings, the save game (`localStorage`) and the `t()` i18n helper. |

### `src/world`

`city.js` assembles the map from the other world modules: `street`, `rialoHQ`, `konbini` (Semesta Mart), `arcade`, `houses`, `playground`, `gacha`, `brand`, `rain` and `decals`. Static geometry is merged per material, and repeated props are instanced. The city returns its spawn point, NPC spots, interactables, roofs and the holo-table position.

### `src/characters`

| File | Role |
|---|---|
| `body.js` | Joint rig (a `THREE.Group` hierarchy) and body proportions (`bodyDims`). |
| `anims.js` | `Animator`, the procedural animation system. See [CHARACTERS.md](CHARACTERS.md). |
| `avatar.js` | The player's avatar, built from appearance data: body, face atlas, hair, clothes, props, headwear and auras. |
| `glbAvatar.js` | Loads the GLB cast and drives the skinned bones from the same procedural rig, behind the same API as `avatar.js`. |
| `npc.js` | NPC behaviour: idle variants, noticing the player, turning to face them, and talking. |
| `spider.js` | Spider the cat: wandering, sitting, grooming, following, and reacting to being petted, fed or played with. |
| `nxr.js`, `pet_kit.js`, `pet_batik.js` | The NXR mascot and the shared pet helpers. |

### `src/combat`

This is the holo-table battle: `arena` (octagon, cover cubes), `robots` (articulated toon mechs), `fighter` (physics and hit states), `weapons` (homing gun, lobbed bombs, pods), `ai` (rival behaviour), `fx` and `hud`.

### `src/systems`

| File | Role |
|---|---|
| `chain.js` | A local simulation of a Rialo testnet wallet: identity, keypair, faucet, transactions, and an activity log. It makes no network calls. |
| `gacha.js` | Pulls, rarity rolls and inventory. |
| `perks.js` | Sums the gameplay perks of the equipped gear. |

### `src/ui`

The UI is plain DOM over the canvas. It includes the loading screen, title and pause menus, the HUD (player plate, collapsible objectives, minimap, menu button, toasts, name tags), the dialog box, touch controls, the character creator, the wallet and the gacha.

## Cameras in conversations

- **NPC dialog** (`dialogCamera`). The camera searches angles, distances and sides around the player and NPC pair. It rejects positions behind walls and positions where the player's head would cover the NPC's face. If none qualify, it falls back to a high shot.
- **Spider** (`frameCat`). The camera cuts to a low three-quarter shot from the front and the patting-hand side, picking whichever side is wall-free once per visit. While Spider plays, it tracks him and pulls back as he runs off.

## Mobile

`input.isTouch` is set when the device reports `(hover: none) and (pointer: coarse)`. A touchscreen laptop switches over on its first touch event. Touch mode adds `body.touch`, the joystick, the look zone and the action buttons (`src/ui/touch.js`). The buttons feed `input.setVirtual()`, so the game reads the same key codes on every device.

## Tests

`tests/*.html` are standalone pages that exercise one subsystem each: the avatar, the world, the battle, the pets and the testnet. Run `npm run dev` and open, for example, `http://localhost:5173/tests/avatar.html`.
