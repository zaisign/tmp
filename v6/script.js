// PDF.js ライブラリを取得
var { pdfjsLib } = globalThis;

// PDFのworkerSrc を指定
pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdfjs/build/pdf.worker.mjs';

let pdfDoc = null;        // PDFオブジェクト
var currentPageLeft = 1;  // 左canvasのページ数の保管
var currentPageRight = 2;

// 顔角度((xとy)Degrees + o_rx))の時系列リスト[ degress0, [...]]
var Degress_face_x = []
var Degress_face_y = []

// 視線角度((xとy)Degrees + o_rx + eye_o_rx + gazeUpRad))の時系列リスト[ degress0, [...]]
var Degress_eye_x = []
var Degress_eye_y = []


// MediaPipeのBlendshapesのlookUp/Downの平均合計値の時系列リスト（	• eyeLookDownLeft　• eyeLookDownRight　• eyeLookUpLeft　•eyeLookUpRight）
var Blendes_LookUp = []


// 時系列の横軸のデータ
var Degress_time = []

// 前回自動ページめくった時刻[ms]
var LastAutoNextPageCallTime = 0

var pEyeScreenIntersect  // 視線と画面の交点の座標[px]　のグローバル保管
var EyeCalibVal = [0, 0] // 視線校正データ

$(function(){
  // 中央の校正ボタンの処理
  $("#center_point").on('click', function(){
    const imgW = video.videoWidth

    const centerX = imgW/2

    const viewPortRatio = window.innerWidth / window.innerHeight
    const centerY = imgW / viewPortRatio / 2
    EyeCalibVal = [
      centerX - (pEyeScreenIntersect[0] - EyeCalibVal[0]) ,
      centerY - (pEyeScreenIntersect[1] - EyeCalibVal[1]) 
    ]
    console.log("imgW = ", imgW, centerX, centerY, EyeCalibVal)
  })
})


function getScreenWidthInCm() {
  // Get the screen width in pixels
  const screenWidthPx = window.screen.width;

  // Approximate DPI (dots per inch). You might want to adjust this value for more accuracy.
  const dpi = 96; // Common DPI for many screens, but this can vary widely.

  // Convert screen width from pixels to inches (1 inch = 2.54 cm)
  const screenWidthInInches = screenWidthPx / dpi;
  const screenWidthInCm = screenWidthInInches * 2.54;

  return screenWidthInCm;
}

// 結果をコンソールに表示
console.log("ウィンドウの幅（cm）: " + getScreenWidthInCm());
$(function (){
  $("#width_cm").val(getScreenWidthInCm())
})


// 合計値を求める関数
function sumArray(arr) {
  return arr.reduce(function(acc, curr) {
    return acc + curr;
  }, 0);
}

// 平均値を求める関数
function averageArray(arr) {
  return sumArray(arr) / arr.length;
}

// 中央値を求める関数
function medianArray(arr) {
  const sorted = arr.slice().sort(function(a, b) {
    return a - b;
  });
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}


function AddToTimeSeries(dat){
  // dat: Array:  [ eyeX:[time, deg],  ...  ]
  Degress_face_x.push(dat[0])
  Degress_face_y.push(dat[1])
  Degress_eye_x.push(dat[2])
  Degress_eye_y.push(dat[3])
  Blendes_LookUp.push(dat[4])
  
  // Get current time in milliseconds
  var time = Date.now();
  Degress_time.push(time)

  // 25秒前の時系列データを削除
  while( time - Degress_time[0] >= 25000 ){
    Degress_time.shift()
    Degress_face_x.shift()
    Degress_face_y.shift()
    Degress_eye_x.shift()
    Degress_eye_y.shift()
    Blendes_LookUp.shift()
  }
}

