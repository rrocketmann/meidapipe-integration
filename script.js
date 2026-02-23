// Copyright 2023 The MediaPipe Authors.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//      http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.// Hand Gesture Drawing Application
// Copyright (c) 2026 rrocketmann
// Licensed under the MIT License - see LICENSE file for details    

import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
const statusElement = document.getElementById("status");
const handStateElement = document.getElementById("handState");

let handLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let clearButton;
let exportButton;
let shareButton;
let colorSelect;
let toggleDrawingButton;
let toggleMixingButton;
let toggleMixModeButton;
let communityFeedElement;
let communityEmptyElement;
let communityPosts = [];
let webcamRunning = false;
let stream = null;
let midpointTrails = {};
let drawingEnabled = true;
let colorMixingEnabled = true;
const MIXING_MODES = ["screen", "multiply"];
let currentMixingModeIndex = 0;
const COMMUNITY_MAX_POSTS = 50;
const COMMUNITY_POSTS_API = "/api/community-posts";
const COMMUNITY_STORAGE_KEY = "hanvasCommunityPosts";
let communityStorageMode = "server";

const DEFAULT_PAINT_COLOR = "#6fa8e6";
const CONNECTOR_COLOR = "#9cc2ee";
const LANDMARK_COLOR = "#4f89c6";
let currentPaintColor = DEFAULT_PAINT_COLOR;

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
  console.log(message);
}

function setWebcamButtonLabel(text) {
  if (enableWebcamButton) {
    enableWebcamButton.textContent = text;
  }
}

function setDrawingButtonLabel() {
  if (toggleDrawingButton) {
    toggleDrawingButton.textContent = drawingEnabled ? "DRAWING: ON" : "DRAWING: OFF";
  }
}

function setMixingButtonLabel() {
  if (toggleMixingButton) {
    toggleMixingButton.textContent = colorMixingEnabled ? "COLOR MIXING: ON" : "COLOR MIXING: OFF";
  }
}

