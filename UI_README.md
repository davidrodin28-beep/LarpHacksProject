# Stillwatch UI

From this repository, install dependencies with `.venv/bin/python -m pip install -r requirements.txt`, then run `.venv/bin/python server.py` and open http://localhost:8000. See README.md for virtual environment setup and Windows commands.

Login, signup, and logout require this Flask server. Do not use `python -m http.server` or an editor’s static preview: those cannot handle POST requests and return HTTP 501. If port 8000 is occupied by a static server, stop it with Ctrl+C in its terminal before starting Flask. Use `PORT=8002 .venv/bin/python server.py` on macOS/Linux to run Flask on another port.

React and HTM load from esm.sh; MediaPipe and its models load from the URLs in `src/config.js`. Internet access is required. Frames are processed locally; no API keys are needed.

## Ownership

- `src/StillwatchUI.js` and `src/styles/app.css`: React interface and styling.
- `src/tracking/createMotionTracker.js`: integration adapter, with start, stop, pause, mirror, snapshot, and dispose methods. Pass video/canvas/stage elements and status/error callbacks. Status updates are limited to about four per second; frames never pass through React state.
- Team tracking modules (`camera-source.js`, `vision-pipeline.js`, `hand-enrollment.js`, `overlay-renderer.js`, `movement-counter.js`, `motion-meter.js`, `config.js`) are used without modifications.
- `src/tracking/createCamera.js`: unused historical camera-only adapter; retained for reference.

## Flow

Start opens the workspace without requesting camera permission. Enable camera opens the camera, loads models, then starts enrollment. Make a fist and open each hand to enroll it; the team's automatic enrollment delay is preserved. Sport selection changes the prompt without restarting the tracker. Settings exposes mirror, pause/resume, and camera stop. Snapshots include the rendered landmarks and current mirroring. Leaving the workspace cancels loops and releases camera/model resources, including pending startup operations.

Movement counts and motion metrics continue inside the adapter; they are not displayed in a dashboard. Session duration includes time paused. The default motion change threshold is 32.

The teammate's original interface is preserved in `tracker.html` and uses `src/app.js`; it is not exposed by the authenticated Flask server. Do not load that entry script on the React page. The UI entry is named `StillwatchUI.js` to avoid a case-only filename collision with `app.js`.
