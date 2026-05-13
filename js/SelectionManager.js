import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { TransformCommand } from './HistoryManager.js';
export class SelectionManager {
    constructor(core, stageManager) {
        this.core = core;
        this.scene = core.scene;
        this.camera = core.camera;
        this.domElement = core.renderer.domElement;
        this.stageManager = stageManager;

        // 選択状態
        this.selectedObjects = [];
        this.multiSelectEnabled = false; // "Multi"ボタンの状態
        this.snapEnabled = false;        // "Snap"ボタンの状態
        
        // ★修正点1: 元の親を記録するマップ
        this.originalParents = new Map(); 

        // Raycaster (クリック判定用)
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.pointerDownTime = 0;

        // ヘルパーグループ (黄色い枠線などを入れる)
        this.helperGroup = new THREE.Group();
        this.scene.add(this.helperGroup);

        // 複数選択時の一時グループ (まとめて移動させる用)
        this.multiGroup = new THREE.Group();
        this.scene.add(this.multiGroup);

        // トランスフォームコントロール (移動・回転・拡大縮小ツール)
        this.control = new TransformControls(this.camera, this.domElement);
        
        this.control.addEventListener('dragging-changed', (event) => {
            this.core.orbit.enabled = !event.value;
            
            if (event.value) {
                // ドラッグ開始時は初期状態の記録のみ
                this.dragStartObj = this.control.object;
                if (this.dragStartObj) {
                    this.initialState = {
                        position: this.dragStartObj.position.clone(),
                        rotation: this.dragStartObj.rotation.clone(),
                        scale: this.dragStartObj.scale.clone()
                    };
                }
            } else {
                // ★ドラッグ終了時 (End): 
                if (this.dragStartObj && this.initialState) {
                    const finalState = {
                        position: this.dragStartObj.position.clone(),
                        rotation: this.dragStartObj.rotation.clone(),
                        scale: this.dragStartObj.scale.clone()
                    };
                    const cmd = new TransformCommand(this.dragStartObj, this.initialState, finalState);
                    if (window.saveHistory) window.saveHistory(cmd);

                    // ★追加: 操作が完全に終わった瞬間に「１回だけ」物理ボディを再構築する
                    if (this.dragStartObj === this.multiGroup) {
                        this.selectedObjects.forEach(o => {
                            if (this.stageManager && this.stageManager.createPhysicsBody) {
                                this.stageManager.createPhysicsBody(o);
                            }
                        });
                    } else if (this.stageManager && this.stageManager.createPhysicsBody) {
                        this.stageManager.createPhysicsBody(this.dragStartObj);
                    }
                }
                
                this.syncUI();
                this.dragStartObj = null;
                this.initialState = null;
            }
        });

        // ★修正: ドラッグ中(change) はUIの更新だけを行い、物理の再構築は行わない！
        this.control.addEventListener('change', () => {
            if (this.symmetrySyncEnabled && this.selectedObjects.length === 1) {
                const obj = this.selectedObjects[0];
                if (obj.userData.mirrorPairId) {
                    let mirrorObj = null;
                    if (window.currentMode === 'character' && window.charEditor && window.charEditor.activeCharacter) {
                        mirrorObj = window.charEditor.activeCharacter.parts.find(p => p.uuid === obj.userData.mirrorPairId);
                    } else {
                        mirrorObj = this.stageManager.stageGroup.getObjectByProperty('uuid', obj.userData.mirrorPairId);
                    }

                    if (mirrorObj) {
                        mirrorObj.position.set(-obj.position.x, obj.position.y, obj.position.z);
                        mirrorObj.rotation.set(obj.rotation.x, -obj.rotation.y, -obj.rotation.z);
                        mirrorObj.scale.copy(obj.scale);
                        
                        // ★修正: ドラッグ中は鏡像オブジェクトの物理ボディも更新しない
                        // (終了時にまとめて行うため、ここは削除・コメントアウト)
                    }
                }
            }

            if (this.control.object && this.selectedObjects.length <= 1) {
                this.syncUI();
            }
            this.updateHelpers();

            // ★修正: ドラッグ中(change) は、重い createPhysicsBody ではなく
            // 超軽量な syncPhysicsBodyPosition を呼び出して、物理の箱だけを追従させる！
            this.selectedObjects.forEach(obj => {
                if (this.stageManager && this.stageManager.syncPhysicsBodyPosition) {
                    this.stageManager.syncPhysicsBodyPosition(obj);
                }
            });
        });
        this.scene.add(this.control);

        // イベント登録
        this._initEvents();
    }

