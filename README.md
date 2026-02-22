# Hanvas

Hanvas is a browser-based hand-tracking paint app. It uses webcam input and MediaPipe hand landmarks to let you draw in the air, choose colors, clear strokes, and export the canvas as PNG.

## How It Works

1. The webcam feed is started with `getUserMedia`.
2. MediaPipe Tasks Vision runs hand landmark detection on each video frame.
3. A hand state heuristic (open, partial, fist) controls whether drawing is active.
4. Midpoints are sampled and interpolated between nearby points to smooth gaps.
5. Strokes render on the canvas and can be exported as image output.

## Libraries and External Dependencies

- `@mediapipe/tasks-vision` (via CDN import in `script.js`)
	- Provides `HandLandmarker` and `FilesetResolver`.
	- Handles the ML inference pipeline for real-time hand tracking.
- `@mediapipe/drawing_utils` (via CDN script in `index.html`)
	- Renders landmark connectors and keypoints for debug/visual feedback.
- `@mediapipe/hands` (via CDN script in `index.html`)
	- Supplies shared hand constants (`HAND_CONNECTIONS`) used during overlay drawing.
- Google Fonts: `Roboto` and `JetBrains Mono`
	- `Roboto` is used for readable UI text.
	- `JetBrains Mono` is used for technical output/status text.

## Controls

- `ENABLE WEBCAM` / `DISABLE WEBCAM`: starts or stops live tracking.
- `CLEAR DRAWING`: removes all painted points.
- `EXPORT`: downloads the current drawing as PNG.
- Color selector: changes paint color for new points.

## Running Locally

Use a local web server (recommended for webcam permissions):

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

## Deploy on Render

This repo includes a `render.yaml` blueprint for a static web service.

1. Push this project to GitHub/GitLab.
2. In Render, choose **New +** → **Blueprint**.
3. Connect your repository and deploy.
4. Render will read `render.yaml` and create a static service named `hanvas`.

After deploy, open your Render URL over HTTPS and allow camera access in the browser.

## License

- This project source code is licensed under the MIT License (see `LICENSE`).
- MediaPipe components are provided by Google under Apache License 2.0 terms.