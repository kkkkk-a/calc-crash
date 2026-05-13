/* =========================================
   js/characterEditor.js (Debugging Version)
   ========================================= */

import * as THREE from 'three';
const SYSTEM_ANIM_NAMES = ['idle', 'walk', 'run', 'jump', 'step', 'attack1', 'attack2', 'attack3', 'damage', 'dead'];
export class CharacterEditor {
    constructor(scene, stageGroup, inspectorPanel, outlinerPanel, logicEditor) {
        this.scene = scene;
        this.stageGroup = stageGroup;
        this.inspector = inspectorPanel;
        this.outliner = outlinerPanel;
        this.logicEditor = logicEditor; // AIロジックエディタへの参照

        // キャラクターモード専用のルートグループ
        this.editorRoot = new THREE.Group();
        this.editorRoot.name = "CharacterEditorSystem";
        this.editorRoot.visible = false;
        this.scene.add(this.editorRoot);
const guideGeo = new THREE.CylinderGeometry(1, 1, 0.2, 32, 1, false, 0, Math.PI);
        const guideMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false 
        });
        this.attackGuide = new THREE.Mesh(guideGeo, guideMat);
        this.attackGuide.visible = false; // 最初は隠しておく
        this.scene.add(this.attackGuide);
        // データ管理
        this.characters = []; 
        this.activeCharacter = null; 
        
        this.isCharacterMode = false;

        // 初期キャラ生成
        this.initDefaultCharacters();
    }
