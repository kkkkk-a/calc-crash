/* =========================================
   js/main.js (Fixed: Play Mode Detection)
   ========================================= */

// ★最優先: グローバルエラーハンドリング
window.onerror = function (message, source, lineno, colno, error) {
    console.error("🔥 [CRITICAL ERROR] 予期せぬエラーが発生しました:", message);
    console.error("場所:", source, "行:", lineno, "列:", colno);
    console.error("詳細:", error);
    // 書き出し後のゲームでアラートが出ると遊びにくいので、コンソールのみにするか、
    // 開発中のみアラートを出すようにしても良いですが、一旦そのままにします。
    // alert(`【エラー発生】\n処理が中断されました。\n\n詳細: ${message}\n行: ${lineno}`);
    return true;
};

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { CoreManager } from './CoreManager.js';
import { StageManager } from './StageManager.js';
import { SelectionManager } from './SelectionManager.js';
import { EffectManager } from './EffectManager.js';
import { UIManager } from './UIManager.js';
import { IOManager } from './IOManager.js';
import { SoundManager } from './SoundManager.js';
import { CharacterEditor } from './CharacterEditor.js';
import { LogicEditor } from './LogicEditor.js';
import { AttackEditor } from './AttackEditor.js';
import { TimelineEditor } from './TimelineEditor.js';
import { UIEditor } from './UIEditor.js';

import { SimpleGameSystem } from './SimpleGame.js';
import { PhysicsDebugger } from './PhysicsDebugger.js';

import { ProjectilePool } from './ProjectilePool.js';
import { HistoryManager } from './HistoryManager.js';
import { imageManager } from './ImageManager.js';
import { SceneOptimizer } from './SceneOptimizer.js';

// --- Global Variables ---
let core, stage, selection, ui, effectManager, ioManager;
let charEditor, logicEditor, attackEditor, timelineEditor, simpleGame;
let physicsDebugger, uiEditor;
let historyManager;
let sceneOptimizer;

window.isPlaying = false;
window.currentMode = 'stage';
window.gameSettings = {
    targetFPS: 60,   // 目標FPS (初期値60)
    bgmVolume: 0.5,  // BGM音量 (0.0 ~ 1.0)
    seVolume: 0.5    // SE音量 (0.0 ~ 1.0)
};
let lastFrameTime = 0;
const animatedSprites = [];
const textureCache = {};

// =========================================================
//  Helper Functions
// =========================================================

function checkDOMElement(id) {
    const el = document.getElementById(id);
    if (!el) {
        // エディタモードで必須要素がない場合はエラー
        console.error(`❌ [DOM Error] 必須IDが見つかりません: "${id}"`);
        return false;
    }
    return true;
}

function showNotification(msg) {
    const area = document.getElementById('notification-area');
    if (!area) return;
    const d = document.createElement('div');
    d.className = 'notification'; d.innerText = msg;
    area.appendChild(d); setTimeout(() => d.remove(), 4000);
}
window.showNotification = showNotification;

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}
window.downloadJSON = downloadJSON;

// Config取得
function getWorldConfigFromUI() {
    const getValue = (id, def) => { const el = document.getElementById(id); return (el && el.value !== "") ? el.value : def; };
    const getNum = (id, def) => { const num = parseFloat(getValue(id, def)); return isNaN(num) ? def : num; };
    const getCheck = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
    return {
        bgColor: getValue('world-bg-color', '#1e1e1e'), fogDensity: getNum('world-fog-dens', 0),
        ambientColor: getValue('world-amb-color', '#404040'), ambientInt: getNum('world-amb-int', 1.0),
        sunColor: getValue('world-sun-color', '#ffffff'), sunInt: getNum('world-sun-int', 1.2),
        sunX: getNum('world-sun-x', 10), sunY: getNum('world-sun-y', 20),
        cameraMode: getValue('world-cam-mode', 'tps'), cameraDist: getNum('world-cam-dist', 10), cameraFov: getNum('world-cam-fov', 60),
        timeLimit: getNum('world-time-limit', 0), lives: getNum('world-lives', 3),
        playerSpeed: getNum('world-plr-speed', 1.0), playerJump: getNum('world-plr-jump', 1.0), doubleJump: getNum('world-plr-double', 0), maxHp: getNum('world-plr-hp', 100),
        boundary: { x: getNum('world-size-x', 50), y: getNum('world-size-y', 50), z: getNum('world-size-z', 50) },
        boundaryMode: getValue('world-bounds-mode', 'block'), boundaryColor: getValue('world-bounds-color', '#00d2ff'), boundaryVisible: getCheck('world-bounds-visible'),
        fallDamage: getCheck('world-fall-dmg'), fallHeight: getNum('world-fall-h', 10), gravity: getNum('world-gravity', -20)
    };
}

function getSafeWorldPosition(obj) { const vec = new THREE.Vector3(); obj.getWorldPosition(vec); return vec; }
function getSafeWorldRotation(obj) { const quat = new THREE.Quaternion(); obj.getWorldQuaternion(quat); return new THREE.Euler().setFromQuaternion(quat); }
function getSafeWorldScale(obj) { const vec = new THREE.Vector3(); obj.getWorldScale(vec); return vec; }

