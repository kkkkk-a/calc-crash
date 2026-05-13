import * as THREE from 'three';

export class TimelineEditor {
    constructor(charEditor) {
        this.charEditor = charEditor;
        this.attackEditor = null;

        // 1. まず、絶対に変わらない大枠（パネル）だけを取得
        this.panel = document.getElementById('timeline-panel');
        this.toggleBtn = document.getElementById('btn-toggle-timeline');

        // 2. ★修正: 最初に部屋（HTML構造）を破壊・再構築する
        this._initSharedPanel();

        // 3. ★修正: 再構築した「新しい部屋」を変数に記憶させる
        // （これで、古いゴミ要素を操作してしまうバグが消えます）
        this.playhead = document.getElementById('timeline-playhead');
        this.labelsContainer = document.getElementById('timeline-labels-container');
        this.tracksScroll = document.getElementById('timeline-tracks-scroll');
        this.gridSheet = document.getElementById('timeline-grid-sheet');
        
        // ヘッダーや入力欄も再取得
        this.frameInput = document.getElementById('tl-current-frame');
        this.totalFramesInput = document.getElementById('tl-total-frames');
        this.animSelect = document.getElementById('tl-anim-select');
        this.panelModeSelect = document.getElementById('bottom-panel-mode');
        this.animControls = document.getElementById('tl-anim-controls');
        this.logicControls = document.getElementById('tl-logic-controls');
        this.attackControls = document.getElementById('tl-attack-controls');
        this.commonSettings = document.getElementById('tl-common-settings');

        // ビューエリアも最新のものを取得
        this.animView = document.getElementById('anim-editor-view');
        this.logicView = document.getElementById('logic-editor-area');
        this.attackView = document.getElementById('attack-editor-area');

        // 4. ★修正: 部屋が完成した後に、リサイザー（青い線）を取り付ける
        this._initResizer();

        // 状態変数
        this.currentFrame = 0;
        this.totalFrames = 60;
        this.fps = 30;
        this.isPlaying = false;
        this.frameWidth = 10;
        this.currentAnimName = 'idle';
        this.currentPanelMode = 'animation';
        this.poseClipboard = null;
        this.draggingKey = null;
        this.isDragging = false;

        this._tmpVec1 = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector3();
        this._tmpQuat1 = new THREE.Quaternion();
        this._tmpQuat2 = new THREE.Quaternion();

        // 5. 新しい部屋に対してイベント（クリック判定など）を割り当てる
        this._bindEvents();
        this._bindToggleEvents();
        
        // 最後に非表示にして初期化完了
        this.setVisible(false);
    }
_initSharedPanel() {
        if (!this.panel) return;
        
        // 元々HTMLにあったヘッダー（ボタン類）を退避
        const header = this.panel.querySelector('.timeline-header');
        
        // パネルの中身を一度完全に空にする
        this.panel.innerHTML = ''; 

        // --- 1. アニメ用の部屋 ---
        const animView = document.createElement('div');
        animView.id = 'anim-editor-view';
        animView.className = 'bottom-view-container';
        if (header) animView.appendChild(header);

        const tracksContainer = document.createElement('div');
        tracksContainer.className = 'timeline-tracks-container';
        
        const leftCol = document.createElement('div'); leftCol.id = 'timeline-labels-container';
        const rightCol = document.createElement('div'); rightCol.id = 'timeline-tracks-scroll';
        const sheet = document.createElement('div'); sheet.id = 'timeline-grid-sheet';
        const ruler = document.createElement('div'); ruler.id = 'timeline-ruler';
        const ph = document.createElement('div'); ph.id = 'timeline-playhead';
        
        sheet.appendChild(ruler); 
        sheet.appendChild(ph); 
        rightCol.appendChild(sheet);
        tracksContainer.appendChild(leftCol); 
        tracksContainer.appendChild(rightCol);
        animView.appendChild(tracksContainer);
        this.panel.appendChild(animView);

        // --- 2. ロジック用の部屋 ---
        const logicView = document.createElement('div');
        logicView.id = 'logic-editor-area';
        logicView.className = 'bottom-view-container';
        this.panel.appendChild(logicView);

        // --- 3. 攻撃設定用の部屋 ---
        const attackView = document.createElement('div');
        attackView.id = 'attack-editor-area';
        attackView.className = 'bottom-view-container';
        this.panel.appendChild(attackView);

        // --- 4. UIエディタ用の部屋 ---
        const uiView = document.createElement('div');
        uiView.id = 'ui-editor-view';
        uiView.className = 'bottom-view-container';
        this.panel.appendChild(uiView);

        // スクロール同期
        rightCol.addEventListener('scroll', () => { 
            leftCol.scrollTop = rightCol.scrollTop; 
        });
    }

