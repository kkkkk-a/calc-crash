/* =========================================
   js/simpleGame.js (Refactored Core System)
   ========================================= */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EnemyController } from './EnemyController.js'; // ★修正: 大文字に変更
import { PlayerController } from './PlayerController.js'; 
import { InputManager } from './InputManager.js'; // ★追加

export class SimpleGameSystem {
    constructor(scene, world, camera, canvas, stageGroup) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;
        this.stageGroup = stageGroup;

        // ★★★ 修正箇所: グローバルアクセスの確保 ★★★
        window.simpleGame = this; 

        this.isPlaying = false;
        this.gameState = 'INIT'; 
         this.targetSpawnId = null;
        this.playerConfig = {
            speed: 1.0, jumpPower: 1.0, doubleJump: 0, maxHp: 100, maxSp: 100
        };
        this.currentHp = 100;
        this.currentSp = 100;
        this.inputManager = new InputManager(); // ★追加
        // InputManager の状態をそのまま Player に渡す
        this.input = this.inputManager.actions;
        
        this.player = new PlayerController(
            this.scene, 
            this.world, 
            this.camera, 
            this.input, 
            this.playerConfig, 
            this.stageGroup
        );
        
        this.enemies = [];
        this.uiBindings = {}; 
        this.elapsedTime = 0;
        this._onWindowResizeBound = this.onWindowResize.bind(this);
        window.addEventListener('resize', this._onWindowResizeBound);
        this.inventory = []; // 初期インベントリを空にする場合
        this.equipment = {}; // ★追加: 現在の装備 (部位名 -> アイテムデータ)
        this.lockOnTarget = null; // ★追加: 現在のロックオン対象
         this.selectedItem = null;
         this.activeReceivers = []; // ★追加
        this.editorCameraState = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() };
        this.activeReceivers = []; 
        this.isAutoRun = false; 

        // ★追加: GC最適化用の一時変数キャッシュ
        this._tmpQuatStart = new THREE.Quaternion();
        this._tmpQuatEnd = new THREE.Quaternion();
    }
    shouldGameLoopUpdate() {
        // EVENT中（チュートリアル等）は物理や移動を止めたいので false を返す
        // PLAYING, ATTACK, DAMAGE の時だけ物理を動かす
        return (this.gameState === 'PLAYING' || this.gameState === 'ATTACK' || this.gameState === 'DAMAGE');
    }

    applyConfig(config) {
        // ★修正: プレイヤーに関するすべての設定を確実に取り込む
        this.playerConfig = {
            speed: config.playerSpeed || 1.0,
            dashMult: config.dashMult !== undefined ? config.dashMult : 2.0,
            jumpPower: config.playerJump || 1.0,
            doubleJump: parseInt(config.doubleJump || 0),
            
            maxHp: config.maxHp || 100,
            hpRegen: config.hpRegen || 0,
            maxSp: config.maxSp || 100,
            spRegen: config.spRegen !== undefined ? config.spRegen : 20,
            spDelay: config.spDelay !== undefined ? config.spDelay : 1.0,
            
            spCostDash: config.spCostDash !== undefined ? config.spCostDash : 10,
            spCostJump: config.spCostJump !== undefined ? config.spCostJump : 15,
            spCostAtk: config.spCostAtk !== undefined ? config.spCostAtk : 20,
            lockonDist: config.lockonDist !== undefined ? config.lockonDist : 20, // ★追加
            baseAtk: config.baseAtk !== undefined ? config.baseAtk : 10,          // ★追加
            boundary: config.boundary || { x: 50, y: 50, z: 50 },
            boundaryMode: config.boundaryMode || 'block',
            fallDamage: config.fallDamage || true,
            fallHeight: config.fallHeight || 10,
            gravity: config.gravity !== undefined ? config.gravity : -20, 
            
            bgColor: config.bgColor,
            fogDensity: config.fogDensity,
            cameraMode: config.cameraMode,
            cameraDist: config.cameraDist,
            bgm: config.bgm || '' // ★追加: プレイヤー(システム)設定にBGMを記録
        };
        
        // プレイヤーコントローラーに最新設定を渡す
        this.player.playerConfig = this.playerConfig;
        
        // HP/SPの最大値が変わった可能性があるので適用
        this.currentHp = Math.min(this.currentHp, this.playerConfig.maxHp);
        this.currentSp = Math.min(this.currentSp, this.playerConfig.maxSp);
        this.player.currentHp = this.currentHp;
        this.player.currentSp = this.currentSp;
        
        // 物理エンジンの重力更新
        if (config.gravity !== undefined) {
            this.world.gravity.set(0, config.gravity, 0);
        }
    this.lives = config.lives !== undefined ? config.lives : 3;
        this.timeLimit = config.timeLimit || 0;
        this.timeLeft = this.timeLimit;
    }

    // --- SimpleGame.js の start メソッドを上書き ---

    start(enablePlayer = true, skipTitle = false) {
        // プレイ開始前にカメラ状態を保存
        this.editorCameraState.pos.copy(this.camera.position);
        this.editorCameraState.up.copy(this.camera.up);
        if (window.core && window.core.orbit) this.editorCameraState.target.copy(window.core.orbit.target);

        this.isPlaying = true;
        this.elapsedTime = 0;
        this.enablePlayerFunc = enablePlayer;

        // ★追加: 以前のゲーム状態（プレイヤーや敵）を完全にクリア
        this.player.removePlayer();
        this.cleanupEnemies();

        if (window.soundManager) {
            if (this.playerConfig.bgm) {
                window.soundManager.playBGM(this.playerConfig.bgm);
            } else {
                window.soundManager.stopBGM();
            }
        }

        if (skipTitle) {
            this.startGameplay(false); 
        } else {
            // ★タイトル画面モード
            this.gameState = 'TITLE';
            this.buildGameUI('title'); // UIエディタで「title」に設定した要素を表示
            
            // タイトル中はマウス操作（カメラ回転）ができるように OrbitControls を一時的に許可しても良い
            if (window.core && window.core.orbit) window.core.orbit.enabled = true;
        }
        this.onWindowResize(); 
    }
    startGameplay(isRestart = false) {
        this.gameState = 'PLAYING';
        this.buildGameUI('hud'); 
        
        const uiContainer = document.getElementById('game-ui');
        if (uiContainer) uiContainer.style.pointerEvents = 'auto';

        // ★修正: リスタート時は、すでに集めたフラグの数(collectedFlags)をゼロに戻さない
        this.totalFlags = 0;
        if (!isRestart) {
            this.collectedFlags = 0;
            this.elapsedTime = 0; // タイムリセットも最初から遊ぶ時だけ
        }

        if (this.stageGroup) {
            this.stageGroup.traverse(obj => {
                if (obj.userData.role === 'goal_flag') this.totalFlags++;
            });
        }

        if (this.enablePlayerFunc) {
            let playerCharData = null;
            let foundStartPos = null; // ★追加
            let fallbackStartPos = null; // ★追加: 見つからなかった時用の保険
            let finalStartObj = null;
             this.stageGroup.traverse(obj => {
                if (obj.userData.role === 'start') {
                    // とりあえず最初に見つけたスタート地点を保険としてキープ
                    if (!fallbackStartPos) {
                        fallbackStartPos = obj.position.clone();
                        finalStartObj = obj;
                    }
                    
                    // IDが指定されており、それが一致する場合（本命）
                    if (this.targetSpawnId && obj.userData.roleParams && obj.userData.roleParams.mySpawnId === this.targetSpawnId) {
                        foundStartPos = obj.position.clone();
                        finalStartObj = obj;
                    }
                }
            });

            // 本命がなければ保険を使い、それでもなければ(0,5,0)を使う
            const spawnPosToUse = foundStartPos || fallbackStartPos;

            if (finalStartObj && finalStartObj.userData.roleParams && finalStartObj.userData.roleParams.playerModel) {
                const modelName = finalStartObj.userData.roleParams.playerModel;
                const charList = window.charEditor ? window.charEditor.characters : (window.embeddedGameProject ? window.embeddedGameProject.characters : []);
                const found = charList.find(c => c.name === modelName);
                if (found) playerCharData = window.charEditor ? window.charEditor.getCharacterData(found) : found;
            }

            this.player.charData = playerCharData; 
            this.player.currentHp = this.playerConfig.maxHp;
            this.player.currentSp = this.playerConfig.maxSp || 100;
            
            // ★追加: 見つけた地点をスポーン位置として渡す
            if (spawnPosToUse) {
                this.player.spawnPoint.copy(spawnPosToUse);
            }
            this.player.initSpawn(isRestart);
            this.setupControls();
        }

        this.spawnEnemies(); 
    }
  gameClear() {
        if (this.gameState === 'RESULT') return;
        this.gameState = 'RESULT';
        
        // プレイヤーの操作を無効化（入力リセット）
        this.input = { x: 0, y: 0, camX: 0, camY: 0, jump: false, attack: false };
        this.player.body.velocity.set(0, 0, 0); // 完全に静止させる

        // ★追加: クリアタイムの計算とフォーマット
        const m = Math.floor(this.elapsedTime / 60);
        const s = Math.floor(this.elapsedTime % 60);
        const timeStr = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        
        // UIをリザルト画面に切り替え
        this.buildGameUI('result');

        // ★追加: 構築されたUIの紐付け変数に、クリアデータを直接書き込む
        if (this.uiBindings['result_time']) {
            this.uiBindings['result_time'].element.innerText = `クリアタイム: ${timeStr}`;
        }
        if (this.uiBindings['result_score']) {
            if (this.totalFlags > 0) {
                this.uiBindings['result_score'].element.innerText = `フラグ回収: ${this.collectedFlags} / ${this.totalFlags}`;
            } else {
                this.uiBindings['result_score'].element.innerText = ``; // フラグがないステージなら空白にする
            }
        }
        
        // ポインターイベント有効化
        const uiContainer = document.getElementById('game-ui');
        if (uiContainer) uiContainer.style.pointerEvents = 'auto';
        
        // 祝福のエフェクトを出す
        if (window.effectManager) {
             window.effectManager.spawnEffect('hit', this.player.mesh.position, 0xffff00);
        }
    }
    // --- 受信機を起動するロジック ---