// canvasに描画する関数
function drawTimeSeries(zoomY) {
  var canvas = document.getElementById('timeSeriesCanvas');
  var ctx = canvas.getContext('2d');

  // キャンバスをクリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // データが少ない場合は描画しない
  if (Degress_time.length === 0) return;

  var timeWindow = 25000; // [ms]
  var currentTime = Date.now();
  var timeRange = Math.max(...Degress_time) - Math.min(...Degress_time);

  // Yの目盛りを描画
  function drawYLabels(zoomY) {
    var canvas = document.getElementById('timeSeriesCanvas');
    var ctx = canvas.getContext('2d');

    ctx.save(); // 現在の描画状態を保存

    // Y軸の目盛りの設定
    var margin = 50; // Y軸の目盛りからキャンバス端までの距離
    var step = 0.5; // 目盛りの間隔
    var startValue = -10; // Y軸の最小値（例: -10）
    var endValue = 10; // Y軸の最大値（例: 10）

    ctx.strokeStyle = '#000'; // 目盛り線の色
    ctx.lineWidth = 1; // 目盛り線の幅

    for (var value = startValue; value <= endValue; value += step) {
      var y = (canvas.height / 2) - value * zoomY; // zoomYを考慮してy位置を計算

      // 目盛り線を描画
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();

      // 目盛りのラベルを描画
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, margin - 10, y);
    }

    ctx.restore(); // 描画状態を復元
  }


  // 横軸（時間軸）の目盛りを描画する関数
  function drawXLabels(timeWindow) {
    var canvas = document.getElementById('timeSeriesCanvas');
    var ctx = canvas.getContext('2d');
    var currentTime = Date.now();

    ctx.save(); // 現在の描画状態を保存

    // 横軸の目盛り設定
    var margin = 50; // X軸の目盛りからキャンバス端までの距離
    var yZero = canvas.height / 2; // Y = 0 の位置
    var step = 2000; // 2秒刻みの時間（ミリ秒）

    ctx.strokeStyle = '#000'; // 目盛り線の色

    // 左から右に向かって2秒刻みの目盛りを描画
    for (var time = 0; time <= timeWindow; time += step) {
        var x = canvas.width - (time / timeWindow) * canvas.width;

        // 目盛り線を描画 (y = 0 の位置)

        ctx.lineWidth = 0.5; // 目盛り線の幅
        
        ctx.beginPath();
        ctx.moveTo(x, 0); 
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yZero - 5); // 目盛りの高さを少し調整
        ctx.lineTo(x, yZero + 5);
        ctx.stroke();
  

        // 目盛りのラベルを描画
        var timeLabel = -(time / 1000).toFixed(1) + 's'; // 時間（秒）
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(timeLabel, x - 20, yZero + 10);
    }

    ctx.restore(); // 描画状態を復元
  }


  // Yの目盛りを描画
  drawYLabels(zoomY);


  // Xの目盛りを描画 (2秒刻みで)
  drawXLabels(timeWindow);

  // 時間を横軸に、角度を縦軸に描画
  function drawLine(dataArray, color, width, offset = 0) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (var i = 0; i < dataArray.length; i++) {
      var timeDiff = currentTime - Degress_time[i];
      var x = (timeDiff / timeWindow) * canvas.width;
      var y = (canvas.height / 2) - (dataArray[i] + offset) * zoomY; // zoomYを縦軸の倍率に使用
      if (i === 0) {
        ctx.moveTo(canvas.width - x, y);
      } else {
        ctx.lineTo(canvas.width - x, y);
      }
    }
    ctx.stroke();
  }

  // データの描画
  drawLine(Degress_face_x, 'red', 2, -1.5);    // 顔のx方向角度
  drawLine(Degress_face_y, 'blue', 2, -1.5);   // 顔のy方向角度
  drawLine(Degress_eye_x, 'green', 3, 1.5);   // 視線のx方向角度
  drawLine(Degress_eye_y, 'purple', 3, 1.5);  // 視線のy方向角度
  drawLine(Blendes_LookUp, 'cyan', 3, 0);  // 視線のy方向角度

}




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
                // showPage(1, currentPageRight);  // 右ページに2ページ目を表示
            }, function (reason) {
                console.error(reason);
            });
        };
        reader.readAsArrayBuffer(file);
    }
});


