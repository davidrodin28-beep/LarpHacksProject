# Stillwatch Motion Tracker

A small browser app that detects movement and tracks the head, shoulders, elbows, wrists, and hand(s) you select. Pose tracking draws both arms from shoulder through elbow to wrist, with enrolled arms emphasized. At camera startup, make a fist and open each hand you want enrolled, then wait for automatic selection to finish. Hand skeletons for hands that do not complete the gesture are ignored. Hand tracking follows the wrist and finger joints, helping preserve the arm trace when a hand turns or the person turns sideways. Head position uses face landmarks around the nose, eyes, and mouth. Camera frames are processed in the browser and are not uploaded or recorded.

## Run it

Camera access works on `localhost` or a secure HTTPS page. From this folder, run:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) and choose **Start camera**. Allow camera access when your browser asks. On first use, the browser downloads the MediaPipe runtime and pose/hand/face model files; those are used for local processing. Internet access is needed for that first download. Press `Ctrl+C` in the PowerShell window to stop the local server.

Hand setup starts tracking automatically 2.5 seconds after the last fist-to-open selection. Enroll both hands before the countdown finishes if you want both tracked.

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
- `src/hand-enrollment.js` recognizes the fist-to-open enrollment gesture and matches only enrolled hands.
- `src/movement-counter.js` owns angle calculation and repetition state.
- `src/motion-meter.js` computes motion level, peak, and history.
- `src/overlay-renderer.js` draws the head, shoulders, selected arm from shoulder through elbow to wrist, and hand/finger landmarks.
- `src/config.js` centralizes model URLs and processing settings.

Each module exposes a small interface; `src/app.js` is the composition layer that passes results between them.

Pose inference is requested every 33 ms on new video frames; hands run at most every 66 ms and face landmarks every 150 ms to prioritize quick arm movements. These are scheduling targets, not guaranteed frame rates. Fully occluded arms and movements between camera frames cannot be measured reliably.

The hand overlay uses current detector landmarks without additional smoothing. Hand inference runs every 66 ms to preserve pose responsiveness. The Head slips counter has a dedicated card at the top of the sidebar.

## Jab–cross combinations

Choose Orthodox (left jab, right cross) or Southpaw (right jab, left cross). Start in guard with bent elbows. Each quick bend-to-extension transition labels that arm as a jab or cross; a jab followed by a cross 80–1200 ms later adds one combination. Punch detection rearms below 135 degrees and accepts extension within 700 ms of the last bent observation. Both arms extending in the same observed frame are not assigned an order. Holding an arm extended adds no repeats. Stance changes, pause, and camera restarts clear pending sequences; Reset data clears totals. These counts describe arm-extension sequences and do not measure punch technique, impact, or force.

The Head slips card automatically increments on each detected sideways excursion and flashes with a +1 confirmation. Returning to center rearms the same side; crossing to the opposite side counts again. `src/combo-counter.js` owns stance-aware sequence timing.
