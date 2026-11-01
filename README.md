# Stillwatch Motion Tracker

A browser motion tracker and playful sports practice dashboard. It estimates movement from camera pose landmarks and analyzes frames locally in your browser; video is not uploaded or recorded.

## Run it

Camera access works on `localhost` or a secure HTTPS page. From this folder, run:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000), choose a sport, and select **Start camera**. Allow camera access when your browser asks. On first use, the browser downloads the MediaPipe runtime and pose/hand/face model files; those are used for local processing. Internet access is needed for that first download. Press `Ctrl+C` in the PowerShell window to stop the local server.

Hand setup defaults to Both hands. After camera permission, step into view and hold still briefly; the tracker enrolls the visible hand or hands after several detections and starts by itself. There is no fist/open gesture or confirmation step. Choose One hand before starting if you only want one hand enrolled. Keep your upper body visible for arm-based sports; keep your full body in frame for jump, running, and kick estimates.

## Sport statistics

Use the Sport selector to choose Basketball, Boxing, Tennis, Archery, Table tennis, Volleyball, Badminton, Soccer, Running, Golf, or Baseball. The stats remain visible before camera startup and update during tracking:

- **Boxing:** jab, cross, and 1–2 sequences require a bent-to-straight arm cycle plus visible wrist travel from the guard. The percentage is elbow extension only; it is not a full boxing-form score.
- **Basketball:** shot-like motions require a bent-to-straight arm cycle finishing overhead. Jump counts, peak pelvis lift relative to visible body length, and an arm-release estimate combining elbow extension with wrist height are also shown. This does not assess feet, hand placement, ball arc, or whether a shot went in.
- **Tennis, table tennis, and badminton:** racket-swing estimates use normalized wrist travel, including camera-depth movement when pose depth is available. Forehand/backhand labels are rough direction estimates; the tracker cannot detect racket or ball/shuttle contact.
- **Archery:** a draw-like hold requires one extended arm, one bent arm, wrists near shoulder height, and a steady pose. Hold duration, extension, and shoulder/wrist alignment are shown. It does not measure aim, release, or arrow accuracy.
- **Volleyball:** overhead arm raise-and-extension cycles, jump estimates, relative lift, and elbow extension. It cannot verify ball contact, blocks, or spikes.
- **Soccer:** side-view knee-bend to leg-extension kick estimates, split by leg. It cannot confirm ball contact or kick power.
- **Running:** alternating knee-lift step estimates, approximate cadence, and left/right step counts. It does not measure foot strikes, distance, or speed.
- **Golf:** broad swing estimates, arm-extension score, torso-turn estimate, and swing time. It does not measure club path or ball contact.
- **Baseball:** overhead arm raise-and-extension estimates, split by arm. It cannot assess throwing velocity, release point, or ball trajectory.

These are camera-based practice estimates, not professional coaching scores. Keep the upper body visible; for jump estimates, include shoulders, hips, and ankles. Camera angle, lighting, clothing, occlusion, and quick movements affect reliability. Jump lift is reported as a fraction of visible shoulder-to-ankle body length, not centimeters. Scores describe the landmarks the camera can see, not overall sport technique.

Automatic movement counters replace the 6-7 counter:
- Arm extensions: each arm uses the 3D shoulder/elbow/wrist geometry. Reach is shoulder-to-wrist distance divided by upper-arm plus forearm length. A bent arm (angle at most 120 degrees and reach at most 90%) followed by a nearly straight arm (angle at least 150 degrees and reach at least 96%) adds one repetition. This ratio is invariant to 3D rotation and scale; projected shoulder spacing is not used because it collapses in a side view. The live readout shows angle, reach percentage, and whether 3D or 2D geometry is available. The 2D fallback is less reliable for arms pointing at the camera. Switching geometry modes clears partial repetitions. Partly obscured arms require two confirming samples; clear 3D arms accept a single extension sample to catch quick movements. Short tracking gaps up to 250 ms retain the starting bend; longer loss clears it.
- Hand opens and closes: each enrolled hand has separate open/closed state transitions, summed in the two totals. The initial hand pose does not count.
- Head slips: face forward and hold your head centered for roughly half a second after setup. A lateral head displacement greater than 18% of shoulder width counts once, confirmed for 60 ms. Returning to center rearms the same side; switching sides also counts. This uses the ear midpoint relative to the shoulder axis so whole-body sideways motion cancels out. Head roll above 20 degrees is excluded to separate neck tilts. Missing landmarks trigger recalibration.
- Ear-to-shoulder tilts: face the camera and start upright. Each lean toward a shoulder counts once; moving across to the other shoulder counts again. This uses pose ear landmarks, ear-to-shoulder distances normalized by shoulder width, and head roll relative to the shoulders. Ear markers and connecting lines are visible on the overlay.

Pause analysis pauses counters; Reset data clears totals. Low-confidence or missing joints suspend the corresponding counter. A side view is useful for arm angles; use a front view for neck tilts. These are camera estimates, and occlusion or perspective can affect counts.

## Code layout

- `index.html` loads the app shell.
- `src/styles/app.css` contains the interface styling.
- `src/StillwatchUI.js` renders the introduction, sport selector, live stats, and camera studio.
- `src/tracking/createMotionTracker.js` coordinates camera, inference, hand setup, counters, and sport estimates.
- `src/camera-source.js` owns camera enumeration and stream lifecycle.
- `src/vision-pipeline.js` initializes MediaPipe and returns pose, hand, and face results.
- `src/slip-counter.js` calibrates and counts head slips relative to the shoulders.
- `src/hand-matcher.js` associates enrolled hands with fresh detections using motion and pose anchors.
- `src/hand-enrollment.js` enrolls the selected number of hands from stable detections without requiring a gesture.
- `src/sport-tracker.js` computes sport-specific movement estimates and per-session sport statistics.
- `src/movement-counter.js` owns angle calculation and repetition state.
- `src/motion-meter.js` computes motion level, peak, and history.
- `src/overlay-renderer.js` draws the head, shoulders, selected arm from shoulder through elbow to wrist, and hand/finger landmarks.
- `src/config.js` centralizes model URLs and processing settings.

Each tracking module exposes a small interface; `src/tracking/createMotionTracker.js` passes results between them, while the UI receives compact status updates.

Pose inference is requested every 33 ms on new video frames; hands adapt between 33 and 66 ms according to measured pose-plus-hand inference cost and face landmarks every 150 ms to prioritize quick arm movements. These are scheduling targets, not guaranteed frame rates. Fully occluded arms and movements between camera frames cannot be measured reliably.

The hand overlay uses current detector landmarks without additional smoothing. Hand inference adapts between 33 and 66 ms and detects at most two hands to reduce inference work.

For Boxing, choose Orthodox (left jab, right cross) or Southpaw (right jab, left cross). The jab and cross percentages summarize elbow extension only; they do not grade guard, alignment, impact, or force.

Hand association uses motion prediction and one-to-one assignment. At enrollment, nearby pose wrists can be bound as anchors for rapid-motion recovery. Brief handedness-label changes can be accepted when position agrees. Missing hands are not drawn with invented landmarks; the UI reports visible/enrolled counts. Long losses require a close pose-wrist anchor for automatic reacquisition; changing the one/both hands selector restarts enrollment.