// =========================================================
//  Global Actions
// =========================================================

window.loadProject = function (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try { const json = JSON.parse(e.target.result); window.restore(json); window.showNotification("📂 プロジェクトを読み込みました"); }
        catch (err) { console.error(err); alert("読み込みエラー: " + err); }
    };
    reader.readAsText(file);
};

window.importGLB = function (file) {
    window.saveHistory();
    const loader = new GLTFLoader();
    const url = URL.createObjectURL(file);
    loader.load(url, (gltf) => {
        const model = gltf.scene;
        model.name = file.name.replace(/\.[^/.]+$/, "");
        const spawnPos = (core && core.cursorMesh) ? core.cursorMesh.position : new THREE.Vector3(0, 0, 0);
        model.position.copy(spawnPos);
        model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; if (child.material) child.material.side = THREE.DoubleSide; } });
        model.userData.type = 'model';
        model.userData.physics = { state: 'dynamic', mass: 10.0, bounce: 0.1, fixedRotation: false };
        model.userData.role = 'none'; model.userData.roleParams = {};
        stage.stageGroup.add(model); stage.createPhysicsBody(model);
        selection.deselectAll(); selection.select(model); window.updateOutliner();
        window.showNotification(`📦 モデル読込: ${model.name}`); URL.revokeObjectURL(url);
    }, undefined, (error) => { console.error(error); alert("GLBの読み込みに失敗しました"); });
};

window.serialize = function () {
    let targetObjects = [...stage.stageGroup.children];
    if (selection && selection.multiGroup) targetObjects = targetObjects.concat(selection.multiGroup.children);
    const objectsData = targetObjects.map(o => {
        if (!o.isMesh && !o.isGroup) return null;
        let color = 0xffffff; if (o.material && o.material.color) color = o.material.color.getHex();
        return {
            uuid: o.uuid, type: o.userData.type || 'cube', name: o.name,
            pos: getSafeWorldPosition(o).toArray(), rot: getSafeWorldRotation(o).toArray().slice(0, 3), scale: getSafeWorldScale(o).toArray(),
            color: color, opacity: (o.material) ? o.material.opacity : 1.0,
            roughness: (o.material && o.material.roughness !== undefined) ? o.material.roughness : 0.5,
            metalness: (o.material && o.material.metalness !== undefined) ? o.material.metalness : 0.0,
            physics: o.userData.physics, role: o.userData.role, roleParams: o.userData.roleParams,
            visible: o.visible, gradient: o.userData.gradient, isSprite: o.userData.isSprite, anim: o.userData.anim ? { ...o.userData.anim, texture: null } : null,
            assets: o.userData.assets
        };
    }).filter(i => i);
    let charData = []; if (charEditor) charData = charEditor.exportData();
    const worldData = getWorldConfigFromUI();
    const uiData = window.uiEditor ? window.uiEditor.exportData() : [];
    return { objects: objectsData, characters: charData, ui: uiData, world: worldData };
};

window.saveHistory = function (command = null) {
    if (historyManager) {
        if (command) {
            historyManager.execute(command);
        } else {
            historyManager.saveSnapshot();
        }
    } else if (ioManager) {
        ioManager.saveHistory();
    }
};

window.restore = function (data) {
    selection.deselectAll(); stage.clearStage(); animatedSprites.length = 0;
    if (data.characters && charEditor) charEditor.restoreCharacters(data.characters);
    if (data.ui && window.uiEditor) window.uiEditor.importData(data.ui);
    if (data.world) {
        const w = data.world; const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; }; const setCh = (id, v) => { const e = document.getElementById(id); if (e) e.checked = v; };
        setVal('world-bg-color', w.bgColor); setVal('world-fog-dens', w.fogDensity); setVal('world-amb-color', w.ambientColor); setVal('world-amb-int', w.ambientInt);
        setVal('world-sun-color', w.sunColor); setVal('world-sun-int', w.sunInt); setVal('world-sun-x', w.sunX); setVal('world-sun-y', w.sunY);
        setVal('world-cam-mode', w.cameraMode); setVal('world-cam-dist', w.cameraDist); setVal('world-cam-fov', w.cameraFov);
        setVal('world-time-limit', w.timeLimit); setVal('world-lives', w.lives); setVal('world-plr-speed', w.playerSpeed); setVal('world-plr-jump', w.playerJump); setVal('world-plr-double', w.doubleJump); setVal('world-plr-hp', w.maxHp);
        if (w.boundary) { setVal('world-size-x', w.boundary.x); setVal('world-size-y', w.boundary.y); setVal('world-size-z', w.boundary.z); }
        setVal('world-bounds-mode', w.boundaryMode); setVal('world-bounds-color', w.boundaryColor); setCh('world-bounds-visible', w.boundaryVisible); setCh('world-fall-dmg', w.fallDamage); setVal('world-fall-h', w.fallHeight); setVal('world-gravity', w.gravity);
        core.scene.background = new THREE.Color(w.bgColor || '#1e1e1e');
        if (core.ambientLight) { core.ambientLight.color.set(w.ambientColor || '#404040'); core.ambientLight.intensity = Number(w.ambientInt || 1); }
        if (core.dirLight) { core.dirLight.color.set(w.sunColor || '#fff'); core.dirLight.intensity = Number(w.sunInt || 1.2); core.dirLight.position.set(Number(w.sunX || 10), Number(w.sunY || 20), 10); }
        stage.world.gravity.set(0, w.gravity !== undefined ? w.gravity : -20, 0);
    }
    const objectsData = data.objects || [];
    objectsData.forEach(d => {
        if (ioManager) {
            ioManager._restoreObject(d);
        }
    });
    window.updateOutliner();
};

