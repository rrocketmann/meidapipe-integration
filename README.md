# Hanvas

Hanvas is a browser-based hand-tracking paint app built with MediaPipe Tasks Vision.
It uses your webcam to detect hand landmarks in real time and draws persistent paint strokes on a canvas.

## Tech Stack

- HTML/CSS/JavaScript (no frontend framework)
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision@0.10.0`)
- MediaPipe drawing helpers (`@mediapipe/drawing_utils`, `@mediapipe/hands`)
- Static hosting via Python `http.server` or Node `serve`

## Features

### 1) Real-time webcam hand tracking

- Accesses webcam through `navigator.mediaDevices.getUserMedia()`.
- Runs continuous per-frame hand landmark detection.
- Supports up to 2 hands (`numHands: 2`).

### 2) Gesture-driven drawing

- Computes a hand midpoint from all landmarks (`getLandmarksMidpoint`).
- Draws when hand state is:
	- `Fist`
	- `Partial hand`
- Does not add new stroke points for `Open hand`.
- Keeps drawn trails persistent across frames (until cleared).

### 3) Stroke interpolation for smoother lines

- Each hand has its own trail bucket (`midpointTrails[handLabel]`).
- If two points are close enough, intermediate points are inserted.
- This reduces visible gaps when hand motion is fast.

### 4) Multi-hand support

- Processes all detected hands in each frame.
- Uses handedness labels from model output.
- Because video is mirrored for UX, labels are swapped:
	- Model `Left` shown as `Right`
	- Model `Right` shown as `Left`

### 5) UI controls

- `CLEAR DRAWING`: empties all stored trails.
- `EXPORT`: downloads current drawing as PNG.
- `DRAWING: ON/OFF`: enables or disables adding new paint points.
- `COLOR MIXING: ON/OFF`: enables or disables overlap blending.
- `MIX MODE: SCREEN/MULTIPLY`: cycles blend mode used while mixing is ON.
- Color selector: changes current paint color for new points.

### 6) Color overlap mixing

- Drawing uses canvas compositing (`globalCompositeOperation`).
- Mixing OFF: `source-over` (normal paint layering).
- Mixing ON: selected mode from `MIXING_MODES`:
	- `screen` (lighter overlap)
	- `multiply` (darker overlap)

### 7) Canvas/Webcam aspect-ratio lock

- Webcam and drawing containers share one CSS aspect ratio variable.
- JS updates `--media-aspect-ratio` from actual video dimensions.
- Result: webcam view and drawing canvas always match proportions.

## How JavaScript Model Inference Works

This section explains the exact inference flow used in `script.js`.

### Step 1: Load runtime and model

1. `FilesetResolver.forVisionTasks(...)` loads the MediaPipe WASM runtime.
2. `HandLandmarker.createFromOptions(...)` creates an inference object.
3. Model options include:
	 - `modelAssetPath`: hosted hand landmark model
	 - `delegate`: `GPU` first, fallback to `CPU`
	 - `runningMode`: starts as `IMAGE`
	 - `numHands`: `2`

### Step 2: Start camera stream

1. App checks secure context (`https` or localhost).
2. Calls `getUserMedia({ video: true })`.
3. On `video.onloadeddata`, marks webcam active and starts prediction loop.

### Step 3: Prepare per-frame dimensions

Each frame in `predictWebcam()`:

1. Sync UI aspect ratio from `video.videoWidth/video.videoHeight`.
2. Set `canvasElement.width/height` to match video pixel dimensions.

This keeps coordinate mapping accurate:

- Landmark normalized `x` maps to `x * canvas.width`
- Landmark normalized `y` maps to `y * canvas.height`

### Step 4: Switch model from IMAGE to VIDEO mode

On first prediction frame:

- If running mode is still `IMAGE`, call `handLandmarker.setOptions({ runningMode: "VIDEO" })`.

Why:

- VIDEO mode is optimized for temporal frame-by-frame inference.

### Step 5: Run inference only on new frames

`predictWebcam()` compares `video.currentTime` with `lastVideoTime`.

- If unchanged: skip inference (avoid duplicate work).
- If changed: run `handLandmarker.detectForVideo(video, startTimeMs)`.

Output (`results`) includes:

- `results.landmarks`: array of 21 landmarks per hand
- `results.handednesses`: left/right confidence categories

### Step 6: Convert landmarks to app-level hand state

For each detected hand:

1. `inferHandState(landmarks)` computes how many fingers are extended.
2. Uses wrist-to-tip and wrist-to-base distance ratios.
3. Classifies into:
	 - `Open hand`
	 - `Fist`
	 - `Partial hand`

### Step 7: Produce drawing points

If drawing is enabled and hand state is drawable (`Fist` or `Partial hand`):

1. Compute midpoint of all landmarks.
2. Add to the hand’s trail.
3. Interpolate extra points for smooth continuity.

### Step 8: Render frame

Render order in each loop:

1. Clear canvas.
2. Draw persistent midpoint trail (with selected color + mixing mode).
3. Draw hand connectors and landmarks.
4. Update hand-state text.

### Step 9: Loop with animation frame

- `requestAnimationFrame(predictWebcam)` schedules next frame while webcam is running.
- This ties inference/render cadence to browser frame timing.

## Run Locally

### Option A: Python

```bash
cd /home/martin/dev/Hanvas
/bin/python -m http.server 8000
```

Open:

- `http://127.0.0.1:8000`

### Option B: npm

```bash
npm install
npm start
```

## Notes

- Use a normal browser tab for webcam permissions.
- Some embedded preview contexts block camera access.
- Exported PNG mirrors horizontally to match displayed drawing orientation.