// 左か右に指定したpageNoを表示
function showPage(leftRight, pageNo) {
    if (!pdfDoc) {
        console.error('PDF is not loaded');
        return;
    }

    pdfDoc.getPage(pageNo).then(function (page) {
        console.log('Page loaded: ' + pageNo);

        // var scale = parseInt(document.getElementById("page_scale").value) / 100.0 
        // scale *= resolutionMultiplier
        // var viewport = page.getViewport({ scale: scale });

        // // var viewport = page.getViewport();

        // // var canvas = document.getElementById(leftRight === 0 ? 'left-canvas' : 'right-canvas');
        // // var context = canvas.getContext('2d');

        // // let canvas = [leftCanvas, rightCanvas][leftRight]
        // let context = [leftContext, rightContext][leftRight]
        // // canvas.height = viewport.height;
        // // canvas.width = viewport.width;

        // var renderContext = {
        //     canvasContext: context,
        //     viewport: viewport
        // };
        // var renderTask = page.render(renderContext);
        // renderTask.promise.then(function () {
        //     console.log('Page rendered: ' + pageNo);
        // });

        // // if (leftRight === 0) {
        // //     currentPageLeft = pageNo;
        // //     document.getElementById('page-num-left').value = pageNo;
        // // } else {
        // //     currentPageRight = pageNo;
        // //     document.getElementById('page-num-right').value = pageNo;
        // // }

      var scale = 1.5;
      var viewport = page.getViewport({ scale: scale, });
      // Support HiDPI-screens.
      var outputScale = window.devicePixelRatio || 1;

      var canvas = document.getElementById('left-canvas');
      var context = canvas.getContext('2d');

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      // canvas.style.height = Math.floor(viewport.height) + "px";

      var transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : null;

      var renderContext = {
        canvasContext: context,
        transform: transform,
        viewport: viewport
      };
      page.render(renderContext);
    });
}



var is_control_eye = true;


$(function(){
  $("#toggle_debug_info").on("click", function(){
    $("#debug_info").toggle()
  })
  $("#debug_info").toggle()

  $("#next_page").on("click", function(){
    nextPage()
  })

  $("#prev_page").on("click", function(){
    prevPage()
  })

  $("#first_page").on("click", function(){
    firstPage()
  })

  $("#page_scale").on("change", function(){
    showPage(0, currentPageLeft)
  })

  $("#control_face_eye").on("click", function(){    
    is_control_eye = !is_control_eye;
    document.getElementById("control_face_eye").textContent = is_control_eye ? "視線制御" : "顔制御";
  })

})



let canNextPage = false;


// 次のページを表示する
function nextPage(){
  if (! pdfDoc?.numPages ) return

  let maxPage = pdfDoc.numPages

  currentPageLeft += 1;
  currentPageLeft = Math.min(maxPage, currentPageLeft)
  showPage(0, currentPageLeft); 
}

// 前のページを表示する
function prevPage(){
  if (! pdfDoc?.numPages ) return

  currentPageLeft -= 1;
  currentPageLeft = Math.max(1, currentPageLeft)
  showPage(0, currentPageLeft); 
}

// 最初のページを表示する
function firstPage(){
  if (! pdfDoc?.numPages ) return

  currentPageLeft = 1;
  showPage(0, currentPageLeft); 
}


function resetCanNextPage(){
  canNextPage = true;
}


function constrainValue(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}




// MediaPipeのimport
import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision

// DrawingUtilsにOpenCVライクの描画関数を拡張
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