window.loadStageOnly = function (data) {
    selection.deselectAll(); stage.clearStage(); animatedSprites.length = 0;
    if (data.world) {
        const w = data.world; const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; }; const setCh = (id, v) => { const e = document.getElementById(id); if (e) e.checked = v; };
        setVal('world-bg-color', w.bgColor); setVal('world-fog-dens', w.fogDensity); setVal('world-amb-color', w.ambientColor); setVal('world-amb-int', w.ambientInt);
        setVal('world-sun-color', w.sunColor); setVal('world-sun-int', w.sunInt); setVal('world-sun-x', w.sunX); setVal('world-sun-y', w.sunY);
        setVal('world-cam-mode', w.cameraMode); setVal('world-cam-dist', w.cameraDist); setVal('world-cam-fov', w.cameraFov);
        setVal('world-time-limit', w.timeLimit); setVal('world-lives', w.lives); setVal('world-plr-speed', w.playerSpeed); setVal('world-plr-jump', w.playerJump); setVal('world-plr-double', w.doubleJump); setVal('world-plr-hp', w.maxHp);
        if (w.boundary) { setVal('world-size-x', w.boundary.x); setVal('world-size-y', w.boundary.y); setVal('world-size-z', w.boundary.z); }
        setVal('world-bounds-mode', w.boundaryMode); setVal('world-bounds-color', w.boundaryColor); setCh('world-bounds-visible', w.boundaryVisible); setCh('world-fall-dmg', w.fallDamage); setVal('world-fall-h', w.fallHeight); setVal('world-gravity', w.gravity);
        core.scene.background = new THREE.Color(w.bgColor || '#1e1e1e');
        if (core.ambientLight) { core.ambientLight.color.set(w.ambientColor || '#404040'); core.ambientLight.intensity = Number(w.ambientInt || 1); }
        if (core.dirLight) { core.dirLight.color.set(w.sunColor || '#fff'); core.dirLight.intensity = Number(w.sunInt || 1.2); core.dirLight.position.set(Number(w.sunX || 10), Number(w.sunY || 20), 10); }
        stage.world.gravity.set(0, w.gravity !== undefined ? w.gravity : -20, 0);
    }
    const objectsData = data.objects || [];
    objectsData.forEach(d => {
        if (ioManager) ioManager._restoreObject(d);
    });
    window.updateOutliner();
    window.showNotification("📂 ステージデータを読み込みました");
};

window.updateOutlinerWrapper = function () {
    if (window.currentMode === 'ui') { if (window.uiEditor) window.uiEditor.updateOutliner(); return; }
    if (window.currentMode === 'character') { if (charEditor) charEditor.updateOutlinerUI(); return; }
    const list = document.getElementById('outliner-content');
    if (!list) return;
    list.innerHTML = '';
    stage.stageGroup.children.forEach(obj => {
        const div = document.createElement('div');
        div.className = 'outliner-item';
        if (selection.selectedObjects.includes(obj)) div.classList.add('selected');
        div.innerHTML = `<span class="item-name">${obj.name}</span><span class="item-vis-btn">${obj.visible ? '👁' : '・'}</span>`;
        div.onclick = (e) => {
            if (e.target.classList.contains('item-vis-btn')) { obj.visible = !obj.visible; window.updateOutliner(); return; }
            if (selection.multiSelectEnabled) { selection.toggleSelection(obj); } else { selection.deselectAll(); selection.select(obj); }
        };
        list.appendChild(div);
    });
};
window.updateOutliner = window.updateOutlinerWrapper;