function setMixModeButtonLabel() {
  if (toggleMixModeButton) {
    const modeLabel = MIXING_MODES[currentMixingModeIndex].toUpperCase();
    toggleMixModeButton.textContent = `MIX MODE: ${modeLabel}`;
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function inferHandState(landmarks) {
  const wrist = landmarks[0];
  const fingerTips = [4, 8, 12, 16, 20];
  const fingerBase = [2, 5, 9, 13, 17];
  let extendedCount = 0;

  for (let index = 0; index < fingerTips.length; index += 1) {
    const tip = landmarks[fingerTips[index]];
    const base = landmarks[fingerBase[index]];
    const tipDistance = distance(tip, wrist);
    const baseDistance = distance(base, wrist);
    if (tipDistance > baseDistance * 1.15) {
      extendedCount += 1;
    }
  }

  if (extendedCount >= 4) {
    return "Open hand";
  }
  if (extendedCount <= 1) {
    return "Fist";
  }
  return "Partial hand";
}

function getLandmarksMidpoint(landmarks) {
  if (!landmarks || landmarks.length === 0) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const landmark of landmarks) {
    sumX += landmark.x;
    sumY += landmark.y;
    sumZ += landmark.z || 0;
  }

  return {
    x: sumX / landmarks.length,
    y: sumY / landmarks.length,
    z: sumZ / landmarks.length
  };
}

function drawMidpoint(midpoint) {
  if (!midpoint) {
    return;
  }

  const x = midpoint.x * canvasElement.width;
  const y = midpoint.y * canvasElement.height;
  const radiusX = midpoint.radiusX || 3;
  const radiusY = midpoint.radiusY || 3;
  
  canvasCtx.save();
  canvasCtx.globalCompositeOperation = colorMixingEnabled ? MIXING_MODES[currentMixingModeIndex] : "source-over";
  canvasCtx.beginPath();
  canvasCtx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  canvasCtx.fillStyle = midpoint.color || currentPaintColor;
  canvasCtx.fill();
  canvasCtx.restore();
}

function drawMidpointTrail() {
  for (const trail of Object.values(midpointTrails)) {
    for (const point of trail) {
      drawMidpoint(point);
    }
  }
}

function addMidpointToTrail(midpoint, handKey) {
  if (!midpoint) {
    return;
  }

  const key = handKey || "Hand";
  if (!midpointTrails[key]) {
    midpointTrails[key] = [];
  }

  const handTrail = midpointTrails[key];
  const radiusX = 10;
  const radiusY = 10;
  

  const midpointPoint = {
    ...midpoint,
    radiusX,
    radiusY,
    color: currentPaintColor
  };

  const lastPoint = handTrail[handTrail.length - 1];
  if (!lastPoint) {
    handTrail.push(midpointPoint);
    return;
  }

  const isFarEnough = distance(midpoint, lastPoint) > 0;
  if (isFarEnough) {
    const distancePx = Math.hypot(
      (midpointPoint.x - lastPoint.x) * canvasElement.width,
      (midpointPoint.y - lastPoint.y) * canvasElement.height
    );
    const nearbyThresholdPx = 80;
    const maxGapPx = 10;

    if (distancePx > 0 && distancePx <= nearbyThresholdPx) {
      const interpolationSteps = Math.floor(distancePx / maxGapPx);
      for (let step = 1; step <= interpolationSteps; step += 1) {
        const t = step / (interpolationSteps + 1);
        handTrail.push({
          x: lastPoint.x + (midpointPoint.x - lastPoint.x) * t,
          y: lastPoint.y + (midpointPoint.y - lastPoint.y) * t,
          z: lastPoint.z + (midpointPoint.z - lastPoint.z) * t,
          radiusX,
          radiusY,
          color: currentPaintColor
        });
      }
    }

    handTrail.push(midpointPoint);
  }
}

function setPaintColor(event) {
  const selectedColor = event?.target?.value;
  if (selectedColor) {
    currentPaintColor = selectedColor;
  }
}

function toggleDrawing() {
  drawingEnabled = !drawingEnabled;
  setDrawingButtonLabel();
  setStatus(drawingEnabled ? "Drawing enabled." : "Drawing disabled.");
}

function toggleColorMixing() {
  colorMixingEnabled = !colorMixingEnabled;
  setMixingButtonLabel();
  setStatus(colorMixingEnabled ? "Color overlap mixing enabled." : "Color overlap mixing disabled.");
}

function toggleColorMixingMode() {
  currentMixingModeIndex = (currentMixingModeIndex + 1) % MIXING_MODES.length;
  setMixModeButtonLabel();
  const modeLabel = MIXING_MODES[currentMixingModeIndex];
  setStatus(`Color mixing mode set to ${modeLabel}.`);
}

function clearMidpointTrail() {
  midpointTrails = {};
}

async function fetchCommunityPosts() {
  try {
    const response = await fetch(COMMUNITY_POSTS_API);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const posts = Array.isArray(data?.posts) ? data.posts : [];

    return posts
      .filter((post) => typeof post?.imageDataUrl === "string" && typeof post?.sharedAt === "string")
      .slice(0, COMMUNITY_MAX_POSTS);
  } catch {
    return null;
  }
}

async function postCommunityDrawing(imageDataUrl) {
  try {
    const response = await fetch(COMMUNITY_POSTS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ imageDataUrl })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const posts = Array.isArray(data?.posts) ? data.posts : [];
    return posts
      .filter((post) => typeof post?.imageDataUrl === "string" && typeof post?.sharedAt === "string")
      .slice(0, COMMUNITY_MAX_POSTS);
  } catch {
    return null;
  }
}

function loadCommunityPostsFromLocalStorage() {
  try {
    const saved = window.localStorage.getItem(COMMUNITY_STORAGE_KEY);
    if (!saved) {
      return [];
    }

    const parsedPosts = JSON.parse(saved);
    if (!Array.isArray(parsedPosts)) {
      return [];
    }

    return parsedPosts
      .filter((post) => typeof post?.imageDataUrl === "string" && typeof post?.sharedAt === "string")
      .slice(0, COMMUNITY_MAX_POSTS);
  } catch {
    return [];
  }
}

function saveCommunityPostsToLocalStorage(posts) {
  try {
    window.localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(posts.slice(0, COMMUNITY_MAX_POSTS)));
  } catch {
    setStatus("Unable to save local community posts in this browser.");
  }
}

function buildCommunityCard(post) {
  const card = document.createElement("article");
  card.className = "communityCard";

  const image = document.createElement("img");
  image.src = post.imageDataUrl;
  image.alt = "Shared drawing";

  const timestamp = document.createElement("time");
  timestamp.dateTime = post.sharedAt;
  timestamp.textContent = `Shared ${new Date(post.sharedAt).toLocaleString()}`;

  card.appendChild(image);
  card.appendChild(timestamp);
  return card;
}

