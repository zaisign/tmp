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
  // 動画のアスペクト比を計算
  const aspectRatio = video.videoWidth / video.videoHeight; 

  // 画面の幅を取得
  const screenWidth = window.innerWidth;

  // アスペクト比と画面の幅に基づいてcanvasの高さを計算
  const canvasHeight = screenWidth / aspectRatio;

  // 動画の幅を画面全体に設定
  video.style.width = screenWidth + "px";
  video.style.height = canvasHeight + "px";

  // canvasの幅を画面全体に設定
  canvasElement.style.width = screenWidth + "px";
  canvasElement.style.height = canvasHeight + "px";

  // canvasの位置を左上に設定
  canvasElement.style.position = "absolute";
  canvasElement.style.top = "0";
  canvasElement.style.left = "0";

  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  // 動作モードが「画像」なら「ビデオ」に変更
  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await faceLandmarker.setOptions({ runningMode: runningMode });
  }
  let startTimeMs = performance.now(); // 処理の開始時間を記録
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    results = faceLandmarker.detectForVideo(video, startTimeMs); // ビデオから顔を検出
  }
  let lastAngles = null;
  if (results.faceLandmarks) {
    
    if (results.faceLandmarks.length > 0) {
      // 顔向き角度を求める
      const faceLandmarks = results.faceLandmarks[0];
      
      // 全ての顔Landmarkから最小の z 値を見つける
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
        face3D.push([x, y, (lm.z - minZ)]); // z 値を基準化
        // face3D.push([x, y, lm.z]);

        if (idx === 1) {
          nose2D = [x, y];
          nose3D = [x, y, lm.z * imgW];
        }
      });
  
      if (face2D.length !== 6 || face3D.length !== 6) {
        console.error('必要な顔のLandmarkを取得できませんでした。');
        return;
      }
  
      const face2DArray = cv.matFromArray(face2D.length, 2, cv.CV_64F, face2D.flat());
      const face3DArray = cv.matFromArray(face3D.length, 3, cv.CV_64F, face3D.flat());
  
      const focalLength = imgW * 50 / 44;
      
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
      // console.log("rmat: ", rmat.data64F);
  
      // 回転行列をオイラー角に変換
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
  
      // 角度に平滑化（スムージング）を適用
      // ここは、指数移動平均（Exponential Moving Average, EMA）を使用
      // 新しい平滑化後の値 = 前回の平滑化後の値 * 平滑化係数 + 新しい値 * (1 - 平滑化係数)
      const smoothingFactor = 0.9;
      if (lastAngles) {
        x = lastAngles.x * smoothingFactor + x * (1 - smoothingFactor);
        y = lastAngles.y * smoothingFactor + y * (1 - smoothingFactor);
        z = lastAngles.z * smoothingFactor + z * (1 - smoothingFactor);
      }
      lastAngles = { x, y, z };
  
        
      // 角度をラジアンから度に変換
      const xDegrees = x * (180 / Math.PI);
      const yDegrees = y * (180 / Math.PI);
      const zDegrees = z * (180 / Math.PI);

      // 度単位で頭の向き角度を出力
      const poseInfoElement = document.getElementById('pose_info');
      poseInfoElement.innerText = `頭の向き推定角度 - x: ${xDegrees.toFixed(3)}°, y: ${yDegrees.toFixed(3)}°, z: ${zDegrees.toFixed(3)}°`;

      // メモリの解放
      face2DArray.delete();
      face3DArray.delete();
      camMatrix.delete();
      distMatrix.delete();
      rotVec.delete();
      transVec.delete();
      rmat.delete();
  
      // 目の間の距離を計算
      const leftEye = faceLandmarks[263];
      const rightEye = faceLandmarks[33];
      const dx = (rightEye.x - leftEye.x) * imgW;
      const dy = (rightEye.y - leftEye.y) * imgH;
      const dz = (rightEye.z - leftEye.z) * imgW; // z 値を imgW でスケーリング
      const eyeDistancePixels = Math.sqrt(dx * dx + dy * dy + dz * dz); // 3D ユークリッド距離

      // 平均瞳孔間距離 (IPD) を mm 単位で設定
      const ipd = 63; // mm 単位

      // カメラから顔までの距離を計算
      const focalLengthMM = focalLength; // mm 単位の焦点距離がピクセルの焦点距離と一致すると仮定
      const distanceToCamera = (ipd * focalLengthMM) / eyeDistancePixels; // mm 単位の距離

      // 結果を出力
      document.getElementById("eye_info").innerText = `カメラまでの推定距離: ${(distanceToCamera / 10).toFixed(2)} cm`;

      // 顔の向きを示す線と画面との交点を描画：
      
      // 顔向きと画面の交差点の計算：
      const dist = distanceToCamera * 19; // 640 px / 18cm
      const o_rx = -1, o_ry = 0, r_rx = 1, r_ry = 1; // 必要に応じて調整
      const d_eopy = dist * Math.tan((xDegrees + o_rx) * Math.PI / 180) * r_rx;
      const d_eopx = dist * Math.tan((yDegrees + o_ry) * Math.PI / 180) * r_ry;

      const pScreenIntersect = [Math.round(nose2D[0] + d_eopx), Math.round(nose2D[1] - d_eopy)];
      const pNose = [Math.round(nose2D[0]), Math.round(nose2D[1])];

      // 線を描画
      drawingUtils.drawLine(pNose, pScreenIntersect, { color: 'rgba(9, 255, 0, 1)', lineWidth: 3 });

      // 交点に円を描画
      const radius = Math.round(40 * distanceToCamera / 500); // カメラまでの距離に応じて円のサイズを比例関係で調整。
      drawingUtils.drawCircle(pScreenIntersect, { color: 'rgba(255, 255, 0, 1)', radius: radius });

      // 鼻の位置に円を描画
      const nosePoint = faceLandmarks[1];
      const npX = Math.round(nosePoint.x * imgW);
      const npY = Math.round(nosePoint.y * imgH);
      drawingUtils.drawCircle([npX, npY], { color: 'rgba(255, 255, 255, 1)', radius: 3 });

      const drawInfoElement = document.getElementById('draw_info');
      drawInfoElement.innerHTML = `
        画像サイズ: ${imgW} x ${imgH}<br>
        最小Z値: ${minZ.toFixed(3)}<br>
        左右目のLandmark: <br>
        　　${leftEye.x.toFixed(3)},${leftEye.y.toFixed(3)},${leftEye.z.toFixed(3)}<br>
        　　${rightEye.x.toFixed(3)},${rightEye.y.toFixed(3)},${rightEye.z.toFixed(3)} 
        <br>
        鼻の位置: [${npX}, ${npY}]<br>
        P1: [${pNose[0]}, ${pNose[1]}]<br>
        P3: [${pScreenIntersect[0]}, ${pScreenIntersect[1]}]
      `;
    }

    // 顔のLandmarkを描画
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
    window.requestAnimationFrame(predictWebcam); // 次のフレームで再度実行
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