let lastAddObjectTime = 0;
window.addObject = function (type) {
    if (window.currentMode === 'ui') { if (window.uiEditor) window.uiEditor.addElement(type); return; }
    if (window.currentMode === 'character') {
        if (charEditor && charEditor.activeCharacter) { window.saveHistory(); charEditor.addPartToActiveChar(type, `Part_${charEditor.activeCharacter.parts.length + 1}`); } else { alert("キャラクターを作成または選択してください"); }
    } else {
        const now = Date.now();
        if (now - lastAddObjectTime < 100) return;
        lastAddObjectTime = now;

        window.saveHistory();
        const spawnPos = (core && core.cursorMesh) ? core.cursorMesh.position : new THREE.Vector3(0, 0, 0);
        const mesh = stage.addObject(type, spawnPos);
        selection.deselectAll(); selection.select(mesh); window.updateOutliner();
    }
};
window.switchMode = function (mode) {
    if (window.currentMode === mode) return;
    if (selection) selection.deselectAll();
    window.currentMode = mode;
    
    document.body.setAttribute('data-mode', mode);

    const toolbar = document.getElementById('toolbar');
    const resizerBtn = document.getElementById('btn-minimize-toolbar');
    // ★追加: タイムラインパネル（青い線を含む器）を取得
    const timelinePanel = document.getElementById('timeline-panel');
    
    if (mode === 'stage' || mode === 'character') {
        if (toolbar) toolbar.style.display = 'flex';
        if (resizerBtn) resizerBtn.style.display = 'flex';
        // ステージ/キャラモードならパネルの存在を許可
        if (timelinePanel) timelinePanel.style.display = 'flex';
    } 
    else if (mode === 'ui') {
        // UIモードはツールバーは消すが、パネルは使うので表示
        if (toolbar) toolbar.style.display = 'none';
        if (resizerBtn) resizerBtn.style.display = 'none';
        if (timelinePanel) timelinePanel.style.display = 'flex';
    }
    else if (mode === 'sound') {
        // ★修正: 音響モードはツールバーも「青い線があるパネル」もすべて物理的に消す
        if (toolbar) toolbar.style.display = 'none';
        if (resizerBtn) resizerBtn.style.display = 'none';
        if (timelinePanel) timelinePanel.style.display = 'none'; // これで青い線が消えます
    }

    // --- (以下、エディタのクリーンアップと起動処理はそのまま) ---
    if (window.uiEditor) window.uiEditor.deactivate();
    if (window.soundManager) window.soundManager.deactivateEditor();
    if (window.timelineEditor) window.timelineEditor.setVisible(false);

    if (mode === 'ui') {
        if (charEditor) charEditor.switchToStageMode();
        if (window.uiEditor) window.uiEditor.activate();
    }
    else if (mode === 'sound') {
        if (charEditor) charEditor.switchToStageMode();
        if (window.soundManager) window.soundManager.activateEditor();
        // 音響モードはパネルを絶対に出さない
    }
    else if (mode === 'character') {
        if (charEditor) charEditor.switchToCharacterMode();
        if (window.timelineEditor) window.timelineEditor.show();
        if (selection && selection.control) selection.control.setSize(0.8);
    }
    else {
        // ステージモード
        if (charEditor) { charEditor.switchToStageMode(); charEditor.resetInspectorUI(); }
        window.updateOutliner();
        if (selection && selection.control) selection.control.setSize(1.0);
    }

    // ヒントの更新
    updateLiveHint();
};
window.togglePlay = function () {
    if (document.activeElement) {
        document.activeElement.blur();
    }

    window.isPlaying = !window.isPlaying;
    const btn = document.getElementById('btn-play');
    const enablePlayer = document.getElementById('chk-enable-player').checked;

    const editorUIs = [
        'header', 'aside', '#timeline-panel', '#toolbar', 
        '#btn-minimize-toolbar', '#live-hint-area'
    ];

    if (window.isPlaying) {
        // ★追加: プレイモード用のCSSクラスをbodyに付与
        document.body.classList.add('play-mode-active');
        
        btn.classList.add('playing'); btn.innerHTML = '<span class="play-icon">■</span> 停止';
        selection.deselectAll();

        // ★追加: 停止ボタンをヘッダーから引き抜き、画面右上に固定表示する
        document.body.appendChild(btn);
        btn.style.position = 'fixed';
        btn.style.top = '15px';
        btn.style.right = '15px';
        btn.style.zIndex = '9999';
        btn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';

        // エディタUIを隠してゲーム画面を広くする
        editorUIs.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) el.style.display = 'none';
        });

        stage.stageGroup.traverse(obj => {
            if (obj.userData.isRoleIcon) obj.visible = false;
        });

        // 階層のフラット化を廃止し、純粋な座標と状態のバックアップのみを行う
        stage.snapshot = [];
        stage.stageGroup.traverse(o => {
            if (!o.isMesh || o.userData.isHelper) return;
            stage.snapshot.push({
                uuid: o.uuid, pos: o.position.clone(), rot: o.rotation.clone(),
                scale: o.scale.clone(), visible: o.visible
            });
        });

        while (stage.world.bodies.length > 0) stage.world.removeBody(stage.world.bodies[0]);
        stage.stageGroup.children.forEach(obj => {
            if (obj.isMesh && obj.userData.physics) stage.createPhysicsBody(obj);
        });

        if (sceneOptimizer) sceneOptimizer.optimize(stage.stageGroup);

        if (!simpleGame) simpleGame = new SimpleGameSystem(core.scene, stage.world, core.camera, core.renderer.domElement, stage.stageGroup);
        const config = ioManager.getWorldConfigFromUI();
        simpleGame.applyConfig(config);
        
        simpleGame.start(enablePlayer, false);

        if (enablePlayer) { core.orbit.enabled = false; window.showNotification("🎮 Play Mode: Active"); } 
        else { core.orbit.enabled = true; window.showNotification("👀 Watch Mode"); }

    } else {
        // --- プレイ終了処理 ---
        document.body.classList.remove('play-mode-active');
        btn.classList.remove('playing'); btn.innerHTML = '<span class="play-icon">▶</span> テストプレイ';
        if (simpleGame && simpleGame.isPlaying) simpleGame.stop();

        // ★追加: 停止ボタンをヘッダーの中央に戻す
        const headerCenter = document.querySelector('.header-center');
        if (headerCenter) {
            headerCenter.appendChild(btn);
            btn.style.position = '';
            btn.style.top = '';
            btn.style.right = '';
            btn.style.zIndex = '';
            btn.style.boxShadow = '';
        }

        // エディタUIを元に戻す
        editorUIs.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) el.style.display = ''; // CSSのデフォルト設定に戻す
        });

        if (sceneOptimizer) sceneOptimizer.restore(stage.stageGroup);

        stage.stageGroup.traverse(obj => {
            if (obj.userData.isRoleIcon) obj.visible = true;
        });

        if (stage.snapshot) {
            stage.snapshot.forEach(snap => {
                const o = stage.stageGroup.getObjectByProperty('uuid', snap.uuid);
                if (o) {
                    o.position.copy(snap.pos); o.rotation.copy(snap.rot);
                    o.scale.copy(snap.scale); o.visible = snap.visible;
                }
            });
        }

        while (stage.world.bodies.length > 0) stage.world.removeBody(stage.world.bodies[0]);
        stage.physicsMap.clear();

        stage.stageGroup.children.forEach(obj => {
            if (obj.isMesh && obj.userData.physics) stage.createPhysicsBody(obj);
        });

        core.orbit.enabled = true;
    }
};