    _initEvents() {
        // クリック判定 (Down -> Up の時間が短い時だけクリックとみなす)
        this.domElement.addEventListener('pointerdown', () => {
            this.pointerDownTime = Date.now();
        });

        this.domElement.addEventListener('pointerup', (e) => {
            this.onPointerUp(e);
        });
    }

    /**
     * クリック時の処理
     */
    onPointerUp(e) {
        // プレイ中やUI操作中は無視
        if (window.isPlaying || e.target.closest('aside') || e.target.closest('header') || e.target.closest('footer') || e.target.closest('#game-ui')) {
            return;
        }

        // 長押し(ドラッグ)の場合は無視
        if (Date.now() - this.pointerDownTime > 200) return;

        // マウス座標の正規化 (-1 ~ +1)
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // --- 判定対象の決定 (モード分岐) ---
        let targetObjects = [];
        const currentMode = window.currentMode || 'stage';

        if (currentMode === 'character') {
            // キャラモード: アクティブなキャラのパーツのみ対象
            if (window.charEditor && window.charEditor.activeCharacter) {
                // 親子関係があるため再帰的に探せるようにルートグループを渡す
                targetObjects = [window.charEditor.activeCharacter.rootGroup];
            }
        } else {
            // ステージモード: ステージ上の全オブジェクト
            targetObjects = this.stageManager.stageGroup.children;
        }

        // 交差判定 (第2引数 true で再帰チェック)
        const intersects = this.raycaster.intersectObjects(targetObjects, true);

        if (intersects.length > 0) {
            // 一番手前のオブジェクト
            // (Helperなどを除外するロジックが必要ならここに入れる)
            const hit = intersects[0].object;

            if (this.multiSelectEnabled || e.shiftKey) {
                // 複数選択モード
                this.toggleSelection(hit);
            } else {
                // 単一選択モード
                this.deselectAll();
                this.select(hit);
            }
        } else {
            // 何もないところをクリック
            if (!this.multiSelectEnabled && !e.shiftKey) {
                this.deselectAll();
            }
        }
    }

    /**
     * オブジェクトを選択状態にする
     */
    select(object) {
        if (this.selectedObjects.includes(object)) return;

        this.selectedObjects.push(object);

        // ★修正点2: 選択時に元の親を記録する
        if (!this.originalParents.has(object) && object.parent) {
            this.originalParents.set(object, object.parent);
        }

        // ヘルパー(枠線)の作成
        const box = new THREE.BoxHelper(object, 0xffff00);
        box.userData.target = object;
        this.helperGroup.add(box);

        this._updateSelectionState();
    }

    /**
     * オブジェクトの選択を解除する
     */
    deselect(object) {
        const idx = this.selectedObjects.indexOf(object);
        if (idx > -1) {
            this.selectedObjects.splice(idx, 1);
        }
        
        // ★修正点3: 解除時もマップから削除
        this.originalParents.delete(object);

        // ヘルパー削除
        const helper = this.helperGroup.children.find(h => h.userData.target === object);
        if (helper) {
            this.helperGroup.remove(helper);
            if(helper.dispose) helper.dispose();
        }

        this._updateSelectionState();
    }

    /**
     * 選択/解除をトグルする
     */
    toggleSelection(object) {
        if (this.selectedObjects.includes(object)) {
            this.deselect(object);
        } else {
            this.select(object);
        }
    }

    /**
     * 全選択解除
     */
    deselectAll() {
        this.selectedObjects = [];
        
        // ヘルパー全削除
        while (this.helperGroup.children.length > 0) {
            const h = this.helperGroup.children[0];
            this.helperGroup.remove(h);
            if(h.dispose) h.dispose();
        }
        
        // ★修正点4: 全解除時にマップもクリア
        this.originalParents.clear(); 

        this._updateSelectionState();
    }