    _initResizer() {
        if (!this.panel) return;

        let resizer = document.getElementById('timeline-resizer');
        if (!resizer) {
            resizer = document.createElement('div');
            resizer.id = 'timeline-resizer';
            // ★修正: パネルの一番上に必ず配置する
            this.panel.insertBefore(resizer, this.panel.firstChild);
        }

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        resizer.addEventListener('pointerdown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = this.panel.offsetHeight;
            document.body.style.cursor = 'ns-resize'; 
        });

        window.addEventListener('pointermove', (e) => {
            if (!isResizing) return;
            const diffY = startY - e.clientY; 
            const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, startHeight + diffY));
            document.documentElement.style.setProperty('--timeline-height', `${newHeight}px`);
        });

        window.addEventListener('pointerup', () => {
            isResizing = false;
            document.body.style.cursor = '';
        });
    }


    _bindToggleEvents() {
        // フッターのボタン
        if (this.toggleBtn) {
            this.toggleBtn.onclick = () => {
                this.toggleVisibility();
            };
        }

    }
    _bindEvents() {
        // --- 下部パネルモード切替 ---
        if (this.panelModeSelect) {
            this.panelModeSelect.addEventListener('change', (e) => {
                this.switchPanelMode(e.target.value);
            });
        }

        // --- アニメーション選択 ---
        if (this.animSelect) {
            this.animSelect.addEventListener('change', (e) => {
                this.setAnimation(e.target.value);
                // インスペクタ側も同期させる
                const inspectorSelect = document.getElementById('char-anim-select');
                if (inspectorSelect) inspectorSelect.value = e.target.value;
            });
        }

        // --- 再生制御ボタン ---
        const btnPlay = document.getElementById('tl-btn-play');
        if (btnPlay) btnPlay.onclick = () => this.togglePlay();

        const btnFirst = document.getElementById('tl-btn-first');
        if (btnFirst) btnFirst.onclick = () => this.setFrame(0);

        const btnLast = document.getElementById('tl-btn-last');
        if (btnLast) btnLast.onclick = () => this.setFrame(this.totalFrames);

        const btnPrev = document.getElementById('tl-btn-prev');
        if (btnPrev) btnPrev.onclick = () => this.setFrame(this.currentFrame - 1);

        const btnNext = document.getElementById('tl-btn-next');
        if (btnNext) btnNext.onclick = () => this.setFrame(this.currentFrame + 1);

        // --- キーフレーム操作ボタン ---
        const btnRec = document.getElementById('tl-btn-record');
        if (btnRec) btnRec.onclick = () => this.recordKeyframe();

        const btnDel = document.getElementById('tl-btn-delete-key');
        if (btnDel) btnDel.onclick = () => this.deleteKeyframe();

        // --- 設定入力 ---
        if (this.frameInput) {
            this.frameInput.onchange = (e) => this.setFrame(parseInt(e.target.value));
        }
        if (this.totalFramesInput) {
            this.totalFramesInput.onchange = (e) => {
                this.totalFrames = Math.max(1, parseInt(e.target.value));
                // ★修正: フレーム数が変わったら即座に再描画して横幅を伸ばす
                this.renderTracks();
            };
        }

        // --- タイムライン領域の操作 (シーク) ---
        if (this.tracksScroll) {
            this.tracksScroll.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.keyframe-marker')) return;

                const rect = this.gridSheet.getBoundingClientRect();
                // ★修正: 150pxのオフセットはもう不要。クリックしたシート内のX座標を純粋に割るだけ。
                const clickX = e.clientX - rect.left;

                if (clickX >= 0) {
                    this.setFrame(Math.round(clickX / this.frameWidth));
                }
            });
        }
        window.addEventListener('pointermove', (e) => this._handleDragMove(e));
        window.addEventListener('pointerup', (e) => this._handleDragEnd(e));
        if (this.tracksScroll) {
            this.tracksScroll.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault(); // デフォルトのブラウザズームを防止

                    // スクロール量に応じてフレーム幅を伸縮
                    const zoomDelta = e.deltaY > 0 ? -1 : 1;
                    this.frameWidth = Math.max(2, Math.min(50, this.frameWidth + zoomDelta));

                    // 背景のグリッドサイズをフレーム幅に同期させる
                    if (this.gridSheet) {
                        this.gridSheet.style.backgroundSize = `${this.frameWidth}px 100%`;
                    }

                    // 幅が変わったので再描画
                    this.renderTracks();
                    this.updateUI();
                }
            }, { passive: false }); // passive: false を指定して e.preventDefault() を許可する
        }
    }

    // =========================================================
    //  表示・モード制御
    // =========================================================
