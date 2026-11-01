# Stillwatch Motion Tracker

A small browser app that detects movement and tracks the head, shoulders, elbows, wrists, and hand(s) you select. Pose tracking draws both arms from shoulder through elbow to wrist, with enrolled arms emphasized. At camera startup, make a fist and open each hand you want enrolled, then wait for automatic selection to finish. Hand skeletons for hands that do not complete the gesture are ignored. Hand tracking follows the wrist and finger joints, helping preserve the arm trace when a hand turns or the person turns sideways. Head position uses face landmarks around the nose, eyes, and mouth. Camera frames are processed in the browser and are not uploaded or recorded.

## Supabase accounts and static hosting

Stillwatch is a static app. Supabase Auth handles signup, email confirmation, login, token refresh, and logout. Render only serves the UI; Flask and SQLite are no longer used. Existing local SQLite accounts are not migrated—users must sign up again. Camera frames remain on the device.

### Configure Supabase

1. Create a free Supabase project. Keep email/password authentication enabled.
2. Under **Authentication → URL Configuration**, set Site URL to `https://larphacksproject.onrender.com` and add these redirect URLs:
   - `https://larphacksproject.onrender.com/login.html`
   - `http://localhost:8000/login.html`
   - `https://larphacksproject.onrender.com/reset-password.html`
   - `http://localhost:8000/reset-password.html`
3. Copy the project URL and **publishable** key from the project's Connect dialog or API settings. Never use a secret or service-role key in the browser.
4. Keep email confirmation enabled. For public signups, configure custom SMTP: Supabase's default email sender is limited to authorized organization addresses and is for development. See [Supabase email setup](https://supabase.com/docs/guides/auth/auth-smtp).

Accounts are managed in Supabase Authentication → Users. No public application tables are required. If you add saved metrics later, create owner-scoped Row Level Security policies before exposing data. The browser's login gate controls navigation, not access to static assets; database access must always be enforced by Supabase policies.

### Changes your friend needs to make in Render

Keep the existing **Static Site**, connected to the GitHub branch containing this change. Set:

| Setting | Value |
| --- | --- |
| Build command | `python3 scripts/build_static.py` |
| Publish directory | `dist` |
| Environment variable `SUPABASE_URL` | Your Supabase project URL |
| Environment variable `SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable key |

Save and redeploy. Do not publish the repository root. The build copies only frontend files and emits `auth-config.json` with public Supabase configuration. Private credentials, `.env`, Git metadata, local databases, and tests stay out of the build. The environment values are public browser configuration, not server secrets.

Remove any catch-all rewrite to `index.html` if it prevents existing files from being served. Optionally add redirects `/login` → `/login.html` and `/signup` → `/signup.html`; directory entry pages are also generated. Confirmation callbacks use `/login.html`; password recovery uses `/reset-password.html`. There is no start command, backend service, persistent disk, or Render payment requirement for this static setup. `render.yaml` documents the equivalent Blueprint configuration; it does not update a manually configured site automatically.

After deployment, verify `/auth-config.json` loads, sign up, confirm the email, log in, and log out. GitHub auto-deploy can continue as before. Supabase accounts persist independently of Render deploys.

On login, choose **Forgot password?**, enter your email, and open the emailed link in the same browser (PKCE). Choose and confirm a new password of 12–128 characters, then return to login. Invalid or expired links provide a link to request another email. Add the recovery redirect URLs above before testing; otherwise Supabase can send users to the Site URL instead of the password form. Keep the recovery email template's link set to `{{ .ConfirmationURL }}`. See [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords).

### Local development

Python 3.10+ is enough to build and serve; no Python packages are required. Set the two public configuration variables, then:

```sh
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="sb_publishable_YOUR_KEY"
python3 scripts/build_static.py
python3 -m http.server 8000 --directory dist
```

On PowerShell, set variables with `$env:SUPABASE_URL="..."` and `$env:SUPABASE_PUBLISHABLE_KEY="..."`, then use `py` instead of `python3`.

Open http://localhost:8000. Use a separate Supabase development project if you want isolated test accounts. Never serve the repository root. Rebuild after source changes.

Run checks:

```sh
python3 -m unittest discover -s tests -v
node --experimental-vm-modules --test tests/auth-flow.test.mjs tests/coaching.test.mjs
```

## Guided coaching

In the studio, choose a sport and a move. Each of the six sports has two beginner lessons with form cues, a practice drill, and a technique tip. Lessons can be read without camera access. Enable the camera, complete hand setup, and choose **Start guided practice** for live upper-body position prompts. Boxing includes Orthodox and Southpaw choices so jab and cross checkpoints use the appropriate arm.

Practice walks through the positions in order. A checkpoint advances after 800 ms of continuous matching observations. Low-confidence, cropped, or missing shoulders/elbows/wrists interrupt the hold. Pausing clears the partial hold and retains the checkpoint; changing the sport, move, or stance resets the lesson. Turning off the camera ends practice. Completed drills can be repeated. Video and coaching run in the browser without an additional service or API key.

These are slow, equipment-free position rehearsals, not full-speed technique evaluations. Checks use aspect-corrected 2D landmarks, so face your chest toward the camera and keep both arms visible; angle extended arms slightly across the image for depth-heavy movements. The coach can estimate arm height, bend, reach direction, and hand proximity. It cannot verify ball contact, grip, force, footwork, body rotation, or complete sporting technique. Completion confirms the position checkpoints only. Read each lesson’s cues and camera limits for the unmeasured details.

Lesson references: [Jr. NBA shooting fundamentals](https://jr.nba.com/shooting/), [USTA serving basics](https://www.usta.com/en/home/improve/tips-and-instruction/national/learning-the-basics--serve.html), [USA Archery shooting steps](https://www.usarchery.org/resources/explore-archery-example-activity---outer-ring-challenge-250319085534.pdf), [England Boxing coaching handbook](https://www.englandboxing.org/wp-content/uploads/2022/03/Level-2-Coaching-Handbook-compressed.pdf), [Table Tennis England ready position](https://newsarchive.tabletennisengland.co.uk/news/archived/coaching-grip-ready-position/), and [USA Volleyball passing](https://usavolleyball.org/resource/five-keys-to-better-passing/). The camera thresholds are app heuristics, not governing-body technique standards.

Hand setup defaults to Both hands and waits until each completes the fist-to-open gesture. It starts automatically after both are selected and visible for the selection countdown (1.2 seconds since the last enrollment). Choose One hand intentionally when needed. Re-select hands restarts setup without clearing repetition totals.

Automatic movement counters replace the 6-7 counter:
- Arm extensions: each arm uses the 3D shoulder/elbow/wrist geometry. Reach is shoulder-to-wrist distance divided by upper-arm plus forearm length. A bent arm (angle at most 120 degrees and reach at most 90%) followed by an extended arm (angle at least 125 degrees) adds one repetition. This ratio is invariant to 3D rotation and scale; projected shoulder spacing is not used because it collapses in a side view. The live readout shows angle, reach percentage, and whether 3D or 2D geometry is available. The 2D fallback is less reliable for arms pointing at the camera. Switching geometry modes clears partial repetitions. Partly obscured arms require two confirming samples; clear 3D arms accept a single extension sample to catch quick movements. Short tracking gaps up to 250 ms retain the starting bend; longer loss clears it.
- Hand opens and closes: each enrolled hand has separate open/closed state transitions, summed in the two totals. The initial hand pose does not count.
- Head slips: face forward and hold your head centered for roughly half a second after setup. A lateral head displacement greater than 18% of shoulder width counts once, confirmed for 60 ms. Returning to center rearms the same side; switching sides also counts. This uses the ear midpoint relative to the shoulder axis so whole-body sideways motion cancels out. Head roll above 20 degrees is excluded to separate neck tilts. Missing landmarks trigger recalibration.
- Ear-to-shoulder tilts: face the camera and start upright. Each lean toward a shoulder counts once; moving across to the other shoulder counts again. This uses pose ear landmarks, ear-to-shoulder distances normalized by shoulder width, and head roll relative to the shoulders. Ear markers and connecting lines are visible on the overlay.

Pause analysis pauses counters; Reset data clears totals. Low-confidence or missing joints suspend the corresponding counter. A side view is useful for arm angles; use a front view for neck tilts. These are camera estimates, and occlusion or perspective can affect counts.

## AI sport inventor and coaching

**✦ Invent a sport** in the studio asks a few questions and has an AI (NVIDIA Nemotron on build.nvidia.com)
design a new webcam game whose moves are exactly the events the tracker already counts (`arm_extend`, `punch`,
`hand_open`, `hand_close`, `head_tilt`, `slip`). **Play it** turns the studio into a timed round scored live from
those counts. Every sport, built-in or generated, also has **Coaching**: 2-3 drills the camera scores for
completion, tempo and arm reach. Generation runs in a separate FastAPI service in `sportgen/` (generate ->
critique -> refine pipeline with a playtest-simulating judge; see `sportgen/README.md`).

Run it locally next to the static site:

```sh
cd sportgen && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env                      # paste a free build.nvidia.com key into SPORTGEN_API_KEY
.venv/bin/uvicorn sportgen.server:app --port 8011
```

The page reads the engine URL from `<meta name="sportgen-api">` (empty = `http://localhost:8011`).
`scripts/build_static.py` fills it from `SPORTGEN_API_URL`; on Render, `render.yaml` adds a second service
`sportpau` (https://sportpau.onrender.com, the production default when the meta tag is empty); the NVIDIA keys
`SPORTGEN_API_KEY` / `SPORTGEN_FAST_API_KEY` go on that service, never on the static site. "Fast" generations take ~1-3 min, "Best" ~5-8 min; the UI polls `GET /jobs/{id}`.

## Code layout

- `index.html` contains the app structure and control IDs.
- `styles.css` contains the interface styling.
- `src/app.js` connects UI events and coordinates a camera session.
- `src/camera-source.js` owns camera enumeration and stream lifecycle.
- `src/vision-pipeline.js` initializes MediaPipe and returns pose, hand, and face results.
- `src/slip-counter.js` calibrates and counts head slips relative to the shoulders.
- `src/hand-matcher.js` associates enrolled hands with fresh detections using motion and pose anchors.
- `src/hand-enrollment.js` recognizes the fist-to-open enrollment gesture and matches only enrolled hands.
- `src/movement-counter.js` owns angle calculation and repetition state.
- `src/motion-meter.js` computes motion level, peak, and history.
- `src/overlay-renderer.js` draws the head, shoulders, selected arm from shoulder through elbow to wrist, and hand/finger landmarks.
- `src/config.js` centralizes model URLs and processing settings.

Each module exposes a small interface; `src/app.js` is the composition layer that passes results between them.

Pose inference is requested every 33 ms on new video frames; hands adapt between 33 and 66 ms according to measured pose-plus-hand inference cost and face landmarks every 150 ms to prioritize quick arm movements. These are scheduling targets, not guaranteed frame rates. Fully occluded arms and movements between camera frames cannot be measured reliably.

The hand overlay uses current detector landmarks without additional smoothing. Hand inference adapts between 33 and 66 ms and detects at most two hands to reduce inference work. The Head slips counter has a dedicated card at the top of the sidebar.

## Jab–cross combinations

Choose Orthodox (left jab, right cross) or Southpaw (right jab, left cross). Start in guard with bent elbows. Each quick bend-to-extension transition labels that arm as a jab or cross; a jab followed by a cross 80–1200 ms later adds one combination. Punch detection rearms at an angle of at most 120 degrees and reach of at most 90% and accepts extension within 700 ms of the last bent observation. Both arms extending in the same observed frame are not assigned an order. Holding an arm extended adds no repeats. Stance changes, pause, and camera restarts clear pending sequences; Reset data clears totals. These counts describe arm-extension sequences and do not measure punch technique, impact, or force.

The Head slips card automatically increments on each detected sideways excursion and flashes with a +1 confirmation. Returning to center rearms the same side; crossing to the opposite side counts again. `src/combo-counter.js` owns stance-aware sequence timing.

Hand association uses motion prediction and one-to-one assignment. At enrollment, nearby pose wrists can be bound as anchors for rapid-motion recovery. Brief handedness-label changes can be accepted when position agrees. Missing hands are not drawn with invented landmarks; the UI reports visible/enrolled counts. Long losses require a close pose-wrist anchor for automatic reacquisition, otherwise use Re-select hands.