function renderCommunityPosts() {
  if (!communityFeedElement) {
    return;
  }

  communityFeedElement.innerHTML = "";
  for (const post of communityPosts) {
    communityFeedElement.appendChild(buildCommunityCard(post));
  }

  if (communityEmptyElement) {
    communityEmptyElement.style.display = communityPosts.length > 0 ? "none" : "block";
  }
}

async function initializeCommunityFeed() {
  const serverPosts = await fetchCommunityPosts();
  if (serverPosts) {
    communityStorageMode = "server";
    communityPosts = serverPosts;
  } else {
    communityStorageMode = "local";
    communityPosts = loadCommunityPostsFromLocalStorage();
    setStatus("Community server unavailable. Using local browser storage.");
  }
  renderCommunityPosts();
}

function createMirroredDrawingDataUrl() {
  if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) {
    return null;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvasElement.width;
  exportCanvas.height = canvasElement.height;
  const exportCtx = exportCanvas.getContext("2d");
  if (!exportCtx) {
    return null;
  }

  exportCtx.save();
  exportCtx.translate(exportCanvas.width, 0);
  exportCtx.scale(-1, 1);
  exportCtx.drawImage(canvasElement, 0, 0);
  exportCtx.restore();

  return exportCanvas.toDataURL("image/png");
}

function exportDrawing() {
  if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) {
    setStatus("Nothing to export yet. Start webcam and draw first.");
    return;
  }

  const imageDataUrl = createMirroredDrawingDataUrl();
  if (!imageDataUrl) {
    setStatus("Export failed: unable to prepare image.");
    return;
  }

  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = imageDataUrl;
  link.download = `drawing-${timestamp}.png`;
  link.click();
  setStatus("Exported drawing as PNG.");
}

async function shareDrawing() {
  if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) {
    setStatus("Nothing to share yet. Start webcam and draw first.");
    return;
  }

  const confirmed = window.confirm("Share this drawing to the community section?");
  if (!confirmed) {
    return;
  }

  const imageDataUrl = createMirroredDrawingDataUrl();
  if (!imageDataUrl) {
    setStatus("Share failed: unable to prepare image.");
    return;
  }

  if (!communityFeedElement) {
    setStatus("Share failed: community section is unavailable.");
    return;
  }

  if (communityStorageMode === "server") {
    const updatedPosts = await postCommunityDrawing(imageDataUrl);
    if (updatedPosts) {
      communityPosts = updatedPosts;
      renderCommunityPosts();
      setStatus("Drawing shared to community.");
      return;
    }

    communityStorageMode = "local";
    setStatus("Community server unavailable. Saved locally instead.");
  }

  communityPosts.unshift({
    imageDataUrl,
    sharedAt: new Date().toISOString()
  });
  if (communityPosts.length > COMMUNITY_MAX_POSTS) {
    communityPosts = communityPosts.slice(0, COMMUNITY_MAX_POSTS);
  }

  saveCommunityPostsToLocalStorage(communityPosts);
  renderCommunityPosts();
  setStatus("Drawing shared locally.");
}

function setHandState(text) {
  if (handStateElement) {
    handStateElement.textContent = `Hand states: ${text}`;
  }
}

// Before we can use HandLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createHandLandmarker = async () => {
  setStatus("Loading hand model...");
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2
      });
    } catch {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "CPU"
        },
        runningMode: runningMode,
        numHands: 2
      });
    }
    setStatus("Hand model ready. Starting webcam...");
    autoEnableCam();
  } catch {
    setStatus("Hand model failed to load. Starting webcam...");
    console.error("Failed to initialize HandLandmarker.");
    autoEnableCam();
  }
  demosSection.classList.remove("invisible");
};
createHandLandmarker();


const video = document.getElementById("webcam");
const mediaRowElement = document.getElementById("mediaRow");
video.style.transform = "scaleX(-1)";
const canvasElement = document.getElementById(
  "output_canvas"
);
canvasElement.style.transform = "scaleX(-1)"
const canvasCtx = canvasElement.getContext("2d");

function setMediaActive(active) {
  if (!mediaRowElement) {
    return;
  }
  mediaRowElement.classList.toggle("media-active", active);
}

function syncMediaAspectRatio(width, height) {
  if (!mediaRowElement || !width || !height) {
    return;
  }

  mediaRowElement.style.setProperty("--media-aspect-ratio", `${width} / ${height}`);
}

