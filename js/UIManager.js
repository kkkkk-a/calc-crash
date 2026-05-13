import * as THREE from 'three';

// ゲームロジック用パラメータ設定
const ROLE_PARAM_CONFIG = {
    item_pickup: [
        { type: 'header', label: 'アイテムの基本情報' },
        { key: 'itemName', label: '名前', type: 'text', default: '新しいアイテム' },
        { key: 'itemIcon', label: 'アイコン(絵文字)', type: 'text', default: '⚔️' },
        { key: 'itemDesc', label: '説明文', type: 'textarea', default: 'ここに説明を書く' },
        
        { type: 'header', label: 'アイテムの種類' },
        { key: 'itemType', label: '種類', type: 'select', options: [
            {v:'equipment', l:'🛡️ 装備品 (アセンブル用)'}, // ★追加
            {v:'hp_heal', l:'💚 HPを回復'}, {v:'sp_heal', l:'💙 SPを回復'}, 
            {v:'hp_max_up', l:'❤️ 最大HPアップ'}, {v:'sp_max_up', l:'💧 最大SPアップ'}
        ]},
        // ★装備部位の選択 (動的にワールド設定から取るのは難しいので、最初は直接入力に)
        { key: 'equipSlot', label: '装備部位', type: 'text', default: 'weapon' },
        { key: 'amount', label: '効果量 / 攻撃力', type: 'number', default: 10 },
    ],

    // 2. stage_portal (ステージ遷移) の設定を新規追加
    stage_portal: [
        { type: 'header', label: 'ポータル設定' },
        // ★修正: テキスト入力ではなく、プロジェクト内ステージから選べる「select_dynamic」に変更
        { key: 'targetStage', label: '移動先ステージ', type: 'select_dynamic', 
          getOptions: () => {
              if (window.ioManager && window.ioManager.projectStages) {
                  return Object.keys(window.ioManager.projectStages).map(s => ({v:s, l:s}));
              }
              return [{v:'', l:'(No Stages)'}];
          }
        },
        { key: 'spawnPointId', label: '出現先スタートID', type: 'text', default: 'start_A' },
        { type: 'header', label: '※遷移後、プレイヤーのステータスは維持されます' }
    ],
    
    enemy_spawn: [
        { type: 'header', label: '敵の基本設定' },
        { key: 'enemyType', label: '敵の種類', type: 'select_dynamic', 
          getOptions: () => {
              let list = [];
              if (window.charEditor) list = window.charEditor.getCharacterOptions();
              if (list.length === 0) list.push({v:'none', l:'(No Characters)'});
              return list;
          }
        },
        { key: 'hp', label: 'HP', type: 'number', default: 100 },
        { key: 'attack', label: '攻撃力', type: 'number', default: 10 }
    ],
    chest: [
        { type: 'header', label: '宝箱の中身 (Contents)' },
        { key: 'itemType', label: 'アイテム種別', type: 'select', options: [
            {v:'equipment', l:'🛡️ 装備品'}, 
            {v:'hp_heal', l:'💚 HP回復薬'}, 
            {v:'key', l:'🔑 鍵 (重要アイテム)'}
        ]},
        { key: 'itemName', label: '名前', type: 'text', default: '宝箱の遺物' },
        { key: 'itemIcon', label: 'アイコン', type: 'text', default: '🎁' },
        { key: 'amount', label: '性能値/個数', type: 'number', default: 10 },
        
        { type: 'header', label: '施錠設定 (Lock)' },
        { key: 'isLocked', label: '鍵をかける', type: 'checkbox', default: false },
        { key: 'requiredKeyId', label: '必要な鍵のID', type: 'text', default: 'key_1' },
        { type: 'header', label: '※「鍵」種別のアイテムの「名前」と一致させると開きます' }
    ],
    switch: [
        { key: 'triggerType', label: '起動', type: 'select', options: [{v:'interact', l:'👆 調べる'}, {v:'step_on', l:'🦶 踏む'}] },
        { key: 'switchMode', label: 'モード', type: 'select', options: [{v:'toggle', l:'トグル'}, {v:'one_shot', l:'一回'}] },
        { key: 'targetId', label: '送信先ID', type: 'text', default: 'door_1' }
    ],
    receiver: [
        { type: 'header', label: '起動設定 (Trigger)' },
        { key: 'triggerType', label: '起動方法', type: 'select', options: [
            {v:'remote', l:'📡 外部スイッチから受信'},
            {v:'interact', l:'👆 直接しらべる'},
            {v:'touch', l:'🦶 プレイヤーが触れる'}
        ], default: 'remote' },
        { key: 'myId', label: '受信ID (外部用)', type: 'text', default: 'door_1' },

        { type: 'header', label: '動作設定 (Action)' },
        { key: 'actionType', label: '動作', type: 'select', options: [
            {v:'transform_move', l:'移動'}, {v:'transform_rotate', l:'回転'}, 
            {v:'visibility', l:'表示切替'}, {v:'activate_kinematic', l:'物理起動(Kinematic)'}
        ]},
        { key: 'moveOffset', label: '移動量(X,Y,Z)', type: 'text', default: '0, 2, 0' },
        { key: 'rotateOffset', label: '回転量(X,Y,Z)', type: 'text', default: '0, 90, 0' },
        { key: 'duration', label: '時間(秒)', type: 'number', default: 1.0 }
    ],
    jump_pad: [ { key: 'power', label: '倍率', type: 'number', default: 1.5 } ],
        talkable: [
        { type: 'header', label: '会話データ設定' },
        { key: 'speakerName', label: '表示する名前', type: 'text', default: '村人' },
        { key: 'message', label: '会話本文', type: 'textarea', default: 'こんにちは。\n今日はいい天気ですね。' },
        
        { type: 'header', label: 'UI連携設定 (Data Bind)' },
        { key: 'bindKeyName', label: '名前の宛先ID', type: 'text', default: 'dialogue_name' },
        { key: 'bindKeyText', label: '本文の宛先ID', type: 'text', default: 'dialogue_text' },
        { type: 'header', label: '※UIエディタの「紐付け変数」と一致させてください' }
    ],
    text: [ 
        { key: 'content', label: '表示テキスト', type: 'textarea', default: '看板の内容' },
        { key: 'bindKey', label: '宛先ID', type: 'text', default: 'dialogue_text' } 
    ],
    damage: [ { key: 'damageVal', label: 'ダメージ', type: 'number', default: 10 } ],
    
    // ワープ・ポータル系
    warp: [ { key: 'targetId', label: '行先ID', type: 'text', default: 'exit_1' } ],
    warp_exit: [ { key: 'myId', label: '自分ID', type: 'text', default: 'exit_1' } ],
    portal: [ 
        { key: 'portalId', label: '接続ID', type: 'text', default: 'gate_A' },
        { type: 'header', label: '※同じID同士が繋がります' }
    ],

    // ★追加: イベントトリガー (チュートリアル等)
    event_trigger:[
        { type: 'header', label: 'イベント発火設定' },
        { key: 'eventType', label: '種類', type: 'select', options:[
            {v:'open_ui', l:'🖼️ UI画面を開く (チュートリアル等)'}
        ]},
        { key: 'targetScreenId', label: '開く画面のID', type: 'text', default: 'tutorial_1' },
        { key: 'pauseGame', label: 'ゲームを一時停止', type: 'checkbox', default: true },
        { key: 'oneShot', label: '1回だけ実行', type: 'checkbox', default: true }
    ],

    // ★追加: 乱数配置スポナー
    random_spawner:[
        { type: 'header', label: 'ランダム配置設定' },
        { key: 'spawnType', label: '種類', type: 'select', options: [
            {v:'enemy', l:'👿 敵キャラクター'}
        ]},
        { key: 'targetId', label: '対象キャラ名', type: 'text', default: 'Zombie' },
        { key: 'amount', label: '出現数', type: 'number', default: 3 },
        { key: 'radius', label: '配置半径 (m)', type: 'number', default: 10 }
    ],

    goal: [ 
        { type: 'header', label: 'クリア条件' },
        { key: 'condition', label: '条件', type: 'select', options: [
            {v:'touch', l:'🏃 到達するだけでクリア'}, 
            {v:'all_flags', l:'🏳️ 全フラグ回収'},
            {v:'kill_all', l:'👿 敵を全滅させる'} // ★追加
        ] } 
    ],
    goal_flag: [ { key: 'flagId', label: 'ID', type: 'text', default: 'flag_1' } ],
    
    start: [
        { type: 'header', label: 'プレイヤー設定' },
        { key: 'mySpawnId', label: 'この地点のID', type: 'text', default: 'start_A' }, // ★追加: 自分自身のID
        { key: 'playerModel', label: '使用キャラ', type: 'select_dynamic',
          getOptions: () => {
              let list = [];
              if (window.charEditor) list = window.charEditor.getCharacterOptions();
              list.unshift({v:'none', l:'(Default Capsule)'});
              return list;
          }
        }
    ],
    save: [], heal: [ { key: 'amount', label: '回復量', type: 'number', default: 20 } ],
    
};