window.createSpriteFromJSON = function (data, name) {
    window.saveHistory();
    const w = data.width, h = data.height;
    const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d'); const imgD = ctx.createImageData(w, h);
    for (let i = 0; i < data.pixels.length; i++) { const hex = data.pixels[i]; const idx = i * 4; if (hex === 'transparent') imgD.data[idx + 3] = 0; else { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); imgD.data[idx] = r; imgD.data[idx + 1] = g; imgD.data[idx + 2] = b; imgD.data[idx + 3] = 255; } }
    ctx.putImageData(imgD, 0, 0);
    const tex = new THREE.CanvasTexture(cvs); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const cols = data.cols || 1, rows = data.rows || 1; tex.repeat.set(1 / cols, 1 / rows);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    const aspect = w / cols / (h / rows); mesh.scale.set(aspect, 1, 1);
    mesh.name = name || `Sprite_${stage.objectCounter++}`; mesh.castShadow = true;
    textureCache[mesh.uuid] = tex;
    mesh.userData.type = 'sprite'; mesh.userData.isSprite = true; mesh.userData.billboard = true;
    mesh.userData.anim = { texture: tex, cols, rows, totalFrames: cols * rows, currentFrame: 0, fps: data.fps || 12, accumulator: 0 };
    mesh.userData.physics = { state: 'dynamic', mass: 0.5, bounce: 0.2, fixedRotation: true };
    const spawnPos = (core && core.cursorMesh) ? core.cursorMesh.position : new THREE.Vector3(0, 0, 0);
    mesh.position.copy(spawnPos);
    stage.stageGroup.add(mesh); animatedSprites.push(mesh); stage.createPhysicsBody(mesh);
    selection.deselectAll(); selection.select(mesh); window.updateOutliner();
};

window.exportGameHTML = function () {
    if (ioManager) ioManager.exportGameHTML();
};