setMediaActive(false);

// Auto-enable webcam at launch
function autoEnableCam() {
  enableCam();
}

clearButton = document.getElementById("clearButton");
if (clearButton) {
  clearButton.addEventListener("click", clearMidpointTrail);
}

exportButton = document.getElementById("exportButton");
if (exportButton) {
  exportButton.addEventListener("click", exportDrawing);
}

shareButton = document.getElementById("shareButton");
if (shareButton) {
  shareButton.addEventListener("click", shareDrawing);
}

colorSelect = document.getElementById("colorSelect");
if (colorSelect) {
  colorSelect.value = DEFAULT_PAINT_COLOR;
  colorSelect.addEventListener("change", setPaintColor);
}

toggleDrawingButton = document.getElementById("toggleDrawingButton");
if (toggleDrawingButton) {
  setDrawingButtonLabel();
  toggleDrawingButton.addEventListener("click", toggleDrawing);
}

toggleMixingButton = document.getElementById("toggleMixingButton");
if (toggleMixingButton) {
  setMixingButtonLabel();
  toggleMixingButton.addEventListener("click", toggleColorMixing);
}

toggleMixModeButton = document.getElementById("toggleMixModeButton");
if (toggleMixModeButton) {
  setMixModeButtonLabel();
  toggleMixModeButton.addEventListener("click", toggleColorMixingMode);
}

communityFeedElement = document.getElementById("communityFeed");
communityEmptyElement = document.getElementById("communityEmpty");
initializeCommunityFeed();

// Enable the live webcam view and start detection.
function enableCam(event) {
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isSecure = location.protocol === "https:" || isLocalhost;
  if (!isSecure) {
    setStatus("Camera permission requires https:// or localhost.");
    return;
  }

  if (window.self !== window.top) {
    setStatus("Open this page in a regular browser tab. Embedded previews may block webcam.");
    return;
  }

  if (webcamRunning === true) {
    return;
  } else {
    webcamRunning = true;
    setStatus("Requesting webcam permission...");

    // getUsermedia parameters.
    const constraints = {
      video: true
    };

    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then((mediaStream) => {
      stream = mediaStream;
      video.srcObject = stream;
      video.play().catch(() => {
        setStatus("Camera stream attached. Press play if browser paused autoplay.");
      });
      video.onloadeddata = () => {
        syncMediaAspectRatio(video.videoWidth, video.videoHeight);
        setStatus("Webcam active.");
        setMediaActive(true);
        predictWebcam();
      };
    }).catch((error) => {
      webcamRunning = false;
      setMediaActive(false);
      setStatus(`Unable to access webcam: ${error.name}. Check browser camera permissions.`);
      console.error("Unable to access webcam:", error);
    });
  }
}

let lastVideoTime = -1;
let results = undefined;
async function predictWebcam() {
  syncMediaAspectRatio(video.videoWidth, video.videoHeight);
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;
  
  // Now let's start detecting the stream.
  if (handLandmarker && runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await handLandmarker.setOptions({ runningMode: "VIDEO" });
  }
  let startTimeMs = performance.now();
  if (handLandmarker && lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    results = handLandmarker.detectForVideo(video, startTimeMs);
  }
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (results?.landmarks?.length) {
    const handStateLabels = [];
    results.landmarks.forEach((landmarks, index) => {
      const detectedHand = results?.handednesses?.[index]?.[0]?.categoryName || `Hand ${index + 1}`;
      // Mirror the hand label since video is flipped
      const handLabel = detectedHand === "Left" ? "Right" : detectedHand === "Right" ? "Left" : detectedHand;
      const handState = inferHandState(landmarks);
      handStateLabels.push(`${handLabel}: ${handState}`);

      if (drawingEnabled && (handState === "Fist" || handState === "Partial hand")) {
        const midpoint = getLandmarksMidpoint(landmarks);
        addMidpointToTrail(midpoint, handLabel);
      }
    });

    setHandState(handStateLabels.join(" | "));
    drawMidpointTrail();
    for (const landmarks of results.landmarks) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: CONNECTOR_COLOR,
        lineWidth: 5
      });
      drawLandmarks(canvasCtx, landmarks, { color: LANDMARK_COLOR, lineWidth: 2 });
    }
  } else {
    setHandState("No hand detected");
    drawMidpointTrail();
  }
  canvasCtx.restore();

  // Call this function again to keep predicting when the browser is ready.
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
  }
}