activateReceiver(targetId) {
        this.stageGroup.traverse(obj => {
            if (obj.userData.role === 'receiver' && obj.userData.roleParams.myId === targetId) {
                const params = obj.userData.roleParams;
                const type = params.actionType;

                // 動く床(kinematic)の起動
                if (type === 'activate_kinematic') {
                    const body = window.stage.physicsMap.get(obj.uuid);
                    if (body && body.userData.kinematicLogic) {
                        body.userData.kinematicLogic.isActive = !body.userData.kinematicLogic.isActive; // トグル式
                    }
                    if (window.effectManager) window.effectManager.spawnEffect('hit', obj.position);
                    return;
                }

                // 表示切替
                if (type === 'visibility') {
                    obj.visible = !obj.visible;
                    const body = window.stage.physicsMap.get(obj.uuid);
                    if (body) body.collisionResponse = obj.visible; // 消えたらすり抜けられるようにする
                    if (window.effectManager) window.effectManager.spawnEffect('hit', obj.position);
                    return;
                }

                // --- 移動・回転のセットアップ ---
                const duration = parseFloat(params.duration) || 1.0;
                let targetPos = obj.position.clone();
                let targetRot = new THREE.Euler().copy(obj.rotation);
                
                // 現在の状態（開いているか、閉じているか）を反転
                if (obj.userData.isOpen === undefined) obj.userData.isOpen = false;
                let dir = obj.userData.isOpen ? -1 : 1; 

                // 文字列を安全に数値に変換する
                if (type === 'transform_move' && params.moveOffset) {
                    const offset = params.moveOffset.split(',').map(v => parseFloat(v.trim()));
                    if (offset.length === 3 && !offset.some(isNaN)) {
                        targetPos.x += offset[0] * dir;
                        targetPos.y += offset[1] * dir;
                        targetPos.z += offset[2] * dir;
                    }
                }
                else if (type === 'transform_rotate' && params.rotateOffset) {
                    const rot = params.rotateOffset.split(',').map(v => parseFloat(v.trim()) * (Math.PI / 180));
                    if (rot.length === 3 && !rot.some(isNaN)) {
                        targetRot.x += rot[0] * dir;
                        targetRot.y += rot[1] * dir;
                        targetRot.z += rot[2] * dir;
                    }
                }

                obj.userData.isOpen = !obj.userData.isOpen; // 状態更新

                // 既に動いているなら古いアニメーションをキャンセル
                const existingIdx = this.activeReceivers.findIndex(r => r.obj === obj);
                if (existingIdx > -1) this.activeReceivers.splice(existingIdx, 1);

                // アニメーションキューに登録
                this.activeReceivers.push({
                    obj: obj,
                    startPos: obj.position.clone(),
                    endPos: targetPos,
                    startRot: obj.rotation.clone(),
                    endRot: targetRot,
                    time: 0,
                    duration: Math.max(0.1, duration) // 0除算防止
                });

                if (window.effectManager) window.effectManager.spawnEffect('hit', obj.position);
            }
        });
    }

    // --- 追加：アニメーションの毎フレーム処理 ---
    _updateReceivers(dt) {
        for (let i = this.activeReceivers.length - 1; i >= 0; i--) {
            const anim = this.activeReceivers[i];
            anim.time += dt;
            let progress = anim.time / anim.duration;
            let isFinished = false;

            if (progress >= 1.0) {
                progress = 1.0;
                isFinished = true;
            }

            // 滑らかな動き（イージング）
            const ease = progress * progress * (3 - 2 * progress);

            // メッシュの更新
            anim.obj.position.lerpVectors(anim.startPos, anim.endPos, ease);
            this._tmpQuatStart.setFromEuler(anim.startRot);
            this._tmpQuatEnd.setFromEuler(anim.endRot);
            anim.obj.quaternion.copy(this._tmpQuatStart).slerp(this._tmpQuatEnd, ease);

            // 物理エンジンの直接上書き（ワープではないので上に乗れる）
            if (window.stage && window.stage.physicsMap) {
                const body = window.stage.physicsMap.get(anim.obj.uuid);
                if (body) {
                    body.position.copy(anim.obj.position);
                    body.quaternion.copy(anim.obj.quaternion);
                    
                    // 動いている間だけ速度を与える（上に乗っているプレイヤーを運ぶため）
                    if (dt > 0) {
                        body.velocity.set(
                            (anim.endPos.x - anim.startPos.x) / anim.duration,
                            (anim.endPos.y - anim.startPos.y) / anim.duration,
                            (anim.endPos.z - anim.startPos.z) / anim.duration
                        );
                    }
                }
            }

            if (isFinished) {
                // 停止時に速度をゼロにする
                if (window.stage && window.stage.physicsMap) {
                    const body = window.stage.physicsMap.get(anim.obj.uuid);
                    if (body) body.velocity.set(0, 0, 0);
                }
                this.activeReceivers.splice(i, 1);
            }
        }
    }
    gameOver() {
        if (this.gameState === 'GAMEOVER') return;
        this.gameState = 'GAMEOVER';
        
        this.player.removePlayer(); 
        this.cleanupControls();
        
        this.buildGameUI('gameover');
        
        const uiContainer = document.getElementById('game-ui');
        if (uiContainer) uiContainer.style.pointerEvents = 'auto';
    }
    restartGame() {
        this.stop(); 
        
        // ★修正: 複雑なスナップショット復元をやめ、「いま遊んでいたステージ」をロードし直すことで
        // 壊れた壁、敵のHP、動く床などを完璧に初期状態に戻します。
        if (window.ioManager) {
            // ステータスを全回復させるために、リスタート前にプレイヤー内部値をリセット
            this.player.currentHp = this.playerConfig.maxHp;
            this.player.currentSp = this.playerConfig.maxSp || 100;
            
            // 現在のステージを「遷移モード」でロードし直す
            const currentStage = window.ioManager.currentStageName;
            window.ioManager.loadStageFromURL(currentStage, true, this.targetSpawnId);
        }
    }
    returnToTitle() {
        this.stop();
        this.start(true); 
    }

     openMenu() {
        if (this.gameState !== 'PLAYING') return;
        this.gameState = 'MENU';
        this._resetInput(); // ★追加: メニューを開いた瞬間にキー入力をクリア
        this.buildGameUI('menu');
    }

    triggerEventUI(screenId, pauseGame) {
        if (this.gameState === 'GAMEOVER' || this.gameState === 'RESULT') return;
        
        if (pauseGame) {
            this.gameState = 'EVENT'; 
            this._resetInput(); // ★追加: イベント発生時もキー入力をクリア
            this.player.body.velocity.set(0, 0, 0); // その場で止める
        }

        this.buildGameUI(screenId);
    }

    showDialogue(speakerName, messageText, bindKeyName, bindKeyText) {
        if (this.gameState === 'GAMEOVER' || this.gameState === 'RESULT') return;
        
        // ★UIに宛先ID(Data Bind)が設定されているかチェック
        const nameEl = this.uiBindings[bindKeyName || 'dialogue_name'];
        const textEl = this.uiBindings[bindKeyText || 'dialogue_text'];

        if (nameEl) nameEl.element.innerText = speakerName;
        if (textEl) textEl.element.innerText = messageText;
    } toggleLockOn() {
        if (this.lockOnTarget) {
            this.lockOnTarget = null;
            if (window.showNotification) window.showNotification("🔓 ロックオン解除");
            return;
        }

        let closest = null;
        // ★修正: ワールド設定からロックオン距離を取得
        let minDist = this.playerConfig.lockonDist || 20; 
        const plrPos = this.player.mesh.position;

        this.enemies.forEach(en => {
            if (en.state === 'dead' || !en.meshGroup) return;
            const d = en.meshGroup.position.distanceTo(plrPos);
            if (d < minDist) {
                minDist = d;
                closest = en;
            }
        });

        if (closest) {
            this.lockOnTarget = closest;
            if (window.showNotification) window.showNotification("🎯 ロックオン: " + closest.charData.name);
        }
    }
