import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js'; // Three.jsをCDNからインポート

let scene, camera, renderer, planeMesh;
let textureLoader;
let depthMapTexture;
let mainTexture;

// ジャイロセンサー関連 (マウスシミュレーション用)
let currentBeta = 0; // 前後傾き (マウスY軸に対応)
let currentGamma = 0; // 左右傾き (マウスX軸に対応)
let sensorSensitivity = 0.05; // センサーの感度調整 (マウス移動量に対する影響度)

// マウスイベント関連
let isDragging = false;
let previousMouseX = 0;
let previousMouseY = 0;
let mouseSensitivity = 0.1; // マウスドラッグの感度 (ピクセルあたりの傾き変化量)

// シーンの初期化
function init() {
    // シーン
    scene = new THREE.Scene();

    // カメラ
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 2; // カメラを少し手前に配置

    // レンダラー
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // レンダリング品質をデバイスピクセル比に合わせる
    document.body.appendChild(renderer.domElement);

    // テクスチャローダー
    textureLoader = new THREE.TextureLoader();

    // 画像と深度マップの読み込み
    loadTextures();

    // イベントリスナー
    window.addEventListener('resize', onWindowResize, false);

    // --- マウスイベントリスナーを追加 ---
    renderer.domElement.addEventListener('mousedown', onMouseDown, false);
    renderer.domElement.addEventListener('mouseup', onMouseUp, false);
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.addEventListener('mouseleave', onMouseLeave, false); // マウスがCanvasから出た時
    // ------------------------------------
}

// テクスチャの読み込み
function loadTextures() {
    // メイン画像
    textureLoader.load('your_photo.jpg', (texture) => {
        mainTexture = texture;
        console.log('メイン画像を読み込みました。');
        createParallaxPlane();
    });

    // 深度マップ
    textureLoader.load('your_depth_map.png', (texture) => {
        depthMapTexture = texture;
        console.log('深度マップを読み込みました。');
        createParallaxPlane();
    });
}

// 視差効果用プレーンの作成
function createParallaxPlane() {
    if (!mainTexture || !depthMapTexture) {
        return; // 両方のテクスチャが揃ってから作成
    }

    // ジオメトリ: 画像の縦横比に合わせて調整
    const aspectRatio = mainTexture.image.width / mainTexture.image.height;
    const planeWidth = 2; // 適当な基準幅
    const planeHeight = planeWidth / aspectRatio;
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

    // カスタムシェーダーマテリアル
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uMainTexture: { value: mainTexture },
            uDepthMap: { value: depthMapTexture },
            uSensorX: { value: 0.0 }, // ジャイロセンサーのX軸傾き (マウスX軸に対応)
            uSensorY: { value: 0.0 }, // ジャイロセンサーのY軸傾き (マウスY軸に対応)
            uParallaxStrength: { value: 0.0005 } // 視差効果の強さ
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uMainTexture;
            uniform sampler2D uDepthMap;
            uniform float uSensorX;
            uniform float uSensorY;
            uniform float uParallaxStrength;

            varying vec2 vUv;

            void main() {
                // 深度マップから深度値を取得 (Rチャンネルのみで十分)
                float depth = texture2D(uDepthMap, vUv).r;

                // 深度値に基づいてUV座標をずらす
                vec2 offset = vec2(uSensorX, uSensorY) * depth * uParallaxStrength;
                vec2 newUv = vUv + offset;

                // 新しいUV座標でメインテクスチャから色を取得
                vec4 color = texture2D(uMainTexture, newUv);
                gl_FragColor = color;
            }
        `,
        side: THREE.DoubleSide // 両面描画
    });

    planeMesh = new THREE.Mesh(geometry, material);
    scene.add(planeMesh);
}

// ウィンドウリサイズ時の処理
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- マウスイベントハンドラ ---
function onMouseDown(event) {
    isDragging = true;
    previousMouseX = event.clientX;
    previousMouseY = event.clientY;
    document.body.style.cursor = 'grabbing'; // カーソルを掴む形にする
}

function onMouseUp(event) {
    isDragging = false;
    document.body.style.cursor = 'grab'; // カーソルを掴める形に戻す
}

function onMouseLeave(event) {
    // マウスがCanvas外に出た時もドラッグを終了
    if (isDragging) {
        onMouseUp(event);
    }
}

function onMouseMove(event) {
    if (!isDragging) return;

    const deltaX = event.clientX - previousMouseX;
    const deltaY = event.clientY - previousMouseY;

    // マウスの移動量をジャイロセンサーの傾きにマッピング
    // X軸の移動はgamma（左右傾き）に影響
    // Y軸の移動はbeta（前後傾き）に影響
    // マウスの移動方向と画像の移動方向を合わせるため、deltaXに負号を付けています
    // （マウスを右に動かすと画像が右にずれるような効果）
    currentGamma += deltaX * mouseSensitivity;
    currentBeta -= deltaY * mouseSensitivity; // Y軸は逆方向の動きが自然な場合が多い

    // 傾きに制限を設ける（極端な動きを防ぐため）
    // 例えば、-50から50の範囲にクランプ
    currentGamma = Math.max(-50, Math.min(50, currentGamma));
    currentBeta = Math.max(-50, Math.min(50, currentBeta));

    previousMouseX = event.clientX;
    previousMouseY = event.clientY;
}
// ----------------------------

// アニメーションループ
function animate() {
    requestAnimationFrame(animate);

    if (planeMesh) {
        // マウスの動きによって更新された値をシェーダーに渡す
        // uSensorX (シェーダー内のX軸傾き) に currentGamma (マウスX軸由来の左右傾き) を渡す
        planeMesh.material.uniforms.uSensorX.value = currentGamma;
        // uSensorY (シェーダー内のY軸傾き) に currentBeta (マウスY軸由来の前後傾き) を渡す
        planeMesh.material.uniforms.uSensorY.value = currentBeta;
    }

    renderer.render(scene, camera);
}

// 初期化とアニメーション開始
init();
animate();

// ジャイロセンサーの許可ボタンはPC確認中は不要なので削除、またはコメントアウト
// document.getElementById('permissionButton').addEventListener('click', () => { ... });
const permissionButton = document.getElementById('permissionButton');
if (permissionButton) {
    permissionButton.style.display = 'none'; // PC確認中は非表示にする
}
// または、以下のようにボタンを削除しても良い
// if (permissionButton) {
//     permissionButton.parentNode.removeChild(permissionButton);
// }

// PCで確認する場合、ジャイロセンサーイベントリスナーの設定関数は呼び出さない
// setupDeviceOrientationListener(); // コメントアウト
// handleDeviceOrientation(); // コメントアウト