initDefaultCharacters() {
        // ==========================================
        // 1. Zombie (人型・追跡タイプ)
        // ==========================================
        const zombie = this.createNewCharacter("Zombie");
        
        // 胴体
        const zBody = this.addPartToActiveChar('cube', 'Body');
        zBody.scale.set(0.6, 0.8, 0.4);
        zBody.position.y = 0.8;
        zBody.material.color.set(0x2e7d32); // 濃い緑
        
        // 頭
        const zHead = this.addPartToActiveChar('cube', 'Head');
        zHead.scale.set(0.5, 0.5, 0.5);
        zHead.position.y = 0.65;
        zHead.material.color.set(0x66bb6a); // 薄い緑
        this.changeParent(zHead, zBody.uuid);

        // 両腕 (前に突き出している)
        const zArmL = this.addPartToActiveChar('cube', 'Arm_L');
        zArmL.scale.set(0.2, 0.2, 0.7);
        zArmL.position.set(-0.4, 0.3, 0.3);
        zArmL.material.color.set(0x388e3c);
        this.changeParent(zArmL, zBody.uuid);

        const zArmR = this.addPartToActiveChar('cube', 'Arm_R');
        zArmR.scale.set(0.2, 0.2, 0.7);
        zArmR.position.set(0.4, 0.3, 0.3);
        zArmR.material.color.set(0x388e3c);
        this.changeParent(zArmR, zBody.uuid);

        // ステータスとAI
        zombie.hp = 50; zombie.speed = 0.8; zombie.attack = 15;
        zombie.logic = {
            moveType: 'wander', patrolRange: 5.0,
            triggers: { onSight: true, onDamage: true, always: false },
            visionRange: 12.0, searchTime: 5.0, combatType: 'chase', attackRange: 1.5,
            patterns: [{ cond: 'dist_lt', val: 2.0, act: 'attack1', prob: 100 }],
            attacks: { attack1: { damage: 15, range: 2.0, knockback: 5, hitStop: 0.5, moveStyle: 'dash', vfx: 'hit', sfx: 'none' } }
        };

        // ==========================================
        // 2. Slime (半透明・ジャンプタイプ)
        // ==========================================
        const slime = this.createNewCharacter("Slime");
        this.selectCharacter(slime);
        
        // ぷるぷるの半透明ボディ
        const sBody = this.addPartToActiveChar('dome', 'SlimeBody');
        sBody.scale.set(0.8, 0.5, 0.8); // 平べったい
        sBody.position.y = 0.25;
        sBody.material.color.set(0x00d2ff); 
        sBody.material.transparent = true;
        sBody.material.opacity = 0.7; // 半透明

        // 目（コア）
        const sCore = this.addPartToActiveChar('sphere', 'Core');
        sCore.scale.set(0.2, 0.2, 0.2);
        sCore.position.set(0, 0.2, 0.3);
        sCore.material.color.set(0xffeb3b);
        this.changeParent(sCore, sBody.uuid);

        slime.hp = 20; slime.speed = 0.5;
        slime.logic = {
            moveType: 'wander', patrolRange: 10.0,
            triggers: { onSight: false, onDamage: true, always: false },
            combatType: 'random',
            patterns: [
                { cond: 'hp_lt', val: 50, act: 'retreat', prob: 80 },
                { cond: 'always', val: 0, act: 'jump', prob: 50 },
                { cond: 'dist_lt', val: 2.0, act: 'attack1', prob: 30 }
            ],
            attacks: { attack1: { damage: 5, range: 1.0, knockback: 2, moveStyle: 'jump', vfx: 'none' } }
        };

        // ==========================================
        // 3. Hero (プレイヤー素体モデル)
        // ==========================================
        const hero = this.createNewCharacter("Hero");
        this.selectCharacter(hero);

        // 胴体
        const hBody = this.addPartToActiveChar('cylinder', 'Body');
        hBody.scale.set(0.5, 0.6, 0.3);
        hBody.position.y = 0.7;
        hBody.material.color.set(0x1976d2); // 青い服

        // 頭
        const hHead = this.addPartToActiveChar('sphere', 'Head');
        hHead.scale.set(0.4, 0.4, 0.4);
        hHead.position.y = 0.5;
        hHead.material.color.set(0xffccbc); // 肌色
        this.changeParent(hHead, hBody.uuid);

        // 両腕
        const hArmL = this.addPartToActiveChar('cylinder', 'Arm_L');
        hArmL.scale.set(0.2, 0.6, 0.2); hArmL.position.set(-0.4, 0, 0);
        hArmL.material.color.set(0xffccbc); this.changeParent(hArmL, hBody.uuid);
        
        const hArmR = this.addPartToActiveChar('cylinder', 'Arm_R');
        hArmR.scale.set(0.2, 0.6, 0.2); hArmR.position.set(0.4, 0, 0);
        hArmR.material.color.set(0xffccbc); this.changeParent(hArmR, hBody.uuid);

        // プレイヤーとして使う場合はAI不要
        hero.hp = 100; hero.speed = 1.0; hero.attack = 10;
        hero.logic = { moveType: 'stand', combatType: 'none', patterns: [] };

        // 初期状態は未選択にする
        this.activeCharacter = null;
        this.characters.forEach(c => c.rootGroup.visible = false);
    }
    switchToCharacterMode() {
        if (this.isCharacterMode) return;
        this.isCharacterMode = true;

        this.stageGroup.visible = false;
        this.editorRoot.visible = true;

        // キャラがいない場合は作成
        if (this.characters.length === 0) {
            this.createNewCharacter("New_Character_01");
        } 
        // 誰も選択されていなければ先頭を選択
        else if (!this.activeCharacter) {
            this.selectCharacter(this.characters[0]);
        }
        // 既に選択されていたら表示を確実にONにする
        else {
            this.selectCharacter(this.activeCharacter);
        }

        this.updateOutlinerUI();
        this.updateInspectorUI();
    }

    switchToStageMode() {
        if (!this.isCharacterMode) return;
        this.isCharacterMode = false;

        this.editorRoot.visible = false;
        this.stageGroup.visible = true;
    }

    // --- キャラクター管理 ---

    createNewCharacter(name) {
        // ★修正: 重複しない安全な名前に変換してから作成する
        const safeName = this._getUniqueName(name);

        const rootGroup = new THREE.Group();
        rootGroup.name = safeName;
        this.editorRoot.add(rootGroup);

        const newChar = {
            id: crypto.randomUUID(),
            name: safeName,
            rootGroup: rootGroup,
            parts: [],
            // デフォルトステータス
            hp: 100, attack: 10, defense: 0, speed: 1.0,
            animations: {},
            logic: {} // AIロジック用
        };

        this.characters.push(newChar);
        this.selectCharacter(newChar);
        
        // ベースパーツ(Hips)を自動追加
        this.addPartToActiveChar('cube', 'Hips (Base)');
        
        return newChar;
    }

    selectCharacter(charData) {
        this.activeCharacter = charData;
        
        this.characters.forEach(c => {
            c.rootGroup.visible = (c === charData);
        });

        this.updateOutlinerUI();
        
        if (window.timelineEditor) {
            // ★追加: キャラの切り替え時にタイムラインのプルダウンリストも更新する
            window.timelineEditor.updateAnimSelector();
            window.timelineEditor.renderTracks();
        }
    }


    deleteActiveCharacter() {
        if (!this.activeCharacter) return;
        if (!confirm(`Character "${this.activeCharacter.name}" を削除しますか？`)) return;

        this.editorRoot.remove(this.activeCharacter.rootGroup);
        this.characters = this.characters.filter(c => c !== this.activeCharacter);
        
        if (this.characters.length > 0) {
            this.selectCharacter(this.characters[this.characters.length - 1]);
        } else {
            this.activeCharacter = null;
            this.updateOutlinerUI();
            this.updateInspectorUI();
        }
    }