// =========================================================
//  ★3. Init (Window Load)
// =========================================================
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');

    try {
        // ★修正: 新しい「プロジェクト方式(Project)」か、古い「単一データ方式(Data)」か、あるいはURLにplayがあるか
        const isPlayMode = new URLSearchParams(window.location.search).has('play') ||
            (typeof window.embeddedGameProject !== 'undefined') ||
            (typeof window.embeddedGameData !== 'undefined');

        // 1. Core Init
        if (!checkDOMElement('viewport')) throw new Error("Viewport not found");
        core = new CoreManager('viewport'); window.core = core;
        stage = new StageManager(core.scene); window.stage = stage;
        selection = new SelectionManager(core, stage); window.selection = selection;
        effectManager = new EffectManager(core.scene); window.effectManager = effectManager;

        // ★追加: 音響システムの初期化
        window.soundManager = new SoundManager(core.camera);

        ProjectilePool.init(core.scene);

        window.imageManager = imageManager;

        // 2. Editors Init (エディタモードの時のみ)
        if (!isPlayMode) {
            logicEditor = new LogicEditor();
            attackEditor = new AttackEditor();
            const inspectorPanel = document.getElementById('inspector-panel');
            const outlinerPanel = document.getElementById('outliner-panel');

            if (inspectorPanel && outlinerPanel) {
                charEditor = new CharacterEditor(core.scene, stage.stageGroup, inspectorPanel, outlinerPanel, logicEditor);
                window.charEditor = charEditor;
                timelineEditor = new TimelineEditor(charEditor);
                timelineEditor.attackEditor = attackEditor;
                window.timelineEditor = timelineEditor;
                ui = new UIManager(stage, selection);
                window.syncUI = (obj) => ui.syncUI(obj);
                window.setPivot = (obj, p) => { obj.userData.pivot = p; };
                uiEditor = new UIEditor(inspectorPanel, outlinerPanel);
                window.uiEditor = uiEditor;
            }

            physicsDebugger = new PhysicsDebugger(core.scene, stage.world);
            const chkDebug = document.getElementById('world-debug-physics');
            if (chkDebug) { chkDebug.addEventListener('change', (e) => { physicsDebugger.setEnabled(e.target.checked); }); }
        } else {
            document.body.classList.add('play-mode-active');
        }

        // 3. Managers Init
        ioManager = new IOManager(core, stage, selection, charEditor, uiEditor);
        window.ioManager = ioManager;
        historyManager = new HistoryManager(ioManager);
        window.historyManager = historyManager;
        window.ioManager.undo = function () { historyManager.undo(); };
        window.ioManager.redo = function () { historyManager.redo(); };
        sceneOptimizer = new SceneOptimizer(core.scene);
        simpleGame = null; window.simpleGame = null;

        // 4. Loop Start
        core.addUpdateCallback((dt) => { animate(dt); });
        core.startLoop();

        // 5. Events (ここからエディタ操作系のイベントを整理)
        if (!isPlayMode) {
            document.addEventListener('selectObject', (e) => {
                if (selection) {
                    if (!selection.multiSelectEnabled && !window.event?.shiftKey) {
                        selection.deselectAll();
                    }
                    selection.select(e.detail);
                    if (window.updateOutliner) window.updateOutliner();
                    // window. に登録したので呼び出せる
                    window.updateLiveHint();
                }
            });
            // ★追加: 初期状態のヘッダー表示バグ（隠れてしまう問題）を解消
            document.body.setAttribute('data-mode', 'stage');
            if (ioManager) ioManager._updateStageSelectUI();
            const btnMinimize = document.getElementById('btn-minimize-toolbar');
            const toolbar = document.getElementById('toolbar');
            const mainContainer = document.getElementById('main-container');

            if (btnMinimize && toolbar && mainContainer) {
                // ボタンがフッターの中に入っている場合は、bodyの直下に移動させてフローティングさせる
                if (btnMinimize.parentElement === toolbar) {
                    document.body.appendChild(btnMinimize);
                }

                btnMinimize.addEventListener('click', () => {
                    const isMin = toolbar.classList.toggle('minimized');
                    
                    if (isMin) {
                        document.documentElement.style.setProperty('--current-footer-height', '0px');
                        btnMinimize.innerText = '▲'; 
                    } else {
                        document.documentElement.style.setProperty('--current-footer-height', '80px');
                        btnMinimize.innerText = '▼'; 
                    }

                    setTimeout(() => {
                        if (core) core.onResize();
                    }, 300); 
                });
            }
            const modeSelect = document.getElementById('mode-select');
            if (modeSelect) {
                modeSelect.addEventListener('change', (e) => window.switchMode(e.target.value));
            }

            // タイムライン開閉
            const btnToggleTimeline = document.getElementById('btn-toggle-timeline');
            if (btnToggleTimeline) {
                btnToggleTimeline.onclick = (e) => {
                    const panel = document.getElementById('timeline-panel');
                    if (panel) panel.classList.toggle('visible');
                };
            }

            // ★ステージ切り替えと追加
            const stageSelect = document.getElementById('stage-select');
            const btnAddStage = document.getElementById('btn-add-stage');
            if (stageSelect) {
                stageSelect.addEventListener('change', (e) => ioManager.switchStage(e.target.value));
            }
            if (btnAddStage) {
                btnAddStage.addEventListener('click', () => ioManager.addNewStage());
            }
            const btnDeleteStage = document.getElementById('btn-delete-stage');
            if (btnDeleteStage) {
                btnDeleteStage.addEventListener('click', () => {
                    ioManager.deleteCurrentStage();
                });
            }
            // ★追加: ステージの複製・名前変更・スタート設定
            const btnDuplicateStage = document.getElementById('btn-duplicate-stage');
            if (btnDuplicateStage) {
                btnDuplicateStage.addEventListener('click', () => ioManager.duplicateCurrentStage());
            }

            const btnRenameStage = document.getElementById('btn-rename-stage');
            if (btnRenameStage) {
                btnRenameStage.addEventListener('click', () => ioManager.renameCurrentStage());
            }

            const btnSetStartStage = document.getElementById('btn-set-start-stage');
            if (btnSetStartStage) {
                btnSetStartStage.addEventListener('click', () => ioManager.setStartStage());
            }

            // ヘッダーボタン類
            document.getElementById('btn-play').addEventListener('click', (e) => window.togglePlay(e));
            document.getElementById('btn-save').addEventListener('click', () => ioManager.saveProject());
            const btnExportStage = document.getElementById('btn-export-stage');
            if (btnExportStage) btnExportStage.addEventListener('click', () => ioManager.exportCurrentStageOnly());
            const btnExportChar = document.getElementById('btn-export-char');
            if (btnExportChar) btnExportChar.addEventListener('click', () => ioManager.exportCurrentCharacter());

            const btnExportUi = document.getElementById('btn-export-ui');
            if (btnExportUi) btnExportUi.addEventListener('click', () => ioManager.exportCurrentUI());
            document.getElementById('btn-undo').addEventListener('click', () => ioManager.undo());
            document.getElementById('btn-redo').addEventListener('click', () => ioManager.redo());

            // ★変更: モードに応じた初期化処理を呼び出す
            const btnClearData = document.getElementById('btn-clear-data');
            if (btnClearData) {
                btnClearData.addEventListener('click', () => {
                    if (ioManager) ioManager.clearCurrentData(window.currentMode);
                });
            }

            document.getElementById('btn-export-multi').addEventListener('click', () => ioManager.exportGameHTML());
            document.getElementById('btn-open').addEventListener('click', () => document.getElementById('file-glb').click());

            // ファイル入力 (GLB / JSON読込)
            const fileInput = document.getElementById('file-glb');
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0]; if (!file) return;
                    if (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')) {
                        window.importGLB(file);
                    } else {
                        ioManager.loadProjectFile(file);
                    }
                    e.target.value = '';
                });
            }

            // ワールド設定パネルの自動反映
            const worldPanel = document.getElementById('world-panel');
            if (worldPanel) {
                const inputs = worldPanel.querySelectorAll('input, select');
                inputs.forEach(el => {
                    const updateWorld = () => {
                        const config = ioManager.getWorldConfigFromUI();
                        core.updateEnvironment(config);
                        stage.updateBoundaryHelper(config);
                        if (config.gravity !== undefined) stage.world.gravity.set(0, config.gravity, 0);
                    };
                    el.addEventListener('input', updateWorld);
                    el.addEventListener('change', () => { updateWorld(); window.saveHistory(); });
                });
            }

            // ヘルプモーダル
            const helpModal = document.getElementById('help-modal');
            document.getElementById('btn-help').onclick = () => { helpModal.classList.remove('hidden'); helpModal.style.display = 'flex'; };
            document.getElementById('close-help').onclick = () => { helpModal.classList.add('hidden'); helpModal.style.display = 'none'; };

            // 図形追加ボタン
            document.querySelectorAll('.add-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    if (window.addObject) window.addObject(btn.dataset.type);
                };
            });

        } else {
            if (window.embeddedGameProject) {
                // 編集用のガイド線を非表示
                if (core.gridHelper) core.gridHelper.visible = false;
                if (core.axesHelper) core.axesHelper.visible = false;
                if (core.cursorMesh) core.cursorMesh.visible = false;

                // 1. グローバルなキャラ・UI・音響をメモリに展開
                if (window.embeddedGameProject.characters && charEditor) {
                    charEditor.restoreCharacters(window.embeddedGameProject.characters);
                }
                if (window.embeddedGameProject.ui && window.uiEditor) {
                    window.uiEditor.importData(window.embeddedGameProject.ui);
                }

                // 2. スタート地点のステージを決定
                const startStageName = window.embeddedGameProject.startStage || Object.keys(window.embeddedGameProject.stages)[0];
                const startData = window.embeddedGameProject.stages[startStageName];

                // 3. 最初のステージを構築
                if (startData) ioManager._restoreStageOnly(startData);

                // 4. ゲームの開始（少し待ってから物理を安定始動させる）
                setTimeout(() => {
                    window.isPlaying = true;
                    if (sceneOptimizer) sceneOptimizer.optimize(stage.stageGroup);

                    if (!simpleGame) {
                        simpleGame = new SimpleGameSystem(core.scene, stage.world, core.camera, core.renderer.domElement, stage.stageGroup);
                    }

                    simpleGame.applyConfig(startData.world || {});
                    core.orbit.enabled = false;

                    // プレイ開始
                    simpleGame.start(true);
                }, 100);
            } else {
                console.error("🔥 起動データ (embeddedGameProject) が見つかりません。");
            }
        }
    } catch (err) {
        console.error("🔥 [Main] Initialization Error:", err);
    }
});
function updateLiveHint() {
    // ★修正: ライブヒント機能は不要なため完全に無効化（画面から消去）
    const hintArea = document.getElementById('live-hint-area');
    if (hintArea) {
        hintArea.style.display = 'none';
    }
}
window.updateLiveHint = updateLiveHint;
function animate(dt) {
    if (typeof _loggedLoop === 'undefined') { window._loggedLoop = true; }
    if (dt > 0.1) dt = 0.1; // 巨大なdtによる崩壊を防ぐ

    // ★追加: FPS制限の制御
    const now = performance.now();
    const frameInterval = 1000 / window.gameSettings.targetFPS;
    if (now - lastFrameTime < frameInterval) {
        // 目標FPSに達していない場合はスキップして負荷を下げる
        return;
    }
    // 正確な経過時間を算出し直す（dtの代わりにこれを使う）
    const actualDt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    const shouldUpdateGame = window.isPlaying && simpleGame && simpleGame.shouldGameLoopUpdate();

    if (window.isPlaying) {

        // ★ dt を actualDt に書き換え
        if (simpleGame) {
            simpleGame.update(actualDt);
        }

        if (shouldUpdateGame) {
            stage.updatePhysics(actualDt);
        }

        if (simpleGame && simpleGame.isPlaying) {
            if (simpleGame.gameState !== 'TITLE' && simpleGame.gameState !== 'INIT') {
                if (simpleGame.player.body && simpleGame.player.mesh) {
                    simpleGame.player.mesh.position.copy(simpleGame.player.body.position);
                    simpleGame.player.mesh.quaternion.copy(simpleGame.player.body.quaternion);
                }
                simpleGame.player._updateCamera(actualDt);
            }
        }

        if (shouldUpdateGame) {
            if (physicsDebugger) physicsDebugger.update();
            if (effectManager) effectManager.update(actualDt);
        }

        if (core.orbit.enabled) core.orbit.update();

    } else {
        if (window.currentMode === 'character' && timelineEditor) timelineEditor.update(actualDt);
        core.orbit.update();
    }

    selection.updateHelpers();

    if (ioManager && ioManager.animatedSprites) {
        ioManager.animatedSprites.forEach(m => {
            if (!m.parent) return;
            if (window.isPlaying && !shouldUpdateGame) return;
            if (m.userData.billboard) m.lookAt(core.camera.position);
            const a = m.userData.anim;
            if (a) {
                a.accumulator += actualDt; const frameDur = 1 / a.fps;
                if (a.accumulator >= frameDur) {
                    a.accumulator %= frameDur; a.currentFrame = (a.currentFrame + 1) % a.totalFrames;
                    const c = a.currentFrame % a.cols; const r = Math.floor(a.currentFrame / a.cols);
                    a.texture.offset.x = c / a.cols; a.texture.offset.y = (a.rows - 1 - r) / a.rows;
                }
            }
        });
    }
}