_equipItem(item, index) {
        const slot = item.equipSlot || 'weapon';
        
        // 既に何か装備していたらインベントリに戻す
        if (this.equipment[slot]) {
            this.inventory.push(this.equipment[slot]);
        }

        // 新しいアイテムを装備
        this.equipment[slot] = item;
        this.inventory.splice(index, 1); // インベントリから消す

        if (window.showNotification) window.showNotification(`🛡️ ${item.name} を装備しました (${slot})`);
        
        // プレイヤーの最終ステータスと見た目を更新
        this.player.updateFinalStats();
        this.player.updateEquippedMeshes(); 

        this.updateUI();
        this.buildGameUI('menu'); // メニューリフレッシュ
    }

     _resetInput() {
         this.input.x = 0;
        this.input.y = 0;
        this.input.camX = 0;
        this.input.camY = 0;
        this.input.jump = false;
        this.input.attack = false;
        this.input.dash = false;
        this.input.step = false;
        this.input.jumpHeld = false;
        
        if (this._keys) {
            this._keys.w = false;
            this._keys.a = false;
            this._keys.s = false;
            this._keys.d = false;
        }

        if (this.player && this.player.body) {
            this.player.body.velocity.set(0, 0, 0);
            this.player.body.angularVelocity.set(0, 0, 0);
        }
    }

    closeMenu() {
        if (this.gameState !== 'MENU') return;
        this.gameState = 'PLAYING';
        this.buildGameUI('hud');
    }



    stop() {
        this.isPlaying = false;
         if (window.soundManager) window.soundManager.stopBGM();
        this.activeReceivers = [];
        const uiScreen = document.getElementById('ui-game-screen');
        const uiContainer = document.getElementById('game-ui');
        if(uiScreen) uiScreen.innerHTML = ''; 
        if(uiContainer) {
            uiContainer.style.display = 'none';
            uiContainer.style.pointerEvents = 'none'; 
        }
        
        this.player.removePlayer();
        this.cleanupEnemies();
        this.cleanupControls();
        this.activeReceivers = [];

        // ★追加: カメラの角度と位置をテストプレイ前の状態に完全復元する
        this.camera.position.copy(this.editorCameraState.pos);
        this.camera.up.copy(this.editorCameraState.up); // 重力で狂ったカメラの「上」を戻す
        this.camera.lookAt(this.editorCameraState.target);
        
        if (window.core && window.core.orbit) {
            window.core.orbit.target.copy(this.editorCameraState.target);
            window.core.orbit.update(); // OrbitControlにも変更を通知
        }
        window.removeEventListener('resize', this._onWindowResizeBound);
    }

    update(dt) {
        if (!this.isPlaying) return;

        if (this.shouldGameLoopUpdate()) {
            this.updateInputState(); // ★追加: 毎フレーム入力を最新化する
            this._updateReceivers(dt);
            // 制限時間のカウントダウン
            if (this.timeLimit > 0) {
                this.timeLeft -= dt;
                if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this.gameOver(); // 時間切れ
                }
            }
            this.elapsedTime += dt;
            this.player.update(dt);
            
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const enemy = this.enemies[i];
                enemy.update(dt, this.player.body); 
                
                if (enemy.state === 'dead') {
                    // ★追加: 死んだ敵がロックオン対象なら解除する
                    if (this.lockOnTarget === enemy) this.lockOnTarget = null;

                    this.enemies.splice(i, 1);
                    this.collectedFlags++; 
                    if (window.showNotification) window.showNotification("💀 敵を撃破！");
                }
            }
        }
        
        this.updateUI(); 
    }