export class UIManager {
    constructor(stageManager, selectionManager) {
        this.stageManager = stageManager;
        this.selectionManager = selectionManager;

        // UI要素のキャッシュ
        this.ui = {
            // Basic Info
            infoType: document.getElementById('info-type'),
            infoUuid: document.getElementById('info-uuid'),
            visible: document.getElementById('inp-visible'),
            
            // Game Logic
            role: document.getElementById('game-role'),
            roleDesc: document.getElementById('role-desc'),
            dynamicContainer: document.getElementById('dynamic-params-container'),

            // Transform (Inspector Panel)
            px: document.getElementById('px'), py: document.getElementById('py'), pz: document.getElementById('pz'),
            rx: document.getElementById('rx'), ry: document.getElementById('ry'), rz: document.getElementById('rz'),
            sx: document.getElementById('sx'), sy: document.getElementById('sy'), sz: document.getElementById('sz'),
            pivot: document.getElementById('inp-pivot'),

            // Material
            color: document.getElementById('inp-color'),
            opacity: document.getElementById('mat-opacity'),
            valOpacity: document.getElementById('val-opacity'),
            emissive: document.getElementById('mat-emissive'),
            emissiveInt: document.getElementById('mat-emissive-int'),
            roughness: document.getElementById('mat-roughness'),
            metalness: document.getElementById('mat-metalness'),
            texInput: document.getElementById('inp-texture'),
            texClearBtn: document.getElementById('btn-clear-tex'),

            // Physics (General)
            phyType: document.getElementById('phy-type'),
            phyMass: document.getElementById('phy-mass'),
            phyBounce: document.getElementById('phy-bounce'),
            phyDamping: document.getElementById('phy-damping'),
            valDamping: document.getElementById('val-damping'),
            phyFixed: document.getElementById('phy-fixed'),
            phyDesc: document.getElementById('phy-desc'),
            dynamicOpts: document.getElementById('phy-dynamic-options'),
            kinOpts: document.getElementById('phy-kinematic-options'),

            // Physics (Kinematic Settings)
            kinDestructible: document.getElementById('kin-destructible'),
            kinHp: document.getElementById('kin-hp'),
            kinTrigger: document.getElementById('kin-trigger'),
            kinMode: document.getElementById('kin-mode'),
            kinLoop: document.getElementById('kin-loop'),
            kinAxis: document.getElementById('kin-axis'),
            kinRange: document.getElementById('kin-range'),
            kinSpeed: document.getElementById('kin-speed'),

            // ツールバーの数値入力用 (Toolbar Inputs)
            tfX: document.getElementById('tf-input-x'),
            tfY: document.getElementById('tf-input-y'),
            tfZ: document.getElementById('tf-input-z'),
        };

        // 役割パラメータの一時保存用 (消してはいけません)
        this.currentRoleParams = {};
        
        // ★修正点1: 相対座標オフセットをUIManagerで管理する
        this.globalOffset = new THREE.Vector3(0, 0, 0); 

        // 現在のトランスフォームモード ('translate', 'rotate', 'scale')
        this.currentTransformMode = 'translate'; 

        // イベントリスナーの初期化実行
        this._initEventListeners();
        this._initToolbarEvents();
    }

