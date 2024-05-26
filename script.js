// public/script.js

import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;



class ExtendedDrawingUtils extends DrawingUtils {
  drawLine(start, end, { color = 'rgba(0, 0, 0, 1)', lineWidth = 1 } = {}) {
    this.ctx.beginPath();
    this.ctx.moveTo(start[0], start[1]);
    this.ctx.lineTo(end[0], end[1]);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  drawCircle(center, { color = 'rgba(0, 0, 0, 1)', radius = 1 } = {}) {
    this.ctx.beginPath();
    this.ctx.arc(center[0], center[1], radius, 0, 2 * Math.PI);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }
}


const demosSection = document.getElementById("demos");
const videoBlendShapes = document.getElementById("video-blend-shapes");

let faceLandmarker;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;
const videoWidth = 480;

async function createFaceLandmarker() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode,
    numFaces: 1
  });
  demosSection.classList.remove("invisible");
}
createFaceLandmarker();


const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");

const canvasCtx = canvasElement.getContext("2d");

function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton");
  enableWebcamButton.addEventListener("click", enableCam);
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

function enableCam(event) {
  if (!faceLandmarker) {
    console.log("Wait! faceLandmarker not loaded yet.");
    return;
  }

  if (webcamRunning === true) {
    webcamRunning = false;
    enableWebcamButton.innerText = "ENABLE PREDICTIONS";
  } else {
    webcamRunning = true;
    enableWebcamButton.innerText = "DISABLE PREDICTIONS";
  }

  const constraints = {
    video: true
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
  });
}

let lastVideoTime = -1;
let results = undefined;
const drawingUtils = new ExtendedDrawingUtils(canvasCtx);