// ウェブカメラのフレームごとの処理
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
      const pixel_cm = 34 / parseInt(document.getElementById("width_cm").value || 34) * 64;// 端末のサイズ、カメラの焦点距離に応じて校正が必要      
      
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
      const eye_r_rx = parseFloat(document.getElementById("eye_r_rx").value || 1.5)  // 視線の上下向きの敏感度
      const eye_r_ry = parseFloat(document.getElementById("eye_r_ry").value || 1.0)
      const eye_d_eopy = dist * Math.tan((xDegrees + o_rx + eye_o_rx + gazeUpRad  ) * Math.PI / 180) * eye_r_rx * pixel_cm
      const eye_d_eopx = dist * Math.tan((yDegrees + o_ry + eye_o_ry + gazeLeftRad) * Math.PI / 180) * eye_r_ry * pixel_cm

      pEyeScreenIntersect = [
          pointCenter[0] + eye_d_eopx + EyeCalibVal[0]  ,
          pointCenter[1] - eye_d_eopy + EyeCalibVal[1]
        ]
      const pEyeNose = [pointCenter[0], pointCenter[1]]

      // 視線を描画
      // drawingUtils.drawLine(pEyeNose, pEyeScreenIntersect, { color: 'rgba(255, 0, 0, 0.5)', lineWidth: 3 })

      // 交点に画面を横断する十字カーソルを描画
      drawingUtils.drawLine([pEyeScreenIntersect[0], 0],  [pEyeScreenIntersect[0], imgH], { color: 'rgba(255, 0, 0, 0.5)', lineWidth: 3 })
      drawingUtils.drawLine([0, pEyeScreenIntersect[1]], [imgW, pEyeScreenIntersect[1]], { color: 'rgba(255, 0, 0, 0.5)', lineWidth: 3 })

      // 視線の交点に円を描画
      const devWidth = $("#width_cm").val() || 34

      const radiusEye = 80 * distanceToCamera / 500 * ( 34 / devWidth ) // カメラまでの距離に応じて円のサイズを比例関係で調整、デバイス幅と反比例
      // 交点を画面は範囲内に抑える処理

      const viewPortRatio = window.innerWidth / window.innerHeight
      const maxY = imgW / viewPortRatio

      drawingUtils.drawCircle([constrainValue(pEyeScreenIntersect[0], 0, imgW), constrainValue(pEyeScreenIntersect[1], 0, maxY)], { color: 'rgba(255, 0, 0, 0.5)', radius: radiusEye })


      // 😉片目を閉じてページを制御　（ウィンク）(左目を閉じると、前のページ、右目は次のページ )
      if( $("#next_page_manaual_control").val() == '0' ){
        const right目蓋距離 = getDistOf2LM(fl[159], fl[145])
        const left目蓋距離 = getDistOf2LM(fl[386], fl[374])
  
        if(right目蓋距離 / left目蓋距離 > 1.9){
          if(Date.now() - LastAutoNextPageCallTime > 1000){
            prevPage()
            LastAutoNextPageCallTime = Date.now()
          }
        }
  
        if(left目蓋距離 / right目蓋距離 > 1.9){
          if(Date.now() - LastAutoNextPageCallTime > 1000){
            nextPage()
            LastAutoNextPageCallTime = Date.now()
          }
        }
      }
      
      // console.log("right目蓋距離=","left目蓋距離=", right目蓋距離.toFixed(2), left目蓋距離.toFixed(2))

      let blendShapesScore = getBlendshapesScoreAsDict(results.faceBlendshapes)

      // eyeLookDownLeft
      // eyeLookDownRight
      // eyeLookUpLeft
      // eyeLookUpRight

      // 時系列データに追加
      AddToTimeSeries([ 
          xDegrees + o_rx, 
          yDegrees + o_ry,
          xDegrees + o_rx + eye_o_rx + gazeUpRad,
          yDegrees + o_ry + eye_o_ry + gazeLeftRad,

          (blendShapesScore.eyeLookUpLeft + blendShapesScore.eyeLookUpRight)/2 
          - (blendShapesScore.eyeLookDownLeft + blendShapesScore.eyeLookDownRight)/2 
        ])
      
      // 時系列描画
      drawTimeSeries(100);


      // 時系列データの変化点検知とページ制御
      // 　　次のページの検知
      function detectNextPage_by_EyeDegPattern1( degress, maxDiff, minDiff ){
        // 画面の横幅に応じて、閾値（maxDiff, minDiff）を調整する
        // 開発当時は34cmに設定したので、 これを基準値、比例する
        let widthRatio = parseInt($("#width_cm").val() || 34) / 34

        maxDiff *= widthRatio
        minDiff *= widthRatio


        let now_time = Date.now()
        let target_i
        const windowLen = 1000
        for(let i = Degress_time.length; i >= 0; i--){
          if((now_time - Degress_time[i]) >= windowLen){
            target_i = i;
            break
          }
        }
        if(target_i){
          let arr1 = [];
          let arr2 = [];
          
          for(let j = target_i; j < Degress_time.length; j++ ){
            if(Degress_time[j] < now_time - windowLen/4 ){
              arr1.push(degress[j])
            }else{
              arr2.push(degress[j])
            }
          }
          // let avg_sum1 = averageArray(arr1);
          // let avg_sum2 = averageArray(arr2);
          
          let median1 = medianArray(arr1);
          let median2 = medianArray(arr2);

          // console.log("target_i=", target_i, avg_sum1, avg_sum2, sum1, sum2, n1, n2)
          let diff = median2 - median1 
          if( diff < maxDiff  && diff > minDiff){
            return true
          }
        }
        return false
      }

      if( $("#next_page_control").val() == '1' ){
        // 時系列データの変化点検知とページ制御
        if(  detectNextPage_by_EyeDegPattern1(is_control_eye ? Degress_eye_x : Degress_face_x , 1.0, 0.18) 
          && detectNextPage_by_EyeDegPattern1(is_control_eye ? Degress_eye_y : Degress_face_y,  1.0, 0.13) 
        ){
            let now_time = Date.now()
            if( now_time - LastAutoNextPageCallTime > 1000 ){
              nextPage()
              LastAutoNextPageCallTime = now_time
            }
        }

      } else if( $("#next_page_control").val() == '0' ){
        // 指定位置への視線情報の変化条件でページ制御
        // 視線や顔向きの選択
        if(is_control_eye){
          var point = pEyeScreenIntersect;
        }else{
          var point = pScreenIntersect;
        }

        let n = point[1] / 480
        let m = point[0] / 640

        if(n > 1) n = 1
        if(n < 0) n = 0
        if(m > 1) m = 1
        if(m < 0) m = 0

        
        if (n > 0.5 && m < 0.4){
        // if ( m < 0.44 ){
          if(! canNextPage){
            console.log("n, m: ", n.toFixed(2), ", ",  m.toFixed(2), ", ", ! canNextPage)
          }
          canNextPage = true;
          // console.log("true", n, ", ",  m)
        }

        if (n < 0.4 && m > 0.6){
        // if ( m > 0.56 ){
          if(canNextPage){
            nextPage();
            canNextPage = false;

          //  if(tid){
          //     clearTimeout(tid)
          //   } 
            // var tid = setTimeout(resetCanNextPage, 15000);

            // console.log("false" , n, ", ",  m)
            // console.log("n, m: ", n.toFixed(2), ", ",  m.toFixed(2), ", ", canNextPage)
          }
        }
      }


      

      const drawInfoElement = document.getElementById('draw_info')
      drawInfoElement.innerHTML = `
        表示画素サイズ[px]: ${imgW} x ${imgH}<br>
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


function getBlendshapesScoreAsDict(blendShapes){
  // MediaPipeのblendShapesのリストを、categoryNameをキーに、scoreを値に、オブジェクトとして取得する

  let result = {}
  
  blendShapes[0].categories.map((shape) => {
    result[shape.displayName || shape.categoryName] = shape.score
  })

  return result
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
