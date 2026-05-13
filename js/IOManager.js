import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class IOManager {
    constructor(core, stage, selection, charEditor, uiEditor) {
        this.core = core; this.stage = stage; this.selection = selection;
        this.charEditor = charEditor; this.uiEditor = uiEditor;

        this.undoStack = []; this.redoStack = [];
        this.animatedSprites = []; this.textureCache = {};

        // ★プロジェクトの中枢データ
        this.projectStages = {}; 
        this.currentStageName = "Stage_1";
    }

    setEditors(charEditor, uiEditor) {
        this.charEditor = charEditor; this.uiEditor = uiEditor;
    }

    // --- ヘルパー関数群 ---
    showNotification(msg) {
        const area = document.getElementById('notification-area');
        if (!area) return;
        const d = document.createElement('div');
        d.className = 'notification'; d.innerText = msg;
        area.appendChild(d); setTimeout(() => d.remove(), 4000);
    }

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 100); 
    }

    getWorldConfigFromUI() {
        const getValue = (id, def) => { const el = document.getElementById(id); return (el && el.value !== "") ? el.value : def; };
        const getNum = (id, def) => { const num = parseFloat(getValue(id, def)); return isNaN(num) ? def : num; };
        const getCheck = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
        return {
            bgColor: getValue('world-bg-color', '#1e1e1e'), fogDensity: getNum('world-fog-dens', 0),
            bgm: getValue('world-bgm', ''), // ★追加: BGMのIDを取得
            ambientColor: getValue('world-amb-color', '#404040'), ambientInt: getNum('world-amb-int', 1.0),
            sunColor: getValue('world-sun-color', '#ffffff'), sunInt: getNum('world-sun-int', 1.2),
            sunX: getNum('world-sun-x', 10), sunY: getNum('world-sun-y', 20),
            cameraMode: getValue('world-cam-mode', 'tps'), cameraDist: getNum('world-cam-dist', 10), cameraFov: getNum('world-cam-fov', 60),
            timeLimit: getNum('world-time-limit', 0), lives: getNum('world-lives', 3),
            playerSpeed: getNum('world-plr-speed', 1.0), dashMult: getNum('world-plr-dash', 2.0),
            playerJump: getNum('world-plr-jump', 1.0), doubleJump: getNum('world-plr-double', 0),
            maxHp: getNum('world-plr-hp', 100), hpRegen: getNum('world-plr-hp-regen', 0),
            maxSp: getNum('world-plr-sp', 100), spRegen: getNum('world-plr-sp-regen', 20), spDelay: getNum('world-plr-sp-delay', 1.0),
            spCostDash: getNum('world-plr-sp-dash', 10), spCostJump: getNum('world-plr-sp-jump', 15), spCostAtk: getNum('world-plr-sp-atk', 20),
            lockonDist: getNum('world-plr-lockon', 20), baseAtk: getNum('world-plr-base-atk', 10),
            boundary: { x: getNum('world-size-x', 50), y: getNum('world-size-y', 50), z: getNum('world-size-z', 50) },
            boundaryMode: getValue('world-bounds-mode', 'block'), boundaryColor: getValue('world-bounds-color', '#00d2ff'), boundaryVisible: getCheck('world-bounds-visible'),
            fallDamage: getCheck('world-fall-dmg'), fallHeight: getNum('world-fall-h', 10), gravity: getNum('world-gravity', -20),
            allowGravityChange: getCheck('world-allow-gravity'),
            equipmentSlots: getValue('world-plr-slots', 'head,body,arm,leg,weapon')
        };
    }

    getSafeWorldPosition(obj) { const vec = new THREE.Vector3(); obj.getWorldPosition(vec); return vec; }
    getSafeWorldRotation(obj) { const quat = new THREE.Quaternion(); obj.getWorldQuaternion(quat); return new THREE.Euler().setFromQuaternion(quat); }
    getSafeWorldScale(obj) { const vec = new THREE.Vector3(); obj.getWorldScale(vec); return vec; }

    // =========================================================
    //  ★プロジェクト管理 (マルチステージ)
    // =========================================================