async function predictWebcam() {
  // const radio = video.videoHeight / video.videoWidth;
  // video.style.width = videoWidth + "px";
  // video.style.height = videoWidth * radio + "px";
  // canvasElement.style.width = videoWidth + "px";
  // canvasElement.style.height = videoWidth * radio + "px";
  // canvasElement.width = video.videoWidth;
  // canvasElement.height = video.videoHeight;
 // Calculate the aspect ratio
  // Calculate the aspect ratio
  const aspectRatio = video.videoWidth / video.videoHeight;

  // Get the width of the screen
  const screenWidth = window.innerWidth;

  // Calculate the height of the canvas based on the aspect ratio and screen width
  const canvasHeight = screenWidth / aspectRatio;

  // Set the width of the video to fill the screen
  video.style.width = screenWidth + "px";
  video.style.height = canvasHeight + "px";

  // Set the width of the canvas to fill the screen
  canvasElement.style.width = screenWidth + "px";
  canvasElement.style.height = canvasHeight + "px";

  // Set the canvas position to top-left corner
  canvasElement.style.position = "absolute";
  canvasElement.style.top = "0";
  canvasElement.style.left = "0";

  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;



  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await faceLandmarker.setOptions({ runningMode: runningMode });
  }
  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    results = faceLandmarker.detectForVideo(video, startTimeMs);
  }
  let lastAngles = null
  if (results.faceLandmarks) {
    
    if (results.faceLandmarks.length > 0){
      // 顔向き角度を求める
      const faceLandmarks = results.faceLandmarks[0];
      
      // Find the minimum z value in all face landmarks
      let minZ = faceLandmarks[0].z;
      for (const landmark of faceLandmarks) {
        if (landmark.z < minZ) {
          minZ = landmark.z;
        }
      }

      const imgW = video.videoWidth;
      const imgH = video.videoHeight;
  
      const selectedLandmarksIdx = [33, 263, 1, 61, 291, 199];
      const face2D = [];
      const face3D = [];
      let nose2D = [];
      let nose3D = [];
  
      selectedLandmarksIdx.forEach((idx) => {
        const lm = faceLandmarks[idx];
        const x = lm.x * imgW;
        const y = lm.y * imgH;
        face2D.push([x, y]);
        face3D.push([x, y, (lm.z - minZ) ] );
        // face3D.push([x, y, lm.z]);
  
        if (idx === 1) {
          nose2D = [x, y];
          nose3D = [x, y, lm.z * imgW];
        }
      });
  
      if (face2D.length !== 6 || face3D.length !== 6) {
        console.error('Failed to get the required face landmarks.');
        return;
      }
  
      const face2DArray = cv.matFromArray(face2D.length, 2, cv.CV_64F, face2D.flat());
      const face3DArray = cv.matFromArray(face3D.length, 3, cv.CV_64F, face3D.flat());
  
      const focalLength = imgW * 50/44
      
      const camMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
        focalLength, 0, imgH / 2,
        0, focalLength, imgW / 2,
        0, 0, 1,
      ]);
      const distMatrix = cv.matFromArray(4, 1, cv.CV_64F, [0, 0, 0, 0]);
  
      const rotVec = new cv.Mat();
      const transVec = new cv.Mat();
  
      cv.solvePnP(face3DArray, face2DArray, camMatrix, distMatrix, rotVec, transVec);
  
      const rmat = new cv.Mat();
      cv.Rodrigues(rotVec, rmat);
      // console.log("rmat: ", rmat.data64F)
  

      // Convert rotation matrix to Euler angles
      const sy = Math.sqrt(rmat.data64F[0] * rmat.data64F[0] + rmat.data64F[3] * rmat.data64F[3]);
      const singular = sy < 1e-6;
  
      let x, y, z;
      if (!singular) {
        x = Math.atan2(rmat.data64F[7], rmat.data64F[8]);
        y = Math.atan2(-rmat.data64F[6], sy);
        z = Math.atan2(rmat.data64F[3], rmat.data64F[0]);
      } else {
        x = Math.atan2(-rmat.data64F[5], rmat.data64F[4]);
        y = Math.atan2(-rmat.data64F[6], sy);
        z = 0;
      }
  
      x = x * (180 / Math.PI);
      y = y * (180 / Math.PI);
      z = z * (180 / Math.PI);
  
      // Apply smoothing to angles
      const smoothingFactor = 0.9;
      if (lastAngles) {
        x = lastAngles.x * smoothingFactor + x * (1 - smoothingFactor);
        y = lastAngles.y * smoothingFactor + y * (1 - smoothingFactor);
        z = lastAngles.z * smoothingFactor + z * (1 - smoothingFactor);
      }
      lastAngles = { x, y, z };
  
      // console.log(`Head pose angles - x: ${x.toFixed(5)}, y: ${y.toFixed(5)}, z: ${z.toFixed(5)}`);
      // document.getElementById("pose_info").innerText = `Head pose angles - x: ${x.toFixed(5)}, y: ${y.toFixed(5)}, z: ${z.toFixed(5)}`
        
      // Convert angles from radians to degrees
      const xDegrees = x * (180 / Math.PI);
      const yDegrees = y * (180 / Math.PI);
      const zDegrees = z * (180 / Math.PI);

      // Output head pose angles in degrees
      const poseInfoElement = document.getElementById('pose_info');
      poseInfoElement.innerText = `Head pose angles - x: ${xDegrees.toFixed(3)}°, y: ${yDegrees.toFixed(3)}°, z: ${zDegrees.toFixed(3)}°`;


      face2DArray.delete();
      face3DArray.delete();
      camMatrix.delete();
      distMatrix.delete();
      rotVec.delete();
      transVec.delete();
      rmat.delete();
  
  
      // Calculate the distance between eyes
      const leftEye = faceLandmarks[263];
      const rightEye = faceLandmarks[33];
      const dx = (rightEye.x - leftEye.x) * imgW;
      const dy = (rightEye.y - leftEye.y) * imgH;
      const dz = (rightEye.z - leftEye.z) * imgW; // Scale dz by imgW to match the scale of x and y
      const eyeDistancePixels = Math.sqrt(dx * dx + dy * dy + dz * dz); // 3D Euclidean distance

      // Known average interpupillary distance (IPD) in mm
      const ipd = 63; // in mm

      // Calculate distance from camera to face
      const focalLengthMM = focalLength; // assuming focal length in mm matches the focal length in pixels
      const distanceToCamera = (ipd * focalLengthMM) / eyeDistancePixels; // distance in mm

      // Output the result
      document.getElementById("eye_info").innerText = `Distance to camera: ${(distanceToCamera / 10).toFixed(2)} cm`;

      // Draw face facing line and intersection with screen

      const dist = distanceToCamera *19;  // 640 px / 18cm
      const o_rx = -1, o_ry = 0, r_rx = 1, r_ry = 1; // Adjust as needed
      const d_eopy = dist * Math.tan((xDegrees + o_rx)*Math.PI/180)  * r_rx;
      const d_eopx = dist * Math.tan((yDegrees + o_ry)*Math.PI/180)  * r_ry;

      const pScreenIntersect = [Math.round(nose2D[0] + d_eopx), Math.round(nose2D[1] - d_eopy)];
      const pNose = [Math.round(nose2D[0]), Math.round(nose2D[1])];

      // Drawing the line
      drawingUtils.drawLine(pNose, pScreenIntersect, { color: 'rgba(9, 255, 0, 1)', lineWidth: 3 });

      // Drawing the circle at the intersection point
      drawingUtils.drawCircle(pScreenIntersect, { color: 'rgba(255, 255, 0, 1)', radius: 40 });

      // Drawing the nose point
      const nosePoint = faceLandmarks[1];
      const npX = Math.round(nosePoint.x * imgW);
      const npY = Math.round(nosePoint.y * imgH);
      drawingUtils.drawCircle([npX, npY], { color: 'rgba(255, 255, 255, 1)', radius: 3 });

      const drawInfoElement = document.getElementById('draw_info');
      drawInfoElement.innerHTML = `
        ImgShape: ${imgW} x ${imgH}<br>
        minZ: ${minZ.toFixed(3)}<br>
        LeftRightEyeContourLM: <br>
        　　${leftEye.x.toFixed(3)},${leftEye.y.toFixed(3)},${leftEye.z.toFixed(3)}<br>
        　　${rightEye.x.toFixed(3)},${rightEye.y.toFixed(3)},${rightEye.z.toFixed(3)} 
        <br>
        Nose Point: [${npX}, ${npY}]<br>
        P1: [${pNose[0]}, ${pNose[1]}]<br>
        P3: [${pScreenIntersect[0]}, ${pScreenIntersect[1]}]
      `;

    }



    for (const landmarks of results.faceLandmarks) {
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        { color: "#30FF30" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        { color: "#30FF30" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        { color: "#E0E0E0" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
        { color: "#E0E0E0" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
        { color: "#30FF30" }
      );
    }
  }
  drawBlendShapes(videoBlendShapes, results.faceBlendshapes);

  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
  }
}

function drawBlendShapes(el, blendShapes) {
  if (!blendShapes.length) {
    return;
  }

  // console.log(blendShapes[0]);

  let htmlMaker = "";
  blendShapes[0].categories.map((shape) => {
    htmlMaker += `
      <li class="blend-shapes-item">
        <span class="blend-shapes-label">${
          shape.displayName || shape.categoryName
        }</span>
        <span class="blend-shapes-value" style="width: calc(${
          +shape.score * 100
        }% - 120px)">${(+shape.score).toFixed(4)}</span>
      </li>
    `;
  });

  el.innerHTML = htmlMaker;
}
