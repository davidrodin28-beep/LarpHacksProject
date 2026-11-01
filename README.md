# Stillwatch Motion Tracker

A browser motion tracker and playful sports practice dashboard. It estimates movement from camera pose landmarks and analyzes frames locally in your browser; video is not uploaded or recorded.

## Run it

Camera access works on `localhost` or a secure HTTPS page. From this folder, run:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000), choose a sport, and select **Enable camera**. Allow camera access when your browser asks. On first use, the browser downloads the MediaPipe runtime and pose/hand/face model files; those are used for local processing. Internet access is needed for that first download. Press `Ctrl+C` in the PowerShell window to stop the local server.

Hand setup defaults to Both hands. After camera permission, bring the selected number of hands into frame and hold them steady briefly; the tracker enrolls them after several detections and starts by itself. There is no fist/open gesture or confirmation step. Choose One hand before enabling the camera to follow a single hand.

## Sport statistics

Use the Sport selector to choose Basketball, Boxing, Tennis, Archery, Table tennis, Volleyball, Badminton, Soccer, Running, Golf, or Baseball. The stats remain visible before camera startup and update during tracking:

- **Boxing:** jab, cross, and 1–2 arm-extension sequences; extension score measures elbow straightening only, not full boxing form.
- **Basketball:** overhead shooting-motion estimates, jump counts, relative pelvis lift compared with the user's standing body length, and release elbow-extension score. This is one visible part of shooting form, not a full form rating. The camera does not see the ball or confirm a made shot.
- **Tennis, table tennis, and badminton:** racket-swing estimates and approximate forehand/backhand direction from wrist travel across the torso. They do not detect racket or ball/shuttle contact.
- **Archery:** stable draw holds, hold duration, arm extension, and shoulder-level alignment. It does not measure aim, release, or arrow accuracy.
- **Volleyball:** overhead swings and jump estimates with relative lift. It cannot verify ball contact, blocks, or spikes.
- **Soccer:** side-view knee-bend to leg-extension kick estimates, split by leg. It cannot confirm ball contact or kick power.
- **Running:** alternating knee-lift step estimates, approximate cadence, and left/right step counts. It does not measure foot strikes, distance, or speed.
- **Golf:** broad swing estimates, arm-extension score, torso-turn estimate, and swing time. It does not measure club path or ball contact.
- **Baseball:** overhead arm raise-and-extension estimates, split by arm. It cannot assess throwing velocity, release point, or ball trajectory.

These are camera-based practice estimates, not professional coaching scores. Keep the upper body visible; for jump estimates, include shoulders and ankles in the frame. Camera angle, lighting, clothing, occlusion, and quick movements affect reliability. Jump lift is reported as a fraction of visible shoulder-to-ankle body length, not centimeters.

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
