/* =========================================
   js/CoreManager.js
   ========================================= */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CoreManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // シーン
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1e1e1e);
        this.scene.fog = new THREE.FogExp2(0x1e1e1e, 0);

        // カメラ
        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(8, 8, 12);

        // レンダラー
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
         this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);

        // 環境
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

        // ライト
        this.ambientLight = new THREE.AmbientLight(0x404040, 1.0);
        this.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(10, 20, 10);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.set(2048, 2048);
        this.dirLight.shadow.bias = -0.0001;
        this.scene.add(this.dirLight);

        // コントロール
        this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.1;
       this.orbit.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,   // 左ドラッグで回転（復活！）
            MIDDLE: THREE.MOUSE.ROTATE, // ホイール押し込みでも回転（Blender風）
            RIGHT: THREE.MOUSE.PAN      // 右ドラッグで平行移動（便利！）
        };
this.orbit.minPolarAngle = 0;
        this.orbit.maxPolarAngle = Math.PI;
        // ヘルパー
        this.gridHelper = new THREE.GridHelper(40, 40, 0x666666, 0x333333);
        this.scene.add(this.gridHelper);
        this.axesHelper = new THREE.AxesHelper(2);
        this.scene.add(this.axesHelper);

        // ★追加: 3Dカーソル (赤いリング)
        const cursorGeo = new THREE.RingGeometry(0.3, 0.35, 16);
        cursorGeo.rotateX(-Math.PI / 2);
        const cursorMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            side: THREE.DoubleSide, 
            depthTest: false, 
            transparent: true 
        });
        this.cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
        this.cursorMesh.renderOrder = 999; // 最前面に表示
        this.cursorMesh.add(new THREE.AxesHelper(0.5));
        this.scene.add(this.cursorMesh);

        // イベント
        window.addEventListener('resize', this.onResize.bind(this));
        this.clock = new THREE.Clock();
        this.updateCallbacks = [];
    }

    // ★修正: カーソル位置設定メソッド (名前変更＆globalOffset操作を削除)
    setCursorPosition(position) { 
        if (this.cursorMesh) {
            this.cursorMesh.position.copy(position);
        }
    }

    // ★修正: リセットメソッド (globalOffset操作を削除)
    resetCursor() {
        if (this.cursorMesh) {
            this.cursorMesh.position.set(0, 0, 0);
        }
    }

    onResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight || 1; // ★修正: ゼロ除算防止
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    addUpdateCallback(callback) {
        this.updateCallbacks.push(callback);
    }

    startLoop() {
        this.renderer.setAnimationLoop(() => {
            const dt = this.clock.getDelta();
            this.updateCallbacks.forEach(cb => cb(dt));
            if (this.orbit.enabled) this.orbit.update();
            this.renderer.render(this.scene, this.camera);
        });
    }
    updateEnvironment(config) {
        if (!config) return;

        // 背景と霧
        const bgColor = new THREE.Color(config.bgColor || '#1e1e1e');
        this.scene.background = bgColor;
        if (this.scene.fog) {
            this.scene.fog.color = bgColor;
            this.scene.fog.density = config.fogDensity !== undefined ? config.fogDensity : 0;
        }

        // 環境光 (Ambient)
        if (this.ambientLight) {
            this.ambientLight.color.set(config.ambientColor || '#404040');
            this.ambientLight.intensity = config.ambientInt !== undefined ? config.ambientInt : 1.0;
        }

        // 太陽光 (Directional)
        if (this.dirLight) {
            this.dirLight.color.set(config.sunColor || '#ffffff');
            this.dirLight.intensity = config.sunInt !== undefined ? config.sunInt : 1.2;
            
            // 太陽の向き(XYZ)を更新
            const sx = config.sunX !== undefined ? config.sunX : 10;
            const sy = config.sunY !== undefined ? config.sunY : 20;
            this.dirLight.position.set(sx, sy, 10);
            
            // 影を落とす方向も調整するためにターゲットを原点に向ける
            this.dirLight.target.position.set(0, 0, 0);
            this.dirLight.target.updateMatrixWorld();
        }
    }
}