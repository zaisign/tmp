// PDF.js ライブラリを取得
var { pdfjsLib } = globalThis;

// workerSrc を指定
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';

let pdfDoc = null;
var currentPageLeft = 1;
var currentPageRight = 2;

let leftCanvas = document.getElementById("left-canvas")
let rightCanvas = document.getElementById("right-canvas")

const resolutionMultiplier = window.devicePixelRatio || 1;

// Set the resolution of the canvases to match their displayed size
leftCanvas.width = window.innerWidth / 2 * resolutionMultiplier; // 50% of the viewport width
leftCanvas.height = window.innerHeight * resolutionMultiplier; // 100% of the viewport height

rightCanvas.width = window.innerWidth / 2 * resolutionMultiplier; // 50% of the viewport width
rightCanvas.height = window.innerHeight * resolutionMultiplier; // 100% of the viewport height


let leftContext = document.getElementById("left-canvas").getContext("2d")
let rightContext = document.getElementById("right-canvas").getContext("2d")

// PDFファイルを選択したときの処理
document.getElementById('file-input').addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var arrayBuffer = e.target.result;
            var loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            loadingTask.promise.then(function (pdf) {
                pdfDoc = pdf;
                console.log('PDF loaded');
                showPage(0, currentPageLeft);  // 左ページに1ページ目を表示
                showPage(1, currentPageRight);  // 右ページに2ページ目を表示
            }, function (reason) {
                console.error(reason);
            });
        };
        reader.readAsArrayBuffer(file);
    }
});

$(function(){
  $("#toggle_debug_info").on("click", function(){
    $("#debug_info").toggle()
  })
})

function showPage(leftRight, pageNo) {
    if (!pdfDoc) {
        console.error('PDF is not loaded');
        return;
    }

    pdfDoc.getPage(pageNo).then(function (page) {
        console.log('Page loaded: ' + pageNo);

        var scale = 1.35 * resolutionMultiplier;
        var viewport = page.getViewport({ scale: scale });

        // var viewport = page.getViewport();

        // var canvas = document.getElementById(leftRight === 0 ? 'left-canvas' : 'right-canvas');
        // var context = canvas.getContext('2d');

        // let canvas = [leftCanvas, rightCanvas][leftRight]
        let context = [leftContext, rightContext][leftRight]
        // canvas.height = viewport.height;
        // canvas.width = viewport.width;

        var renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        var renderTask = page.render(renderContext);
        renderTask.promise.then(function () {
            console.log('Page rendered: ' + pageNo);
        });

        // if (leftRight === 0) {
        //     currentPageLeft = pageNo;
        //     document.getElementById('page-num-left').value = pageNo;
        // } else {
        //     currentPageRight = pageNo;
        //     document.getElementById('page-num-right').value = pageNo;
        // }
    });
}












// const detectWindow_Y = [ 1, 1, 1, 1, 0, 0, 0, 0];
// const detectWindow_X = [ 0, 0, 0, 0, 1, 1, 1, 1];
// const eye_y = [];
// const eye_x = [];

// function sumArray(arr) {
//   let sum = 0;
//   for (let i = 0; i < arr.length; i++) {
//       sum += arr[i];
//   }
//   return sum;
// }

// function detectNextPage(){
//   if(eye_x.length >= detectWindow_Y.length){
//     let eye_detect_y = [];
//     let eye_detect_x = [];
//     for( let i = 0; i < detectWindow_Y.length; i++ ){
//       let diff_y = detectWindow_Y[i] - eye_y.at( i - detectWindow_Y.length );
//       let diff_x = detectWindow_X[i] + eye_x.at( i - detectWindow_X.length );
//       eye_detect_y.push(Math.abs(diff_y));
//       eye_detect_x.push(Math.abs(diff_x));

