# Stillwatch Motion Tracker

A small browser app that detects movement and tracks the head, shoulders, elbows, wrists, and hand(s) you select. Pose tracking draws both arms from shoulder through elbow to wrist, with enrolled arms emphasized. At camera startup, make a fist and open each hand you want enrolled, then wait for automatic selection to finish. Hand skeletons for hands that do not complete the gesture are ignored. Hand tracking follows the wrist and finger joints, helping preserve the arm trace when a hand turns or the person turns sideways. Head position uses face landmarks around the nose, eyes, and mouth. Camera frames are processed in the browser and are not uploaded or recorded.

## Run it

Python 3.11+ is required. Create a virtual environment and install the backend:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

On Windows, use `py -m venv .venv` and `.venv\Scripts\Activate.ps1` in PowerShell instead of the first two commands.

Open [http://localhost:8000](http://localhost:8000), create an account, then choose **Start**, followed by **Enable camera**. Use the Flask server, rather than `python -m http.server`: login and signup require the backend. Camera access works on localhost or HTTPS. Allow camera permission when prompted. The browser downloads the MediaPipe models on first use; video processing remains local.

### Accounts and local storage

- `/signup` creates an account and signs in; `/login` signs in; the tracker at `/` requires an account. Your name and **Log out** appear in the main UI header. Log out revokes the current session.
- SQLite is created automatically at `instance/stillwatch.sqlite3`. Accounts persist across server restarts. Each test uses a separate temporary database.
- Passwords use Werkzeug scrypt hashing. Session tokens expire after seven days and are stored hashed in SQLite. Cookies are HTTP-only and SameSite=Lax; forms use CSRF tokens. Authentication permits ten attempts per email in a rolling 15-minute window.
- A local signing secret is generated in `instance/secret.key`. Database files and secrets are ignored by Git. Never serve the repository with a generic public file server.
- Accounts do not yet save movement metrics or video. Email verification and password reset are not implemented.

Run tests:

```sh
python -m unittest discover -s tests -v
```

### Render hosting

Run the frontend and authentication together as a **Python Web Service**. A Static Site or `python -m http.server` cannot handle login/logout POST requests.

`render.yaml` provides a Blueprint with a paid Starter service and a 1 GB persistent disk. For an existing service, apply these settings in its Render dashboard; adding a YAML file does not automatically update a manually configured service:

| Setting | Value |
| --- | --- |
| Runtime | Python |
| Build command | `pip install -r requirements.txt` |
| Start command | `gunicorn --config gunicorn.conf.py wsgi:app` |
| Health check | `/health` |
| Instances | 1 |
| Disk mount path | `/var/data` |
| `APP_ENV` | `production` |
| `DATABASE_PATH` | `/var/data/stillwatch.sqlite3` |
| `SECRET_KEY` | A stable random secret stored in Render environment settings |

Deploy the branch containing `server.py`, `wsgi.py`, `templates/`, and `requirements.txt`. Replace the static-server start command. If the existing resource is a Static Site, create a Python Web Service and use its URL. Flask must serve both the UI and account routes on the same origin.

Gunicorn binds to Render's `PORT` on `0.0.0.0`. Render detection enables Secure cookies and requires a database path and signing secret. The Blueprint generates the secret automatically. For manual setup, generate one with `python -c "import secrets; print(secrets.token_hex(32))"`. Keep it stable across deployments and out of Git.

Attach the persistent disk before deployment. SQLite is created on first boot; local accounts are not uploaded. Persistent disks require paid services. Ordinary Render files are ephemeral, so accounts would be lost on restart without persistent storage. Use one service instance with SQLite; migrate to managed PostgreSQL before horizontal scaling.

After deployment, check `/health` for `{"status":"ok"}`, then test signup, logout, and login. Redeploy and verify the account still works. Local development remains `python server.py` with storage in `instance/`.

See [Render’s Flask guide](https://render.com/docs/deploy-flask), [Blueprint reference](https://render.com/docs/blueprint-spec), and [persistent disk documentation](https://render.com/docs/disks).

Hand setup defaults to Both hands and waits until each completes the fist-to-open gesture. It starts automatically after both are selected and visible for the selection countdown (1.2 seconds since the last enrollment). Choose One hand intentionally when needed. Re-select hands restarts setup without clearing repetition totals.

Automatic movement counters replace the 6-7 counter:
- Arm extensions: each arm uses the 3D shoulder/elbow/wrist geometry. Reach is shoulder-to-wrist distance divided by upper-arm plus forearm length. A bent arm (angle at most 120 degrees and reach at most 90%) followed by a nearly straight arm (angle at least 150 degrees and reach at least 96%) adds one repetition. This ratio is invariant to 3D rotation and scale; projected shoulder spacing is not used because it collapses in a side view. The live readout shows angle, reach percentage, and whether 3D or 2D geometry is available. The 2D fallback is less reliable for arms pointing at the camera. Switching geometry modes clears partial repetitions. Partly obscured arms require two confirming samples; clear 3D arms accept a single extension sample to catch quick movements. Short tracking gaps up to 250 ms retain the starting bend; longer loss clears it.
- Hand opens and closes: each enrolled hand has separate open/closed state transitions, summed in the two totals. The initial hand pose does not count.
- Head slips: face forward and hold your head centered for roughly half a second after setup. A lateral head displacement greater than 18% of shoulder width counts once, confirmed for 60 ms. Returning to center rearms the same side; switching sides also counts. This uses the ear midpoint relative to the shoulder axis so whole-body sideways motion cancels out. Head roll above 20 degrees is excluded to separate neck tilts. Missing landmarks trigger recalibration.
- Ear-to-shoulder tilts: face the camera and start upright. Each lean toward a shoulder counts once; moving across to the other shoulder counts again. This uses pose ear landmarks, ear-to-shoulder distances normalized by shoulder width, and head roll relative to the shoulders. Ear markers and connecting lines are visible on the overlay.

Pause analysis pauses counters; Reset data clears totals. Low-confidence or missing joints suspend the corresponding counter. A side view is useful for arm angles; use a front view for neck tilts. These are camera estimates, and occlusion or perspective can affect counts.

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

Choose Orthodox (left jab, right cross) or Southpaw (right jab, left cross). Start in guard with bent elbows. Each quick bend-to-extension transition labels that arm as a jab or cross; a jab followed by a cross 80–1200 ms later adds one combination. Punch detection rearms below 135 degrees and accepts extension within 700 ms of the last bent observation. Both arms extending in the same observed frame are not assigned an order. Holding an arm extended adds no repeats. Stance changes, pause, and camera restarts clear pending sequences; Reset data clears totals. These counts describe arm-extension sequences and do not measure punch technique, impact, or force.

The Head slips card automatically increments on each detected sideways excursion and flashes with a +1 confirmation. Returning to center rearms the same side; crossing to the opposite side counts again. `src/combo-counter.js` owns stance-aware sequence timing.

Hand association uses motion prediction and one-to-one assignment. At enrollment, nearby pose wrists can be bound as anchors for rapid-motion recovery. Brief handedness-label changes can be accepted when position agrees. Missing hands are not drawn with invented landmarks; the UI reports visible/enrolled counts. Long losses require a close pose-wrist anchor for automatic reacquisition, otherwise use Re-select hands.