    // --- インスペクタパネル等のイベント登録 ---
    _initEventListeners() {
        // ★修正: inputイベントでは履歴を保存しないハンドラ
        const updateNonHistoryHandler = () => {
            this.updateObjectFromUI(false); // false: saveHistoryを呼ばない
        };

        // ★修正: change/blurイベントでのみ履歴を保存するハンドラ
        const updateAndSaveHandler = (e) => {
            // 色入力やセレクトボックスはchange/inputイベントで履歴保存
            if (e.target.type === 'color' || e.tagName === 'SELECT' || e.target.type === 'checkbox' || e.type === 'change' || e.type === 'blur') {
                this.updateObjectFromUI(true); // true: saveHistoryを呼ぶ
            }
        };

        Object.values(this.ui).forEach(el => {
            if (!el) return;
            if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
                
                // pivot変更は専用処理
                if (el === this.ui.pivot) {
                    el.addEventListener('change', (e) => {
                        const targets = this.selectionManager.selectedObjects;
                        if (targets.length === 1) {
                            if (window.setPivot) window.setPivot(targets[0], e.target.value);
                            if (window.saveHistory) window.saveHistory();
                        }
                    });
                    return; // 以降の汎用処理はスキップ
                } 
                // ツールバー入力は別で処理するため除外
                else if (el === this.ui.tfX || el === this.ui.tfY || el === this.ui.tfZ) {
                    return; // スキップ
                }

                // 1. 連続操作 (input) : 履歴なしでUI/オブジェクトを更新
                if (el.type === 'range' || el.type === 'color' || el.type === 'number') {
                    el.addEventListener('input', updateNonHistoryHandler); 
                }
                
                // 2. 確定操作 (change/blur) : 履歴保存付きで更新
                if (el.type === 'checkbox' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.type === 'color') {
                    el.addEventListener('change', updateAndSaveHandler);
                } else if (el.type === 'number' || el.type === 'text') {
                    // number, text は blur でも change でも履歴を保存する
                    el.addEventListener('blur', updateAndSaveHandler);
                    el.addEventListener('change', updateAndSaveHandler); // Enterキーも捕捉
                }
            }
        });

        // テクスチャ関連
        this.ui.texInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const targets = this.selectionManager.selectedObjects;
            