//     }
//     let sumY = sumArray(eye_detect_y);
//     let sumX = sumArray(eye_detect_x);
//     console.log("sumY , sumX: ", eye_y.at(-1).toFixed(2), ", ",  eye_x.at(-1).toFixed(2), ",   ",  sumY.toFixed(2), ", ", sumX.toFixed(2))
//   }
// }

// function push( x, y ){
//   y = Math.max(0, y)
//   y = Math.min(1, y)
//   x = Math.max(0, x)
//   x = Math.min(1, x)

//   eye_y.push(y);
//   eye_x.push(x);
//   if(eye_x.length > 1000){
//     eye_x.shift();
//     eye_y.shift();
//   }
// }

let canNextPage = false;

function nextPage(){
  currentPageLeft += 2;
  currentPageRight += 2;
  showPage(0, currentPageLeft); 
  showPage(1, currentPageRight); 
}

function resetCanNextPage(){
  canNextPage = true;
}



import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision


class ExtendedDrawingUtils extends DrawingUtils {
  drawLine(start, end, { color = 'rgba(0, 0, 0, 1)', lineWidth = 1 } = {}) {
    this.ctx.beginPath()
    this.ctx.moveTo(start[0], start[1])
    this.ctx.lineTo(end[0], end[1])
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = lineWidth
    this.ctx.stroke()
  }

  drawCircle(center, { color = 'rgba(0, 0, 0, 1)', radius = 1 } = {}) {
    this.ctx.beginPath()
    this.ctx.arc(center[0], center[1], radius, 0, 2 * Math.PI)
    this.ctx.fillStyle = color
    this.ctx.fill()
  }
}


const demosSection = document.getElementById("demos")
const videoBlendShapes = document.getElementById("video-blend-shapes")

let faceLandmarker
let runningMode = "IMAGE"
let enableWebcamButton
let webcamRunning = false
const videoWidth = 640

async function createFaceLandmarker() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  )
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode,
    numFaces: 1
  })
  demosSection.classList.remove("invisible")
}
createFaceLandmarker()


const video = document.getElementById("webcam")
const canvasElement = document.getElementById("output_canvas")

const canvasCtx = canvasElement.getContext("2d")

function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton")
  enableWebcamButton.addEventListener("click", enableCam)
} else {
  console.warn("getUserMedia() is not supported by your browser")
}

function enableCam(event) {
  if (!faceLandmarker) {
    console.log("Wait! faceLandmarker not loaded yet.")
    return
  }

  if (webcamRunning === true) {
    webcamRunning = false
    enableWebcamButton.innerText = "ENABLE PREDICTIONS"
  } else {
    webcamRunning = true
    enableWebcamButton.innerText = "DISABLE PREDICTIONS"
  }

  const constraints = {
    video: true
  }

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream
    video.addEventListener("loadeddata", predictWebcam)
  })
}

let lastVideoTime = -1
let results = undefined
const drawingUtils = new ExtendedDrawingUtils(canvasCtx)

