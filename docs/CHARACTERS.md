# Characters

The game has two kinds of character:

- **The cast** (Eric, Ade, Koushik, Rollins, Dikzzy, Baster, Littlechip, NXR). These are rigged GLB models in `public/models/`, loaded by `src/characters/glbAvatar.js`.
- **The player**. Built procedurally in `src/characters/avatar.js` from the choices made in the creator, so any combination of face, hair, outfit and gacha gear works.

Both share one rig layout and one animation system, so they move the same way and use the same emotes.

## Proportions

The cast is chibi: a big head (about 35% of the height), a short torso, chunky hands and shoes. Everyone is scaled by `CHAR_SCALE = 0.82` in `src/characters/body.js`, which puts the cast at about 1.35 m. The world itself is real-scale: doors, streets and shelves are sized for adults. Counters that NPCs stand behind are lowered to the cast's waist height.

## Model pipeline (`tools/blender/`)

Each cast member goes through `gen_postprocess.py` in Blender:

1. **`prep`**: merges duplicate vertices along UV seams, scales the mesh to height, grounds it and applies transforms.
2. **`profile` / `retarget`**: finds the neck from slice widths, then scales the head around the neck so it sits at the chibi ratio while the body keeps the total height.
3. **`ortho_pair` + `grid_overlay.py`**: renders orthographic front and side views with a metric grid, so joint positions can be read off.
4. **`rig`**: fits a 21-bone chibi armature to those joints and binds it with automatic weights.
5. **`hem_to_hips`**: re-weights skirt and coat hems to the hips, so they don't tear when the legs move.
6. **`finalize` / `export`**: packs textures, saves the `.blend`, and exports `public/models/<id>.glb` (Y-up, facing +Z).

The game models are decimated to about 12k triangles each.

To run the scripts, open Blender, set `SEMESTA_ROOT` to the repo path, and `exec()` the script. The comment at the top of `gen_postprocess.py` lists every step.

## Runtime (`glbAvatar.js`)

- **Loading.** `preloadCharacterModels(onProgress)` fetches every GLB once and reports progress in bytes to the loading screen. `createGLBAvatar(id)` clones a model with `SkeletonUtils.clone`.
- **Materials.** The textures are kept on a `MeshToonMaterial`. The outline is a skinned inverted hull that is pushed along the normal after skinning. Outlines are dropped beyond 16 m.
- **Culling.** Skinned meshes get a fixed bounding sphere instead of `frustumCulled = false`, so off-screen characters cost nothing.
- **Driving the bones.** Each GLB carries an invisible procedural rig from `body.js`. Every frame, `Animator` poses that rig, and the GLB bones copy its world-space rotation deltas. The procedural avatar and the GLB cast therefore share every animation.

## Animation (`anims.js`)

The `Animator` is fully procedural. It has no animation clips.

- **Locomotion.** Idle, walk and run blend by speed. Stride length scales with leg length, and foot IK plants the feet. It also handles air time, landing squash and footstep events.
- **Upper body.** The torso twists and leans, the arms swing, and the head looks at targets with a lagged spring.
- **Talking.** While talking, characters nod and sway, and gesture with alternating hands.
- **NPC idles.** `stand`, `phone`, `lean`, `sweep` and `counter` (wiping the counter and waving at customers).
- **Emotes.** `wave`, `nod`, `think` and `cheer`, plus the cat emotes:
  - `pat` is a real squat with the back fairly upright. The right hand lifts slowly and comes down on Spider's head. The knobs are in `PAT` / `PAT_HAND`.
  - `feed` lowers a bowl held in both hands to the floor (`FEED`).
  - `play` winds up an underhand toss and releases the yarn ball at `TOSS_AT`, then claps.

## Spider (`spider.js`)

Spider is a procedural black cat. He walks the city's waypoints and picks idle behaviours: sitting, grooming, stretching, yawning, loafing and sniffing. When you stand still nearby, he rubs against your legs.

The interactions are choreographed in `main.js → catAction()`:

| Action | Player | Spider |
|---|---|---|
| Pet | Squats and pats. The hand is measured to land on his head. | Ducks and flattens his ears each time the hand lands, pushes up into it after, purrs, and shows hearts. |
| Treat | Carries the bowl in both hands and lowers it. | Eats from the bowl where it was set down, then licks his lips. The scene waits for him to finish. |
| Play | Tosses the yarn ball over him and claps. | Turns, crouches with a butt wiggle, pounces twice, then trots back and sits in front of you. |
| Follow / Stay | — | Follows you around the city, or goes back to roaming. |

Props that ride a hand (the bowl and the yarn ball) are moved by `onFrame` hooks that run right after the characters update. They stay attached on every frame, even if the browser throttles timers.