            if (file && targets.length > 0) {
                window.imageManager.loadFromFile(file).then(({ texture, base64 }) => {
                    targets.forEach(o => {
                        o.material.map = texture;
                        o.material.needsUpdate = true;
                        if (!o.userData.assets) o.userData.assets = {};
                        o.userData.assets.textureBase64 = base64;
                    });
                    
                    if (window.saveHistory) window.saveHistory();
                });
            }
        });

        this.ui.texClearBtn.addEventListener('click', () => {
            const targets = this.selectionManager.selectedObjects;
            targets.forEach(o => {
                if (o.material.map) o.material.map.dispose();
                o.material.map = null;
                o.material.needsUpdate = true;
                if (o.userData.assets) delete o.userData.assets.textureBase64;
            });
            if (window.saveHistory) window.saveHistory();
        });

        // ビルボード設定 (スプライト用)
        const chkBillboard = document.getElementById('chk-billboard');
        if (chkBillboard) {
            chkBillboard.addEventListener('change', (e) => {
                const targets = this.selectionManager.selectedObjects;
                targets.forEach(o => {
                    o.userData.billboard = e.target.checked;
                });
                if (window.saveHistory) window.saveHistory();
            });
        }

        // グラデーション設定 (一括登録)
        const updateGrad = () => {
            const targets = this.selectionManager.selectedObjects;
            
            const enabled = document.getElementById('chk-grad-enable').checked;
            const type = document.getElementById('sel-grad-type').value;
            const direction = document.getElementById('sel-grad-dir').value;
            const mapping = document.getElementById('sel-grad-mapping').value;
            const offset = parseFloat(document.getElementById('inp-grad-offset').value);
            
            const colStart = document.getElementById('inp-grad-top').value;
            const colEnd = document.getElementById('inp-grad-bot').value;

            const dirRow = document.getElementById('row-grad-dir');
            if (dirRow) dirRow.style.display = (type === 'linear') ? 'flex' : 'none';

            targets.forEach(obj => {
                if (enabled) {
                    this.stageManager.applyGradient(obj, {
                        colorStart: colStart,
                        colorEnd: colEnd,
                        type: type,
                        direction: direction,
                        mapping: mapping,
                        offset: offset
                    });
                    this.ui.color.value = "#ffffff"; 
                } else {
                    if (obj.userData.gradient && obj.userData.gradient.enabled) {
                        this.stageManager.removeGradient(obj);
                    }
                }
            });
            if (window.saveHistory) window.saveHistory();
        };

        const gradIds = [
            'chk-grad-enable', 'sel-grad-type', 'sel-grad-dir', 'sel-grad-mapping', 
            'inp-grad-offset', 'inp-grad-top', 'inp-grad-bot'
        ];
        gradIds.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input', updateGrad);
        });

        // コピー・削除 (インスペクタ内のボタン)
        document.getElementById('btn-copy').onclick = () => this._handleCopy();
        document.getElementById('btn-delete').onclick = () => this._handleDelete();

        // パネル開閉
        const togglePanel = (btnId, panelId) => {
            const btn = document.getElementById(btnId);
            const panel = document.getElementById(panelId);
            const closeBtn = panel.querySelector('.panel-close');
            if (btn) btn.onclick = () => panel.classList.toggle('visible');
            if (closeBtn) closeBtn.onclick = () => panel.classList.remove('visible');
        };
        togglePanel('btn-outliner-toggle', 'outliner-panel');
        togglePanel('btn-world', 'world-panel');
        document.getElementById('close-inspector').onclick = () => {
            this.selectionManager.deselectAll();
        };
    }

    // --- ツールバーのイベント登録 ---
    _initToolbarEvents() {
        // --- モード切替の汎用関数 ---
        const updateModeUI = (mode) => {
            this.selectionManager.setMode(mode);
            this.currentTransformMode = mode;
            
            // ボタンの見た目更新
            ['mode-translate', 'mode-rotate', 'mode-scale'].forEach(id => {
                const b = document.getElementById(id);
                if (b) b.classList.remove('active');
            });
            const activeBtn = document.getElementById('mode-' + mode);
            if (activeBtn) activeBtn.classList.add('active');
            
            // ツールバーの入力値を更新
            const targets = this.selectionManager.selectedObjects;
            if (targets.length > 0) {
                this.syncToolbarInputs(targets[targets.length - 1]);
            }
        };

        // モード切替ボタンの登録
        const setMode = (id, mode) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.onclick = () => updateModeUI(mode);
            }
        };
        setMode('mode-translate', 'translate');
        setMode('mode-rotate', 'rotate');
        setMode('mode-scale', 'scale');

        // ★外部(ショートカット)から呼べるようにwindowに登録
        window.setTransformMode = updateModeUI;

        // --- Snapボタン ---
        const btnSnap = document.getElementById('btn-snap');
        if (btnSnap) {
            btnSnap.onclick = (e) => {
                const enabled = e.currentTarget.classList.toggle('active');
                this.selectionManager.setSnap(enabled);
            };
        }

        // --- Multi Selectボタン ---
        const btnMulti = document.getElementById('btn-multi');
        if (btnMulti) {
            btnMulti.onclick = (e) => {
                const enabled = e.currentTarget.classList.toggle('active');
                this.selectionManager.setMultiSelect(enabled);
                if (!enabled) this.selectionManager.deselectAll();
            };
        }

        // --- 3Dカーソル系 ---
        const btnSetCursor = document.getElementById('btn-set-cursor');
        if (btnSetCursor) {
            btnSetCursor.onclick = () => {
                const targets = this.selectionManager.selectedObjects;
                if (targets.length === 1) {
                    if (window.core) {
                        window.core.setCursorPosition(targets[0].position); 
                        this.globalOffset.copy(targets[0].position); 
                        if (window.showNotification) window.showNotification("Cursor Set ⌖ (Relative Mode)");
                        this.syncUI(targets[0]);
                    }
                } else {
                    alert("オブジェクトを1つ選択してください");
                }
            };
        }

        const btnResetCursor = document.getElementById('btn-reset-cursor');
        if (btnResetCursor) {
            btnResetCursor.onclick = () => {
                if (window.core) {
                    window.core.resetCursor();
                    this.globalOffset.set(0, 0, 0);
                    if (window.showNotification) window.showNotification("Cursor Reset ◎ (World Mode)");
                    const targets = this.selectionManager.selectedObjects;
                    if(targets.length > 0) this.syncUI(targets[targets.length-1]);
                }
            };
        }

        // --- ツールバー数値入力 ---
        const applyTransform = () => {
            const targets = this.selectionManager.selectedObjects;
            if (targets.length === 0) return;
            if (window.saveHistory) window.saveHistory();

            const valX = parseFloat(this.ui.tfX.value);
            const valY = parseFloat(this.ui.tfY.value);
            const valZ = parseFloat(this.ui.tfZ.value);
            const mode = this.currentTransformMode;
            const offset = this.globalOffset; 

            targets.forEach(obj => {
                if (mode === 'translate') {
                    if (!isNaN(valX)) obj.position.x = valX + offset.x;
                    if (!isNaN(valY)) obj.position.y = valY + offset.y;
                    if (!isNaN(valZ)) obj.position.z = valZ + offset.z;
                } else if (mode === 'rotate') {
                    if (!isNaN(valX)) obj.rotation.x = valX * THREE.MathUtils.DEG2RAD;
                    if (!isNaN(valY)) obj.rotation.y = valY * THREE.MathUtils.DEG2RAD;
                    if (!isNaN(valZ)) obj.rotation.z = valZ * THREE.MathUtils.DEG2RAD;
                } else if (mode === 'scale') {
                    if (!isNaN(valX)) obj.scale.x = valX;
                    if (!isNaN(valY)) obj.scale.y = valY;
                    if (!isNaN(valZ)) obj.scale.z = valZ;
                }
                if (this.stageManager && this.stageManager.createPhysicsBody) {
                    this.stageManager.createPhysicsBody(obj);
                }
            });
            if (targets.length === 1) this.syncUI(targets[0]);
            this.selectionManager.updateHelpers(); 
        };
        
        [this.ui.tfX, this.ui.tfY, this.ui.tfZ].forEach(el => {
            if(!el) return;
            el.addEventListener('change', applyTransform);
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { applyTransform(); el.blur(); }
            });
        });

        // --- カラーピッカー ---
        const colorPicker = document.getElementById('tool-color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.selectionManager.setSelectionColor(e.target.value);
            });
        }

        // --- ピボット設定 ---
        const pivotPicker = document.getElementById('tool-pivot-picker');
        if (pivotPicker) {
            pivotPicker.addEventListener('change', (e) => {
                const pivot = e.target.value;
                if (!pivot) return;
                const targets = this.selectionManager.selectedObjects;
                if (targets.length === 0) return;
                if (window.saveHistory) window.saveHistory();
                targets.forEach(obj => { if (window.setPivot) window.setPivot(obj, pivot); });
                if (targets.length === 1 && this.ui.pivot) this.ui.pivot.value = pivot;
                e.target.value = ""; 
                if(window.showNotification) window.showNotification(`Set Pivot to ${pivot}`);
            });
        }

        // --- 整列・複製・削除・反転 ---
        const setupBtn = (id, action) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', action);
        };
        setupBtn('btn-align-linear', () => this.selectionManager.alignLinear());
        setupBtn('btn-align-dist', () => this.selectionManager.alignDistribute());
        setupBtn('tool-btn-copy', () => this._handleCopy());
        setupBtn('tool-btn-delete', () => this._handleDelete());
        setupBtn('tool-btn-mirror', () => this._handleMirrorCopy());
        
        // 同期トグル
        const btnToolSync = document.getElementById('tool-btn-sync');
        if (btnToolSync) {
            btnToolSync.addEventListener('click', (e) => {
                const enabled = e.currentTarget.classList.toggle('active');
                this.selectionManager.setSymmetrySync(enabled);
                if(window.showNotification) window.showNotification(enabled ? "🔗 Symmetry Sync ON" : "🔗 Symmetry Sync OFF");
            });
        }

        // 図形追加
        document.querySelectorAll('.add-btn').forEach(btn => {
            btn.onclick = () => { if (window.addObject) window.addObject(btn.dataset.type); };
        });
    }

    // --- コピー処理 (同座標版) ---
    _handleCopy() {
        const targets = this.selectionManager.selectedObjects;
        if (targets.length === 0) return;
        if (window.saveHistory) window.saveHistory();
        
        const newSelection = [];
        targets.forEach(obj => {
            const clone = obj.clone();
            
            // 座標はずらさず、同じ場所に生成する
            // clone.position.add(new THREE.Vector3(1, 0, 1)); 
            
            clone.userData = JSON.parse(JSON.stringify(obj.userData));
            
            if (clone.material) clone.material = obj.material.clone();
            
            clone.name = obj.name + "_copy"; 
            
             if (window.currentMode === 'character' && window.charEditor) {
                // ★修正: ステージではなく、アクティブなキャラのルートグループに追加し、パーツリストにも登録する
                const char = window.charEditor.activeCharacter;
                if (char) {
                    char.rootGroup.add(clone);
                    char.parts.push(clone);
                }
                this.stageManager.createPhysicsBody(clone);
                if (window.charEditor.updateOutlinerUI) window.charEditor.updateOutlinerUI();
            } else {
                this.stageManager.stageGroup.add(clone);
                this.stageManager.createPhysicsBody(clone);
                if (window.updateOutliner) window.updateOutliner();
            }
            newSelection.push(clone);
        });

        // コピー先を選択状態にする
        this.selectionManager.deselectAll();
        newSelection.forEach(o => this.selectionManager.select(o));

        if(window.showNotification) window.showNotification(`Copied ${newSelection.length} object(s)`);
    }

    // --- 削除処理 ---
    _handleDelete() {
        const targets = [...this.selectionManager.selectedObjects];
        if (targets.length === 0) return;
        if (window.saveHistory) window.saveHistory();
        
        targets.forEach(obj => {
            if (window.currentMode === 'character' && window.charEditor) {
                obj.parent.remove(obj);
                const char = window.charEditor.activeCharacter;
                if (char) {
                    char.parts = char.parts.filter(p => p !== obj);
                }
                window.charEditor.updateOutlinerUI();
            } else {
                this.stageManager.deleteObject(obj);
            }
        });
        
        this.selectionManager.deselectAll();
        if (window.updateOutliner) window.updateOutliner();
    }

