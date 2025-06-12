import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

let scene, camera, renderer, planeMesh;
let textureLoader;
let depthMapTexture;
let mainTexture;

// ジャイロセンサー関連 (マウス位置シミュレーション用)
let currentBeta = 0; // 前後傾き (マウスY軸に対応)
let currentGamma = 0; // 左右傾き (マウスX軸に対応)
const maxTilt = 20; // 最大傾き角度（画面端でのずれ具合を調整） // --- 追加・変更 ---

// マウスイベント関連
// ドラッグ関連の変数は不要なので削除またはコメントアウト
// let isDragging = false;
// let previousMouseX = 0;
// let previousMouseY = 0;
// let mouseSensitivity = 0.1;

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

    // --- マウスイベントリスナーを修正 ---
    // ドラッグ関連のイベントリスナーはコメントアウトまたは削除
    // renderer.domElement.addEventListener('mousedown', onMouseDown, false);
    // renderer.domElement.addEventListener('mouseup', onMouseUp, false);
    renderer.domElement.addEventListener('mousemove', onMouseMove, false); // これだけ残す
    // renderer.domElement.addEventListener('mouseleave', onMouseLeave, false);
    // ------------------------------------
}

// テクスチャの読み込み (変更なし)
function loadTextures() {
    // メイン画像
    textureLoader.load('your_photo.jpg', (texture) => {
        mainTexture = texture;
        // 画質向上のためのanisotropy設定（任意）
        mainTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        console.log('メイン画像を読み込みました。');
        createParallaxPlane();
    });

    // 深度マップ
    textureLoader.load('your_depth_map.png', (texture) => {
        depthMapTexture = texture;
        // 画質向上のためのanisotropy設定（任意）
        depthMapTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
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
                // あなたの解決策に合わせて 'depth' を使用
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

// ウィンドウリサイズ時の処理 (変更なし)
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- マウスイベントハンドラを修正 ---
// ドラッグ関連の関数は削除またはコメントアウト
// function onMouseDown(event) { ... }
// function onMouseUp(event) { ... }
// function onMouseLeave(event) { ... }

function onMouseMove(event) {
    // マウスカーソルがCanvas要素内のどこにあるかを取得
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left; // Canvas左端からのX座標
    const mouseY = event.clientY - rect.top;   // Canvas上端からのY座標

    // マウス位置を -1.0 から 1.0 の範囲に正規化
    // 中央が 0.0 になるように調整
    const normalizedX = (mouseX / rect.width) * 2 - 1; // -1 (左端) から 1 (右端)
    const normalizedY = (mouseY / rect.height) * 2 - 1; // -1 (上端) から 1 (下端)

    // 正規化されたマウス位置を傾きにマッピング
    // マウスを右に動かすと、写真が左にずれるような効果が一般的
    // (マウスを覗き窓として考えるため)
    // -normalizedX は、マウスが右に動くと、写真が左に動くようにするため
    currentGamma = -normalizedX * maxTilt; // X軸のずれ
    currentBeta = normalizedY * maxTilt;  // Y軸のずれ
}
// ----------------------------

// アニメーションループ (変更なし)
function animate() {
    requestAnimationFrame(animate);

    if (planeMesh) {
        // マウスの動きによって更新された値をシェーダーに渡す
        planeMesh.material.uniforms.uSensorX.value = currentGamma;
        planeMesh.material.uniforms.uSensorY.value = currentBeta;
    }

    renderer.render(scene, camera);
}

// 初期化とアニメーション開始
init();
animate();

// ジャイロセンサーの許可ボタンはPC確認中は引き続き非表示
const permissionButton = document.getElementById('permissionButton');
if (permissionButton) {
    permissionButton.style.display = 'none';
}