takeDamage(amount) {
        // ダメージ計算の実体は PlayerController に任せる
        if (this.player) {
            this.player.takeDamage(amount);
        }
    }

    notifyDamage(amount) {
        // Playerからの通知を受け取り、UIを更新し、死亡判定を行う
        this.currentHp = this.player.currentHp;
        this.updateUI();

        if (this.currentHp <= 0 && this.gameState !== 'GAMEOVER') {
            this.gameOver();
        }
    }
    notifySp() {
        this.currentSp = this.player.currentSp;
        this.updateUI();
    }
    spawnEnemies() {
        if (!this.stageGroup) return;
        this.enemies =[]; 

        // 高さ計算用のRaycasterを用意
        const raycaster = new CANNON.RaycastResult();

        // 共通のキャラリスト取得
        let charList =[];
        if (window.charEditor && window.charEditor.characters) charList = window.charEditor.characters;
        else if (window.embeddedGameData && window.embeddedGameData.characters) charList = window.embeddedGameData.characters;

        this.stageGroup.traverse(obj => {
            // --- パターンA: 固定スポーン ---
            if (obj.userData.role === 'enemy_spawn') {
                const params = obj.userData.roleParams || {};
                const enemyType = params.enemyType || 'Zombie'; 
                const spawnPos = new THREE.Vector3();
                obj.getWorldPosition(spawnPos);

                const liveCharObject = charList.find(c => c.name === enemyType);
                if (liveCharObject) {
                    const charDataForSpawning = window.charEditor ? window.charEditor.getCharacterData(liveCharObject) : liveCharObject;
                    const enemy = new EnemyController(charDataForSpawning, spawnPos, this.scene, this.world);
                    this.enemies.push(enemy);
                }
            }
            // --- ★パターンB: 乱数配置スポーン ---
            else if (obj.userData.role === 'random_spawner') {
                const params = obj.userData.roleParams || {};
                if (params.spawnType !== 'enemy') return; 

                const enemyType = params.targetId || 'Zombie';
                const amount = params.amount || 3;
                const radius = params.radius || 10;
                
                const centerPos = new THREE.Vector3();
                obj.getWorldPosition(centerPos);

                const liveCharObject = charList.find(c => c.name === enemyType);
                if (!liveCharObject) return;
                const charDataForSpawning = window.charEditor ? window.charEditor.getCharacterData(liveCharObject) : liveCharObject;

                for (let i = 0; i < amount; i++) {
                    // 円の内部のランダムなX, Z座標を生成 (Math.sqrtを使うと均等に散らばる)
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.sqrt(Math.random()) * radius; 
                    const randX = centerPos.x + Math.cos(angle) * r;
                    const randZ = centerPos.z + Math.sin(angle) * r;

                    // ★重要: 上空からRayを落として地面(Y座標)を特定する
                    const rayStart = new CANNON.Vec3(randX, centerPos.y + 2, randZ);
                    const rayEnd = new CANNON.Vec3(randX, centerPos.y - 50, randZ);
                    const ray = new CANNON.Ray(rayStart, rayEnd);
                    ray.collisionFilterMask = 1; // Stageのみと判定

                    ray.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST, result: raycaster });
                    
                    let spawnY = centerPos.y;
                    if (raycaster.hasHit) {
                        spawnY = raycaster.hitPointWorld.y + 0.5; // 地面から少し浮かせて配置
                    }

                    const spawnPos = new THREE.Vector3(randX, spawnY, randZ);
                    const enemy = new EnemyController(charDataForSpawning, spawnPos, this.scene, this.world);
                    this.enemies.push(enemy);
                }
            }
        });
    }

    cleanupEnemies() {
        this.enemies.forEach(enemy => {
            // 敵が持っている弾もすべて回収
            if (enemy.projectiles) {
                enemy.projectiles.forEach(p => {
                    ProjectilePool.releaseMesh(p.type, p.mesh);
                });
            }
            enemy.die(true);
        });
        this.enemies = [];
    }

 setupControls() {
        this.inputManager.start();

        // 毎フレームの入力をPlayerController用の変数(x, yなど)に変換する更新ループ
        // ※SimpleGameのupdate(dt)の中で呼ぶようにします
    }

    cleanupControls() {
        this.inputManager.stop();
    }
    
    updateInputState() {
        // ジョイスティックまたはボタン入力を反映
        let mX = this.inputManager.axisX || (this.inputManager.actions.right ? 1 : (this.inputManager.actions.left ? -1 : 0));
        let mY = this.inputManager.axisY || (this.inputManager.actions.down ? 1 : (this.inputManager.actions.up ? -1 : 0));
        
        // ★追加: オートランが有効なら、強制的に前進方向(-1)へ入力し続ける
        if (this.isAutoRun) {
            mY = -1;
        }

        this.input.x = mX;
        this.input.y = mY;
        
        this.input.camX = this.inputManager.camAxisX || (this.inputManager.actions.camRight ? 1 : (this.inputManager.actions.camLeft ? -1 : 0));
        this.input.camY = this.inputManager.camAxisY || (this.inputManager.actions.camDown ? 1 : (this.inputManager.actions.camUp ? -1 : 0));

        // 押した瞬間のトリガー系処理
        if (this.inputManager.isTriggered('interact')) {
            this.input.interact = true;
        }
        if (this.inputManager.isTriggered('jump')) {
            this.input.jump = true;
        }
        if (this.inputManager.isTriggered('step')) {
            this.input.step = true;
        }
        if (this.inputManager.isTriggered('attack')) {
            const attackCost = this.playerConfig.spCostAtk !== undefined ? this.playerConfig.spCostAtk : 20;
            if (this.player.consumeSp(attackCost)) {
                this.player.executeAttack(); 
            } else {
                if (window.effectManager) window.effectManager.showEmote(this.player.mesh, 'sweat');
            }
        }

        // 押しっぱなし系のフラグ
        this.input.jumpHeld = this.inputManager.actions.jump; 
        this.input.dash = this.inputManager.actions.dash;
    }

    buildGameUI(targetScreen = 'hud') {
        // ★追加: 以前に登録されたグローバルイベント(ドラッグ操作など)を確実に解除
        if (this._windowEventCleanups && this._windowEventCleanups.length > 0) {
            this._windowEventCleanups.forEach(fn => fn());
            this._windowEventCleanups =[];
        }

        const gameUI = document.getElementById('ui-game-screen'); 
        if (!gameUI) return;
        gameUI.innerHTML = '';
        this.uiBindings = {};
        this.uiCache = { hp: -1, hpBar: -1, time: '' };

        let fullData = {};
        if (window.embeddedGameData) {
            fullData = window.embeddedGameData; 
        } else if (window.uiEditor && window.uiEditor.exportData && window.ioManager) {
            fullData.ui = window.uiEditor.exportData(); 
        } else { return; }
        
        let allUiData = fullData.ui || [];
        let screenData = allUiData.filter(u => u.props.screenId === targetScreen && u.props.visible);
        if (screenData.length === 0) screenData = this._getDefaultUIData(targetScreen);

        const uiContainer = document.getElementById('game-ui');
        if (uiContainer) {
            uiContainer.style.display = 'flex'; 

            // HUD(操作画面)以外の時は背景クリックを有効にする
            const needsAutoPointer = (targetScreen !== 'hud');
            uiContainer.style.pointerEvents = needsAutoPointer ? 'auto' : 'none';

            // 会話シーンの時だけ、どこを押しても再開するイベントを登録
            if (targetScreen === 'dialogue') {
                const resumeFromClick = (e) => {
                    // スマホでの誤動作防止
                    if(e.type === 'touchstart') e.preventDefault(); 
                    
                    if (this.gameState === 'EVENT') {
                        this.gameState = 'PLAYING';
                        this.buildGameUI('hud');
                        if (this.player && this.player.body) this.player.body.wakeUp();
                        this._resetInput();
                        window.focus();
                    }
                    uiContainer.removeEventListener('mousedown', resumeFromClick);
                    uiContainer.removeEventListener('touchstart', resumeFromClick); // ★追加
                };
                uiContainer.addEventListener('mousedown', resumeFromClick);
                uiContainer.addEventListener('touchstart', resumeFromClick, { passive: false }); // ★追加
            }
        }

        
        screenData.forEach(data => {
            const el = document.createElement('div');
            const p = data.props;
            el.style.position = 'absolute';
            el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
            el.style.width = p.width + 'px'; el.style.height = p.height + 'px';
            el.style.backgroundColor = p.bgColor; el.style.color = p.color;
            el.style.fontSize = p.fontSize + 'px';
            el.style.border = `${p.borderWidth}px solid ${p.borderColor}`;
            el.style.borderRadius = p.radius + 'px';
            el.style.opacity = p.opacity;
            el.style.zIndex = p.zIndex + 100;
            el.style.boxSizing = 'border-box';
            el.style.pointerEvents = 'auto';

            if (p.dataBind === 'inventory_list') this._renderInventoryItems(el);
 if (p.dataBind === 'assemble_stats') this._renderAssembleStats(el);
            if (p.dataBind === 'equip_slots_list') this._renderEquipSlots(el);
            if (p.dataBind === 'equip_inventory_list') this._renderEquipInventory(el);
            if (p.dataBind === 'selected_item_stats') this._renderSelectedItemDetails(el);
            if (data.type === 'slider') {
                const input = document.createElement('input');
                input.type = 'range';
                input.min = "0"; input.max = "1"; input.step = "0.05";
                input.style.width = '100%'; input.style.height = '100%';
                input.style.margin = "0";
                
                if (p.dataBind === 'set_bgm_vol') {
                    input.value = window.gameSettings.bgmVolume;
                    input.oninput = (e) => {
                        window.gameSettings.bgmVolume = parseFloat(e.target.value);
                        if (window.soundManager) window.soundManager.bgmAudio.setVolume(window.gameSettings.bgmVolume);
                    };
                } else if (p.dataBind === 'set_se_vol') {
                    input.value = window.gameSettings.seVolume;
                    input.oninput = (e) => window.gameSettings.seVolume = parseFloat(e.target.value);
                } else if (p.dataBind === 'set_fps') {
                    input.min = "15"; input.max = "60"; input.step = "15";
                    input.value = window.gameSettings.targetFPS;
                    input.oninput = (e) => window.gameSettings.targetFPS = parseInt(e.target.value);
                }
                
                el.appendChild(input);
                el.style.backgroundColor = 'transparent';
            } 
            else if (data.type === 'radar') {
                const canvas = document.createElement('canvas');
                canvas.width = p.width; canvas.height = p.height;
                canvas.style.borderRadius = '50%';
                el.appendChild(canvas);
                this.uiBindings[p.dataBind] = { canvas: canvas, ctx: canvas.getContext('2d') };
            }
            else if (data.type === 'joystick') {
                el.className = 'game-joystick-base';
                const knob = document.createElement('div');
                knob.className = 'game-joystick-knob';
                knob.style.position = 'absolute'; knob.style.width = '40%'; knob.style.height = '40%';
                knob.style.backgroundColor = p.borderColor || '#fff'; knob.style.borderRadius = '50%';
                knob.style.top = '30%'; knob.style.left = '30%'; knob.style.pointerEvents = 'none';
                el.appendChild(knob);
                
                if (p.dataBind === 'camera_input') {
                    this._setupJoystick(el, knob, p.radius || 50, (x, y) => { this.inputManager.setVirtualCamAxis(x, y); });
                } else if (p.dataBind === 'move_input' || !p.dataBind) {
                    this._setupJoystick(el, knob, p.radius || 50, (x, y) => { this.inputManager.setVirtualAxis(x, y); });
                }
            }
            else if (data.type === 'button') {
                el.style.display = 'flex'; 
                el.style.justifyContent = 'center'; 
                el.style.alignItems = 'center';
                el.style.cursor = 'pointer'; 
                el.innerText = p.text || ''; 
                el.style.fontWeight = 'bold';
                el.style.lineHeight = '1'; 
                el.style.textAlign = 'center';
                el.style.padding = '0';
                this._bindAction(el, p.action, p.actionTarget, p.clickSound);
            } 
            else if (data.type === 'image' && p.imageUrl) {
                el.style.backgroundImage = `url(${p.imageUrl})`;
                el.style.backgroundSize = 'cover'; el.style.backgroundRepeat = 'no-repeat';
            }
            else if (data.type === 'text') {
                el.innerText = p.text || ''; 
                el.style.display = 'flex'; 
                el.style.alignItems = 'center';
                el.style.justifyContent = (p.align === 'left' ? 'flex-start' : (p.align === 'right' ? 'flex-end' : 'center'));
                el.style.lineHeight = '1'; 
            }
            else if (data.type === 'panel') { 
                // ★修正: パネルの時だけ中身を空にする
                el.innerText = ''; 
            }

            if (p.dataBind) {
                // radar用の canvas, ctx を上書きしないようにマージする
                this.uiBindings[p.dataBind] = { 
                    ...(this.uiBindings[p.dataBind] || {}), // radar等で設定済みのものがあれば維持
                    element: el, 
                    type: data.type, 
                    originalWidth: p.width,
                    props: p 
                };
            }
            gameUI.appendChild(el);
        });

        // setTimeoutの位置は完璧です！
        setTimeout(() => {
            this.updateUI();
        }, 10);
    }
    _getDefaultUIData(screenId) { return []; }

     _setupJoystick(base, knob, radius, callback) {
        let isDragging = false; 
        let baseCenter = { x: 0, y: 0 };
        let touchId = null; // ★追加: タッチしている指のID

        const onStart = (clientX, clientY, id = null) => {
            isDragging = true;
            touchId = id;
            const rect = base.getBoundingClientRect();
            baseCenter.x = rect.left + rect.width / 2; 
            baseCenter.y = rect.top + rect.height / 2;
            onMove(clientX, clientY, id);
        };

        const onMove = (clientX, clientY, id = null) => {
            if (!isDragging || (touchId !== null && touchId !== id)) return;
            let dx = clientX - baseCenter.x; 
            let dy = clientY - baseCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDist = (base.clientWidth / 2) * 0.8;
            const deadzone = 10; // ★追加: デッドゾーン (10px以内は無視)

            if (distance < deadzone) {
                dx = 0; dy = 0;
            } else if (distance > maxDist) { 
                const ratio = maxDist / distance; 
                dx *= ratio; dy *= ratio; 
            }
            
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
            
            // ★修正: デッドゾーン内なら完全な 0 を返す
            if (distance < deadzone) {
    if (callback) callback(0, 0);
} else {
    // 入力値を-1.0〜1.0の範囲に収める
    const normX = dx / maxDist;
    const normY = dy / maxDist;
    if (callback) callback(normX, normY);
}
        };
        const onEnd = (id = null) => {
            if (touchId !== null && touchId !== id) return;
            isDragging = false; 
            touchId = null;
            knob.style.transform = `translate(0px, 0px)`;
            if (callback) callback(0, 0);
        };

        // タッチイベント
        base.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            const t = e.changedTouches[0];
            onStart(t.clientX, t.clientY, t.identifier); 
        }, { passive: false });

        base.addEventListener('touchmove', (e) => { 
            e.preventDefault(); 
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === touchId) onMove(t.clientX, t.clientY, t.identifier);
            }
        }, { passive: false });

        base.addEventListener('touchend', (e) => { 
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === touchId) onEnd(touchId);
            }
        });

        // マウスイベント (PC用)
        base.addEventListener('mousedown', (e) => {
            onStart(e.clientX, e.clientY, 'mouse');
            const move = (ev) => onMove(ev.clientX, ev.clientY, 'mouse');
            const up = () => { 
                onEnd('mouse'); 
                window.removeEventListener('mousemove', move); 
                window.removeEventListener('mouseup', up); 
            };
            window.addEventListener('mousemove', move); 
            window.addEventListener('mouseup', up);
        });
    }


    _bindAction(el, action, target, clickSoundId) {
        const originalBgColor = el.style.backgroundColor;

        // ★追加: 押しっぱなしにするアクションのリスト
        const pushActions = {
            'move_up': 'up',
            'move_down': 'down',
            'move_left': 'left',
            'move_right': 'right',
            'cam_up': 'camUp',
            'cam_down': 'camDown',
            'cam_left': 'camLeft',
            'cam_right': 'camRight'
        };

        // ★追加: 移動・カメラ用の押しっぱなし処理
        if (pushActions[action]) {
            const inputKey = pushActions[action];
            const startPush = () => { this.inputManager.setVirtualAction(inputKey, true); };
            const stopPush = () => { this.inputManager.setVirtualAction(inputKey, false); };
            
            el.addEventListener('mousedown', (e) => { e.stopPropagation(); startPush(); });
            el.addEventListener('mouseup', stopPush);
            el.addEventListener('mouseleave', stopPush);
            el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); startPush(); }, { passive: false });
            el.addEventListener('touchend', stopPush);
            el.addEventListener('touchcancel', stopPush);
            return;
        }

        // ダッシュ・ジャンプ・ステップの押しっぱなし処理
        if (action === 'dash') {
            const startDash = () => { this.inputManager.setVirtualAction('dash', true); };
            const stopDash = () => { this.inputManager.setVirtualAction('dash', false); };
            el.addEventListener('mousedown', (e) => { e.stopPropagation(); startDash(); });
            el.addEventListener('mouseup', stopDash);
            el.addEventListener('mouseleave', stopDash);
            el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); startDash(); }, { passive: false });
            el.addEventListener('touchend', stopDash);
            el.addEventListener('touchcancel', stopDash);
            return;
        }

        if (action === 'jump') {
            const startJump = () => { this.inputManager.setVirtualAction('jump', true); };
            const stopJump = () => { this.inputManager.setVirtualAction('jump', false); };
            el.addEventListener('mousedown', (e) => { e.stopPropagation(); startJump(); });
            el.addEventListener('mouseup', stopJump);
            el.addEventListener('mouseleave', stopJump);
            el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); startJump(); }, { passive: false });
            el.addEventListener('touchend', stopJump);
            return;
        }

        if (action === 'step') {
            const triggerStep = () => { this.inputManager.setVirtualAction('step', true); };
            const stopStep = () => { this.inputManager.setVirtualAction('step', false); };
            el.addEventListener('mousedown', (e) => { e.stopPropagation(); triggerStep(); });
            el.addEventListener('mouseup', stopStep);
            el.addEventListener('mouseleave', stopStep);
            el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); triggerStep(); }, { passive: false });
            el.addEventListener('touchend', stopStep);
            return;
        }

        // ★追加: オートラン（トグル）処理
        if (action === 'auto_forward') {
            const toggleAutoRun = () => {
                this.isAutoRun = !this.isAutoRun;
                // 色を変えてON/OFFを分かりやすくする
                el.style.backgroundColor = this.isAutoRun ? '#ff9800' : originalBgColor;
                if (window.showNotification) {
                    window.showNotification(this.isAutoRun ? "⏩ オートラン: ON" : "🛑 オートラン: OFF");
                }
            };
            el.addEventListener('mousedown', (e) => { e.stopPropagation(); toggleAutoRun(); });
            el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggleAutoRun(); }, { passive: false });
            return;
        }

        // --- 以下は単発クリックアクション ---
        const trigger = () => {
             if (clickSoundId && window.soundManager) {
                window.soundManager.playSE(clickSoundId);
            }

            if (action === 'wait_key_input' && target) {
                el.innerText = "キーを入力...";
                el.style.backgroundColor = "#ff9800";
                const onKey = (e) => {
                    e.preventDefault();
                    if (this.inputManager) {
                        this.inputManager.setKeyBind(target, e.code);
                        el.innerText = e.code.replace('Key', '').replace('Arrow', '');
                        el.style.backgroundColor = originalBgColor;
                    }
                    window.removeEventListener('keydown', onKey);
                };
                window.addEventListener('keydown', onKey);
                return;
            }

            if (action === 'game_start') { this.startGameplay(); return; }
            if (action === 'open_config') { this.gameState = 'CONFIG'; this.buildGameUI('config'); return; }
            if (action === 'open_title') { this.gameState = 'TITLE'; this.buildGameUI('title'); return; }
            if (action === 'open_menu') { this.openMenu(); return; }
            if (action === 'close_menu') { this.closeMenu(); return; }
            if (action === 'restart_game') { this.restartGame(); return; } 
            if (action === 'return_to_title') { this.returnToTitle(); return; } 

            if (action === 'resume_game') {
                this.gameState = 'PLAYING';
                this.buildGameUI('hud');

                if (this.player && this.player.body) {
                    this.player.body.wakeUp(); 
                    this.player.body.velocity.set(0, 0, 0); 
                    this.player.body.angularVelocity.set(0, 0, 0);
                }
                
                this._resetInput(); 
                return;
            }

            if (this.gameState !== 'PLAYING') return;
            if (action === 'toggle_lockon') { this.toggleLockOn(); }
            if (action === 'play_motion' && target) { this.player.playAnimation(target); }
            if (action.startsWith('gravity_')) {
                const dir = action.replace('gravity_', '');
                this.player.setGravity(dir);
            }
            if (action === 'attack') {
                this.inputManager.setVirtualAction('attack', true);
            } else if (action === 'interact') {
                this.inputManager.setVirtualAction('interact', true);
            } else if (action === 'use_item') {
                const potionIdx = this.inventory.findIndex(i => i.type === 'hp_heal' || i.type === 'sp_heal');
                if (potionIdx !== -1) {
                    this._useInventoryItem(this.inventory[potionIdx], potionIdx);
                }
            }
        };
        
        el.addEventListener('mousedown', (e) => { e.stopPropagation(); trigger(); });
        el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); trigger(); }, { passive: false });
    }

    updateUI() {
        if (this.gameState !== 'PLAYING' && this.gameState !== 'ATTACK') return;
        const hp = Math.floor(this.currentHp);
        if (this.uiBindings['player_hp'] && this.uiCache.hp !== hp) {
            this.uiBindings['player_hp'].element.innerText = hp;
            this.uiCache.hp = hp;
        }
        if (this.uiBindings['hp_bar'] && this.uiCache.hpBar !== hp) {
            const bind = this.uiBindings['hp_bar'];
            const pct = Math.max(0, this.currentHp / this.playerConfig.maxHp);
            bind.element.style.width = (bind.originalWidth * pct) + 'px';
            this.uiCache.hpBar = hp;
        }

        // ★追加: SP(スタミナ)更新
        const sp = Math.floor(this.currentSp);
        if (this.uiBindings['player_sp'] && this.uiCache.sp !== sp) {
            this.uiBindings['player_sp'].element.innerText = sp;
            this.uiCache.sp = sp;
        }
        if (this.uiBindings['sp_bar'] && this.uiCache.spBar !== sp) {
            const bind = this.uiBindings['sp_bar'];
            const pct = Math.max(0, this.currentSp / (this.playerConfig.maxSp || 100));
            bind.element.style.width = (bind.originalWidth * pct) + 'px';
            this.uiCache.spBar = sp;
        }
        // 残機の更新
        if (this.uiBindings['lives']) {
            this.uiBindings['lives'].element.innerText = this.lives < 0 ? "∞" : this.lives;
        }

        // 残り時間の更新 (00:00形式)
        if (this.uiBindings['time_limit']) {
            const time = Math.max(0, this.timeLeft);
            const m = Math.floor(time / 60);
            const s = Math.floor(time % 60);
            this.uiBindings['time_limit'].element.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }

        // 時間更新
        if (this.uiBindings['time']) {
            const m = Math.floor(this.elapsedTime / 60);
            const s = Math.floor(this.elapsedTime % 60);
            const timeStr = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
            if (this.uiCache.time !== timeStr) {
                this.uiBindings['time'].element.innerText = timeStr;
                this.uiCache.time = timeStr;
            }
        }
        Object.keys(this.uiBindings).forEach(bindName => {
            if (bindName === 'key_bind_disp') {
                const uiData = this.uiBindings[bindName];
                const actionTarget = uiData.props.actionTarget; // 引数に 'jump' などが入っている想定
                if (actionTarget && this.inputManager) {
                    const keys = this.inputManager.keyBinds[actionTarget];
                    if (keys && keys.length > 0) {
                        uiData.element.innerText = keys[0].replace('Key', '').replace('Arrow', ''); // 見た目を少し綺麗に
                    }
                }
            }
        });
         Object.keys(this.uiBindings).forEach(key => {
            const uiData = this.uiBindings[key];
            
            if (uiData.props.dataBind === 'key_bind_disp') {
                const actionTarget = uiData.props.actionTarget; // 引数に 'jump' などが入っている想定
                if (actionTarget && this.inputManager) {
                    const keys = this.inputManager.keyBinds[actionTarget];
                    if (keys && keys.length > 0) {
                        uiData.element.innerText = keys[0].replace('Key', '').replace('Arrow', ''); // 見た目を少し綺麗に
                    }
                }
            }
            if (uiData.type === 'radar') this._updateRadar(uiData);
            if (uiData.type === 'indicator') this._updateIndicator(uiData);
        });
    }