// --- 履歴システム(HistoryManager)用の統合シリアライズ ---
    serialize() {
        this.syncCurrentStageToMemory(); // 最新状態をメモリに同期
        return {
            isMultiStageProject: true,
            startStage: this.currentStageName,
            stages: this.projectStages,
            characters: this.charEditor ? this.charEditor.exportData() : [],
            ui: window.uiEditor ? window.uiEditor.exportData() : []
        };
    }
// --- 修正後 ---
    restore(data) {
        if (!data || !data.isMultiStageProject) {
            console.error("無効なプロジェクトデータ、または旧形式のデータです。");
            alert("このプロジェクトファイルは旧形式または破損しているため読み込めません。");
            return;
        }

        this.selection.deselectAll();
        this.stage.clearStage();
        this.animatedSprites.length = 0;
        THREE.Cache.clear(); 

        this.projectStages = data.stages;
        
        if (data.characters && this.charEditor) this.charEditor.restoreCharacters(data.characters);
        if (data.ui && this.uiEditor) this.uiEditor.importData(data.ui);
        
        if (data.sounds && window.soundManager) {
            window.soundManager.library = data.sounds;
            Object.values(window.soundManager.library).forEach(snd => {
                if (snd.src && !snd.buffer) {
                    window.soundManager.audioLoader.load(snd.src, (buffer) => {
                        snd.buffer = buffer;
                    });
                }
            });
            window.soundManager.renderList();
        }

        this.startStage = data.startStage;
        this._updateStageSelectUI();
        
        const stageToLoad = data.startStage || Object.keys(this.projectStages)[0];
        if (this.projectStages[stageToLoad]) {
            this.currentStageName = stageToLoad;
            document.getElementById('stage-select').value = stageToLoad;
            this._restoreStageOnly(this.projectStages[stageToLoad]);
        }
        
        if (window.updateOutliner) window.updateOutliner();
    }
    // 現在の「ステージ構成物」だけをシリアライズ（キャラ・UIは含めない）
    serializeStageOnly() {
        let targetObjects = [...this.stage.stageGroup.children];
        if (this.selection && this.selection.multiGroup) {
            targetObjects = targetObjects.concat(this.selection.multiGroup.children);
        }

        const objectsData = targetObjects.map(o => {
            if (!o.isMesh && !o.isGroup) return null;
            let color = 0xffffff; if (o.material && o.material.color) color = o.material.color.getHex();
            return {
                uuid: o.uuid, type: o.userData.type || 'cube', isModel: (o.userData.type === 'model'), name: o.name,
                pos: this.getSafeWorldPosition(o).toArray(), rot: this.getSafeWorldRotation(o).toArray().slice(0, 3), scale: this.getSafeWorldScale(o).toArray(),
                color: color, opacity: (o.material) ? (o.material.opacity ?? 1.0) : 1.0,
                roughness: (o.material && o.material.roughness !== undefined) ? o.material.roughness : 0.5,
                metalness: (o.material && o.material.metalness !== undefined) ? o.material.metalness : 0.0,
                physics: o.userData.physics, role: o.userData.role, roleParams: o.userData.roleParams,
                visible: o.visible, modelName: o.name, gradient: o.userData.gradient, isSprite: o.userData.isSprite, 
                anim: o.userData.anim ? { ...o.userData.anim, texture: null } : null, assets: o.userData.assets 
            };
        }).filter(i => i);

        return {
            world: this.getWorldConfigFromUI(),
            objects: objectsData
        };
    }

    // 現在のステージを裏メモリに保存
    syncCurrentStageToMemory() {
        if (window.isPlaying) return;
        this.projectStages[this.currentStageName] = this.serializeStageOnly();
    }

    // ステージを切り替える
    switchStage(stageName) {
        if (this.currentStageName === stageName) return;
        this.syncCurrentStageToMemory();
        this.currentStageName = stageName;
        document.getElementById('stage-select').value = stageName;

        // ★追加: 別のステージに移動したので履歴(Undo)をリセットし、誤作動を防ぐ
        if (window.historyManager) {
            window.historyManager.undoStack = [];
            window.historyManager.redoStack = [];
        }

        this.selection.deselectAll();
        this.stage.clearStage();
        this.animatedSprites.length = 0;

        if (this.projectStages[stageName]) {
            // ステージ専用データだけを復元
            this._restoreStageOnly(this.projectStages[stageName]);
            this.showNotification(`🔄 ${stageName} に切り替えました`);
        } else {
            this._resetToEmptyStage();
            this.showNotification(`✨ ${stageName} を新規作成しました`);
        }
        if (window.updateOutliner) window.updateOutliner();
    }