    /**
     * 選択状態に応じてコントロール(Gizmo)を更新する
     * (複数選択時のグループ化処理など)
     */
    _updateSelectionState() {
        // まずコントロールを外す
        this.control.detach();

        // 既存の multiGroup の中身を元の親に戻す (グループ化解除)
        while (this.multiGroup.children.length > 0) {
            const child = this.multiGroup.children[0];
            
            // ★修正点5: 記録した元の親に戻すロジック
            const originalParent = this.originalParents.get(child);
            
            // 記録された親が存在し、かつそれがグループ（Group, Meshなど）であればそこに戻す
            if (originalParent && originalParent.isGroup) {
                 // World座標を維持したまま元の親に戻す
                originalParent.attach(child);
            } else {
                // 記録がないか、無効な場合は現在のモードのルートに戻す（フォールバック）
                const currentMode = window.currentMode || 'stage';
                if (currentMode === 'character' && window.charEditor && window.charEditor.activeCharacter) {
                    window.charEditor.activeCharacter.rootGroup.attach(child);
                } else {
                    this.stageManager.stageGroup.attach(child);
                }
            }
            
            // 処理を終えたのでマップから削除
            this.originalParents.delete(child);
        }
        
            // アウトライナーのハイライト更新 (main.jsのグローバル関数に依存)
        if (window.updateOutliner) window.updateOutliner();

        // 選択なし
        if (this.selectedObjects.length === 0) {
            // インスペクタを閉じる等の処理
            if (window.syncUI) window.syncUI(null);
            return;
        }

        // 単一選択
        if (this.selectedObjects.length === 1) {
            const obj = this.selectedObjects[0];
            this.control.attach(obj);
            if (window.syncUI) window.syncUI(obj);
        } 
        // 複数選択
        else {
            // 中心点を計算
            const center = new THREE.Vector3();
            this.selectedObjects.forEach(o => center.add(o.position));
            center.divideScalar(this.selectedObjects.length);

            // multiGroup を中心点に配置
            this.multiGroup.position.copy(center);
            this.multiGroup.rotation.set(0, 0, 0);
            this.multiGroup.scale.set(1, 1, 1);
            
            // 選択オブジェクトを multiGroup に入れる前に、元の親を記録しておく
            this.selectedObjects.forEach(o => {
                 // multiGroupに入れる前に、念のため元の親を再記録
                if (!this.originalParents.has(o) && o.parent) {
                    this.originalParents.set(o, o.parent);
                }
                this.multiGroup.attach(o);
            });

            // コントロールを multiGroup につける
            this.control.attach(this.multiGroup);
            
            // インスペクタは代表して最後のオブジェクトを表示
               if (window.syncUI) window.syncUI(this.selectedObjects[this.selectedObjects.length - 1]);
        }

        this.updateHelpers();
        
        // ★追加: 選択状態が変わったのでヒントの表示も更新する
        if (window.updateLiveHint) window.updateLiveHint();
    }

    /**
     * ヘルパーの位置更新 (アニメーションループから呼ばれる)
     */
    updateHelpers() {
        this.helperGroup.children.forEach(h => {
            if (h.userData.target) {
                h.update();
            }
        });
    }

    /**
     * UIとの同期 (main.jsの関数を呼ぶラッパー)
     */
    syncUI() {
        if (this.selectedObjects.length === 1) {
            if (window.syncUI) window.syncUI(this.selectedObjects[0]);
        }
    }

    // --- 外部操作用メソッド ---

    /**
     * トランスフォームモード変更 (move, rotate, scale)
     */
    setMode(mode) {
        this.control.setMode(mode);
    }

    /**
     * スナップ機能の切り替え
     */
    setSnap(enabled) {
        this.snapEnabled = enabled;
        this.control.setTranslationSnap(enabled ? 0.5 : null);
        this.control.setRotationSnap(enabled ? THREE.MathUtils.degToRad(15) : null);
        this.control.setScaleSnap(enabled ? 0.1 : null);
    }

    /**
     * 複数選択モードの切り替え
     */
    setMultiSelect(enabled) {
        this.multiSelectEnabled = enabled;
        if (!enabled) {
            // OFFにした瞬間、選択を解除するかどうかは仕様次第だが
            // ここでは維持する。クリック時に挙動が変わる。
        }
    }