addNewAnimation(customName) {
        if (!this.activeCharacter) return;
        const char = this.activeCharacter;
        const name = customName.trim().toLowerCase();

        if (name === "") return;

        if (char.animations[name]) {
            alert("その名前のアニメーションは既に存在します。");
            return;
        }

        const SYSTEM_ANIM_NAMES = ['idle', 'walk', 'run', 'jump', 'step', 'attack1', 'attack2', 'attack3', 'damage', 'dead'];
        if (SYSTEM_ANIM_NAMES.includes(name)) {
            alert(`「${name}」はシステム予約名です。プルダウンから選択して編集してください。`);
            return;
        }

        char.animations[name] = {};
        this.updateInspectorUI();
        
        if (window.timelineEditor) {
            // ★追加: 新しいアニメが追加されたらプルダウンを再構築して選択させる
            window.timelineEditor.updateAnimSelector();
            window.timelineEditor.setAnimation(name);
        }
    }

    // --- パーツ管理 ---

    addPartToActiveChar(geometryType, partName = "New Part") {
        if (!this.activeCharacter) return;

        let geo;
        if (geometryType === 'sphere') geo = new THREE.SphereGeometry(0.5, 16, 16);
        else if (geometryType === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
        else if (geometryType === 'cone') geo = new THREE.ConeGeometry(0.5, 1, 16);
        else geo = new THREE.BoxGeometry(1, 1, 1);

        const mat = new THREE.MeshStandardMaterial({ color: 0x00d2ff });
        const mesh = new THREE.Mesh(geo, mat);
        
        mesh.name = partName;
        // データ保存
        mesh.userData = {
            isCharPart: true,
            partType: 'body',
            geometryType: geometryType, // 保存用
            parentId: this.activeCharacter.id
        };

        this.activeCharacter.rootGroup.add(mesh);
        this.activeCharacter.parts.push(mesh);

        this.updateOutlinerUI();
        
        // タイムライン更新
        if (window.timelineEditor) window.timelineEditor.renderTracks();

        return mesh;
    }

    // 親子関係の変更
    changeParent(childObj, newParentUUID) {
        if (childObj.uuid === newParentUUID) return;
        
        let newParent = null;
        
        // ルートの場合
        if (newParentUUID === this.activeCharacter.rootGroup.uuid) {
            newParent = this.activeCharacter.rootGroup;
        } else {
            // 他のパーツの場合
            newParent = this.activeCharacter.parts.find(p => p.uuid === newParentUUID);
        }

        if (newParent) {
            // World座標を維持したまま付け替え
            newParent.attach(childObj);
            this.updateInspectorUI(childObj); // UI更新
        }
    }

    // --- データ入出力 (Save/Load) ---

    // 全キャラ保存用
    exportData() {
        return this.characters.map(char => this.getCharacterData(char));
    }

    // 単体キャラデータ抽出
    getCharacterData(char) {
        const partsData = char.parts.map((part, index) => { 
            let parentIndex = -1;
            
            // 親がルートグループではないことを確認
            if (part.parent !== char.rootGroup) {
                // 親メッシュのUUIDを取得
                const parentUUID = part.parent.uuid;
                
                // char.partsリスト全体からそのUUIDを持つパーツを探し、インデックスを取得
                // ※ findIndexを使用することで、indexOfよりも安全に検索し、見つからない場合は -1 を返す
                parentIndex = char.parts.findIndex(p => p.uuid === parentUUID);
            }
            return {
                uuid: part.uuid,
                name: part.name,
                userData: JSON.parse(JSON.stringify(part.userData)),
                
                pos: part.position.toArray(),
                rot: part.quaternion.toArray(),
                scl: part.scale.toArray(),
                
                color: (part.material && part.material.color) ? part.material.color.getHex() : 0xffffff,
                opacity: (part.material) ? (part.material.opacity ?? 1.0) : 1.0,
                parentIndex: parentIndex // 既に計算済み
            };
        });
        return {
            type: "single_character",
            id: char.id,
            name: char.name,
            hp: char.hp || 100,
            attack: char.attack || 10,
            defense: char.defense || 0,
            speed: char.speed || 1.0,
            parts: partsData,
            animations: char.animations || {},
            logic: char.logic || {}
        };
    }

    // データ読み込み (全置換)
    importData(data) {
        if (!data || !Array.isArray(data)) return;

        // 全クリア
        this.characters.forEach(c => this.editorRoot.remove(c.rootGroup));
        this.characters = [];
        this.activeCharacter = null;

        // 復元
        data.forEach(charData => this._createCharacterFromData(charData));

        this.updateOutlinerUI();
        if (this.characters.length > 0) this.selectCharacter(this.characters[0]);
    }

    // ファイルからの追加読み込み
    importCharactersFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const list = Array.isArray(json) ? json : [json];
                
                list.forEach(charData => {
                    // 名前重複回避
                    let name = charData.name;
                    if (this.characters.some(c => c.name === name)) {
                        name = name + "_Copy";
                    }
                    charData.name = name;
                    
                    // IDを新規発行して追加
                    charData.id = crypto.randomUUID();
                    this._createCharacterFromData(charData);
                });
                
                alert(`${list.length} Character(s) Imported!`);
                this.updateOutlinerUI();
            } catch (err) {
                console.error(err);
                alert("Invalid Character File");
            }
        };
        reader.readAsText(file);
    }

    // スマート復元 (Undo/Redo用)
    restoreCharacters(data) {
        if (!data || !Array.isArray(data)) return;

        const currentCharsMap = new Map(this.characters.map(c => [c.id, c]));
        const visitedChars = new Set();

        data.forEach(charData => {
            let char = currentCharsMap.get(charData.id);
            if (char) {
                visitedChars.add(char.id);
                // ステータス更新
                char.name = charData.name;
                char.rootGroup.name = charData.name;
                char.hp = charData.hp;
                char.attack = charData.attack;
                char.defense = charData.defense;
                char.speed = charData.speed;
                char.animations = charData.animations || {};
                char.logic = charData.logic || {};

                // 構造チェック
                const currentPartsMap = new Map(char.parts.map(p => [p.uuid, p]));
                const isStructureChanged = charData.parts.length !== char.parts.length || 
                                           charData.parts.some(p => !currentPartsMap.has(p.uuid));

                if (isStructureChanged) {
                    this._recreateCharacter(char, charData);
                } else {
                    // Transform更新
                    charData.parts.forEach((pData) => {
                        const part = currentPartsMap.get(pData.uuid);
                        if (part) {
                            part.position.fromArray(pData.pos);
                            part.quaternion.fromArray(pData.rot);
                            part.scale.fromArray(pData.scl);
                            part.name = pData.name;
                            part.userData = pData.userData;
                            part.material.color.setHex(pData.color);
                            part.material.opacity = pData.opacity;
                            part.material.transparent = pData.opacity < 1.0;
                            part.material.needsUpdate = true;

                            // 親子付け替えチェック
                            const parentIndex = pData.parentIndex;
                            let intendedParent = char.rootGroup;
                            if (parentIndex !== -1 && char.parts[parentIndex]) {
                                intendedParent = char.parts[parentIndex];
                            }
                            if (part.parent !== intendedParent) {
                                intendedParent.add(part);
                            }
                        }
                    });
                }
            } else {
                this._createCharacterFromData(charData);
            }
        });

        // 削除されたキャラの処理
        this.characters.forEach(c => {
            if (!visitedChars.has(c.id)) {
                this.editorRoot.remove(c.rootGroup);
            }
        });
        this.characters = this.characters.filter(c => visitedChars.has(c.id));

        this.updateOutlinerUI();
        if (this.activeCharacter && !this.characters.includes(this.activeCharacter)) {
            this.activeCharacter = null;
            this.updateInspectorUI();
        }
    }

    _recreateCharacter(oldChar, charData) {
        this.editorRoot.remove(oldChar.rootGroup);
        this.characters = this.characters.filter(c => c !== oldChar);
        this._createCharacterFromData(charData);
    }

    _createCharacterFromData(charData) {
        const rootGroup = new THREE.Group();
        rootGroup.name = charData.name;
        this.editorRoot.add(rootGroup);

        const newChar = {
            id: charData.id,
            name: charData.name,
            rootGroup: rootGroup,
            parts: [],
            hp: charData.hp, attack: charData.attack, defense: charData.defense, speed: charData.speed,
            animations: charData.animations || {},
            logic: charData.logic || {}
        };

        if (charData.parts) {
            charData.parts.forEach(pData => {
                const type = pData.userData.geometryType || 'cube';
                let geo;
                if (type === 'sphere') geo = new THREE.SphereGeometry(0.5, 16, 16);
                else if (type === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
                else if (type === 'cone') geo = new THREE.ConeGeometry(0.5, 1, 16);
                else geo = new THREE.BoxGeometry(1, 1, 1);

                const mat = new THREE.MeshStandardMaterial({
                    color: pData.color,
                    transparent: pData.opacity < 1.0,
                    opacity: pData.opacity
                });

                const mesh = new THREE.Mesh(geo, mat);
                mesh.name = pData.name;
                mesh.uuid = pData.uuid; 
                mesh.userData = pData.userData;
                mesh.position.fromArray(pData.pos);
                mesh.quaternion.fromArray(pData.rot);
                mesh.scale.fromArray(pData.scl);

                newChar.parts.push(mesh);
                newChar.rootGroup.add(mesh);
            });

            // 親子関係構築
            charData.parts.forEach((pData, index) => {
                const child = newChar.parts[index];
                const pIdx = pData.parentIndex;
                if (pIdx !== -1 && newChar.parts[pIdx]) {
                    // ★修正: attach(ワールド維持) ではなく add(ローカル維持) を使用する
                    newChar.parts[pIdx].add(child);
                }
            });
        }

        this.characters.push(newChar);
    }

    // 外部用: リスト取得
    getCharacterOptions() {
        return this.characters.map(c => ({ v: c.name, l: `🤖 ${c.name}` }));
    }

    // =========================================================
    //  UI描画 (Outliner)
    // =========================================================
    
  updateOutlinerUI() {
        const list = document.getElementById('outliner-content');
        if (!list) return;
        list.innerHTML = '';

        // ヘッダー
        const headerDiv = document.createElement('div');
        headerDiv.style.padding = "5px";
        headerDiv.style.borderBottom = "1px solid #444";
        headerDiv.style.marginBottom = "5px";
        headerDiv.style.display = "flex";
        headerDiv.style.flexDirection = "column";
        headerDiv.style.gap = "5px";

        headerDiv.innerHTML = `
            <button class="btn-secondary" id="btn-create-char" style="width:100%;">+ Create New</button>
            <div style="display:flex; gap:5px;">
                <button class="btn-secondary" id="btn-import-char" style="flex:1;">📂 Load</button>
                <button class="btn-secondary" id="btn-export-all-char" style="flex:1;">💾 Save All</button>
            </div>
            <input type="file" id="file-import-char" accept=".json" style="display:none;">
        `;
        list.appendChild(headerDiv);

        // イベント
        headerDiv.querySelector('#btn-create-char').onclick = () => {
            const name = prompt("New Character Name:", `Enemy_${this.characters.length + 1}`);
            if (name) this.createNewCharacter(name);
        };
        headerDiv.querySelector('#btn-export-all-char').onclick = () => {
            if (this.characters.length === 0) { alert("保存するキャラクターがいません。"); return; }
            const data = this.exportData();
            if (window.downloadJSON) window.downloadJSON(data, "all_characters.json");
        };
        const fileInput = headerDiv.querySelector('#file-import-char');
        headerDiv.querySelector('#btn-import-char').onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            if (e.target.files[0]) this.importCharactersFromFile(e.target.files[0]);
            e.target.value = '';
        };

        // キャラリスト
        this.characters.forEach(char => {
            const isActive = (char === this.activeCharacter);
            
            const charDiv = document.createElement('div');
            charDiv.className = `outliner-item ${isActive ? 'selected' : ''}`;
            charDiv.style.display = 'flex';
            charDiv.style.justifyContent = 'space-between';
            charDiv.style.alignItems = 'center';
            charDiv.style.borderLeft = isActive ? "4px solid #00d2ff" : "4px solid transparent";

            const nameSpan = document.createElement('span');
            nameSpan.style.flex = "1";
            nameSpan.style.fontWeight = "bold";
            nameSpan.style.cursor = "pointer";
            nameSpan.textContent = `🤖 ${char.name}`;
            nameSpan.onclick = () => this.selectCharacter(char);

            const btnGroup = document.createElement('div');
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '8px';
            btnGroup.style.marginRight = '4px';

            // リネーム
            const editBtn = document.createElement('span');
            editBtn.textContent = '✏️';
            editBtn.style.cursor = 'pointer';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                const newName = prompt("Rename Character:", char.name);
                if (newName && newName !== char.name) {
                    // ★修正: 他のキャラと名前が被らないように自動調整
                    const safeName = this._getUniqueName(newName);
                    char.name = safeName;
                    char.rootGroup.name = safeName;
                    this.updateOutlinerUI();
                    if (isActive) this.updateInspectorUI(); 
                }
            };

            // 削除
            const delBtn = document.createElement('span');
            delBtn.textContent = '🗑️';
            delBtn.style.cursor = 'pointer';
            delBtn.style.color = '#ff4444';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (isActive) {
                    this.deleteActiveCharacter();
                } else {
                    if (confirm(`Character "${char.name}" を削除しますか？`)) {
                        this.editorRoot.remove(char.rootGroup);
                        this.characters = this.characters.filter(c => c !== char);
                        this.updateOutlinerUI();
                    }
                }
            };

            btnGroup.appendChild(editBtn);
            btnGroup.appendChild(delBtn);
            charDiv.appendChild(nameSpan);
            charDiv.appendChild(btnGroup);
            list.appendChild(charDiv);

            // パーツリスト (アクティブ時のみ)
            if (isActive) {
                // ★修正: ルート直下のパーツから再帰的（ツリー状）に描画する関数
                const renderParts = (parentGroup, depth) => {
                    // この親に直接属しているメッシュパーツだけを取得
                    const children = [...parentGroup.children].filter(c => c.isMesh && c.userData.isCharPart);
                    
                    children.forEach(part => {
                        const partDiv = document.createElement('div');
                        
                        const isSelected = window.selection && window.selection.selectedObjects.includes(part);
                        partDiv.className = `outliner-item ${isSelected ? 'selected' : ''}`;
                        
                        // ★深さ(depth)に応じて左に余白を作り、階層を表現する
                        partDiv.style.paddingLeft = `${20 + depth * 15}px`;
                        if (depth > 0) partDiv.style.borderLeft = "1px dashed #555"; // ツリーの線
                        
                        partDiv.style.fontSize = "0.85rem";
                        partDiv.style.display = 'flex';
                        partDiv.style.justifyContent = 'space-between';
                        partDiv.style.alignItems = 'center';

                        const pName = document.createElement('span');
                        pName.textContent = `${depth === 0 ? '📦' : '↳'} ${part.name}`;
                        pName.style.flex = "1";
                        pName.style.cursor = "pointer";
                        pName.onclick = (e) => {
                            e.stopPropagation();
                            document.dispatchEvent(new CustomEvent('selectObject', { detail: part }));
                        };

                        const pBtns = document.createElement('div');
                        pBtns.style.display = 'flex';
                        pBtns.style.gap = '8px';
                        pBtns.style.marginRight = '4px';

                        const pEdit = document.createElement('span');
                        pEdit.textContent = '✏️';
                        pEdit.style.cursor = 'pointer';
                        pEdit.onclick = (e) => {
                            e.stopPropagation();
                            const newPName = prompt("Rename Part:", part.name);
                            if (newPName) {
                                part.name = newPName;
                                this.updateOutlinerUI();
                                document.dispatchEvent(new CustomEvent('selectObject', { detail: part }));
                            }
                        };

                        const pDel = document.createElement('span');
                        pDel.textContent = '×';
                        pDel.style.cursor = 'pointer';
                        pDel.style.color = '#ff4444';
                        pDel.style.fontWeight = 'bold';
                        pDel.onclick = (e) => {
                            e.stopPropagation();
                            if(confirm(`Delete part "${part.name}"?`)) {
                                const childrenToMove = [...part.children].filter(c => c.isMesh && c.userData.isCharPart);
                                childrenToMove.forEach(c => {
                                    this.activeCharacter.rootGroup.attach(c);
                                });
                                if (part.parent) part.parent.remove(part);
                                this.activeCharacter.parts = this.activeCharacter.parts.filter(p => p !== part);
                                
                                if (this.activeCharacter.animations) {
                                    Object.keys(this.activeCharacter.animations).forEach(animName => {
                                        if (this.activeCharacter.animations[animName][part.uuid]) {
                                            delete this.activeCharacter.animations[animName][part.uuid];
                                        }
                                    });
                                }
                                this.updateOutlinerUI();
                                this.updateInspectorUI(null);
                                if (window.saveHistory) window.saveHistory(); 
                            }
                        };

                        pBtns.appendChild(pEdit);
                        pBtns.appendChild(pDel);
                        partDiv.appendChild(pName);
                        partDiv.appendChild(pBtns);
                        list.appendChild(partDiv);

                        // ★自身の子パーツも描画（再帰呼び出し）
                        renderParts(part, depth + 1);
                    });
                };
                
                // ツリー描画の開始
                renderParts(char.rootGroup, 0);

                const addPartDiv = document.createElement('div');
                addPartDiv.style.paddingLeft = "20px";
                addPartDiv.style.marginTop = "4px";
                const addPartBtn = document.createElement('button');
                addPartBtn.className = "btn-secondary";
                addPartBtn.style.padding = "4px";
                addPartBtn.style.width = "100%";
                addPartBtn.textContent = "+ Add Part";
                addPartBtn.onclick = () => {
                    this.addPartToActiveChar('cube', `Part_${char.parts.length + 1}`);
                };
                addPartDiv.appendChild(addPartBtn);
                list.appendChild(addPartDiv);
            }
                    });
    }


    // =========================================================
    //  UI描画 (Inspector)
    // =========================================================
    
    updateInspectorUI(selectedObj = null) {
        const container = document.getElementById('inspector-panel').querySelector('.scrollable-content');
        
        let charUI = document.getElementById('char-inspector-ui');
        if (!charUI) {
            charUI = document.createElement('div');
            charUI.id = 'char-inspector-ui';
            if (container.children.length > 0) {
                container.insertBefore(charUI, container.children[0].nextSibling);
            } else {
                container.appendChild(charUI);
            }
        }
        
        charUI.innerHTML = ''; 
        charUI.style.display = 'block';

        // パターンA: キャラクター全体設定
        if (!selectedObj || !selectedObj.userData.isCharPart) {
            if (this.activeCharacter) {
                let currentAnim = 'idle';
                if (window.timelineEditor) currentAnim = window.timelineEditor.currentAnimName;

                // ロジックUI (LogicEditor呼び出し)
                let logicHTML = "";
                if (this.logicEditor && this.logicEditor.renderUI) {
                    logicHTML = this.logicEditor.renderUI(this.activeCharacter);
                }

                charUI.innerHTML = `
                    <div class="prop-section" style="border-left: 3px solid #ff9800; padding-left: 8px; margin-bottom: 15px;">
                        <div class="prop-title" style="color:#ff9800">Character Settings</div>
                        
                        <div class="prop-row">
                            <label>キャラ名</label>
                            <input type="text" id="inp-char-name" value="${this.activeCharacter.name}" style="width:100%;">
                        </div>

                        <div class="prop-row" style="margin-top:10px;">
    <label style="color:#00d2ff;">Animation</label>
    <div style="display:flex; gap:5px; width:100%;">
        <select id="char-anim-select" style="flex:1; font-weight:bold;">
            ${SYSTEM_ANIM_NAMES.map(n => `<option value="${n}" ${currentAnim===n?'selected':''}>${n}</option>`).join('')}
            ${Object.keys(this.activeCharacter.animations).filter(n => !SYSTEM_ANIM_NAMES.includes(n)).map(n => `<option value="${n}" ${currentAnim===n?'selected':''}>✨ ${n}</option>`).join('')}
        </select>
        <button id="btn-add-custom-anim" style="padding:0 8px; background:#4caf50; border:none; border-radius:4px; color:white; cursor:pointer;">+</button>
    </div>
</div>
                        <div class="sub-header">基本ステータス</div>
                        <div class="prop-row"><label>最大HP</label><input type="number" id="inp-char-hp" value="${this.activeCharacter.hp || 100}"></div>
                        <div class="prop-row"><label>攻撃力</label><input type="number" id="inp-char-atk" value="${this.activeCharacter.attack || 10}"></div>
                        <div class="prop-row"><label>防御力</label><input type="number" id="inp-char-def" value="${this.activeCharacter.defense || 0}"></div>
                        <div class="prop-row"><label>移動速度</label><input type="number" id="inp-char-spd" value="${this.activeCharacter.speed || 1.0}" step="0.1"></div>

                        <div style="margin-top:15px; padding-top:10px; border-top:1px dashed #555;">
                            <button class="btn-action" id="btn-save-char" style="background:#009688;">💾 Save This Character</button>
                        </div>
                    </div>
                    ${logicHTML}
                `;
                
                // イベント
                document.getElementById('inp-char-name').addEventListener('input', (e) => {
                    this.activeCharacter.name = e.target.value;
                    this.activeCharacter.rootGroup.name = e.target.value;
                    this.updateOutlinerUI();
                });
                document.getElementById('char-anim-select').addEventListener('change', (e) => {
                    if (window.timelineEditor) window.timelineEditor.setAnimation(e.target.value);
                });
                document.getElementById('btn-add-custom-anim').onclick = () => {
                    const newName = prompt("新しいアニメーションの名前を入力してください（例: dance, salute）");
                    if (newName) this.addNewAnimation(newName);
                };
                document.getElementById('inp-char-hp').addEventListener('input', (e) => this.activeCharacter.hp = parseInt(e.target.value));
                document.getElementById('inp-char-atk').addEventListener('input', (e) => this.activeCharacter.attack = parseInt(e.target.value));
                document.getElementById('inp-char-def').addEventListener('input', (e) => this.activeCharacter.defense = parseInt(e.target.value));
                document.getElementById('inp-char-spd').addEventListener('input', (e) => this.activeCharacter.speed = parseFloat(e.target.value));

                const btnSaveChar = document.getElementById('btn-save-char');
                if (btnSaveChar) {
                    btnSaveChar.onclick = () => {
                        const data = this.getCharacterData(this.activeCharacter);
                        if(window.downloadJSON) window.downloadJSON(data, `${this.activeCharacter.name}.json`);
                    };
                }

                if (this.logicEditor && this.logicEditor.bindEvents) {
                    this.logicEditor.bindEvents(this.activeCharacter);
                }
            }
            return;
        }

        // パターンB: 個別パーツ設定
        if (selectedObj && selectedObj.userData.isCharPart) {
            // 親候補リスト
            let parentOptions = `<option value="${this.activeCharacter.rootGroup.uuid}">[Root] Character Base</option>`;
            this.activeCharacter.parts.forEach(p => {
                if (p !== selectedObj) { 
                    const isSelected = (selectedObj.parent === p) ? 'selected' : '';
                    parentOptions += `<option value="${p.uuid}" ${isSelected}>📦 ${p.name}</option>`;
                }
            });

            const logic = selectedObj.userData.logic || { isHitbox: false, isWeakPoint: false };
            const morph = selectedObj.userData.morph || { hideOnIdle: false, colorOnAttack: false, attackColor: '#ff0000' };

            charUI.innerHTML = `
                <div class="prop-section" style="border-left: 3px solid #00d2ff; padding-left: 8px; margin-bottom: 15px;">
                    <div class="prop-title" style="color:#00d2ff">Part Structure (構造)</div>
                    
                    <div class="prop-row"><label>パーツ名</label><input type="text" id="inp-part-name" value="${selectedObj.name}" style="width:100%;"></div>
                    
                    <div class="prop-row">
                        <label>種類</label>
                        <select id="inp-part-type" style="width:100%;">
                            <option value="body" ${selectedObj.userData.partType==='body'?'selected':''}>Body (胴体)</option>
                            <option value="head" ${selectedObj.userData.partType==='head'?'selected':''}>Head (頭/弱点)</option>
                            <option value="arm_l" ${selectedObj.userData.partType==='arm_l'?'selected':''}>Left Arm</option>
                            <option value="arm_r" ${selectedObj.userData.partType==='arm_r'?'selected':''}>Right Arm</option>
                            <option value="leg_l" ${selectedObj.userData.partType==='leg_l'?'selected':''}>Left Leg</option>
                            <option value="leg_r" ${selectedObj.userData.partType==='leg_r'?'selected':''}>Right Leg</option>
                            <option value="weapon" ${selectedObj.userData.partType==='weapon'?'selected':''}>Weapon (武器)</option>
                            <option value="wing" ${selectedObj.userData.partType==='wing'?'selected':''}>Wing (翼)</option>
                            <option value="tail" ${selectedObj.userData.partType==='tail'?'selected':''}>Tail (尻尾)</option>
                            <option value="effect" ${selectedObj.userData.partType==='effect'?'selected':''}>Effect (エフェクト)</option>
                            <option value="other" ${selectedObj.userData.partType==='other'?'selected':''}>Other (その他)</option>
                        </select>
                    </div>

                    <div class="prop-row">
                        <label>親パーツ</label>
                        <select id="inp-part-parent" style="width:100%;">
                            ${parentOptions}
                        </select>
                    </div>

                    <div class="sub-header">判定ロジック (Logic)</div>
                    <div class="prop-row"><label style="width:120px;">⚔️ 常時攻撃判定</label><input type="checkbox" id="chk-logic-hitbox" ${logic.isHitbox ? 'checked' : ''}></div>
                    <div class="prop-row"><label style="width:120px;">🛡️ 弱点部位 (x2)</label><input type="checkbox" id="chk-logic-weak" ${logic.isWeakPoint ? 'checked' : ''}></div>

                    <div class="sub-header">形態変化 (State Morph)</div>
                    <div class="prop-row"><label style="width:120px;">待機時 非表示</label><input type="checkbox" id="chk-morph-hide-idle" ${morph.hideOnIdle ? 'checked' : ''}></div>
                    <div class="prop-row"><label style="width:120px;">攻撃時 色変化</label><input type="checkbox" id="chk-morph-col-atk" ${morph.colorOnAttack ? 'checked' : ''}></div>
                    <div class="prop-row"><label>変化色</label><input type="color" id="inp-morph-col" value="${morph.attackColor}" style="width:100%;"></div>

                    <div class="sub-header">基本マテリアル</div>
                    <div class="prop-row"><label>色</label><input type="color" id="inp-part-color" value="#${selectedObj.material.color.getHexString()}" style="width:100%;"></div>
                    <div class="prop-row"><label>透明度</label><input type="range" id="inp-part-opacity" min="0" max="1" step="0.1" value="${selectedObj.material.opacity}"></div>
                    
                    <div class="prop-row" style="margin-top:5px;"><label>テクスチャ</label><input type="file" id="inp-part-tex" accept="image/*" style="font-size:0.8rem;"></div>
                    <button class="btn-secondary" id="btn-part-tex-clear" style="margin-top:4px;">テクスチャ削除</button>
                </div>
            `;

            // イベント登録
            document.getElementById('inp-part-name').addEventListener('input', (e) => {
                selectedObj.name = e.target.value;
                this.updateOutlinerUI();
            });
            document.getElementById('inp-part-type').addEventListener('change', (e) => selectedObj.userData.partType = e.target.value);
            document.getElementById('inp-part-parent').addEventListener('change', (e) => this.changeParent(selectedObj, e.target.value));

            const saveLogic = () => {
                selectedObj.userData.logic = {
                    isHitbox: document.getElementById('chk-logic-hitbox').checked,
                    isWeakPoint: document.getElementById('chk-logic-weak').checked
                };
            };
            document.getElementById('chk-logic-hitbox').addEventListener('change', saveLogic);
            document.getElementById('chk-logic-weak').addEventListener('change', saveLogic);

            const saveMorph = () => {
                selectedObj.userData.morph = {
                    hideOnIdle: document.getElementById('chk-morph-hide-idle').checked,
                    colorOnAttack: document.getElementById('chk-morph-col-atk').checked,
                    attackColor: document.getElementById('inp-morph-col').value
                };
            };
            document.getElementById('chk-morph-hide-idle').addEventListener('change', saveMorph);
            document.getElementById('chk-morph-col-atk').addEventListener('change', saveMorph);
            document.getElementById('inp-morph-col').addEventListener('input', saveMorph);

            document.getElementById('inp-part-color').addEventListener('input', (e) => selectedObj.material.color.set(e.target.value));
            document.getElementById('inp-part-opacity').addEventListener('input', (e) => {
                const o = parseFloat(e.target.value);
                selectedObj.material.opacity = o;
                selectedObj.material.transparent = o < 1.0;
                selectedObj.material.needsUpdate = true;
            });

            const texInput = document.getElementById('inp-part-tex');
            texInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const url = URL.createObjectURL(file);
                    new THREE.TextureLoader().load(url, (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        selectedObj.material.map = tex;
                        selectedObj.material.needsUpdate = true;
                    });
                }
            });
            document.getElementById('btn-part-tex-clear').addEventListener('click', () => {
                selectedObj.material.map = null;
                selectedObj.material.needsUpdate = true;
                texInput.value = ''; 
            });
        }
    }

    resetInspectorUI() {
        const charUI = document.getElementById('char-inspector-ui');
        if(charUI) charUI.style.display = 'none';
    }

    _getUniqueName(baseName) {
        let newName = baseName;
        let counter = 1;
        // 同名のキャラクターが既に存在する場合は連番をつける
        while (this.characters.some(c => c.name === newName)) {
            newName = `${baseName}_${counter}`;
            counter++;
        }
        return newName;
    }
}