clearCurrentData(mode) {
        if (mode === 'stage') {
            const choice = prompt(
                "ステージの初期化を行います。番号を入力してください。\n" +
                "1: 現在のステージ (" + this.currentStageName + ") のオブジェクトを空にする\n" +
                "2: 全てのステージを削除し、完全に初期状態に戻す", "1"
            );
            
            if (choice === "1") {
                this.saveHistory();
                this.selection.deselectAll();
                this.stage.clearStage();
                this.animatedSprites.length = 0;
                this.showNotification(`🧹 ステージ「${this.currentStageName}」を空にしました`);
            } else if (choice === "2") {
                if (!confirm("本当に全てのステージデータを削除しますか？\n(キャラクターやUIは維持されます)")) return;
                this.saveHistory();
                this.selection.deselectAll();
                this.stage.clearStage();
                this.animatedSprites.length = 0;
                this.projectStages = {};
                this.currentStageName = "Stage_1";
                this._updateStageSelectUI();
                this._resetToEmptyStage();
                this.showNotification("🗑️ 全てのステージを初期化しました");
            }
        } 
        else if (mode === 'character') {
            if (!this.charEditor || !this.charEditor.activeCharacter) return;
            if (confirm(`現在のキャラクター「${this.charEditor.activeCharacter.name}」の全パーツとアニメーションを削除しますか？`)) {
                const char = this.charEditor.activeCharacter;
                [...char.parts].forEach(p => {
                    if (p.parent) p.parent.remove(p);
                    if (p.geometry) p.geometry.dispose();
                    if (p.material) p.material.dispose();
                });
                char.parts = [];
                char.animations = {}; 
                this.charEditor.updateOutlinerUI();
                this.charEditor.updateInspectorUI();
                if (window.timelineEditor) window.timelineEditor.renderTracks();
                this.showNotification(`🧹 キャラクター「${char.name}」をリセットしました`);
            }
        }
        else if (mode === 'ui') {
            if (!this.uiEditor) return;
            if (confirm("UIレイアウトをデフォルト(初期状態)に戻しますか？")) {
                this.uiEditor.initDefaultUI();
                this.showNotification("🎨 UIをデフォルトレイアウトに初期化しました");
            }
        }
        else if (mode === 'sound') {
            if (!window.soundManager) return;
            if (confirm("登録されている全ての音声データを削除しますか？")) {
                window.soundManager.library = {};
                window.soundManager.activeAudioId = null;
                window.soundManager.renderList();
                window.soundManager.renderInspector();
                this.showNotification("🎵 音声ライブラリを空にしました");
            }
        }
    }

    // ★追加: 現在のステージ単体のエクスポート（部品として）
    exportCurrentStageOnly() {
        const data = this.serializeStageOnly();
        data.type = "single_stage";
        data.stageName = this.currentStageName;
        this.downloadJSON(data, `${this.currentStageName}_data.json`);
        this.showNotification(`💾 ステージ「${this.currentStageName}」を素材として保存しました`);
    }
    addNewStage() {
        const newName = prompt("新しいステージ名を入力してください", `Stage_${Object.keys(this.projectStages).length + 1}`);
        if (!newName || newName.trim() === "") return;
        const safeName = newName.trim();
        if (this.projectStages[safeName] || safeName === this.currentStageName) { alert("既に存在します"); return; }

        this.syncCurrentStageToMemory();
        this.projectStages[safeName] = null;
        this._updateStageSelectUI();
        this.switchStage(safeName);
    }