switchPanelMode(mode) {
        this.currentPanelMode = mode;

        // --- 1. 全て一旦隠す ---
        if (this.animControls) this.animControls.style.display = 'none';
        if (this.logicControls) this.logicControls.style.display = 'none';
        if (this.attackControls) this.attackControls.style.display = 'none';
        if (this.commonSettings) this.commonSettings.style.visibility = 'hidden';

        if (this.animView) this.animView.classList.remove('active');
        if (this.logicView) this.logicView.classList.remove('active');
        if (this.attackView) this.attackView.classList.remove('active');

        // --- 2. 選択モードを表示 ---
        if (mode === 'animation') {
            if (this.animControls) this.animControls.style.display = 'flex';
            if (this.commonSettings) this.commonSettings.style.visibility = 'visible';
            if (this.animView) this.animView.classList.add('active');

            this.renderTracks(); 
        }
        else if (mode === 'logic') {
            if (this.logicControls) this.logicControls.style.display = 'flex';
            if (this.logicView) this.logicView.classList.add('active');

            if (this.charEditor && this.charEditor.logicEditor) {
                // 確実に最新の要素に描き込む
                this.charEditor.logicEditor.renderBottomUI(this.charEditor.activeCharacter);
            }
        }
        else if (mode === 'attack') {
            if (this.attackControls) this.attackControls.style.display = 'flex';
            if (this.attackView) this.attackView.classList.add('active');

            if (this.attackEditor && this.charEditor) {
                // 確実に最新の要素に描き込む
                this.attackEditor.renderBottomUI(this.charEditor.activeCharacter);
            }
        }
    }
    // エディタ全体の表示切り替え
    show() {
        this.setVisible(true);
        // ★追加: タイムラインが開いた時にプルダウンリストを最新化する
        this.updateAnimSelector();
    }

    hide() {
        // キャラモードを抜けたときに呼ばれる
        this.setVisible(false);
    }
 setVisible(isVisible) {
        if (!this.panel) return;

        if (isVisible) {
            this.panel.classList.add('visible');
            const mode = window.currentMode;
            
            // UIエディタの部屋だけを特別扱いする
            const uiView = document.getElementById('ui-editor-view');
            
            if (mode === 'character') {
                if (uiView) uiView.classList.remove('active');
                // キャラクターモードの時は、現在選ばれているサブモード(animation/logic/attack)を展開
                this.switchPanelMode(this.currentPanelMode);
            } 
            else if (mode === 'ui') {
                // UIモードの時は、アニメ系の部屋をすべて隠し、UI部屋だけを開く
                document.getElementById('anim-editor-view')?.classList.remove('active');
                document.getElementById('logic-editor-area')?.classList.remove('active');
                document.getElementById('attack-editor-area')?.classList.remove('active');
                
                if (uiView) uiView.classList.add('active');
            }
        } else {
            this.panel.classList.remove('visible');
        }
    }
    toggleVisibility() {
        if (!this.panel) return;
        const isVisible = this.panel.classList.contains('visible');
        this.setVisible(!isVisible);
    }

    setAnimation(animName) {
        this.currentAnimName = animName;
        this.setFrame(0);

        // ★追加: 選んだアニメーションのデータがまだ無ければ、空の枠を新しく作る
        if (this.charEditor && this.charEditor.activeCharacter) {
            const char = this.charEditor.activeCharacter;
            if (!char.animations) char.animations = {};
            if (!char.animations[animName]) {
                char.animations[animName] = {};
            }
        }

        this.renderTracks();
        if (this.animSelect) this.animSelect.value = animName;
    }
    updateAnimSelector() {
        if (!this.animSelect || !this.charEditor || !this.charEditor.activeCharacter) return;
        const char = this.charEditor.activeCharacter;
        const sysAnims = ['idle', 'walk', 'run', 'jump', 'step', 'attack1', 'attack2', 'attack3', 'damage', 'dead'];

        // 現在のキャラが持っている「ユーザーが独自に追加したカスタムアニメ」を抽出
        const customAnims = Object.keys(char.animations || {}).filter(n => !sysAnims.includes(n));

        let html = '';
        sysAnims.forEach(n => {
            html += `<option value="${n}">${n}</option>`;
        });
        customAnims.forEach(n => {
            html += `<option value="${n}">✨ ${n}</option>`;
        });

        this.animSelect.innerHTML = html;
        this.animSelect.value = this.currentAnimName;
    }

    // メインループからの更新
    update(dt) {
        if (!this.isPlaying) return;

        this.currentFrame += (dt * this.fps);

        if (this.currentFrame >= this.totalFrames) {
            this.currentFrame = 0; // ループ再生
        }

        this.updateUI();
        this.applyPoseAtFrame(this.currentFrame);
    }

    // =========================================================
    //  キーフレーム操作 (Record / Delete / Apply)
    // =========================================================

    recordKeyframe() {
        if (!this.charEditor || !this.charEditor.activeCharacter) return;
        const char = this.charEditor.activeCharacter;

        if (!char.animations) char.animations = {};
        if (!char.animations[this.currentAnimName]) char.animations[this.currentAnimName] = {};
        const animData = char.animations[this.currentAnimName];

        // ★強化: 現在選択中のパーツを取得
        let targets = [];
        if (window.selection && window.selection.selectedObjects.length > 0) {
            targets = window.selection.selectedObjects;
        } else {
            // 何も選択されていなければ、今まで通り全パーツを記録
            targets = char.parts;
        }

        targets.forEach(part => {
            if (!part.userData || !part.userData.isCharPart) return; // 念のためキャラパーツか確認

            if (!animData[part.uuid]) animData[part.uuid] = [];
            const track = animData[part.uuid];
            const currentF = Math.floor(this.currentFrame);

            const existingKeyIndex = track.findIndex(k => k.frame === currentF);
            const keyData = {
                frame: currentF,
                pos: part.position.toArray(),
                rot: part.quaternion.toArray(),
                scl: part.scale.toArray()
            };

            if (existingKeyIndex !== -1) {
                track[existingKeyIndex] = keyData;
            } else {
                track.push(keyData);
                track.sort((a, b) => a.frame - b.frame);
            }
        });

        this.renderTracks();
    }

    deleteKeyframeAtCurrent() {
        if (!this.charEditor || !this.charEditor.activeCharacter) return;
        const char = this.charEditor.activeCharacter;
        const animData = char.animations[this.currentAnimName];
        if (!animData) return;

        const currentF = Math.floor(this.currentFrame);
        let targets = window.selection ? window.selection.selectedObjects : [];
        if (targets.length === 0) targets = char.parts;

        targets.forEach(part => {
            const track = animData[part.uuid];
            if (track) {
                const idx = track.findIndex(k => k.frame === currentF);
                if (idx !== -1) track.splice(idx, 1);
            }
        });

        this.renderTracks();
        if (window.showNotification) window.showNotification("🗑️ Keyframe Deleted");
    }

    deleteKeyframe() {
        const char = this.charEditor?.activeCharacter;
        if (!char || !char.animations) return;

        const animData = char.animations[this.currentAnimName];
        if (!animData) return;

        const currentF = Math.floor(this.currentFrame);

        // 現在フレームにある全パーツのキーを削除
        Object.values(animData).forEach(track => {
            const idx = track.findIndex(k => k.frame === currentF);
            if (idx !== -1) track.splice(idx, 1);
        });

        this.renderTracks();
    }
    // ★追加: ポーズのコピー
    copyPose() {
        if (!this.charEditor || !this.charEditor.activeCharacter) return;
        const char = this.charEditor.activeCharacter;
        this.poseClipboard = {};

        // 現在の画面上の見た目（座標）を丸ごとキャッシュに保存
        char.parts.forEach(part => {
            this.poseClipboard[part.uuid] = {
                pos: part.position.toArray(),
                rot: part.quaternion.toArray(),
                scl: part.scale.toArray()
            };
        });
        if (window.showNotification) window.showNotification("📄 ポーズをコピーしました");
    }

    // ★追加: ポーズのペースト
    pastePose() {
        if (!this.poseClipboard || !this.charEditor || !this.charEditor.activeCharacter) {
            alert("コピーされたポーズがありません");
            return;
        }

        const char = this.charEditor.activeCharacter;
        if (!char.animations) char.animations = {};
        if (!char.animations[this.currentAnimName]) char.animations[this.currentAnimName] = {};
        const animData = char.animations[this.currentAnimName];

        const currentF = Math.floor(this.currentFrame);

        char.parts.forEach(part => {
            const savedPose = this.poseClipboard[part.uuid];
            if (!savedPose) return; // 構造が変わっていたら無視

            // パーツの見た目を更新
            part.position.fromArray(savedPose.pos);
            part.quaternion.fromArray(savedPose.rot);
            part.scale.fromArray(savedPose.scl);

            // キーフレームとして記録
            if (!animData[part.uuid]) animData[part.uuid] = [];
            const track = animData[part.uuid];

            const existingKeyIndex = track.findIndex(k => k.frame === currentF);
            const keyData = { frame: currentF, pos: savedPose.pos, rot: savedPose.rot, scl: savedPose.scl };

            if (existingKeyIndex !== -1) track[existingKeyIndex] = keyData;
            else track.push(keyData);

            track.sort((a, b) => a.frame - b.frame);
        });

        this.renderTracks();
        if (window.showNotification) window.showNotification("📋 ポーズを貼り付けました");
    }
    // 指定フレームのポーズを計算して適用 (補間処理)
    applyPoseAtFrame(frame) {
        const char = this.charEditor?.activeCharacter;
        if (!char || !char.animations) return;

        const animData = char.animations[this.currentAnimName];
        if (!animData) return;

        char.parts.forEach(part => {
            const track = animData[part.uuid];
            if (!track || track.length === 0) return;

            // 前後のキーフレームを探す
            let prevKey = track[0];
            let nextKey = track[track.length - 1];

            for (let i = 0; i < track.length - 1; i++) {
                if (track[i].frame <= frame && track[i + 1].frame >= frame) {
                    prevKey = track[i];
                    nextKey = track[i + 1];
                    break;
                }
            }

            // 線形補間係数 (0.0 ~ 1.0)
            let alpha = 0;
            if (nextKey.frame !== prevKey.frame) {
                alpha = (frame - prevKey.frame) / (nextKey.frame - prevKey.frame);
            }

            // ★追加: Smoothstepによるイージング（動きを滑らかにする魔法の数式）
            // alpha = alpha * alpha * (3.0 - 2.0 * alpha); // 基本の滑らかさ
            alpha = alpha * alpha * alpha * (alpha * (alpha * 6 - 15) + 10); // さらに滑らかなSmootherstep

            // 適用 (Position: Lerp, Rotation: Slerp, Scale: Lerp)
            part.position.fromArray(prevKey.pos).lerp(this._tmpVec1.fromArray(nextKey.pos), alpha);
            part.quaternion.fromArray(prevKey.rot).slerp(this._tmpQuat1.fromArray(nextKey.rot), alpha);
            part.scale.fromArray(prevKey.scl).lerp(this._tmpVec2.fromArray(nextKey.scl), alpha);
        });
    }

    setFrame(f) {
        this.currentFrame = Math.max(0, Math.min(this.totalFrames, f));
        this.updateUI();
        this.applyPoseAtFrame(this.currentFrame);
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        const btnPlay = document.getElementById('tl-btn-play');
        if (btnPlay) btnPlay.textContent = this.isPlaying ? "⏸" : "▶";
    }

    stop() {
        this.isPlaying = false;
        const btnPlay = document.getElementById('tl-btn-play');
        if (btnPlay) btnPlay.textContent = "▶";
    }

    updateUI() {
        if (this.frameInput) this.frameInput.value = Math.floor(this.currentFrame);
        if (this.playhead) {
            // ★修正: オフセット不要。純粋に計算。
            const pos = (this.currentFrame * this.frameWidth);
            this.playhead.style.left = pos + 'px';
        }
    }

    // =========================================================
    //  ドラッグ操作 (キーフレーム移動)
    // =========================================================

    _handleDragStart(e, partUUID, keyIndex, keyData) {
        e.stopPropagation(); // シーク動作防止

        // ★重要: ポインターキャプチャ (スマホスクロール防止 & 追従強化)
        if (e.target.setPointerCapture) {
            e.target.setPointerCapture(e.pointerId);
        }

        this.isDragging = true;
        this.draggingKey = {
            partUUID,
            keyIndex,
            originalFrame: keyData.frame,
            target: e.target,
            pointerId: e.pointerId
        };
        e.target.classList.add('dragging');
    }

    _handleDragMove(e) {
        if (!this.isDragging || !this.draggingKey || window.currentMode !== 'character') return;
        if (e.pointerId !== this.draggingKey.pointerId) return;

        const rect = this.gridSheet.getBoundingClientRect();
        // ★修正: オフセット不要
        const x = e.clientX - rect.left;
        let newFrame = Math.round(x / this.frameWidth);
        newFrame = Math.max(0, Math.min(this.totalFrames, newFrame));

        // マーカーの位置更新 (中心合わせのズレはCSSのmargin-leftで吸収済み)
        this.draggingKey.target.style.left = (newFrame * this.frameWidth) + 'px';
        this.draggingKey.newFrame = newFrame;
    }

    _handleDragEnd(e) {
        if (!this.isDragging) return;
        if (e.pointerId !== this.draggingKey.pointerId) return;

        // キャプチャ解放
        if (this.draggingKey.target.releasePointerCapture) {
            this.draggingKey.target.releasePointerCapture(e.pointerId);
        }

        this.isDragging = false;

        const { partUUID, keyIndex, newFrame, target } = this.draggingKey;
        target.classList.remove('dragging');

        // 位置が変わっていたらデータ更新
        if (newFrame !== undefined && newFrame !== this.draggingKey.originalFrame) {
            const char = this.charEditor.activeCharacter;
            const track = char.animations[this.currentAnimName][partUUID];

            track[keyIndex].frame = newFrame;
            track.sort((a, b) => a.frame - b.frame);

            this.renderTracks(); // 再描画
            this.setFrame(newFrame); // 移動先にシーク
        }

        this.draggingKey = null;
    }

    // =========================================================
    //  描画 (Render)
    // =========================================================

    renderTracks() {
        if (!this.labelsContainer || !this.gridSheet) return;

        // 既存の中身をクリア（ルーラーと赤い線は残す）
        this.labelsContainer.innerHTML = '';
        Array.from(this.gridSheet.children).forEach(child => {
            if (child.id !== 'timeline-ruler' && child.id !== 'timeline-playhead') {
                this.gridSheet.removeChild(child);
            }
        });

        if (!this.charEditor || !this.charEditor.activeCharacter) return;

        const char = this.charEditor.activeCharacter;
        const animData = (char.animations && char.animations[this.currentAnimName]) ? char.animations[this.currentAnimName] : {};

        // ★修正: 合計フレーム数に合わせて、シート全体の横幅をピクセル単位で確定させる
        // 例: 60F なら 600px、300F なら 3000px の横幅になり、スクロールバーが出現する
        const sheetWidth = this.totalFrames * this.frameWidth;
        this.gridSheet.style.width = Math.max(sheetWidth + 50, this.tracksScroll.clientWidth) + 'px';

        // ツール行 (左側ラベルの最上部に置く)
        const toolRow = document.createElement('div');
        toolRow.style.cssText = 'height:1.5rem; background:#222; border-bottom:1px solid #444; padding:0 5px; display:flex; align-items:center; gap:5px;';
        toolRow.innerHTML = `<button id="tl-btn-copy-pose" class="btn-secondary" style="margin:0; padding:2px; font-size:0.7rem;">C</button><button id="tl-btn-paste-pose" class="btn-secondary" style="margin:0; padding:2px; font-size:0.7rem;">P</button>`;
        this.labelsContainer.appendChild(toolRow);
        toolRow.querySelector('#tl-btn-copy-pose').onclick = () => this.copyPose();
        toolRow.querySelector('#tl-btn-paste-pose').onclick = () => this.pastePose();

        char.parts.forEach(part => {
            // --- 左側 (ラベル) ---
            const label = document.createElement('div');
            label.className = 'track-label-row';
            label.textContent = part.name;
            label.onclick = () => { document.dispatchEvent(new CustomEvent('selectObject', { detail: part })); };
            this.labelsContainer.appendChild(label);

            // --- 右側 (トラック) ---
            const row = document.createElement('div');
            row.className = 'timeline-track-row';
            row.style.width = '100%';

            const trackData = animData[part.uuid];
            if (trackData) {
                trackData.forEach((key, index) => {
                    const marker = document.createElement('div');
                    marker.className = 'keyframe-marker';
                    // ★修正: オフセット不要。CSSの margin-left で中心を合わせている
                    marker.style.left = (key.frame * this.frameWidth) + 'px';
                    marker.addEventListener('pointerdown', (e) => this._handleDragStart(e, part.uuid, index, key));
                    row.appendChild(marker);
                });
            }
            this.gridSheet.appendChild(row);
        });
    }
}