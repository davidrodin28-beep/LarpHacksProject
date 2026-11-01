# Stillwatch Motion Tracker

A small browser app that detects movement and tracks the head, shoulders, and hand(s) you select. At camera startup, make a fist and open each hand you want enrolled, then confirm the selection. Hands that do not complete the gesture are ignored. The wrist and finger joints are tracked, with the closest selected hand emphasized. Head position uses face landmarks around the nose, eyes, and mouth. Camera frames are processed in the browser and are not uploaded or recorded.

## Run it

Camera access works on `localhost` or a secure HTTPS page. From this folder, run:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) and choose **Start camera**. Allow camera access when your browser asks. On first use, the browser downloads the MediaPipe runtime and pose/hand/face model files; those are used for local processing. Internet access is needed for that first download. Press `Ctrl+C` in the PowerShell window to stop the local server.

You can select a camera, adjust motion sensitivity, pause analysis, mirror the preview, save a snapshot, or reset the session metrics.