_renderInventoryItems(container) {
        container.innerHTML = '';
        container.style.cssText = 'display:flex; flex-direction:column; gap:8px; padding:10px; color:#fff; overflow-y:auto;';
        
        // カバンが空の場合
        if (this.inventory.length === 0) { 
            container.innerHTML = '<div style="text-align:center; color:#888; padding-top:50px;">カバンは空っぽです</div>'; 
            return; 
        }

        // アイテムリストの生成
        this.inventory.forEach((item, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'background:rgba(255,255,255,0.05); border:1px solid #555; border-radius:6px; padding:8px; display:flex; align-items:center; gap:10px;';
            
            row.innerHTML = `
                <div style="font-size:24px; text-align:center; width:30px;">${item.icon}</div>
                <div style="flex:1;">
                    <div style="font-weight:bold; color:#ffeb3b; font-size:14px;">${item.name}</div>
                    <div style="font-size:11px; color:#ccc; line-height:1.2;">${item.desc}</div>
                </div>
                <button class="use-item-btn" style="background:#4caf50; color:white; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">使う</button>
            `;

            // 「使う」ボタンのクリックイベント
            const btn = row.querySelector('.use-item-btn');
            btn.onclick = (e) => {
                e.stopPropagation();
                this._useInventoryItem(item, index);
            };
            
            container.appendChild(row);
        });
    }
 _renderAssembleStats(container) {
        if (!this.player) return;
        const conf = this.player.playerConfig;
        
        container.innerHTML = `
            <div style="line-height: 2.0; font-size: 14px; color: #ccc;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:5px;">
                    <span>最大HP:</span> <span style="color:#4caf50; font-weight:bold;">${conf.maxHp}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:5px;">
                    <span>最大スタミナ:</span> <span style="color:#00d2ff; font-weight:bold;">${conf.maxSp}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:5px;">
                    <span>移動スピード:</span> <span style="color:#ffeb3b; font-weight:bold;">${conf.speed.toFixed(2)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:5px;">
                    <span>ジャンプ力:</span> <span style="color:#ffeb3b; font-weight:bold;">${conf.jumpPower.toFixed(2)}</span>
                </div>
            </div>
        `;
    }_renderEquipSlots(container) {
        container.innerHTML = '';
        container.style.cssText = 'display:flex; flex-direction:column; gap:8px; overflow-y:auto; height:100%; padding-right:5px;';
        
        const slotsStr = window.ioManager ? window.ioManager.getWorldConfigFromUI().equipmentSlots : '右手,頭,体';
        const slots = slotsStr.split(',').map(s => s.trim()).filter(s => s);

        slots.forEach(slot => {
            const item = this.equipment[slot];
            const row = document.createElement('div');
            
            if (item) {
                row.style.cssText = 'background:rgba(76,175,80,0.2); border:1px solid #4caf50; border-radius:4px; padding:8px; display:flex; align-items:center; gap:10px; cursor:pointer;';
                row.innerHTML = `
                    <div style="width:50px; font-size:11px; color:#4caf50; font-weight:bold; overflow:hidden; text-overflow:ellipsis;">${slot}</div>
                    <div style="font-size:24px;">${item.icon}</div>
                    <div style="flex:1; font-size:13px; color:#fff; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                    <div style="font-size:11px; color:#ff5555; font-weight:bold;">外す</div>
                `;
                row.onclick = (e) => {
                    e.stopPropagation();
                    this.inventory.push(item);
                    delete this.equipment[slot];
                    this.player.updateFinalStats();
                    this.player.updateEquippedMeshes();
                    this.buildGameUI('assemble'); 
                };
            } else {
                row.style.cssText = 'background:rgba(255,255,255,0.05); border:1px dashed #555; border-radius:4px; padding:8px; display:flex; align-items:center; gap:10px;';
                row.innerHTML = `
                    <div style="width:50px; font-size:11px; color:#888; font-weight:bold; overflow:hidden; text-overflow:ellipsis;">${slot}</div>
                    <div style="flex:1; font-size:12px; color:#555; text-align:center;">( 未装備 )</div>
                `;
            }
            container.appendChild(row);
        });
    }_renderEquipInventory(container) {
        container.innerHTML = '';
        container.style.cssText = 'display:flex; flex-direction:column; gap:8px; overflow-y:auto; height:100%; padding-right:5px;';
        
        const equips = this.inventory.filter(i => i.type === 'equipment');

        if (equips.length === 0) {
            container.innerHTML = '<div style="color:#666; font-size:12px; text-align:center; margin-top:20px;">装備できるパーツがありません</div>';
            return;
        }

        equips.forEach(item => {
            const row = document.createElement('div');
            row.style.cssText = 'background:rgba(255,152,0,0.2); border:1px solid #ff9800; border-radius:4px; padding:8px; display:flex; flex-direction:column; gap:4px; cursor:pointer;';
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="font-size:24px;">${item.icon}</div>
                    <div style="font-weight:bold; font-size:14px; color:#fff;">${item.name}</div>
                    <div style="margin-left:auto; font-size:11px; background:#ff9800; color:#000; padding:2px 6px; border-radius:10px; font-weight:bold;">${item.equipSlot || '右手'}</div>
                </div>
                <div style="font-size:11px; color:#ccc; line-height:1.3;">${item.desc}</div>
            `;

            row.onclick = (e) => {
                e.stopPropagation();
                // ★修正: クリックしたらまず「詳細」に表示する
                this.selectedItem = item;
                this.buildGameUI('assemble'); 
            };
            
            container.appendChild(row);
        });
    }
    // アイテムの効果発動と消費処理
    _useInventoryItem(item, index) {
        let success = false;
        if (item.type === 'equipment') {
            this._equipItem(item, index);
            return; // 装備処理はここで終了
        }
        if (item.type === 'hp_heal') {
            if (this.player.currentHp < this.playerConfig.maxHp) {
                this.player.currentHp = Math.min(this.playerConfig.maxHp, this.player.currentHp + item.value);
                success = true;
            } else {
                if (window.showNotification) window.showNotification("HPは満タンです");
            }
        } 
        else if (item.type === 'sp_heal') {
            if (this.player.currentSp < this.playerConfig.maxSp) {
                this.player.currentSp = Math.min(this.playerConfig.maxSp, this.player.currentSp + item.value);
                success = true;
            } else {
                if (window.showNotification) window.showNotification("SPは満タンです");
            }
        } 
        else if (item.type === 'hp_max_up') {
            this.playerConfig.maxHp += item.value;
            this.player.currentHp = this.playerConfig.maxHp; // 最大値が増えたら全回復
            success = true;
        } 
        else if (item.type === 'sp_max_up') {
            this.playerConfig.maxSp += item.value;
            this.player.currentSp = this.playerConfig.maxSp; // 最大値が増えたら全回復
            success = true;
        }

        // 使用成功時の処理
        if (success) {
            this.inventory.splice(index, 1); // カバンから1つ減らす
            this.updateUI(); // HPバーなどを更新
            this.buildGameUI('menu'); // メニュー画面のリストを再描画
            
            // 回復エフェクト
            if (window.effectManager) window.effectManager.showEmote(this.player.mesh, 'heart');
            if (window.showNotification) window.showNotification(`${item.name} を使った！`);
        }
    }
    _useItem(item) {
        if (item.type === 'heal') {
            const healAmount = item.value;
            this.player.currentHp = Math.min(this.playerConfig.maxHp, this.player.currentHp + healAmount);
            this.currentHp = this.player.currentHp;
            this.updateUI();
        }
        item.amount--;
        if (this.gameState === 'MENU') this.buildGameUI('menu');
    }

    onWindowResize() {
        const viewport = document.getElementById('viewport');
        const uiScreen = document.getElementById('ui-game-screen');
        if (!viewport || !uiScreen) return;
        
        const viewWidth = viewport.clientWidth;
        const viewHeight = viewport.clientHeight;
        const DESIGN_WIDTH = 800;
        const DESIGN_HEIGHT = 450;
        
        const widthRatio = viewWidth / DESIGN_WIDTH;
        const heightRatio = viewHeight / DESIGN_HEIGHT;
        const scale = Math.min(widthRatio, heightRatio);
        
        uiScreen.style.transform = `scale(${scale})`;
        uiScreen.style.transformOrigin = `center center`;
        
        if (window.core) window.core.onResize();
    }
     _renderSelectedItemDetails(container) {
        container.innerHTML = '';
        const item = this.selectedItem;
        if (!item) {
            container.innerHTML = '<div style="color:#666; text-align:center; padding-top:20px;">パーツを選択してください</div>';
            return;
        }

        container.innerHTML = `
            <div style="padding:10px; color:#fff;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; border-bottom:1px solid #555; padding-bottom:5px;">
                    <span style="font-size:30px;">${item.icon}</span>
                    <span style="font-weight:bold; font-size:18px; color:#ffeb3b;">${item.name}</span>
                </div>
                <div style="font-size:12px; color:#ccc; margin-bottom:10px;">${item.desc}</div>
                <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:4px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#aaa;">部位:</span> <span>${item.equipSlot || '---'}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-weight:bold;">
                        <span style="color:#aaa;">性能値:</span> <span style="color:#00d2ff;">+${item.value}</span>
                    </div>
                </div>
                <button id="btn-equip-action" style="width:100%; margin-top:15px; padding:10px; background:#4caf50; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                    これを装備する
                </button>
            </div>
        `;

        container.querySelector('#btn-equip-action').onclick = () => {
            const index = this.inventory.indexOf(item);
            if (index !== -1) {
                this._equipItem(item, index);
                this.selectedItem = null;
                this.buildGameUI('assemble');
            }
        };
    }
    // --- レーダーの描画計算 ---
    _updateRadar(uiData) {
        const { canvas, ctx, props } = uiData;
        const player = this.player.mesh;
        if (!player || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const center = canvas.width / 2;
        const range = 40; // レーダーの表示範囲 (40m)
        const scale = center / range;

        // プレイヤーの向きを取得
        const playerRot = player.rotation.y;

        // 敵やゴールを表示
        const targets = [];
        this.enemies.forEach(e => { if(e.meshGroup) targets.push({pos: e.meshGroup.position, col: '#ff4444'}); });
        this.stageGroup.traverse(obj => {
            if (obj.userData.role === 'goal' || obj.userData.role === 'goal_flag') {
                targets.push({pos: obj.position, col: '#ffeb3b'});
            }
        });

        targets.forEach(t => {
            // 相対座標
            const dx = t.pos.x - player.position.x;
            const dz = t.pos.z - player.position.z;
            const distSq = dx*dx + dz*dz;
            if (distSq > range * range) return;

            // プレイヤーの向きに合わせて回転（前方を上にする）
            const nx = dx * Math.cos(playerRot) - dz * Math.sin(playerRot);
            const nz = dx * Math.sin(playerRot) + dz * Math.cos(playerRot);

            ctx.fillStyle = t.col;
            ctx.beginPath();
            ctx.arc(center + nx * scale, center + nz * scale, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // 自分（中央の点）
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(center, center - 6); ctx.lineTo(center - 4, center + 4); ctx.lineTo(center + 4, center + 4);
        ctx.fill();
    }

    // --- 画面端インジケーターの計算 ---
    _updateIndicator(uiData) {
        const { element, props } = uiData;
        const targetRole = props.actionTarget || 'goal';
        
        let targetPos = null;
        let minDistSq = Infinity;
        const playerPos = this.player.mesh ? this.player.mesh.position : new THREE.Vector3();

        // 1. 【動いている敵本体】を優先的にリストから探す (targetRoleが enemy_spawn の時)
        if (targetRole === 'enemy_spawn') {
            this.enemies.forEach(enemy => {
                if (enemy.state !== 'dead' && enemy.meshGroup) {
                    const pos = enemy.meshGroup.position;
                    const distSq = playerPos.distanceToSquared(pos);
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        targetPos = pos.clone();
                    }
                }
            });
        }

        // 2. もし敵本体が見つからない、または別の役割（goalなど）を探している場合
        if (!targetPos) {
            this.stageGroup.traverse(obj => {
                if (obj.userData.role === targetRole && obj.visible) {
                    const pos = new THREE.Vector3();
                    obj.getWorldPosition(pos);
                    const distSq = playerPos.distanceToSquared(pos);
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        targetPos = pos;
                    }
                }
            });
        }

        // --- (ここから下の表示ロジックは前回と同じ) ---
        if (!targetPos) { element.style.display = 'none'; return; }
        element.style.display = 'flex';
        const screenPos = targetPos.clone().project(this.camera);
        const isOffScreen = (screenPos.x < -0.9 || screenPos.x > 0.9 || screenPos.y < -0.9 || screenPos.y > 0.9 || screenPos.z > 1);

        if (isOffScreen) {
            let edgeX = screenPos.x; let edgeY = screenPos.y;
            if (screenPos.z > 1) { edgeX = -edgeX; edgeY = -edgeY; }
            const angle = Math.atan2(edgeY, edgeX);
            screenPos.x = Math.cos(angle) * 0.9; screenPos.y = Math.sin(angle) * 0.8;
            element.style.transform = `rotate(${angle + Math.PI/2}rad)`;
        } else {
            element.style.transform = `rotate(0deg)`;
        }
        const px = (screenPos.x * 0.5 + 0.5) * 800;
        const py = (-screenPos.y * 0.5 + 0.5) * 450;
        element.style.left = (px - props.width/2) + 'px';
        element.style.top = (py - props.height/2) + 'px';
    }
}