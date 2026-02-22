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
let webcamRunning = false;
let stream = null;
let midpointTrail = [];
let lastMidpointSample = null;

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
  canvasCtx.beginPath();
  canvasCtx.arc(x, y, midpoint.radius || 8, 0, Math.PI * 2);
  canvasCtx.fillStyle = "#0000FF";
  canvasCtx.fill();
}

function drawMidpointTrail() {
  for (const point of midpointTrail) {
    drawMidpoint(point);
  }
}

function addMidpointToTrail(midpoint) {
  if (!midpoint) {
    return;
  }

  const now = performance.now();
  let radius = 12;
  if (lastMidpointSample) {
    const deltaTimeSeconds = Math.max((now - lastMidpointSample.timeMs) / 1000, 0.001);
    const deltaDistance = distance(midpoint, lastMidpointSample.point);
    const speed = deltaDistance / deltaTimeSeconds;
    const clampedSpeed = Math.min(Math.max(speed, 0), 1.2);
    const minRadius = 4;
    const maxRadius = 16;
    const speedRatio = clampedSpeed / 1.2;
    radius = maxRadius - speedRatio * (maxRadius - minRadius);
  }

  const midpointPoint = {
    ...midpoint,
    radius
  };

  const lastPoint = midpointTrail[midpointTrail.length - 1];
  if (!lastPoint) {
    midpointTrail.push(midpointPoint);
    lastMidpointSample = {
      point: midpoint,
      timeMs: now
    };
    return;
  }

  const isFarEnough = distance(midpoint, lastPoint) > 0.01;
  if (isFarEnough) {
    midpointTrail.push(midpointPoint);
    lastMidpointSample = {
      point: midpoint,
      timeMs: now
    };
  }
}

function clearMidpointTrail() {
  midpointTrail = [];
  lastMidpointSample = null;
}

function setHandState(text) {
  if (handStateElement) {
    handStateElement.textContent = `Hand state: ${text}`;
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
    setStatus("Hand model ready. Click ENABLE WEBCAM.");
  } catch {
    setStatus("Hand model failed to load. Webcam can still open, but landmarks will not draw.");
    console.error("Failed to initialize HandLandmarker.");
  }
  demosSection.classList.remove("invisible");
};
createHandLandmarker();

/********************************************************************
// Demo 2: Continuously grab image from webcam stream and detect it.
********************************************************************/

const video = document.getElementById("webcam");
video.style.transform = "scaleX(-1)";
const canvasElement = document.getElementById(
  "output_canvas"
);
canvasElement.style.transform = "scaleX(-1)"
const canvasCtx = canvasElement.getContext("2d");

// Check if webcam access is supported.
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// If webcam supported, add event listener to button for when user
// wants to activate it.
if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton");
  if (enableWebcamButton) {
    enableWebcamButton.addEventListener("click", enableCam);
  } else {
    setStatus("Webcam button not found in page.");
  }
} else {
  setStatus("getUserMedia is not supported by this browser.");
  console.warn("getUserMedia() is not supported by your browser");
}

clearButton = document.getElementById("clearButton");
if (clearButton) {
  clearButton.addEventListener("click", clearMidpointTrail);
}

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
    webcamRunning = false;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      stream = null;
    }
    video.srcObject = null;
    setWebcamButtonLabel("ENABLE WEBCAM");
    setStatus("Webcam stopped.");
    setHandState("No hand detected");
    clearMidpointTrail();
  } else {
    webcamRunning = true;
    setWebcamButtonLabel("DISABLE WEBCAM");
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
        setStatus("Webcam active.");
        predictWebcam();
      };
    }).catch((error) => {
      webcamRunning = false;
      setWebcamButtonLabel("ENABLE WEBCAM");
      setStatus(`Unable to access webcam: ${error.name}. Check browser camera permissions.`);
      console.error("Unable to access webcam:", error);
    });
  }
}

let lastVideoTime = -1;
let results = undefined;
async function predictWebcam() {
  canvasElement.style.width = `${video.videoWidth}px`;
  canvasElement.style.height = `${video.videoHeight}px`;
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
  if (results?.landmarks) {
    const primaryHand = results.landmarks[0];
    let midpoint = null;
    if (primaryHand) {
      const handState = inferHandState(primaryHand);
      setHandState(handState);
      if (handState === "Fist" || handState === "Partial hand") {
        midpoint = getLandmarksMidpoint(primaryHand);
        addMidpointToTrail(midpoint);
      }
    }
    drawMidpointTrail();
    for (const landmarks of results.landmarks) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 5
      });
      drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
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
