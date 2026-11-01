# Stillwatch UI

Build with `python3 scripts/build_static.py` after setting `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, then serve with `python3 -m http.server 8000 --directory dist`. See README.md for Supabase and Render Static Site configuration.

Login, signup, and logout call Supabase directly from the browser. There is no Flask server. React, HTM, and Supabase JS load from esm.sh; MediaPipe models load from the URLs in `src/config.js`. Video stays local. Supabase configuration uses a public publishable key.

## Ownership

- `src/StillwatchUI.js` and `src/styles/app.css`: React interface and styling.
- `src/tracking/createMotionTracker.js`: integration adapter, with start, stop, pause, mirror, snapshot, and dispose methods. Pass video/canvas/stage elements and status/error callbacks. Status updates are limited to about four per second; frames never pass through React state.
- Team tracking modules (`camera-source.js`, `vision-pipeline.js`, `hand-enrollment.js`, `overlay-renderer.js`, `movement-counter.js`, `motion-meter.js`, `config.js`) are used without modifications.
- `src/tracking/createCamera.js`: unused historical camera-only adapter; retained for reference.

## Flow

Start opens the workspace without requesting camera permission. Enable camera opens the camera, loads models, then starts enrollment. Make a fist and open each hand to enroll it; the team's automatic enrollment delay is preserved. Sport selection changes the prompt without restarting the tracker. Settings exposes mirror, pause/resume, and camera stop. Snapshots include the rendered landmarks and current mirroring. Leaving the workspace cancels loops and releases camera/model resources, including pending startup operations.

Movement counts and motion metrics continue inside the adapter; they are not displayed in a dashboard. Session duration includes time paused. The default motion change threshold is 32.

The teammate's original interface is preserved in `tracker.html` and uses `src/app.js`; it is excluded from the published static build. Do not load that entry script on the React page. The UI entry is named `StillwatchUI.js` to avoid a case-only filename collision with `app.js`.