// --- ミラー反転コピー処理 ---
    _handleMirrorCopy() {
        const targets = this.selectionManager.selectedObjects;
        if (targets.length === 0) return;
        if (window.saveHistory) window.saveHistory();
        
        const newSelection =[];
        targets.forEach(obj => {
            const clone = obj.clone();
            
            // 1. 座標の反転 (X軸対称)
            clone.position.x *= -1;

            // 2. 回転の反転 (Euler角のX軸対称は、YとZを反転させる)
            clone.rotation.y *= -1;
            clone.rotation.z *= -1;

            // 3. データのディープコピー
            clone.userData = JSON.parse(JSON.stringify(obj.userData));
            
            // 4. マテリアルのクローン
            if (clone.material) clone.material = obj.material.clone();
            
            // 5. 名前の自動変換 (_L ⇔ _R, Left ⇔ Right)
            let newName = obj.name;
            if (newName.includes('_L')) newName = newName.replace('_L', '_R');
            else if (newName.includes('_R')) newName = newName.replace('_R', '_L');
            else if (newName.includes('Left')) newName = newName.replace('Left', 'Right');
            else if (newName.includes('Right')) newName = newName.replace('Right', 'Left');
            else newName = newName + "_Mirror";
            clone.name = newName;

            // 6. ★左右同期 (Sync) のためのペア紐付け
            obj.userData.mirrorPairId = clone.uuid;
            clone.userData.mirrorPairId = obj.uuid;

            // 7. シーンやキャラクターへの追加
            if (window.currentMode === 'character' && window.charEditor) {
                const char = window.charEditor.activeCharacter;
                if (char) {
                    if (obj.parent) obj.parent.add(clone); // 元のオブジェクトと同じ親に追加
                    else char.rootGroup.add(clone);
                    char.parts.push(clone);
                }
                window.charEditor.updateOutlinerUI();
            } else {
                if (obj.parent) obj.parent.add(clone);
                else this.stageManager.stageGroup.add(clone);
                if (window.updateOutliner) window.updateOutliner();
            }

            this.stageManager.createPhysicsBody(clone);
            newSelection.push(clone);
        });

        // コピー先（反転側）を選択状態にする
        this.selectionManager.deselectAll();
        newSelection.forEach(o => this.selectionManager.select(o));

        if(window.showNotification) window.showNotification(`Mirrored ${newSelection.length} object(s)`);
    }
    // --- UI同期 (Object -> UI) ---
    syncUI(obj) {
        const inspector = document.getElementById('inspector-panel');
        const scrollContent = inspector.querySelector('.scrollable-content');
        const charUI = document.getElementById('char-inspector-ui');
        
        const staticSections = Array.from(scrollContent.children).filter(el => 
            el.classList.contains('prop-section') && el.id !== 'char-inspector-ui'
        );

        if (!obj) {
            inspector.classList.remove('visible');
            this.syncToolbarInputs(null);
            return;
        }
        inspector.classList.add('visible');

        if (window.currentMode === 'character') {
            staticSections.forEach(el => el.style.display = 'none');
            if (charUI) charUI.style.display = 'block';
            if (window.charEditor) window.charEditor.updateInspectorUI(obj);
            this.syncToolbarInputs(obj); // ツールバーも更新
            return;
        }

        staticSections.forEach(el => el.style.display = 'block');
        if (charUI) charUI.style.display = 'none';

        // Basic Info
        this.ui.infoType.value = obj.userData.type || 'Unknown';
        this.ui.infoUuid.value = obj.uuid;
        this.ui.visible.checked = obj.visible;

        // Role
        const role = obj.userData.role || 'none';
        this.ui.role.value = role;
        this.updateRoleParamsUI(role, obj.userData.roleParams);

        // Transform (Inspector) - 相対座標計算
        // const offset = (window.core && window.core.globalOffset) ? window.core.globalOffset : { x:0, y:0, z:0 }; // ★旧
        const offset = this.globalOffset; // ★修正

        this.ui.px.value = (obj.position.x - offset.x).toFixed(2);
        this.ui.py.value = (obj.position.y - offset.y).toFixed(2);
        this.ui.pz.value = (obj.position.z - offset.z).toFixed(2);
        
        this.ui.rx.value = Math.round(obj.rotation.x * THREE.MathUtils.RAD2DEG);
        this.ui.ry.value = Math.round(obj.rotation.y * THREE.MathUtils.RAD2DEG);
        this.ui.rz.value = Math.round(obj.rotation.z * THREE.MathUtils.RAD2DEG);
        
        this.ui.sx.value = obj.scale.x.toFixed(2);
        this.ui.sy.value = obj.scale.y.toFixed(2);
        this.ui.sz.value = obj.scale.z.toFixed(2);
        
        this.ui.pivot.value = obj.userData.pivot || 'center';

        // Material
        const mat = obj.material;
        if (mat) {
            if (mat.color) this.ui.color.value = '#' + mat.color.getHexString();
            this.ui.opacity.value = mat.opacity;
            this.ui.valOpacity.textContent = mat.opacity.toFixed(2);
            
            if (mat.emissive) {
                this.ui.emissive.value = '#' + mat.emissive.getHexString();
                this.ui.emissiveInt.value = mat.emissiveIntensity;
            }
            if (mat.roughness !== undefined) {
                this.ui.roughness.value = mat.roughness;
                this.ui.metalness.value = mat.metalness;
            }
        }

        // Billboard (Sprite)
        const rowBillboard = document.getElementById('row-billboard');
        if (rowBillboard) {
            if (obj.userData.isSprite) {
                rowBillboard.style.display = 'flex';
                const chk = document.getElementById('chk-billboard');
                if (chk) chk.checked = (obj.userData.billboard !== false);
            } else {
                rowBillboard.style.display = 'none';
            }
        }

        // Gradient
        const grad = obj.userData.gradient || { 
            enabled: false, colorStart: '#4caf50', colorEnd: '#8b4513',
            type: 'linear', direction: 'y', mapping: 'face', offset: 0
        };
        const chkGrad = document.getElementById('chk-grad-enable');
        if (chkGrad) chkGrad.checked = grad.enabled;
        
        const selType = document.getElementById('sel-grad-type');
        if (selType) selType.value = grad.type || 'linear';
        const selMap = document.getElementById('sel-grad-mapping');
        if (selMap) selMap.value = grad.mapping || 'face';
        const selDir = document.getElementById('sel-grad-dir');
        if (selDir) selDir.value = grad.direction || 'y';
        const inpTop = document.getElementById('inp-grad-top');
        if (inpTop) inpTop.value = grad.colorStart || '#4caf50';
        const inpBot = document.getElementById('inp-grad-bot');
        if (inpBot) inpBot.value = grad.colorEnd || '#8b4513';
        const inpOff = document.getElementById('inp-grad-offset');
        if (inpOff) inpOff.value = grad.offset || 0;
        
        const dirRow = document.getElementById('row-grad-dir');
        if(dirRow) dirRow.style.display = (grad.type === 'linear' || !grad.type) ? 'flex' : 'none';
        
        // Physics
        const phy = obj.userData.physics || { state: 'static' };
        this.ui.phyType.value = phy.state;
        this.ui.phyMass.value = phy.mass !== undefined ? phy.mass : 1.0;
        this.ui.phyBounce.value = phy.bounce !== undefined ? phy.bounce : 0.5;
        this.ui.phyDamping.value = phy.damping !== undefined ? phy.damping : 0.0;
        this.ui.valDamping.textContent = parseFloat(this.ui.phyDamping.value).toFixed(2);
        this.ui.phyFixed.checked = phy.fixedRotation || false;

        // Kinematic
        this.ui.kinDestructible.checked = !!phy.destructible;
        this.ui.kinHp.value = phy.hp || 0;
        this.ui.kinTrigger.value = phy.trigger || 'auto';
        this.ui.kinMode.value = phy.moveMode || 'none';
        this.ui.kinLoop.value = phy.moveLoop || 'loop';
        this.ui.kinAxis.value = phy.moveAxis || 'x';
        this.ui.kinRange.value = phy.moveRange !== undefined ? phy.moveRange : 3.0;
        this.ui.kinSpeed.value = phy.moveSpeed !== undefined ? phy.moveSpeed : 1.0;

        this._updatePhysicsUIState(phy.state);

        // ツールバーの数値も更新
        this.syncToolbarInputs(obj);
    }

    // --- ツールバー入力同期 ---
    syncToolbarInputs(obj) {
        if (!obj) {
            if (this.ui.tfX) this.ui.tfX.value = '';
            if (this.ui.tfY) this.ui.tfY.value = '';
            if (this.ui.tfZ) this.ui.tfZ.value = '';
            return;
        }

        const mode = this.currentTransformMode;
        // ★修正: オフセットは自身が持つものを使用
        const offset = this.globalOffset; 

        if (mode === 'translate') {
            // 相対座標表示
            this.ui.tfX.value = (obj.position.x - offset.x).toFixed(2);
            this.ui.tfY.value = (obj.position.y - offset.y).toFixed(2);
            this.ui.tfZ.value = (obj.position.z - offset.z).toFixed(2);
            this.ui.tfX.step = 0.5;
        } else if (mode === 'rotate') {
            this.ui.tfX.value = Math.round(obj.rotation.x * THREE.MathUtils.RAD2DEG);
            this.ui.tfY.value = Math.round(obj.rotation.y * THREE.MathUtils.RAD2DEG);
            this.ui.tfZ.value = Math.round(obj.rotation.z * THREE.MathUtils.RAD2DEG);
            this.ui.tfX.step = 15;
        } else if (mode === 'scale') {
            this.ui.tfX.value = obj.scale.x.toFixed(2);
            this.ui.tfY.value = obj.scale.y.toFixed(2);
            this.ui.tfZ.value = obj.scale.z.toFixed(2);
            this.ui.tfX.step = 0.1;
        }
    }

    // --- UI反映 (UI -> Object) ---
    // ★修正: shouldSaveHistory 引数追加
    updateObjectFromUI(shouldSaveHistory = true) {
        if (window.currentMode === 'character') return;

        const targets = this.selectionManager.selectedObjects;
        if (targets.length === 0) return;

        // ★修正: オフセットは自身が持つものを使用
        const offset = this.globalOffset; 
        const newRole = this.ui.role.value;

        targets.forEach(o => {
            if (targets.length === 1) {
                o.visible = this.ui.visible.checked;
                
                // ★修正: 入力値を安全に取得し、NaNなら無視する (前の値を維持)
                const px = parseFloat(this.ui.px.value);
                const py = parseFloat(this.ui.py.value);
                const pz = parseFloat(this.ui.pz.value);
                
                const rx = parseFloat(this.ui.rx.value);
                const ry = parseFloat(this.ui.ry.value);
                const rz = parseFloat(this.ui.rz.value);
                
                const sx = parseFloat(this.ui.sx.value);
                const sy = parseFloat(this.ui.sy.value);
                const sz = parseFloat(this.ui.sz.value);

                // 位置適用 (NaNチェック)
if (!isNaN(px)) o.position.x = px + offset.x;
if (!isNaN(py)) o.position.y = py + offset.y;
if (!isNaN(pz)) o.position.z = pz + offset.z;

// 回転適用
if (!isNaN(rx)) o.rotation.x = rx * THREE.MathUtils.DEG2RAD;
if (!isNaN(ry)) o.rotation.y = ry * THREE.MathUtils.DEG2RAD;
if (!isNaN(rz)) o.rotation.z = rz * THREE.MathUtils.DEG2RAD;

// スケール適用 (0も困るが、NaNは絶対にNG)
// ★修正: Math.abs() を使って 0 になるのも防ぐ
if (!isNaN(sx) && Math.abs(sx) > 0.0001) o.scale.x = sx;
if (!isNaN(sy) && Math.abs(sy) > 0.0001) o.scale.y = sy;
if (!isNaN(sz) && Math.abs(sz) > 0.0001) o.scale.z = sz;
            }

            if (o.userData.role !== newRole) {
                o.userData.role = newRole;
                o.userData.roleParams = {};
                
                // ★追加: 役割が変わったら、ステージ上のアイコンを更新する
                if (this.stageManager.updateRoleIcon) {
                    this.stageManager.updateRoleIcon(o);
                }

                if (targets.length === 1) this.updateRoleParamsUI(newRole, {});
            }
            if (this.currentRoleParams) {
                o.userData.roleParams = JSON.parse(JSON.stringify(this.currentRoleParams));
            }

            const mat = o.material;
            if (mat) {
                if (mat.color) mat.color.set(this.ui.color.value);
                
                const op = parseFloat(this.ui.opacity.value);
                if (!isNaN(op)) {
                    mat.opacity = op;
                    mat.transparent = op < 1.0;
                }
                mat.needsUpdate = true;
                
                if (mat.emissive) {
                    mat.emissive.set(this.ui.emissive.value);
                    const emInt = parseFloat(this.ui.emissiveInt.value);
                    if(!isNaN(emInt)) mat.emissiveIntensity = emInt;
                }
                if (mat.roughness !== undefined) {
                    const r = parseFloat(this.ui.roughness.value);
                    const m = parseFloat(this.ui.metalness.value);
                    if(!isNaN(r)) mat.roughness = r;
                    if(!isNaN(m)) mat.metalness = m;
                }
            }

            if (o.userData.isSprite) {
                const chk = document.getElementById('chk-billboard');
                if (chk) o.userData.billboard = chk.checked;
            }

            // 物理パラメータの取得 (ここも数値入力があるので安全策)
            const mass = parseFloat(this.ui.phyMass.value);
            const bounce = parseFloat(this.ui.phyBounce.value);
            const damping = parseFloat(this.ui.phyDamping.value);
            const moveRange = parseFloat(this.ui.kinRange.value);
            const moveSpeed = parseFloat(this.ui.kinSpeed.value);
            const hp = parseInt(this.ui.kinHp.value);

            o.userData.physics = {
                state: this.ui.phyType.value,
                mass: !isNaN(mass) ? mass : 1.0,
                bounce: !isNaN(bounce) ? bounce : 0.5,
                damping: !isNaN(damping) ? damping : 0.0,
                fixedRotation: this.ui.phyFixed.checked,
                
                destructible: this.ui.kinDestructible.checked,
                hp: !isNaN(hp) ? hp : 0,
                trigger: this.ui.kinTrigger.value,
                moveMode: this.ui.kinMode.value,
                moveLoop: this.ui.kinLoop.value,
                moveAxis: this.ui.kinAxis.value,
                moveRange: !isNaN(moveRange) ? moveRange : 3.0,
                moveSpeed: !isNaN(moveSpeed) ? moveSpeed : 1.0
            };

            // ★修正: 入力中(shouldSaveHistory=false) は物理ボディを再構築しない！
            // 確定時(エンターやブラー)のみ構築して負荷とカクつきを下げる
            if (shouldSaveHistory) {
                this.stageManager.createPhysicsBody(o);
            }
        });

        // ラベル更新
        const opVal = parseFloat(this.ui.opacity.value);
        if(!isNaN(opVal)) this.ui.valOpacity.textContent = opVal.toFixed(2);
        
        const dampVal = parseFloat(this.ui.phyDamping.value);
        if(!isNaN(dampVal)) this.ui.valDamping.textContent = dampVal.toFixed(2);
        
        this._updatePhysicsUIState(this.ui.phyType.value);
        
        if (window.updateOutliner) window.updateOutliner();
        
        // ★修正: 履歴保存のチェックを追加
        if (shouldSaveHistory && window.saveHistory) {
            window.saveHistory();
        }
    }

    _updatePhysicsUIState(state) {
        this.ui.dynamicOpts.style.display = state === 'dynamic' ? 'block' : 'none';
        this.ui.kinOpts.style.display = state === 'kinematic' ? 'block' : 'none';
        const desc = { static: "不動 (壁/床)", dynamic: "物理 (落下/衝突)", kinematic: "制御 (動く床)", ghost: "不干渉 (すり抜け)" };
        this.ui.phyDesc.textContent = desc[state] || "";
    }

    // --- ロジックパラメータ生成 ---
    updateRoleParamsUI(role, currentData = {}) {
        const container = this.ui.dynamicContainer;
        container.innerHTML = '';
        this.currentRoleParams = currentData || {};

        const config = ROLE_PARAM_CONFIG[role];
        if (!config) {
            container.innerHTML = '<div style="color:#666;font-size:0.8rem;">設定項目はありません</div>';
            return;
        }

        config.forEach(field => {
            if (field.type === 'header') {
                const h = document.createElement('div');
                h.className = 'sub-header';
                h.textContent = field.label;
                container.appendChild(h);
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'param-group';

            let value = this.currentRoleParams[field.key];
            if (value === undefined) value = field.default;
            this.currentRoleParams[field.key] = value;

            // ★修正: ロジックパラメータの変更は常に履歴保存を伴う
            const apply = () => this.updateObjectFromUI(true); 

            if (field.type === 'checkbox') {
                wrapper.classList.add('param-checkbox-row');
                const label = document.createElement('label');
                label.className = 'param-label';
                label.textContent = field.label;
                label.style.marginBottom = '0';
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = !!value;
                input.addEventListener('change', (e) => {
                    this.currentRoleParams[field.key] = e.target.checked;
                    apply();
                });
                wrapper.appendChild(label);
                wrapper.appendChild(input);

            } else if (field.type === 'select' || field.type === 'select_dynamic') {
                const label = document.createElement('label');
                label.className = 'param-label';
                label.textContent = field.label;
                
                const sel = document.createElement('select');
                sel.className = 'param-select';

                let options = [];
                if (field.type === 'select_dynamic' && field.getOptions) {
                    options = field.getOptions();
                } else {
                    options = field.options || [];
                }

                options.forEach(opt => {
                    const op = document.createElement('option');
                    op.value = opt.v;
                    op.textContent = opt.l;
                    if (opt.v === value) op.selected = true;
                    sel.appendChild(op);
                });

                sel.addEventListener('change', (e) => {
                    this.currentRoleParams[field.key] = e.target.value;
                    apply();
                });
                wrapper.appendChild(label);
                wrapper.appendChild(sel);

            } else if (field.type === 'textarea') {
                const label = document.createElement('label');
                label.className = 'param-label';
                label.textContent = field.label;
                const input = document.createElement('textarea');
                input.className = 'param-input';
                input.rows = 3;
                input.value = value || '';
                input.addEventListener('input', (e) => {
                    this.currentRoleParams[field.key] = e.target.value;
                    // テキストエリアは連続入力なので、ここでは履歴保存しない(blur/changeで保存)
                    this.updateObjectFromUI(false);
                });
                // blur/changeで履歴を保存するイベントは_initEventListenersで登録されているので不要

                wrapper.appendChild(label);
                wrapper.appendChild(input);

            } else {
                const label = document.createElement('label');
                label.className = 'param-label';
                label.textContent = field.label;
                const input = document.createElement('input');
                input.type = field.type;
                input.className = 'param-input';
                input.value = value !== undefined ? value : '';
                if(field.step) input.step = field.step;

                input.addEventListener('input', (e) => {
                    if(field.type === 'number') this.currentRoleParams[field.key] = parseFloat(e.target.value);
                    else this.currentRoleParams[field.key] = e.target.value;
                    // number/textはinputで画面を更新するが履歴保存しない
                    this.updateObjectFromUI(false);
                });
                // blur/changeで履歴を保存するイベントは_initEventListenersで登録されているので不要
                
                wrapper.appendChild(label);
                wrapper.appendChild(input);
            }
            container.appendChild(wrapper);
        });
    }
};