      /**
     * 選択オブジェクトを直線上に整列させる
     * (端と端のオブジェクトを結ぶ直線上に、中間のオブジェクトを並べる)
     */
    alignLinear() {
        if (this.selectedObjects.length < 3) {
            alert("3つ以上のオブジェクトを選択してください");
            return;
        }

        if (window.saveHistory) window.saveHistory();

        // 1. 選択オブジェクトを位置でソートする（X軸またはZ軸で大きく離れている方を基準にする）
        // 簡易的に、最も離れている2点（始点と終点）を見つける
        const objs = [...this.selectedObjects];
        
        // 距離が最も遠いペアを探す（これが直線の両端になる）
        let maxDist = -1;
        let startObj = objs[0];
        let endObj = objs[1];

        for(let i=0; i<objs.length; i++) {
            for(let j=i+1; j<objs.length; j++) {
                const d = objs[i].position.distanceTo(objs[j].position);
                if (d > maxDist) {
                    maxDist = d;
                    startObj = objs[i];
                    endObj = objs[j];
                }
            }
        }

        // 始点と終点以外のオブジェクトリスト
        const middles = objs.filter(o => o !== startObj && o !== endObj);

        // 始点から終点へのベクトル
        const startPos = startObj.position.clone();
        const endPos = endObj.position.clone();
        const totalVec = endPos.clone().sub(startPos);
        const totalLen = totalVec.length();
        const dir = totalVec.clone().normalize();

        // 中間のオブジェクトを、始点からの距離順にソート（現在の位置を投影して順番を決める）
        middles.sort((a, b) => {
            const vecA = a.position.clone().sub(startPos);
            const distA = vecA.dot(dir); // 始点からの投影距離
            const vecB = b.position.clone().sub(startPos);
            const distB = vecB.dot(dir);
            return distA - distB;
        });

        // 配置（始点と終点の間を等分割して配置するならこれ）
        // 単なる「直線に乗せる」だけでなく「均等」も兼ねるのが一般的で使いやすい
        const count = objs.length;
        const step = totalLen / (count - 1);

        middles.forEach((obj, index) => {
            const i = index + 1; 
            const newPos = startPos.clone().add(dir.clone().multiplyScalar(step * i));
            
            // 位置適用
            obj.position.copy(newPos);
            
            // ★修正: createPhysicsBody() は重いので、軽量な syncPhysicsBodyPosition() に変更
            if (this.stageManager && this.stageManager.syncPhysicsBodyPosition) {
                this.stageManager.syncPhysicsBodyPosition(obj);
            }
        });
        this._updateSelectionState();
    }

    /**
     * 選択オブジェクトを均等間隔に配置する
     * (現在の並び順を維持しつつ、間隔だけ整える)
     */
    alignDistribute() {
        if (this.selectedObjects.length < 3) {
            alert("3つ以上のオブジェクトを選択してください");
            return;
        }
        
        if (window.saveHistory) window.saveHistory();

        // 主軸を判定 (Xの広がりが大きいか、Zの広がりが大きいか)
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        this.selectedObjects.forEach(o => {
            minX = Math.min(minX, o.position.x);
            maxX = Math.max(maxX, o.position.x);
            minZ = Math.min(minZ, o.position.z);
            maxZ = Math.max(maxZ, o.position.z);
        });

        const width = maxX - minX;
        const depth = maxZ - minZ;
        const isXAxis = width > depth; // X軸方向に並んでいるとみなす

        // 座標順にソート
        const sorted = [...this.selectedObjects].sort((a, b) => {
            return isXAxis ? (a.position.x - b.position.x) : (a.position.z - b.position.z);
        });

        // 端と端は動かさず、中身を均等配置
        const startPos = sorted[0].position.clone();
        const endPos = sorted[sorted.length - 1].position.clone();
        const totalVec = endPos.clone().sub(startPos);
        const count = sorted.length;
        const stepVec = totalVec.divideScalar(count - 1);

        for(let i = 1; i < count - 1; i++) {
            const obj = sorted[i];
            const newPos = startPos.clone().add(stepVec.clone().multiplyScalar(i));
            
            obj.position.copy(newPos);

            // ★修正: 同様に syncPhysicsBodyPosition() へ変更
            if (this.stageManager && this.stageManager.syncPhysicsBodyPosition) {
                this.stageManager.syncPhysicsBodyPosition(obj);
            }
        }
        this._updateSelectionState();
    }

    /**
     * 選択オブジェクトの色を一括変更
     */
    setSelectionColor(hexColor) {
        if (this.selectedObjects.length === 0) return;
        
        if (window.saveHistory) window.saveHistory();

        this.selectedObjects.forEach(obj => {
            if (obj.material && obj.material.color) {
                obj.material.color.set(hexColor);
                // キャラモードならパーツデータ更新などの考慮が必要だが
                // 現状の仕組みならMaterial変更だけで見た目は変わる
            }
        });
        
        // インスペクタ同期
        if (window.syncUI && this.selectedObjects.length === 1) {
            window.syncUI(this.selectedObjects[0]);
        }
    }
    setSymmetrySync(enabled) {
        this.symmetrySyncEnabled = enabled;
    }
}