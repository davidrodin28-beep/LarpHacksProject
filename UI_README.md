# Stillwatch

Local React UI preview. Run `python3 -m http.server 8000` from this folder and open http://localhost:8000.

React and HTM load from esm.sh; an internet connection is required. No build tools or API keys are needed. Camera permission is requested only by **Enable camera**. Leaving the workspace stops the camera.

`src/App.js` and `src/styles/app.css` own the UI. `src/tracking/createCamera.js` owns camera lifecycle and PNG snapshots. Landmark inference is not integrated yet. Original tracking source and the previous mockup are preserved in `references/` for integration with the teammate's latest code.