window.addEventListener('keydown', (e) => {
    if (window.isPlaying) return;

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return; 
    }

    const ctrl = e.ctrlKey || e.metaKey;

    // --- Blenderライクな タイムライン専用ショートカット ---
    if (window.currentMode === 'character' && window.timelineEditor) {
        const tl = window.timelineEditor;
        
        if (e.key === ' ') {
            e.preventDefault();
            tl.togglePlay(); // Space: 再生/停止
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (e.shiftKey) tl.setFrame(tl.totalFrames); // Shift+→: 最後にジャンプ
            else tl.setFrame(tl.currentFrame + 1);       // →: 1コマ進む
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (e.shiftKey) tl.setFrame(0);              // Shift+←: 最初にジャンプ
            else tl.setFrame(tl.currentFrame - 1);       // ←: 1コマ戻る
            return;
        }
         if (e.key === 'i' || e.key === 'I') {
            e.preventDefault();
            tl.recordKeyframe(); // 選択パーツのみ記録
            if (window.showNotification) window.showNotification("📍 Keyframe Inserted");
            return;
        }
        
        // ★追加: タイムライン専用の削除ショートカット (Xキー)
        if (e.key === 'x' || e.key === 'X') {
            e.preventDefault();
            tl.deleteKeyframeAtCurrent(); 
            return;
        }
    }

    // --- 既存の全体ショートカット ---
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (window.currentMode !== 'ui') {
            const btnDel = document.getElementById('tool-btn-delete');
            if (btnDel) btnDel.click();
        }
    }
    else if (ctrl && e.key === 'd') {
        e.preventDefault();
        if (window.currentMode !== 'ui') {
            const btnCopy = document.getElementById('tool-btn-copy');
            if (btnCopy) btnCopy.click();
        }
    }
    else if (ctrl && e.key === 's') {
        e.preventDefault();
        if (ioManager) ioManager.saveProject();
    }
    else if (ctrl && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { if (ioManager) ioManager.redo(); }
        else { if (ioManager) ioManager.undo(); }
    }
    else if (ctrl && e.key === 'y') {
        e.preventDefault();
        if (ioManager) ioManager.redo();
    }
    else if (e.key === 'g' || e.key === 'G') {
        if (window.setTransformMode) window.setTransformMode('translate');
    }
    else if (e.key === 'r' || e.key === 'R') {
        if (window.setTransformMode) window.setTransformMode('rotate');
    }
    else if (e.key === 's' || e.key === 'S') {
        if (window.setTransformMode) window.setTransformMode('scale');
    }
    else if (e.key === 'Escape') {
        if (window.currentMode !== 'ui' && selection) selection.deselectAll();
    }
});