// ★追加: 現在のステージを削除する
    deleteCurrentStage() {
        const stageNames = Object.keys(this.projectStages);
        
        // 1. 最後の1つなら消させない
        if (stageNames.length <= 1) {
            alert("これ以上ステージを削除できません（最低1つのステージが必要です）");
            return;
        }

        // 2. 確認
        if (!confirm(`ステージ「${this.currentStageName}」を完全に削除しますか？\nこの操作は元に戻せません。`)) return;

        // 3. 削除実行
        delete this.projectStages[this.currentStageName];

        // 4. 次に表示するステージを決定（リストの先頭など）
        const nextStage = Object.keys(this.projectStages)[0];
        
        // 5. UI更新と切り替え
        this._updateStageSelectUI();
        this.currentStageName = ""; // switchStageを確実に発火させるため一度空にする
        this.switchStage(nextStage);
        
        this.showNotification(`🗑️ ステージを削除しました`);
    }
    // ★追加: ステージ名の変更と、リンク切れの自動修復
    renameCurrentStage() {
        const oldName = this.currentStageName;
        const newName = prompt("新しいステージ名を入力してください", oldName);
        if (!newName || newName.trim() === "" || newName.trim() === oldName) return;
        
        const safeName = newName.trim();
        if (this.projectStages[safeName]) {
            alert("その名前のステージは既に存在します。");
            return;
        }

        // 1. メモリを更新して名前を付け替える
        this.syncCurrentStageToMemory();
        this.projectStages[safeName] = this.projectStages[oldName];
        delete this.projectStages[oldName];

        // 2. スタートステージだった場合の更新
        if (this.startStage === oldName) {
            this.startStage = safeName;
        }

        // 3. 全ステージを巡回し、古い名前を指している「ポータル」を自動で書き換える（リンク切れ防止）
        Object.values(this.projectStages).forEach(stageData => {
            if (stageData && stageData.objects) {
                stageData.objects.forEach(obj => {
                    if (obj.role === 'stage_portal' && obj.roleParams && obj.roleParams.targetStage === oldName) {
                        obj.roleParams.targetStage = safeName;
                    }
                });
            }
        });

        // 4. UIの更新
        this.currentStageName = safeName;
        this._updateStageSelectUI();
        this.showNotification(`✏️ 名前を「${safeName}」に変更しました`);
    }

    // ★追加: 現在のステージの複製（Duplicate）
    duplicateCurrentStage() {
        this.syncCurrentStageToMemory(); // まず現状を確定

        const baseName = this.currentStageName;
        let copyName = `${baseName}_copy`;
        let counter = 1;
        while (this.projectStages[copyName]) {
            copyName = `${baseName}_copy${counter}`;
            counter++;
        }

        // データのディープコピー（完全な複製）を作成
        const sourceData = JSON.parse(JSON.stringify(this.projectStages[baseName]));
        this.projectStages[copyName] = sourceData;

        this._updateStageSelectUI();
        this.switchStage(copyName);
        this.showNotification(`❐ ステージを複製しました`);
    }

    // ★追加: ゲーム開始時のステージ（Start Level）を設定
    setStartStage() {
        this.startStage = this.currentStageName;
        this._updateStageSelectUI(); // ★ UI(★マーク)を更新
        this.showNotification(`🏁 「${this.currentStageName}」をゲームのスタート地点に設定しました`);
    }

    // ★修正: _updateStageSelectUI に Startフラグの表示機能を追加
    _updateStageSelectUI() {
        const select = document.getElementById('stage-select');
        if (!select) return;
        select.innerHTML = '';
        
        if (!this.projectStages[this.currentStageName]) {
            this.projectStages[this.currentStageName] = null;
        }

        // スタートステージが未定義なら最初のステージを割り当て
        if (!this.startStage && Object.keys(this.projectStages).length > 0) {
            this.startStage = Object.keys(this.projectStages)[0];
        }

        Object.keys(this.projectStages).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            // スタートステージには ★ を付ける
            opt.textContent = (name === this.startStage) ? `★ ${name}` : name;
            
            if (name === this.currentStageName) opt.selected = true;
            select.appendChild(opt);
        });
    }

    _resetToEmptyStage() {
        const defaultConfig = {
            bgColor: '#1e1e1e', fogDensity: 0, ambientColor: '#404040', ambientInt: 1.0, sunColor: '#ffffff', sunInt: 1.2, sunX: 10, sunY: 20,
            cameraMode: 'tps', cameraDist: 10, cameraFov: 60, timeLimit: 0, lives: 3, playerSpeed: 1.0, playerJump: 1.0, doubleJump: 0, maxHp: 100,
            boundary: {x:50, y:50, z:50}, boundaryMode: 'block', boundaryColor: '#00d2ff', boundaryVisible: false, fallDamage: true, fallHeight: 10, gravity: -20, allowGravityChange: true
        };
        this._restoreWorldSettings(defaultConfig);
    }

    // =========================================================
    //  保存 (Save Project)
    // =========================================================

    // ★重要: 全体を一つの巨大なプロジェクトファイルとして保存
    saveProject() {
        this.syncCurrentStageToMemory();
        
        const projectData = {
            isMultiStageProject: true,
            startStage: this.currentStageName,
            stages: this.projectStages,
            characters: this.charEditor ? this.charEditor.exportData() : [],
            ui: window.uiEditor ? window.uiEditor.exportData() : [],
            sounds: window.soundManager ? window.soundManager.library : {}
        };
        
        this.downloadJSON(projectData, "my_game_project.json");
        this.showNotification("💾 プロジェクト全体を保存しました");
        
        return projectData;
    }