async function predictWebcam() {
  // 動画のアスペクト比を計算
  const aspectRatio = video.videoWidth / video.videoHeight 

  // 画面の幅を取得
  const screenWidth = window.innerWidth

  // アスペクト比と画面の幅に基づいてcanvasの高さを計算
  const canvasHeight = screenWidth / aspectRatio

  // 動画の幅を画面全体に設定
  video.style.width = screenWidth + "px"
  video.style.height = canvasHeight + "px"

  // canvasの幅を画面全体に設定
  canvasElement.style.width = screenWidth + "px"
  canvasElement.style.height = canvasHeight + "px"

  // canvasの位置を左上に設定
  canvasElement.style.position = "absolute"
  canvasElement.style.top = "0"
  canvasElement.style.left = "0"

  canvasElement.width = video.videoWidth
  canvasElement.height = video.videoHeight

  // 動作モードが「画像」なら「ビデオ」に変更
  if (runningMode === "IMAGE") {
    runningMode = "VIDEO"
    await faceLandmarker.setOptions({ runningMode: runningMode })
  }
  let startTimeMs = performance.now() // 処理の開始時間を記録
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime
    results = faceLandmarker.detectForVideo(video, startTimeMs) // ビデオから顔を検出
  }
  let lastAngles = null
  if (results.faceLandmarks) {
    
    if (results.faceLandmarks.length > 0) {
      // 顔向き角度を求める
      const fl = results.faceLandmarks[0]
      
      // 全ての顔Landmarkから最小の z 値を見つける
      let minZ = fl[0].z
      for (const landmark of fl) {
        if (landmark.z < minZ) {
          minZ = landmark.z
        }
      }

      const imgW = video.videoWidth
      const imgH = video.videoHeight

      // 顔向き角度の推定のための特徴点の登録
      // const selectedLandmarksIdx = [1, 168, 33, 263,]
      const selectedLandmarksIdx = [33, 263, 1, 61, 291, 199]
      const face2D = []
      const face3D = []
      let pointCenter = []
  
      selectedLandmarksIdx.forEach((idx) => {
        const lm = fl[idx]
        const x = lm.x * imgW
        const y = lm.y * imgH
        face2D.push([x, y])
        face3D.push([x, y, (lm.z - minZ)]) // z 値を基準化
        // face3D.push([x, y, lm.z])

        if (idx === 1) {
          pointCenter = [x, y]
        }
      })
  
  
      const face2DArray = cv.matFromArray(face2D.length, 2, cv.CV_64F, face2D.flat())
      const face3DArray = cv.matFromArray(face3D.length, 3, cv.CV_64F, face3D.flat())
  
      // const focalLength = imgW * 50 / 44
      const focalLength = document.getElementById("focalLength").value;
      
      const camMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
        focalLength, 0, imgH / 2,
        0, focalLength, imgW / 2,
        0, 0, 1,
      ])
      const distMatrix = cv.matFromArray(4, 1, cv.CV_64F, [0, 0, 0, 0])
  
      const rotVec = new cv.Mat()
      const transVec = new cv.Mat()
  
      cv.solvePnP(face3DArray, face2DArray, camMatrix, distMatrix, rotVec, transVec)
  
      const rmat = new cv.Mat()
      cv.Rodrigues(rotVec, rmat)
      // console.log("rmat: ", rmat.data64F)
  
      // 回転行列をオイラー角に変換
      const sy = Math.sqrt(rmat.data64F[0] * rmat.data64F[0] + rmat.data64F[3] * rmat.data64F[3])
      const singular = sy < 1e-6
  
      let x, y, z
      if (!singular) {
        x = Math.atan2(rmat.data64F[7], rmat.data64F[8])
        y = Math.atan2(-rmat.data64F[6], sy)
        z = Math.atan2(rmat.data64F[3], rmat.data64F[0])
      } else {
        x = Math.atan2(-rmat.data64F[5], rmat.data64F[4])
        y = Math.atan2(-rmat.data64F[6], sy)
        z = 0
      }
  
      x = x * (180 / Math.PI)
      y = y * (180 / Math.PI)
      z = z * (180 / Math.PI)
  
      // 角度に平滑化（スムージング）を適用
      // ここは、指数移動平均（Exponential Moving Average, EMA）を使用
      // 新しい平滑化後の値 = 前回の平滑化後の値 * 平滑化係数 + 新しい値 * (1 - 平滑化係数)
      // const smoothingFactor = 0.9
      // if (lastAngles) {
      //   x = lastAngles.x * smoothingFactor + x * (1 - smoothingFactor)
      //   y = lastAngles.y * smoothingFactor + y * (1 - smoothingFactor)
      //   z = lastAngles.z * smoothingFactor + z * (1 - smoothingFactor)
      // }
      // lastAngles = { x, y, z }
  
        
      // 角度をラジアンから度に変換 
      // 不明な校正が必要
      const calib = 0.25
      const xDegrees = x * (180 / Math.PI) * calib
      const yDegrees = y * (180 / Math.PI) * calib
      const zDegrees = z * (180 / Math.PI) * calib

      // 度単位で頭の向き角度を出力
      const poseInfoElement = document.getElementById('pose_info')
      poseInfoElement.innerText = `頭の向き推定角度 - x: ${xDegrees.toFixed(3)} rad, y: ${yDegrees.toFixed(3)} rad, z: ${zDegrees.toFixed(3)} rad`

      // メモリの解放
      face2DArray.delete()
      face3DArray.delete()
      camMatrix.delete()
      distMatrix.delete()
      rotVec.delete()
      transVec.delete()
      rmat.delete()
  
      // 目の間の距離を計算
      function getDistOf2LM(lm1, lm2, toPixel=true){
        if (toPixel){
          const dx = (lm1.x - lm2.x) * imgW
          const dy = (lm1.y - lm2.y) * imgH
          const dz = (lm1.z - lm2.z) * imgW // z 値を imgW でスケーリング
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) // 3D ユークリッド距離
          return dist 
        } else{
          const dx = (lm1.x - lm2.x)
          const dy = (lm1.y - lm2.y)
          const dz = (lm1.z - lm2.z)
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) // 3D ユークリッド距離
          return dist 
        }
      }
      const leftEye = fl[263]
      const rightEye = fl[33]
      // const dx = (rightEye.x - leftEye.x) * imgW
      // const dy = (rightEye.y - leftEye.y) * imgH
      // const dz = (rightEye.z - leftEye.z) * imgW // z 値を imgW でスケーリング
      // const eyeDistancePixels = Math.sqrt(dx * dx + dy * dy + dz * dz) // 3D ユークリッド距離
      const eyeDistancePixels = getDistOf2LM(leftEye, rightEye)

      // 平均瞳孔間距離 (IPD) を mm 単位で設定
      const ipd = 63 // mm 単位

      // カメラから顔までの距離を計算
      const focalLengthMM = focalLength // mm 単位の焦点距離がピクセルの焦点距離と一致すると仮定
      const distanceToCamera = (ipd * focalLengthMM) / eyeDistancePixels // mm 単位の距離

      // 結果を出力
      document.getElementById("eye_info").innerText = `カメラまでの推定距離: ${(distanceToCamera / 10).toFixed(2)} cm`

      // 顔の向きを示す線と画面との交点を描画：
      
      // 顔向きと画面の交差点の計算：
      const dist = distanceToCamera 
      // const pixel_cm = videoWidth / 10　// 端末のサイズ、カメラの焦点距離に応じて校正が必要
      const pixel_cm = document.getElementById("pixelcm").value;// 端末のサイズ、カメラの焦点距離に応じて校正が必要      
      
      const o_rx = -0.2 // 上下向きのオフセット
      const o_ry = 0
      const r_rx = 2 // 上下向きの敏感度
      const r_ry = 1 
      const d_eopy = dist * Math.tan((xDegrees + o_rx) * Math.PI / 180) * r_rx * pixel_cm
      const d_eopx = dist * Math.tan((yDegrees + o_ry) * Math.PI / 180) * r_ry * pixel_cm

      const pScreenIntersect = [pointCenter[0] + d_eopx, pointCenter[1] - d_eopy]
      const pNose = [pointCenter[0], pointCenter[1]]

      // 線を描画
      drawingUtils.drawLine(pNose, pScreenIntersect, { color: 'rgba(9, 255, 0, 0.5)', lineWidth: 3 })

      // 交点に円を描画
      const radius = 40 * distanceToCamera / 500 // カメラまでの距離に応じて円のサイズを比例関係で調整。
      drawingUtils.drawCircle(pScreenIntersect, { color: 'rgba(255, 255, 0, 0.5)', radius: radius })

      // 鼻の位置に円を描画
      const npX = pointCenter[0]
      const npY = pointCenter[1]
      drawingUtils.drawCircle([npX, npY], { color: 'rgba(255, 255, 255, 1)', radius: 3 })

      



      
      //x、ｙ座標の時系列
      // push(pScreenIntersect[0] / 640, pScreenIntersect[1] / 480)

      // detectNextPage()
      
      
      // 瞳孔の位置から水平方向角度の推定
      
      // 左向き程度の推定　（＋は左、―は右）
      // let rdc = Math.abs(fl[473].x - fl[362].x)  // 右目瞳孔から中心目頭点の距離
      // let ldc = Math.abs(fl[133].x - fl[468].x)　// 左目瞳孔から中心目頭点の距離
      // let rdc = getDistOf2LM(fl[473], fl[362], false)  // 右目瞳孔から中心目頭点の距離
      // let ldc = getDistOf2LM(fl[468], fl[133], false)　// 左目瞳孔から中心目頭点の距離
      // let gazeLeft =  rdc - ldc



      // 左目の瞳孔　と　目輪郭の位置関係
      var leftEyeWidth = Math.abs(fl[362].x - fl[263].x)
      var leftEyeLeftDist = Math.abs(fl[362].x - fl[473].x)
      if(leftEyeWidth != 0){
        var leftEyeLeftRatio = leftEyeLeftDist / leftEyeWidth
      }
  
      var leftEyeRad = (leftEyeLeftRatio - 0.56) * ( Math.PI / 2  / 0.28 ) 


      // 右目の瞳孔　と　目輪郭の位置関係
      var rightEyeWidth = Math.abs(fl[33].x - fl[133].x)
      var rightEyeRightDist = Math.abs(fl[468].x - fl[133].x)

      if(rightEyeWidth != 0){
        var rightEyeLeftRatio = - rightEyeRightDist / rightEyeWidth
      }
      var rightEyeRad = (rightEyeLeftRatio + 0.52) * ( Math.PI / 2  / 0.28 ) 
      

      // 両目の角度の平均　
      let gazeLeftRad = (rightEyeRad + leftEyeRad)/2 


      // 視線上角度を求める
      // 瞳孔Y座標と目の輪郭の左右2点のY座標の差から上向き視線角度を求める
      // 右目
      var avgRightEyeCenterY = (fl[33].y + fl[133].y) / 2
      var upRightEyeUpScale = (avgRightEyeCenterY - fl[468].y) / rightEyeWidth

      var upRightEyeRad = (upRightEyeUpScale - 0.08) * (0.5 / 0.05)
      
      // 左目
      var avgLeftEyeCenterY = (fl[362].y + fl[263].y) / 2
      var upLeftEyeUpScale = (avgLeftEyeCenterY - fl[473].y) / leftEyeWidth

      var upLeftEyeRad = (upLeftEyeUpScale - 0.08) * (0.5 / 0.05)

      // 両目の平均
      let gazeUpRad = (upRightEyeRad + upLeftEyeRad) / 2


      
      // 視線方向と画面の交差点の計算：
      const eye_o_rx = 0 // 視線の上下向きのオフセット
      const eye_o_ry = 0
      const eye_r_rx = 1 // 視線の上下向きの敏感度
      const eye_r_ry = 1 
      const eye_d_eopy = dist * Math.tan((xDegrees + o_rx + gazeUpRad  ) * Math.PI / 180) * eye_r_rx * pixel_cm
      const eye_d_eopx = dist * Math.tan((yDegrees + o_ry + gazeLeftRad) * Math.PI / 180) * eye_r_ry * pixel_cm

      const pEyeScreenIntersect = [pointCenter[0] + eye_d_eopx, pointCenter[1] - eye_d_eopy]
      const pEyeNose = [pointCenter[0], pointCenter[1]]

      // 視線を描画
      drawingUtils.drawLine(pEyeNose, pEyeScreenIntersect, { color: 'rgba(255, 0, 0, 0.5)', lineWidth: 3 })

      // 視線の交点に円を描画
      const radiusEye = 80 * distanceToCamera / 500 // カメラまでの距離に応じて円のサイズを比例関係で調整。
      drawingUtils.drawCircle(pEyeScreenIntersect, { color: 'rgba(255, 0, 0, 0.5)', radius: radiusEye })



      

      let n = pEyeScreenIntersect[1] / 480
      let m = pEyeScreenIntersect[0] / 640

      if(n > 1) n = 1
      if(n < 0) n = 0
      if(m > 1) m = 1
      if(m < 0) m = 0
  
      

      // if (n > 0.7 && m < 0.3){
      if ( m < 0.44 ){
        if(! canNextPage){
          console.log("n, m: ", n.toFixed(2), ", ",  m.toFixed(2), ", ", ! canNextPage)
        }
        canNextPage = true;
        // console.log("true", n, ", ",  m)
      }

      // if (n < 0.3 && m > 0.7){
      if ( m > 0.56 ){
        if(canNextPage){
          nextPage();
          canNextPage = false;

        //  if(tid){
        //     clearTimeout(tid)
        //   } 
          // var tid = setTimeout(resetCanNextPage, 15000);

          // console.log("false" , n, ", ",  m)
          console.log("n, m: ", n.toFixed(2), ", ",  m.toFixed(2), ", ", canNextPage)
        }
      }






      

      const drawInfoElement = document.getElementById('draw_info')
      drawInfoElement.innerHTML = `
        画像サイズ: ${imgW} x ${imgH}<br>
        最小Z値: ${minZ.toFixed(3)}<br>
        左右目のLandmark: <br>
        　　${leftEye.x.toFixed(3)},${leftEye.y.toFixed(3)},${leftEye.z.toFixed(3)}<br>
        　　${rightEye.x.toFixed(3)},${rightEye.y.toFixed(3)},${rightEye.z.toFixed(3)} 
        <br>
        正規化した左目の左向き視線比率： ${leftEyeLeftRatio.toFixed(8)}<br>
        　　　　　左目の左向き視線角度： ${leftEyeRad.toFixed(3)} rad<br>
        正規化した右目の左向き視線比率： ${rightEyeLeftRatio.toFixed(8)}<br>
        　　　　　右目の左向き視線角度： ${rightEyeRad.toFixed(3)} rad<br> 
        　　左右目の左向き視線角度平均： ${gazeLeftRad.toFixed(3)} rad<br>
        <br> 
        正規化した右目の上向きスケール：${upRightEyeUpScale.toFixed(3)}<br>
        　　　　　右目の上向き視線角度： ${upRightEyeRad.toFixed(3)} rad<br>
        正規化した左目の上向きスケール：${upLeftEyeUpScale.toFixed(3)}<br>
        　　　　　左目の上向き視線角度： ${upLeftEyeRad.toFixed(3)} rad<br>
        　　左右目の上向き視線角度平均： ${gazeUpRad.toFixed(3)} rad<br>
        鼻の位置: [${npX}, ${npY}]<br>
        P1: [${pNose[0]}, ${pNose[1]}]<br>
        P3: [${pScreenIntersect[0]}, ${pScreenIntersect[1]}]
      `
    }

    // 顔のLandmarkを描画
    for (const landmarks of results.faceLandmarks) {
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        { color: "#FF3030" }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        { color: "#FF3030" }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        { color: "#30FF30" }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        { color: "#30FF30" }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        { color: "#E0E0E0" }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
        { color: "#E0E0E0" }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
        { color: "#FF3030" }
      )
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
        { color: "#30FF30" }
      )
    }
  }
  drawBlendShapes(videoBlendShapes, results.faceBlendshapes)

  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam) // 次のフレームで再度実行
  }
}

function drawBlendShapes(el, blendShapes) {
  if (!blendShapes.length) {
    return
  }

  // console.log(blendShapes[0])

  let htmlMaker = ""
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
    `
  })

  el.innerHTML = htmlMaker
}