// ★追加: 現在選択中のキャラクター単体のエクスポート
    exportCurrentCharacter() {
        if (!this.charEditor || !this.charEditor.activeCharacter) {
            alert("保存するキャラクターを選択してください");
            return;
        }
        // CharacterEditorのデータ抽出機能を呼び出す
        const data = this.charEditor.getCharacterData(this.charEditor.activeCharacter);
        this.downloadJSON(data, `${data.name}.json`);
        this.showNotification(`💾 キャラクター「${data.name}」を素材として保存しました`);
    }

    // ★追加: UIデータのみのエクスポート
    exportCurrentUI() {
        if (!this.uiEditor) return;
        const data = {
            type: "ui_layout",
            uiElements: this.uiEditor.exportData()
        };
        this.downloadJSON(data, `ui_layout.json`);
        this.showNotification(`💾 UIレイアウトを素材として保存しました`);
    }
    // =========================================================
    //  復元 (Load Project)
    // =========================================================
loadProjectFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);

                // A. 単体素材のインポート (キャラ)
                if (json.type === 'single_character') {
                    if (this.charEditor) {
                        json.id = crypto.randomUUID(); 
                        json.name = this.charEditor._getUniqueName(json.name);
                        this.charEditor._createCharacterFromData(json);
                        this.charEditor.updateOutlinerUI();
                        this.showNotification(`🤖 キャラクター「${json.name}」をインポートしました`);
                    }
                    return; 
                } 
                // B. 単体素材のインポート (UI)
                else if (json.type === 'ui_layout') {
                    if (this.uiEditor) {
                        this.uiEditor.importData(json.uiElements);
                        this.showNotification(`🎨 UIレイアウトをインポートしました`);
                    }
                    return; 
                }
                // C. 単体素材のインポート (ステージ)
                else if (json.type === 'single_stage') {
                    let newName = json.stageName || "Imported_Stage";
                    let counter = 1;
                    while (this.projectStages[newName] || newName === this.currentStageName) {
                        newName = `${json.stageName}_${counter}`;
                        counter++;
                    }
                    this.projectStages[newName] = json; // メモリに登録
                    this._updateStageSelectUI();
                    this.switchStage(newName); // すぐに表示する
                    this.showNotification(`🏞️ ステージ素材「${newName}」をインポートしました`);
                    return;
                }

                // D. プロジェクト全体のロード (旧データの自動変換を含む)
                this.restore(json);
                this.showNotification("📂 プロジェクトを読み込みました");

            } catch (err) { 
                console.error(err); 
                alert("読み込みエラー: " + err); 
            }
        };
        reader.readAsText(file);
    }

    _restoreStageOnly(stageData) {
        if (stageData.world) this._restoreWorldSettings(stageData.world);
        const objectsData = stageData.objects || [];
        objectsData.forEach(d => this._restoreObject(d));
        
        let maxCounter = 1;
        this.stage.stageGroup.children.forEach(obj => {
            if (obj.name) {
                const match = obj.name.match(/_(\d+)$/);
                if (match) { const num = parseInt(match[1]); if (num >= maxCounter) maxCounter = num + 1; }
            }
        });
        this.stage.objectCounter = maxCounter; 
    }

     _restoreWorldSettings(w) {
        const setVal = (id, v) => { const e = document.getElementById(id); if(e) e.value = v; };
        const setCh = (id, v) => { const e = document.getElementById(id); if(e) e.checked = v; };

        // ★追加: BGMプルダウンのリストを最新化してから値をセットする
        const bgmSelect = document.getElementById('world-bgm');
        if (bgmSelect && window.soundManager) {
            bgmSelect.innerHTML = '<option value="">(なし)</option>';
            Object.values(window.soundManager.library).forEach(snd => {
                if (snd.type === 'bgm') { // BGMのみ表示
                    const op = document.createElement('option');
                    op.value = snd.id; op.textContent = `🎼 ${snd.name}`;
                    bgmSelect.appendChild(op);
                }
            });
        }

        setVal('world-bg-color',w.bgColor); setVal('world-fog-dens',w.fogDensity); 
        setVal('world-bgm', w.bgm || ''); // ★追加: BGMの復元
        
        setVal('world-amb-color',w.ambientColor); setVal('world-amb-int',w.ambientInt);
        setVal('world-sun-color',w.sunColor); setVal('world-sun-int',w.sunInt); setVal('world-sun-x',w.sunX); setVal('world-sun-y',w.sunY);
        setVal('world-cam-mode',w.cameraMode); setVal('world-cam-dist',w.cameraDist); setVal('world-cam-fov',w.cameraFov);
        setVal('world-time-limit',w.timeLimit); setVal('world-lives',w.lives); setVal('world-plr-speed',w.playerSpeed); setVal('world-plr-jump',w.playerJump); setVal('world-plr-double',w.doubleJump);
        if(w.boundary){ setVal('world-size-x',w.boundary.x); setVal('world-size-y',w.boundary.y); setVal('world-size-z',w.boundary.z); }
        setVal('world-bounds-mode',w.boundaryMode); setVal('world-bounds-color',w.boundaryColor); setCh('world-bounds-visible',w.boundaryVisible); setCh('world-fall-dmg',w.fallDamage); setVal('world-fall-h',w.fallHeight); setVal('world-gravity',w.gravity);
        setVal('world-plr-hp', w.maxHp); setVal('world-plr-dash', w.dashMult !== undefined ? w.dashMult : 2.0); setVal('world-plr-hp-regen', w.hpRegen || 0); setVal('world-plr-sp-regen', w.spRegen !== undefined ? w.spRegen : 20); setVal('world-plr-sp-delay', w.spDelay !== undefined ? w.spDelay : 1.0); setVal('world-plr-sp-dash', w.spCostDash !== undefined ? w.spCostDash : 10); setVal('world-plr-sp-jump', w.spCostJump !== undefined ? w.spCostJump : 15); setVal('world-plr-sp-atk', w.spCostAtk !== undefined ? w.spCostAtk : 20); setVal('world-plr-lockon', w.lockonDist !== undefined ? w.lockonDist : 20); setVal('world-plr-base-atk', w.baseAtk !== undefined ? w.baseAtk : 10); setVal('world-plr-sp', w.maxSp || 100); setVal('world-plr-slots', w.equipmentSlots || 'head,body,arm,leg,weapon'); setCh('world-allow-gravity', w.allowGravityChange !== undefined ? w.allowGravityChange : true);
        
        const config = this.getWorldConfigFromUI();
        if (this.core && this.core.updateEnvironment) this.core.updateEnvironment(config);
        if (this.stage && this.stage.world) this.stage.world.gravity.set(0, config.gravity !== undefined ? config.gravity : -20, 0);
        if (this.stage && this.stage.updateBoundaryHelper) this.stage.updateBoundaryHelper(config);
    }

    _restoreObject(d) {
        // ...(既存の _restoreObject と同じ)...
        let mesh = this.stage.addObject(d.type === 'model' ? 'cube' : d.type, new THREE.Vector3().fromArray(d.pos));
        mesh.uuid = d.uuid; mesh.name = d.name;
        mesh.rotation.fromArray(d.rot); mesh.scale.fromArray(d.scale);
        mesh.material.color.setHex(d.color); mesh.material.opacity = d.opacity;
        if (d.type === 'model') { mesh.material.wireframe = true; mesh.userData.type = 'model'; }
        if (d.roughness !== undefined) mesh.material.roughness = d.roughness;
        if (d.metalness !== undefined) mesh.material.metalness = d.metalness;
        mesh.visible = d.visible; mesh.userData.physics = d.physics; mesh.userData.role = d.role; mesh.userData.roleParams = d.roleParams;
        if (d.gradient && d.gradient.enabled) this.stage.applyGradient(mesh, d.gradient);
        
        if (d.assets && d.assets.textureBase64) {
            if (window.imageManager) {
                window.imageManager.loadFromBase64(d.assets.textureBase64).then(texture => {
                    mesh.material.map = texture; mesh.material.needsUpdate = true;
                    if (!mesh.userData.assets) mesh.userData.assets = {}; mesh.userData.assets.textureBase64 = d.assets.textureBase64;
                });
            }
        }

        if (d.type === 'sprite') {
            mesh.userData.isSprite = true; mesh.userData.anim = d.anim; mesh.material.transparent = true; mesh.material.side = THREE.DoubleSide; 
            if (d.assets && d.assets.textureBase64 && window.imageManager) {
                window.imageManager.loadFromBase64(d.assets.textureBase64).then(texture => {
                    mesh.material.map = texture; mesh.material.needsUpdate = true;
                    if(mesh.userData.anim) mesh.userData.anim.texture = texture;
                    this.textureCache[d.uuid] = texture;
                });
            }
            if (!this.animatedSprites.includes(mesh)) this.animatedSprites.push(mesh);
        }
    }

    // =========================================================
    //  インゲーム中のロードとエクスポート
    // =========================================================

    async loadStageFromURL(filename, isTransition = false, targetSpawnId = null) { // ★引数追加
        const loader = document.getElementById('loader');
        if (loader) { loader.classList.remove('hidden'); loader.style.opacity = '1'; }


        try {
            let savedState = null;
            if (isTransition && window.simpleGame) {
                savedState = {
                    hp: window.simpleGame.player.currentHp, sp: window.simpleGame.player.currentSp,
                    inventory: JSON.parse(JSON.stringify(window.simpleGame.inventory)), equipment: JSON.parse(JSON.stringify(window.simpleGame.equipment))
                };
                window.simpleGame.stop();
            }

            const stageKey = filename.replace(/\.[^/.]+$/, ""); 
            let nextStageData = null;

            // ★書き出し後(Play)ならメモリから引く、エディタ上ならプロジェクトメモリから引く
            if (window.embeddedGameProject && window.embeddedGameProject.stages) {
                nextStageData = window.embeddedGameProject.stages[stageKey];
            } else if (this.projectStages[stageKey]) {
                nextStageData = this.projectStages[stageKey];
            } else {
                throw new Error("Stage not found in Project");
            }
            
            // 物理やシーンをクリアして再構築
            this.selection.deselectAll();
            this.stage.clearStage();
            this._restoreStageOnly(nextStageData);
            
             if (isTransition) {
                setTimeout(() => {
                    const config = this.getWorldConfigFromUI();
                    if (!window.simpleGame) window.simpleGame = new SimpleGameSystem(this.core.scene, this.stage.world, this.core.camera, this.core.renderer.domElement, this.stage.stageGroup);
                    
                    window.simpleGame.applyConfig(config);
                    
                    // ★追加: SimpleGameに次の出現地点IDを教える
                    window.simpleGame.targetSpawnId = targetSpawnId; 
                    
                    window.simpleGame.start(true, true); 
                    
                    if (savedState) {
                        window.simpleGame.player.currentHp = savedState.hp; window.simpleGame.player.currentSp = savedState.sp;
                        window.simpleGame.inventory = savedState.inventory; window.simpleGame.equipment = savedState.equipment;
                        window.simpleGame.player.updateFinalStats(); window.simpleGame.updateUI();
                    }
                    if (loader) loader.classList.add('hidden');
                    if (window.showNotification) window.showNotification(`📍 ${stageKey} に到着しました`);
                }, 500); 
            }
        } catch (error) {
            console.error(error);
            if (loader) loader.classList.add('hidden');
            if (window.showNotification) window.showNotification(`❌ 読み込み失敗: ${filename}`);
        }
    }

    async exportGameHTML() {
        this.showNotification("📦 プロジェクト全体を自動パック中...");
        this.syncCurrentStageToMemory();

        let charData = []; if (this.charEditor) charData = this.charEditor.exportData();
        let uiData = []; if (window.uiEditor) uiData = window.uiEditor.exportData();

        const projectData = {
            startStage: this.currentStageName,
            stages: this.projectStages,
            characters: charData,
            ui: uiData,
            sounds: window.soundManager ? window.soundManager.library : {} // ★追加
        };

        const jsonStr = JSON.stringify(projectData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

        // CSSとJSの読み込み準備
        const cssFiles =['css/variables.css', 'css/base.css', 'css/layout.css', 'css/components.css', 'css/editor.css', 'css/game.css'];
         const jsFiles =['CoreManager.js', 'StageManager.js', 'SelectionManager.js', 'EffectManager.js', 'UIManager.js', 'IOManager.js', 'SoundManager.js', 'InputManager.js', 'CharacterEditor.js', 'LogicEditor.js', 'AttackEditor.js', 'TimelineEditor.js', 'UIEditor.js', 'SimpleGame.js', 'PhysicsDebugger.js', 'ObjectPool.js', 'ProjectilePool.js', 'HistoryManager.js', 'ImageManager.js', 'SceneOptimizer.js', 'EnemyController.js', 'PlayerController.js'];

        try {
            let fullCss = "";
            for (const file of cssFiles) {
                const res = await fetch(file); fullCss += `\n/* --- ${file} --- */\n${await res.text()}\n`;
            }
            const importMap = {
                "imports": {
                    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
                    "three-bvh-csg": "https://esm.sh/three-bvh-csg@0.0.16?external=three",
                    "cannon-es": "https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js"
                }
            };
            for (const jsFile of jsFiles) {
                const res = await fetch(`js/${jsFile}`); let text = await res.text();
                text = text.replace(/(import|from)\s+['"]\.\/([^'"]+)['"]/g, "$1 '$2'");
                const base64 = btoa(unescape(encodeURIComponent(text)));
                importMap.imports[jsFile] = `data:text/javascript;base64,${base64}`;
            }
            const mainRes = await fetch('js/main.js'); let mainCode = await mainRes.text();
            mainCode = mainCode.replace(/(import|from)\s+['"]\.\/([^'"]+)['"]/g, "$1 '$2'");

            const htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>My 3D Game Project</title>
    <style>
        ${fullCss}
        body { margin: 0; overflow: hidden; background: #000; } 
        header, aside, footer, #timeline-panel, #help-modal, #ui-editor-area { display: none !important; pointer-events: none !important; } 
        #main-container { width: 100vw; height: 100dvh; display: flex; justify-content: center; align-items: center; position: relative; } 
        #viewport { width: 100%; height: 100%; position: absolute; inset: 0; }
        #game-ui { width: 100%; height: 100dvh; position: absolute; inset: 0; z-index: 900; display: flex; justify-content: center; align-items: center; pointer-events: none; }
        #ui-game-screen { width: 800px; height: 450px; position: relative; transform-origin: center center; overflow: hidden; flex-shrink: 0; background: transparent; pointer-events: none; }
        #ui-game-screen > div { position: absolute !important; }
        #loader { position: fixed; inset: 0; background: #111; z-index: 9999; display: flex; justify-content: center; align-items: center; transition: opacity 0.5s; }
        .spinner { width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #007acc; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .hidden { opacity: 0; pointer-events: none; }
    </style>
    <script type="importmap">${JSON.stringify(importMap, null, 4)}</script>
</head>
<body>
    <div id="loader"><div class="spinner"></div></div>
    <div id="main-container"><main id="viewport"><div id="notification-area"></div></main></div>
    <div id="game-ui"><div id="ui-game-screen"></div></div>
    <script>
        // ★変更: 埋め込みデータをプロジェクト全体のデータとして統合
        window.embeddedGameProject = ${jsonStr};
    </script>
    <script type="module">${mainCode}</script>
</body>
</html>`;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob); link.download = "index_game.html"; link.click();
            this.showNotification("📤 全自動パック書き出し完了！");
        } catch (err) { console.error(err); alert("書き出し中にエラーが発生しました: " + err); }
    }
}