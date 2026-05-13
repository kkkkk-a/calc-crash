export class UIEditor {
   constructor(inspectorPanel, outlinerPanel) {
        this.inspector = inspectorPanel;
        this.outliner = outlinerPanel;

        this.container = document.getElementById('ui-editor-area');
        this.screen = document.getElementById('ui-editor-screen');

        this.bottomPanel = document.getElementById('timeline-panel'); // 共通の器
        this.bottomView = document.getElementById('ui-editor-view');  // UI用の部屋
        
        // ★修正: UI用の部屋の中に操作盤を構築する
        if (this.bottomView) {
            this.bottomView.innerHTML = `
                <div id="ui-bottom-palette"></div>
                <div id="ui-bottom-list-content"></div>
                <div id="ui-bottom-inspector-content"></div>
            `;
            this.paletteArea = document.getElementById('ui-bottom-palette');
            this.listArea = document.getElementById('ui-bottom-list-content');
            this.propArea = document.getElementById('ui-bottom-inspector-content');
        }

        this.elements = [];
        this.activeElement = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.zoom = 1.0;

        this.currentScreenId = 'title';

        this._initEvents();
        this._renderTools();
        this._renderPalette();

        this.initDefaultUI();
    }

    // デフォルトUI生成 (レイアウト修正版)
    initDefaultUI() {
        this.elements.forEach(e => { if (e.dom.parentNode) e.dom.parentNode.removeChild(e.dom); });
        this.elements = [];

        const w = 800;
        const h = 450;

        // --- 1. タイトル画面 ---
        this._createAndAdd('text', {
            screenId: 'title', text: 'MY GAME',
            x: w / 2 - 150, y: h / 2 - 80, width: 300, height: 60,
            fontSize: 40, color: '#ffeb3b', align: 'center'
        });
        this._createAndAdd('button', {
            screenId: 'title', text: 'START',
            x: w / 2 - 80, y: h / 2 + 20, width: 160, height: 50,
            fontSize: 20, bgColor: '#4caf50', radius: 10, borderWidth: 2,
            action: 'game_start'
        });
this._createAndAdd('button', {
            screenId: 'title', text: 'OPTION',
            x: w / 2 - 80, y: h / 2 + 90, width: 160, height: 40,
            fontSize: 16, bgColor: '#ff9800', radius: 8, borderWidth: 2,
            action: 'open_config'
        });

        // --- 2. HUD (戦闘画面) ---
        // ★追加: レーダー (右上)
        this._createAndAdd('radar', {
            screenId: 'hud', text: '',
            x: w - 170, y: 20, width: 150, height: 150,
            radius: 75, bgColor: 'rgba(0,0,0,0.5)', borderColor: '#00d2ff', borderWidth: 2,
            dataBind: 'radar_display'
        });

        this._createAndAdd('indicator', {
    screenId: 'hud', text: '▼',
    x: w / 2 - 25, y: h / 2 - 25, width: 50, height: 50,
    fontSize: 30, color: '#ffeb3b', 
    bgColor: 'transparent', // 追加
    dataBind: 'target_indicator', actionTarget: 'goal'
});

        this._createAndAdd('button', {
            screenId: 'hud', text: 'STEP',
            x: w - 310, y: h - 140,
            width: 60, height: 60,
            bgColor: 'rgba(0,0,0,0.5)', borderColor: '#e91e63', borderWidth: 2, radius: 30,
            action: 'step'
        });
        // HPバー / SPバー
        this._createAndAdd('panel', { screenId: 'hud', text: '', x: 20, y: 20, width: 200, height: 20, bgColor: '#333', borderWidth: 1 });
        this._createAndAdd('panel', { screenId: 'hud', text: '', x: 20, y: 20, width: 200, height: 20, bgColor: '#4caf50', borderWidth: 0, dataBind: 'hp_bar' });
        this._createAndAdd('text', { 
    screenId: 'hud', text: '100', 
    x: 230, y: 20, width: 50, height: 20, 
    fontSize: 16, dataBind: 'player_hp',
    bgColor: 'transparent' // 追加
});
        this._createAndAdd('panel', { screenId: 'hud', text: '', x: 20, y: 45, width: 150, height: 12, bgColor: '#333', borderWidth: 1 });
        this._createAndAdd('panel', { screenId: 'hud', text: '', x: 20, y: 45, width: 150, height: 12, bgColor: '#00d2ff', borderWidth: 0, dataBind: 'sp_bar' });

        // メニューボタン
        this._createAndAdd('button', { 
    screenId: 'hud', 
    text: '🎒', 
    x: 20, y: 75, // 20, 70付近に変更
    width: 40, height: 40, 
    fontSize: 20, bgColor: '#333', 
    action: 'open_menu' 
});

        // 左ジョイスティック (移動用)
        this._createAndAdd('joystick', {
            screenId: 'hud', text: '',
            x: 50, y: h - 150, width: 120, height: 120,
            radius: 60, bgColor: 'rgba(255,255,255,0.2)', borderWidth: 2,
            dataBind: 'move_input' // ★明示的に追加
        });

        // 右ジョイスティック (カメラ用)
        this._createAndAdd('joystick', {
            screenId: 'hud', text: '',
            x: w - 170, y: h - 150, width: 120, height: 120,
            radius: 60, bgColor: 'rgba(255,255,0,0.1)', borderWidth: 2, dataBind: 'camera_input'
        });

        // ジャンプボタン
        this._createAndAdd('button', {
            screenId: 'hud', text: 'JUMP',
            x: w - 90, y: h - 240, width: 70, height: 70,
            bgColor: 'rgba(0,0,0,0.5)', borderColor: '#4caf50', borderWidth: 2, radius: 35, action: 'jump'
        });

        // 攻撃ボタン
        this._createAndAdd('button', {
            screenId: 'hud', text: 'ATK',
            x: w - 180, y: h - 220, width: 70, height: 70,
            bgColor: 'rgba(0,0,0,0.5)', borderColor: '#ff4444', borderWidth: 2, radius: 35, action: 'attack'
        });

        // ダッシュボタン
        this._createAndAdd('button', {
            screenId: 'hud', text: 'DASH',
            x: w - 240, y: h - 140, width: 60, height: 60,
            bgColor: 'rgba(0,0,0,0.5)', borderColor: '#00d2ff', borderWidth: 2, radius: 30, action: 'dash'
        });

        // --- ★追加: 会話イベント画面 (Dialogue) ---
        this._createAndAdd('panel', {
            screenId: 'dialogue', text: '', x: 50, y: h - 120, width: w - 100, height: 100,
            bgColor: 'rgba(0,0,0,0.8)', borderColor: '#fff', borderWidth: 2, radius: 8
        });
        this._createAndAdd('text', {
            screenId: 'dialogue', text: 'Name', x: 60, y: h - 145, width: 150, height: 30,
            fontSize: 18, color: '#ffeb3b', align: 'left', dataBind: 'dialogue_name'
        });
        this._createAndAdd('text', {
            screenId: 'dialogue', text: 'メッセージがここに表示されます',
            x: 70, y: h - 100, width: w - 140, height: 60,
            fontSize: 20, color: '#ffffff', align: 'left', dataBind: 'dialogue_text'
        });
        this._createAndAdd('button', {
            screenId: 'dialogue', text: '▼', x: w - 100, y: h - 50, width: 40, height: 30,
            bgColor: 'transparent', color: '#ffeb3b', fontSize: 20, action: 'resume_game'
        });

        // ==========================================
        // ★ アセンブル画面 (レイアウトと重なりの完全修正)
        // ==========================================

        // 全画面背景
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '',
            x: 0, y: 0, width: w, height: h,
            bgColor: 'rgba(10, 20, 30, 0.95)', zIndex: 20
        });

        // タイトル
        this._createAndAdd('text', {
            screenId: 'assemble', text: '機体構成 (アセンブル)',
            x: 20, y: 15, width: 300, height: 30, fontSize: 22, color: '#00d2ff', align: 'left', zIndex: 21
        });

        // 閉じるボタン (バツ印の完全中央配置)
        this._createAndAdd('button', {
            screenId: 'assemble', text: '×',
            x: w - 50, y: 10, width: 40, height: 40,
            bgColor: '#f44336', color: '#ffffff', fontSize: 24, radius: 4, zIndex: 22, action: 'close_menu'
        });

        // --- 左側: ステータスパネル ---
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 20, y: 60, width: 220, height: 360,
            bgColor: 'rgba(0,0,0,0.5)', borderColor: '#00a8cc', borderWidth: 1, radius: 6, zIndex: 21
        });
        this._createAndAdd('text', {
            screenId: 'assemble', text: '【機体性能】',
            x: 30, y: 70, width: 200, height: 20, fontSize: 14, color: '#aaa', align: 'left', zIndex: 22
        });
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 30, y: 100, width: 200, height: 300,
            bgColor: 'transparent', zIndex: 22, dataBind: 'assemble_stats'
        });

        // --- 中央: 装備スロット ---
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 250, y: 60, width: 260, height: 360,
            bgColor: 'rgba(0,0,0,0.5)', borderColor: '#4caf50', borderWidth: 1, radius: 6, zIndex: 21
        });
        this._createAndAdd('text', {
            screenId: 'assemble', text: '【装備スロット】',
            x: 260, y: 70, width: 200, height: 20, fontSize: 14, color: '#aaa', align: 'left', zIndex: 22
        });
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 260, y: 100, width: 240, height: 310,
            bgColor: 'transparent', zIndex: 22, dataBind: 'equip_slots_list'
        });

        // --- 右側: 所持パーツ (上段) ---
        // ★修正: 高さを縮めて下段と重ならないようにしました
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 520, y: 60, width: 260, height: 200,
            bgColor: 'rgba(0,0,0,0.5)', borderColor: '#ff9800', borderWidth: 1, radius: 6, zIndex: 21
        });
        this._createAndAdd('text', {
            screenId: 'assemble', text: '【所持パーツ】',
            x: 530, y: 70, width: 200, height: 20, fontSize: 14, color: '#aaa', align: 'left', zIndex: 22
        });
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 530, y: 100, width: 240, height: 150,
            bgColor: 'transparent', zIndex: 22, dataBind: 'equip_inventory_list'
        });

        // --- 右側: パーツ詳細 (下段) ---
        // ★修正: 上段の下に配置し、重なりと新規要素の文字を解消しました
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 520, y: 270, width: 260, height: 150,
            bgColor: 'rgba(0,0,0,0.8)', borderColor: '#ffeb3b', borderWidth: 1, radius: 6, zIndex: 21
        });
        this._createAndAdd('text', {
            screenId: 'assemble', text: '【パーツ詳細】',
            x: 530, y: 280, width: 200, height: 20, fontSize: 14, color: '#aaa', align: 'left', zIndex: 22
        });
        this._createAndAdd('panel', {
            screenId: 'assemble', text: '', x: 530, y: 310, width: 240, height: 100,
            bgColor: 'transparent', zIndex: 22, dataBind: 'selected_item_stats'
        });

        // --- 3. メニュー画面 ---
        this._createAndAdd('panel', { screenId: 'menu', text: '', x: 0, y: 0, width: w, height: h, bgColor: 'rgba(0,0,0,0.8)', zIndex: 20 });
        this._createAndAdd('panel', { screenId: 'menu', text: 'ITEM MENU', x: w / 2 - 150, y: h / 2 - 200, width: 300, height: 400, fontSize: 24, bgColor: '#444', borderWidth: 2, radius: 10, zIndex: 21 });
        this._createAndAdd('button', { screenId: 'menu', text: '×', x: w / 2 + 110, y: h / 2 - 190, width: 30, height: 30, bgColor: '#f44336', radius: 4, zIndex: 22, action: 'close_menu' });
        this._createAndAdd('panel', { screenId: 'menu', text: '', x: w / 2 - 130, y: h / 2 - 140, width: 260, height: 320, bgColor: '#222', borderColor: '#666', borderWidth: 1, zIndex: 22, dataBind: 'inventory_list' });

        // --- 4. ゲームオーバー画面 ---
        this._createAndAdd('panel', {
            screenId: 'gameover', text: '',
            x: 0, y: 0, width: w, height: h,
            bgColor: 'rgba(50,0,0,0.9)', zIndex: 30
        });
        this._createAndAdd('text', {
            screenId: 'gameover', text: 'GAME OVER',
            x: w / 2 - 200, y: h / 2 - 120, width: 400, height: 80,
            fontSize: 60, color: '#f44336', align: 'center', zIndex: 31
        });
        this._createAndAdd('button', {
            screenId: 'gameover', text: 'RESTART',
            x: w / 2 - 120, y: h / 2 + 20, width: 240, height: 60,
            fontSize: 24, bgColor: '#ff9800', radius: 12, borderWidth: 3, action: 'restart_game', zIndex: 31
        });
        this._createAndAdd('button', {
            screenId: 'gameover', text: 'Back to Title',
            x: w / 2 - 120, y: h / 2 + 100, width: 240, height: 40,
            fontSize: 16, bgColor: '#333', borderColor: '#888', borderWidth: 1, radius: 8, action: 'return_to_title', zIndex: 31
        });

        // --- 5. リザルト画面 ---
        this._createAndAdd('panel', {
            screenId: 'result', text: '',
            x: 0, y: 0, width: w, height: h,
            bgColor: 'rgba(255,215,0,0.3)', zIndex: 30
        });
        this._createAndAdd('text', {
            screenId: 'result', text: 'YOU WIN!',
            x: w / 2 - 200, y: h / 2 - 150, width: 400, height: 100,
            fontSize: 70, color: '#ffffff', align: 'center', zIndex: 31
        });
        this._createAndAdd('text', {
            screenId: 'result', text: 'Stage Cleared',
            x: w / 2 - 150, y: h / 2 - 60, width: 300, height: 40,
            fontSize: 24, color: '#ffeb3b', align: 'center', zIndex: 31
        });
        this._createAndAdd('text', {
            screenId: 'result', text: 'Time: 00:00',
            x: w / 2 - 150, y: h / 2 - 20, width: 300, height: 30,
            fontSize: 20, color: '#ffffff', align: 'center', zIndex: 31, dataBind: 'result_time'
        });
        this._createAndAdd('text', {
            screenId: 'result', text: 'Flags: 0 / 0',
            x: w / 2 - 150, y: h / 2 + 10, width: 300, height: 30,
            fontSize: 20, color: '#ffffff', align: 'center', zIndex: 31, dataBind: 'result_score'
        });
        this._createAndAdd('button', {
            screenId: 'result', text: 'Play Again',
            x: w / 2 - 120, y: h / 2 + 50, width: 240, height: 60,
            fontSize: 24, bgColor: '#4caf50', radius: 30, borderWidth: 3, borderColor: '#fff', action: 'restart_game', zIndex: 31
        });
        this._createAndAdd('button', {
            screenId: 'result', text: 'Title',
            x: w / 2 - 80, y: h / 2 + 130, width: 160, height: 40,
            fontSize: 16, bgColor: '#333', borderColor: '#fff', borderWidth: 1, radius: 8, action: 'return_to_title', zIndex: 31
        });

        // ==========================================
        // ★追加: 6. コンフィグ(設定)画面
        // ==========================================
        // --- 3. コンフィグ(設定)画面 ---
        this._createAndAdd('panel', { screenId: 'config', text: '', x: 0, y: 0, width: w, height: h, bgColor: 'rgba(0,0,0,0.95)', zIndex: 20 });
        this._createAndAdd('text', { screenId: 'config', text: 'SETTINGS', x: w / 2 - 100, y: 20, width: 200, height: 40, fontSize: 30, color: '#00d2ff', align: 'center', bgColor: 'transparent', zIndex: 21 });
        
        // 音量設定
        this._createAndAdd('text', { screenId: 'config', text: 'BGM Volume', x: w / 2 - 250, y: 80, width: 150, height: 30, fontSize: 18, align: 'left', bgColor: 'transparent', zIndex: 21 });
        this._createAndAdd('slider', { screenId: 'config', x: w / 2 - 80, y: 85, width: 300, height: 20, dataBind: 'set_bgm_vol', zIndex: 21 });

        this._createAndAdd('text', { screenId: 'config', text: 'SE Volume', x: w / 2 - 250, y: 120, width: 150, height: 30, fontSize: 18, align: 'left', bgColor: 'transparent', zIndex: 21 });
        this._createAndAdd('slider', { screenId: 'config', x: w / 2 - 80, y: 125, width: 300, height: 20, dataBind: 'set_se_vol', zIndex: 21 });

        // ★強化: キーコンフィグ
        this._createAndAdd('text', { screenId: 'config', text: 'Key Config', x: w / 2 - 250, y: 180, width: 200, height: 30, fontSize: 22, color: '#ffeb3b', align: 'left', bgColor: 'transparent', zIndex: 21 });
        
        const keyConfigData = [
            { label: 'JUMP:', target: 'jump', xOffset: -200, yOffset: 230 },
            { label: 'ATTACK:', target: 'attack', xOffset: 50, yOffset: 230 },
            { label: 'DASH:', target: 'dash', xOffset: -200, yOffset: 290 },
            { label: 'STEP:', target: 'step', xOffset: 50, yOffset: 290 }
        ];

        keyConfigData.forEach(d => {
            this._createAndAdd('text', { screenId: 'config', text: d.label, x: w / 2 + d.xOffset, y: d.yOffset, width: 100, height: 30, fontSize: 16, align: 'left', bgColor: 'transparent', zIndex: 21 });
            this._createAndAdd('button', { screenId: 'config', text: '...', x: w / 2 + d.xOffset + 100, y: d.yOffset - 5, width: 100, height: 40, bgColor: '#333', action: 'wait_key_input', actionTarget: d.target, dataBind: 'key_bind_disp', zIndex: 21 });
        });

        // 戻るボタン
        this._createAndAdd('button', { screenId: 'config', text: 'BACK', x: w / 2 - 60, y: h - 70, width: 120, height: 40, bgColor: '#555', radius: 20, action: 'open_title', zIndex: 21 });

        this._updateScreenVisibility();
    }

    _createAndAdd(type, props) {
        const data = this._createRawElement(type, props);
        this._applyStyles(data);
        return data;
    }

    _saveHistory() { 
        if (window.historyManager && window.ioManager) {
            // UI全体の現在の状態をスナップショットとして保存する
            const currentData = JSON.stringify(window.ioManager.serialize());
            // ProjectSnapshotCommand のような全体保存の仕組みがあればそれを使う
            window.saveHistory(); 
        } 
    }

    _renderTools() {
        let toolbar = document.getElementById('ui-editor-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'ui-editor-toolbar';
            toolbar.style.position = 'absolute';
            toolbar.style.top = '15px'; toolbar.style.left = '50%'; toolbar.style.transform = 'translateX(-50%)';
            toolbar.style.background = '#333'; toolbar.style.padding = '8px 20px'; toolbar.style.borderRadius = '30px';
            toolbar.style.display = 'flex'; toolbar.style.alignItems = 'center'; toolbar.style.gap = '15px'; toolbar.style.whiteSpace = 'nowrap';
            toolbar.style.zIndex = '9999'; toolbar.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5)'; toolbar.style.border = '1px solid #555';
            this.container.appendChild(toolbar);
        }
        toolbar.innerHTML = `
            <select id="ui-screen-select" style="background:#222; color:#fff; border:1px solid #555; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer;">
                <option value="title">🏁 タイトル画面</option>
                <option value="hud">⚔️ 戦闘/探索 (HUD)</option>
                <option value="assemble">⚙️ アセンブル (装備換装)</option>
                <option value="dialogue">💬 会話イベント</option>
                <option value="menu">🎒 メニュー/アイテム</option>
                <option value="gameover">☠️ ゲームオーバー</option>
                <option value="result">🏆 リザルト</option>
                <option value="config">⚙️ 設定/オプション</option>
            </select>
            <span style="border-left:1px solid #555; height:15px; margin:0 5px;"></span>
            <span id="ui-zoom-level" style="color:#fff; font-weight:bold; font-size:0.9rem; min-width:45px; text-align:center;">100%</span>
            <button id="ui-reset-zoom" title="ズームリセット" style="cursor:pointer; color:#bbb; font-size:1.1rem; background:none; border:none;">🔍</button>
            <span style="border-left:1px solid #555; height:15px; margin:0 5px;"></span>
            <button id="ui-align-h" title="左右中央" style="cursor:pointer; color:#fff; background:#444; border:1px solid #555; padding:2px 8px; border-radius:4px; font-size:0.8rem;">↔</button>
            <button id="ui-align-v" title="上下中央" style="cursor:pointer; color:#fff; background:#444; border:1px solid #555; padding:2px 8px; border-radius:4px; font-size:0.8rem;">↕</button>
            <span style="border-left:1px solid #555; height:15px; margin:0 5px;"></span>
            <button id="ui-toggle-panel" title="パネル切替" style="cursor:pointer; color:#ffeb3b; font-weight:bold; background:none; border:none; display:flex; align-items:center; gap:5px;"><span style="font-size:1.1rem;">📂</span> パネル</button>
        `;
        const screenSelect = document.getElementById('ui-screen-select');
        screenSelect.value = this.currentScreenId;
        screenSelect.onchange = (e) => { this.currentScreenId = e.target.value; this._updateScreenVisibility(); };
        document.getElementById('ui-align-h').onclick = () => this.alignSelection('x');
        document.getElementById('ui-align-v').onclick = () => this.alignSelection('y');
        document.getElementById('ui-reset-zoom').onclick = () => { this.zoom = 1.0; this._updateZoom(); };
        document.getElementById('ui-toggle-panel').onclick = () => { if (this.bottomPanel) { this.bottomPanel.classList.toggle('visible'); } };
    }

    _updateScreenVisibility() {
        this.selectElement(null);
        this.elements.forEach(data => {
            const isMatch = (data.props.screenId === this.currentScreenId);
            if (isMatch) {
                if (data.type === 'button' || data.type === 'joystick') data.dom.style.display = data.props.visible ? 'flex' : 'none';
                else data.dom.style.display = data.props.visible ? 'block' : 'none';
            } else {
                data.dom.style.display = 'none';
            }
        });
        this.updateOutliner();
    }
    _updateZoom() { this.screen.style.transform = `scale(${this.zoom})`; document.getElementById('ui-zoom-level').textContent = Math.round(this.zoom * 100) + "%"; }

    _renderPalette() {
        if (!this.paletteArea) return;
        this.paletteArea.innerHTML = '';
        const createSection = (title) => { const div = document.createElement('div'); div.style.fontSize = '0.75rem'; div.style.color = '#aaa'; div.style.marginBottom = '5px'; div.style.marginTop = '10px'; div.textContent = title; return div; };
        const createBtn = (label, onClick) => { const btn = document.createElement('button'); btn.className = 'btn-secondary'; btn.textContent = label; btn.style.marginBottom = '5px'; btn.onclick = onClick; return btn; };

        this.paletteArea.appendChild(createSection("基本パーツ"));
        const basicTypes = [
            { id: 'button', label: '🔘 ボタン' }, { id: 'text', label: '📝 テキスト' },
            { id: 'panel', label: '⬜ パネル' }, { id: 'image', label: '🖼️ 画像' },
            { id: 'slider', label: '🎚️ ゲージ/バー' },
            { id: 'radar', label: '📡 レーダー' },
            { id: 'indicator', label: '📍 指標' }, { id: 'joystick', label: '🕹️ 操作キー' },
        ];
        basicTypes.forEach(t => { this.paletteArea.appendChild(createBtn(t.label, () => this.addElement(t.id))); });
    }

    _createRawElement(type, propsOverride = {}) {
        const el = document.createElement('div');
        const id = 'ui_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        el.style.position = 'absolute'; el.style.boxSizing = 'border-box';
        el.dataset.id = id; el.className = 'ui-element-item';

        const defaultProps = {
            parentId: null, zIndex: 0,
            x: 50, y: 50, width: 100, height: 50,
            text: '', // ★修正: デフォルトの文字は空にする
            fontSize: 16, color: '#ffffff', bgColor: '#444444',
            borderColor: '#ffffff', borderWidth: 0, radius: 4, opacity: 1.0, visible: true,
            imageUrl: '', screenId: this.currentScreenId,
            action: 'none', actionTarget: '', dataBind: ''
        };

        const data = {
            id: id, type: type, dom: el,
            props: { ...defaultProps, ...propsOverride }
        };

        if (type === 'joystick') {
            const knob = document.createElement('div');
            knob.className = 'ui-joystick-knob';
            knob.style.position = 'absolute';
            knob.style.width = '40%';
            knob.style.height = '40%';
            knob.style.backgroundColor = 'rgba(255,255,255,0.5)';
            knob.style.borderRadius = '50%';
            knob.style.pointerEvents = 'none';
            el.appendChild(knob);
        }

        if (data.props.parentId) {
            const parent = this.elements.find(e => e.id === data.props.parentId);
            if (parent) parent.dom.appendChild(el); else this.screen.appendChild(el);
        } else {
            this.screen.appendChild(el);
        }

        this._applyStyles(data);
        this.elements.push(data);
        this._attachElementEvents(el, data);
        return data;
    }

activate() {
        if (!this.container) return;
        this.container.style.display = 'flex';
        const canvas = document.querySelector('canvas'); 
        if (canvas) canvas.style.display = 'none';

        if (this.inspector) this.inspector.classList.remove('visible');
        if (this.outliner) this.outliner.classList.remove('visible');

        // ★修正: TimelineEditor側の機能を使って共通パネルを開き、UIの部屋を表示させる
        if (this.bottomPanel && window.timelineEditor) {
            window.timelineEditor.setVisible(true);
        }

        this._renderPalette();
        this.updateOutliner();
        this.updateInspector();
        this._updateScreenVisibility();
    }

    deactivate() {
        if (!this.container) return;
        this.container.style.display = 'none';
        const canvas = document.querySelector('canvas'); if (canvas) canvas.style.display = 'block';

        if (this.bottomPanel) {
            const tlHeader = this.bottomPanel.querySelector('.timeline-header'); if (tlHeader) tlHeader.style.display = '';
            this.bottomPanel.classList.remove('visible');
        }
        if (this.bottomView) this.bottomView.style.display = 'none';
        const animScroll = document.getElementById('timeline-tracks-scroll'); if (animScroll) animScroll.style.display = 'block';
    }

    _attachElementEvents(el, data) { el.addEventListener('mousedown', (e) => this._onDragStart(e, data)); el.addEventListener('touchstart', (e) => { const touch = e.touches[0]; this._onDragStart({ stopPropagation: () => e.stopPropagation(), clientX: touch.clientX, clientY: touch.clientY }, data); }, { passive: false }); }
    deleteElement(data) { if (!data) return; this._saveHistory(); this.elements.forEach(child => { if (child.props.parentId === data.id) this.reparentElement(child, null); }); if (data.dom && data.dom.parentNode) data.dom.parentNode.removeChild(data.dom); this.elements = this.elements.filter(e => e.id !== data.id); if (this.activeElement === data) { this.activeElement = null; this.updateInspector(); } this._updateScreenVisibility(); }
    selectElement(data) { this.activeElement = data; this.elements.forEach(e => { e.dom.style.outline = 'none'; e.dom.style.zIndex = e.props.zIndex; }); if (data) { data.dom.style.outline = '2px solid #00d2ff'; } this.updateInspector(); this.updateOutliner(); }
    reparentElement(childData, newParentId) { if (newParentId === childData.id) return; if (newParentId) { const parentData = this.elements.find(e => e.id === newParentId); if (parentData) { parentData.dom.appendChild(childData.dom); childData.props.parentId = newParentId; } } else { this.screen.appendChild(childData.dom); childData.props.parentId = null; } this._applyStyles(childData); this.updateOutliner(); }
    _initEvents() { this.container.addEventListener('wheel', (e) => { e.preventDefault(); const delta = -Math.sign(e.deltaY) * 0.1; this.zoom = Math.max(0.2, Math.min(3.0, this.zoom + delta)); this._updateZoom(); }, { passive: false }); window.addEventListener('mousemove', (e) => this._onDragMove(e.clientX, e.clientY, e.shiftKey)); window.addEventListener('mouseup', () => this._onDragEnd()); window.addEventListener('touchmove', (e) => { if (this.isDragging) e.preventDefault(); const t = e.touches[0]; this._onDragMove(t.clientX, t.clientY, false); }, { passive: false }); window.addEventListener('touchend', () => this._onDragEnd()); window.addEventListener('keydown', (e) => { if (window.currentMode !== 'ui') return; const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
                return; 
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.activeElement) this.deleteElement(this.activeElement);
            }
        }); }
    _onDragStart(e, data) { e.stopPropagation(); this._saveHistory(); this.selectElement(data); this.isDragging = true; this.dragStartMouseX = e.clientX; this.dragStartMouseY = e.clientY; this.dragStartElemX = data.props.x; this.dragStartElemY = data.props.y; }
    _onDragMove(clientX, clientY, isShift) {
        // ★追加: 現在のモードが 'ui' でなければ処理しない
        if (window.currentMode !== 'ui') return;

        if (!this.isDragging || !this.activeElement) return;
        const data = this.activeElement;
        const deltaX = (clientX - this.dragStartMouseX) / this.zoom;
        const deltaY = (clientY - this.dragStartMouseY) / this.zoom;
        let newX = this.dragStartElemX + deltaX;
        let newY = this.dragStartElemY + deltaY;

        if (isShift) {
            newX = Math.round(newX / 10) * 10;
            newY = Math.round(newY / 10) * 10;
        }
        data.props.x = newX;
        data.props.y = newY;
        this._applyStyles(data);
        this.updateInspector(false);
    }

     _onDragEnd() {
        if (window.currentMode !== 'ui') return;

        if (this.isDragging) {
            this.isDragging = false;
            this.updateInspector();
            // ★追加: ドラッグ終了時に履歴を保存
            this._saveHistory();
        }
    }
    addElement(type) {
        this._saveHistory();
        const data = this._createRawElement(type, {});
        if (type === 'button') { data.props.bgColor = '#007acc'; data.props.text = 'Button'; data.props.width = 120; data.props.height = 40; data.props.radius = 8; }
        else if (type === 'text') { data.props.bgColor = 'transparent'; data.props.text = 'Text'; data.props.fontSize = 24; data.props.width = 200; data.props.height = 40; }
        else if (type === 'panel') { data.props.bgColor = 'rgba(0, 0, 0, 0.7)'; data.props.text = ''; data.props.width = 300; data.props.height = 200; }
        else if (type === 'image') { data.props.bgColor = 'transparent'; data.props.text = ''; data.props.width = 100; data.props.height = 100; }
        else if (type === 'slider') { data.props.bgColor = '#333'; data.props.color = '#4caf50'; data.props.text = ''; data.props.width = 200; data.props.height = 20; data.props.radius = 10; data.props.borderWidth = 0; }
        else if (type === 'radar') {
            data.props.width = 150; data.props.height = 150; data.props.radius = 75;
            data.props.bgColor = 'rgba(0,0,0,0.5)'; data.props.borderColor = '#00d2ff'; data.props.borderWidth = 2;
            data.props.dataBind = 'radar_display';
        }
        else if (type === 'indicator') {
            data.props.width = 50; data.props.height = 50; data.props.text = '▼';
            data.props.color = '#ffeb3b'; data.props.fontSize = 24;
            data.props.dataBind = 'target_indicator'; data.props.actionTarget = 'goal'; // 追跡対象の役割
        }
        else if (type === 'joystick') { data.props.bgColor = 'rgba(255, 255, 255, 0.2)'; data.props.borderColor = '#ffffff'; data.props.borderWidth = 2; data.props.width = 120; data.props.height = 120; data.props.radius = 60; data.props.text = ''; }

        this._applyStyles(data);
        this.selectElement(data);
        if (window.showNotification) window.showNotification(`追加: ${type}`);
        this.updateOutliner();
    }
    _applyStyles(data) {
        const s = data.dom.style;
        const p = data.props;
        s.left = p.x + 'px'; s.top = p.y + 'px';
        s.width = p.width + 'px'; s.height = p.height + 'px';
        s.backgroundColor = p.bgColor; s.color = p.color;
        s.fontSize = p.fontSize + 'px';
        s.border = `${p.borderWidth}px solid ${p.borderColor}`;
        s.borderRadius = p.radius + 'px'; s.opacity = p.opacity;
        s.zIndex = p.zIndex;
        s.textAlign = p.align || 'center';

        data.dom.innerText = p.text;

        if (data.type === 'image' && p.imageUrl) {
            s.backgroundImage = `url(${p.imageUrl})`; s.backgroundRepeat = 'no-repeat'; s.backgroundSize = 'cover'; data.dom.innerText = '';
        }

        if (p.screenId === this.currentScreenId && p.visible) {
            // ★強化: display: flex を基本にし、中身を中央に寄せる設定を共通化
            s.display = 'flex';
            s.alignItems = 'center'; // 上下中央

            if (data.type === 'text') {
                s.justifyContent = (p.align === 'left') ? 'flex-start' : (p.align === 'right' ? 'flex-end' : 'center');
            } else if (data.type === 'panel') {
                s.justifyContent = 'flex-start';
                if (!p.text) s.display = 'block';
            } else if (data.type === 'slider') {
                s.display = 'block'; // スライダーは中身（range input等）を入れるのでblock
                if (window.currentMode === 'ui') {
                    // エディタ上での見た目（ダミー）
                    data.dom.innerHTML = `<div style="width:50%; height:100%; background:${p.color}; border-radius:${p.radius}px;"></div>`;
                }
            } else {
                s.justifyContent = 'center';
            }
        } else {
            s.display = 'none';
        }

        if (data.type === 'joystick') {
            const knob = data.dom.querySelector('.ui-joystick-knob');
            if (knob) {
                knob.style.backgroundColor = p.borderColor || '#fff';
                knob.style.width = (p.width * 0.4) + 'px';
                knob.style.height = (p.height * 0.4) + 'px';
                knob.style.top = '30%'; knob.style.left = '30%';
            }
        }
    }

    updateOutliner() {
        if (!this.listArea) return;
        this.listArea.innerHTML = '';
        this.elements.forEach(data => {
            if (data.props.screenId !== this.currentScreenId) return;
            const div = document.createElement('div');
            const isSelected = (this.activeElement === data);
            div.className = `outliner-item ${isSelected ? 'selected' : ''}`;
            div.style.padding = '4px'; div.style.borderBottom = '1px solid #333'; div.style.cursor = 'pointer';
            if (data.props.parentId) { div.style.paddingLeft = '20px'; div.style.borderLeft = '2px solid #555'; }

            const bindMark = data.props.dataBind ? `<span style="color:#4caf50; font-size:0.7rem; border:1px solid #4caf50; padding:0 2px; border-radius:2px; margin-left:5px;">$${data.props.dataBind}</span>` : '';
            const actMark = (data.props.action && data.props.action !== 'none') ? `<span style="color:#ff9800; font-size:0.7rem; border:1px solid #ff9800; padding:0 2px; border-radius:2px; margin-left:5px;">⚡</span>` : '';
            const typeNames = { button: 'ボタン', text: 'テキスト', panel: 'パネル', image: '画像', joystick: '操作キー' };
            const typeLabel = typeNames[data.type] || data.type;

            div.innerHTML = `
                <span style="font-size:0.8rem; color:#ccc;">
                    ${data.props.text || typeLabel} 
                    <span style="color:#666; font-size:0.7rem; margin-left:5px;">[${typeLabel}]</span>
                    ${bindMark}${actMark}
                </span>
            `;
            div.onclick = () => this.selectElement(data);
            this.listArea.appendChild(div);
        });
    }

    updateInspector(fullRender = true) {
        if (!this.propArea) return;
        if (!this.activeElement) {
            this.propArea.innerHTML = '<div style="color:#666; width:100%; text-align:center; padding:20px;">要素を選択してください</div>';
            return;
        }
        this.propArea.innerHTML = '';
        const data = this.activeElement;
        const p = data.props;
        const type = data.type;

        const createRow = (label, input) => {
            const div = document.createElement('div');
            div.className = 'prop-row';
            div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.justifyContent = 'space-between';
            div.innerHTML = `<label style="color:#ccc;">${label}</label>`;
            input.style.flex = "1"; input.style.minWidth = "60px";
            div.appendChild(input);
            return div;
        };
        const createInput = (inputType, val, key, step = 1) => {
            const inp = document.createElement('input');
            inp.type = inputType; inp.value = val;
            if (step) inp.step = step;
            inp.addEventListener('focus', () => { if (inputType !== 'checkbox') this._saveHistory(); });
            if (inputType === 'checkbox') inp.addEventListener('mousedown', () => this._saveHistory());
            inp.addEventListener(inputType === 'checkbox' ? 'change' : 'input', (e) => {
                const v = inputType === 'checkbox' ? e.target.checked : e.target.value;
                if (inputType === 'number') p[key] = parseFloat(v); else p[key] = v;
                this._applyStyles(data);
                if (key === 'text' || key === 'screenId' || key === 'dataBind') this.updateOutliner();
                if (key === 'screenId') this.updateInspector();
            });
            return inp;
        };

        const secBasic = document.createElement('div');
        secBasic.className = 'prop-section';
        secBasic.innerHTML = `<div class="prop-title">基本設定</div>`;

        // ★修正: シンプルなプルダウン(Select)に変更
        const bindSel = document.createElement('select');
        bindSel.style.width = '100%';

        const bindOptions = [
            { v: '', l: '(なし)' },
            { v: 'move_input', l: '移動操作 (左スティック)' },
            { v: 'camera_input', l: 'カメラ操作 (右スティック)' },
            { v: 'hp_bar', l: 'HPバー (緑の伸縮バー)' },
            { v: 'player_hp', l: 'HP数値 (100/100)' },
            { v: 'sp_bar', l: 'SPバー (青の伸縮バー)' },
            { v: 'player_sp', l: 'SP数値 (100/100)' },
            { v: 'lives', l: '💖 残機数' },
            { v: 'time_limit', l: '⏰ 制限時間' },
            { v: 'time', l: '経過時間 (00:00)' },
            { v: 'inventory_list', l: 'アイテムリスト' },
            { v: 'result_time', l: '🏆 リザルト: タイム' },
            { v: 'result_score', l: '🏆 リザルト: フラグ数' },
            { v: 'assemble_stats', l: '⚙️ 機体ステータス' },
            { v: 'equip_slots_list', l: '⚙️ 現在の装備スロット' },
            { v: 'equip_inventory_list', l: '⚙️ 所持パーツ一覧' },
            // ★追加: 設定用の変数
            { v: 'set_bgm_vol', l: '🎚️ 設定: BGM音量' },
            { v: 'set_se_vol', l: '🎚️ 設定: SE音量' },
            { v: 'set_fps', l: '🎚️ 設定: FPS(30/60)' },
            { v: 'key_bind_disp', l: '⌨️ キー表示 (引数: アクション名)' },
            { v: 'radar_display', l: '📡 レーダー表示 (周囲の敵/目標)' },
            { v: 'target_indicator', l: '📍 指標表示 (引数にrole名: goal等)' },
        ];

        // 選択肢を生成
        bindOptions.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.v;
            opt.textContent = o.l;
            // 現在の値を選択状態にする
            if (o.v === (p.dataBind || '')) {
                opt.selected = true;
            }
            bindSel.appendChild(opt);
        });

        // イベント登録
        bindSel.addEventListener('mousedown', () => this._saveHistory());
        bindSel.onchange = (e) => {
            p.dataBind = e.target.value;
            this.updateOutliner(); // アウトライナーの表示も更新
        };

        // UIに追加
        secBasic.appendChild(createRow('紐付け変数', bindSel));
        secBasic.lastChild.querySelector('label').style.color = '#4caf50'; // ラベルを緑色に強調
        if (type !== 'image' && type !== 'joystick') { secBasic.appendChild(createRow('内容テキスト', createInput('text', p.text, 'text'))); }
        const parentSel = document.createElement('select'); parentSel.innerHTML = `<option value="">(なし)</option>`;
        this.elements.forEach(e => { if (e.id !== data.id && e.props.screenId === p.screenId) { const op = document.createElement('option'); op.value = e.id; op.textContent = e.props.text || e.type; if (p.parentId === e.id) op.selected = true; parentSel.appendChild(op); } });
        parentSel.onchange = (e) => { this._saveHistory(); this.reparentElement(data, e.target.value || null); };
        secBasic.appendChild(createRow('親要素', parentSel));
        const screenSel = document.createElement('select');
        screenSel.innerHTML = `<option value="title">タイトル</option><option value="hud">HUD</option><option value="dialogue">会話</option><option value="menu">メニュー</option><option value="gameover">終了画面</option><option value="result">リザルト</option>`;
        screenSel.value = p.screenId || 'hud';
        screenSel.onchange = (e) => { this._saveHistory(); p.screenId = e.target.value; this._updateScreenVisibility(); this.updateInspector(); };
        secBasic.appendChild(createRow('シーン', screenSel));
        const btnDel = document.createElement('button'); btnDel.className = 'btn-delete'; btnDel.textContent = '削除'; btnDel.style.width = '100%'; btnDel.style.marginTop = '5px'; btnDel.style.padding = '2px'; btnDel.onclick = () => this.deleteElement(data); secBasic.appendChild(btnDel); this.propArea.appendChild(secBasic);

        const secTrans = document.createElement('div'); secTrans.className = 'prop-section'; secTrans.innerHTML = `<div class="prop-title">座標・サイズ</div>`;
        secTrans.appendChild(createRow('位置 X', createInput('number', p.x, 'x'))); secTrans.appendChild(createRow('位置 Y', createInput('number', p.y, 'y')));
        secTrans.appendChild(createRow('幅 W', createInput('number', p.width, 'width'))); secTrans.appendChild(createRow('高さ H', createInput('number', p.height, 'height')));
        secTrans.appendChild(createRow('重なり Z', createInput('number', p.zIndex, 'zIndex', 1))); this.propArea.appendChild(secTrans);

        const secStyle = document.createElement('div'); secStyle.className = 'prop-section'; secStyle.innerHTML = `<div class="prop-title">スタイル</div>`;
        if (type !== 'image') { secStyle.appendChild(createRow('背景色', createInput('color', p.bgColor, 'bgColor'))); secStyle.appendChild(createRow('枠線色', createInput('color', p.borderColor, 'borderColor'))); secStyle.appendChild(createRow('枠線幅', createInput('number', p.borderWidth, 'borderWidth'))); secStyle.appendChild(createRow('角丸', createInput('number', p.radius, 'radius'))); }
        if (type === 'text' || type === 'button') {
            secStyle.appendChild(createRow('文字色', createInput('color', p.color, 'color')));
            secStyle.appendChild(createRow('文字大', createInput('number', p.fontSize, 'fontSize')));

            const alignSel = document.createElement('select');
            ['left', 'center', 'right'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; alignSel.appendChild(o); });
            alignSel.value = p.align || 'center';
            alignSel.onchange = (e) => { p.align = e.target.value; this._applyStyles(data); };
            secStyle.appendChild(createRow('文字揃え', alignSel));
        }
        secStyle.appendChild(createRow('透明度', createInput('range', p.opacity, 'opacity', 0.1)));
        if (type === 'image') { const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.onchange = (e) => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = (ev) => { p.imageUrl = ev.target.result; this._applyStyles(data); }; r.readAsDataURL(f); } }; secStyle.appendChild(createRow('画像', fileInp)); }
        this.propArea.appendChild(secStyle);

        if (type === 'button' || type === 'image' || type === 'panel' || type === 'indicator') {
            const secAction = document.createElement('div'); secAction.className = 'prop-section'; secAction.innerHTML = `<div class="prop-title" style="color:#ff9800;">アクション設定</div>`;
            const actSel = document.createElement('select');
            let options = [
                { v: 'none', l: 'なし' },
                { v: 'open_menu', l: '📂 メニューを開く' },
                { v: 'close_menu', l: '❌ メニューを閉じる' },
                { v: 'wait_key_input', l: '⌨️ キー割り当て変更' } // ★追加
            ];

            if (this.currentScreenId === 'title' || this.currentScreenId === 'config') {
                options.push(
                    { v: 'game_start', l: '🎮 ゲーム開始' },
                    { v: 'open_config', l: '⚙️ 設定画面を開く' },
                    { v: 'open_title', l: '🏠 タイトルに戻る' },
                    { v: 'load_game', l: '📂 ロード' }
                );
            }
            else if (this.currentScreenId === 'hud') {
                options.push(
                    { v: 'attack', l: '⚔️ 攻撃' },
                    { v: 'interact', l: '🔍 調べる / 作動' },
                    { v: 'jump', l: '🦘 ジャンプ' },
                    { v: 'use_item', l: '💊 アイテム使用' },
                    { v: 'toggle_lockon', l: '🎯 ロックオン切替' },
                    { v: 'play_motion', l: '🎬 モーション再生' },
                    { v: 'gravity_up', l: '⬆️ 重力:上' },
                    { v: 'gravity_left', l: '⬅️ 重力:左' },
                    { v: 'gravity_right', l: '➡️ 重力:右' },
                    { v: 'gravity_forward', l: '⏫ 重力:奥' },
                    { v: 'gravity_backward', l: '⏬ 重力:手前' },
                    { v: 'pause', l: '⏸️ ポーズ' },
                    // ★追加: ボタン移動とカメラ操作、オートラン
                    { v: 'move_up', l: '⬆️ 移動: 前進' },
                    { v: 'move_down', l: '⬇️ 移動: 後退' },
                    { v: 'move_left', l: '⬅️ 移動: 左' },
                    { v: 'move_right', l: '➡️ 移動: 右' },
                    { v: 'cam_up', l: '🎥 カメラ: 上' },
                    { v: 'cam_down', l: '🎥 カメラ: 下' },
                    { v: 'cam_left', l: '🎥 カメラ: 左' },
                    { v: 'cam_right', l: '🎥 カメラ: 右' },
                    { v: 'auto_forward', l: '⏩ オートラン (トグル)' }
                );
            }
            else if (this.currentScreenId === 'dialogue' || this.currentScreenId.startsWith('tutorial')) {
                options.push(
                    { v: 'next_msg', l: '⏩ 次のメッセージ' },
                    { v: 'resume_game', l: '▶️ ゲームに戻る' } // ★追加: これでポーズから復帰できる
                );
            }
            else if (this.currentScreenId === 'dialogue') {
                options.push(
                    { v: 'next_msg', l: '⏩ 次のメッセージ' },
                    { v: 'skip_msg', l: '⏭️ スキップ' }
                );
            }
            // ★★★ 追加: ゲームオーバー/リザルト画面用アクション ★★★
            else if (this.currentScreenId === 'gameover' || this.currentScreenId === 'result') {
                options.push(
                    { v: 'restart_game', l: '🔄 ゲームを再開' },
                    { v: 'return_to_title', l: '🏠 タイトルに戻る' }
                );
            }
            options.forEach(opt => { const o = document.createElement('option'); o.value = opt.v; o.textContent = opt.l; actSel.appendChild(o); });
            actSel.value = p.action; actSel.addEventListener('mousedown', () => this._saveHistory()); actSel.onchange = (e) => { p.action = e.target.value; this.updateOutliner(); };
            secAction.appendChild(createRow('クリック時', actSel));
            
            // ==============================================
            // ★強化: 引数/ID のサジェスト(予測変換)付き入力欄
            // ==============================================
            const tgtInp = createInput('text', p.actionTarget, 'actionTarget'); 
            tgtInp.placeholder = "リストから選択 or 直接入力"; 
            tgtInp.setAttribute('list', 'action-target-datalist'); // datalistと紐付け

            // 既存のdatalistがあれば再利用し、なければbodyの末尾に作成
            let dataList = document.getElementById('action-target-datalist');
            if (!dataList) {
                dataList = document.createElement('datalist');
                dataList.id = 'action-target-datalist';
                document.body.appendChild(dataList);
            }
            dataList.innerHTML = ''; // リストを一度クリアして最新状態にする

            // --- 候補1: システム標準の役割 (Role) ---
            const baseRoles = [
                { v: 'goal', l: 'ゴール地点' },
                { v: 'enemy_spawn', l: '敵キャラクター' },
                { v: 'chest', l: '宝箱' },
                { v: 'item_pickup', l: 'アイテム' },
                { v: 'save', l: 'セーブポイント' },
                { v: 'talkable', l: '会話可能キャラ' }
            ];
            
            // --- 候補2: 現在のステージに置かれているカスタムID ---
            const uniqueIds = new Set();
            if (window.stage && window.stage.stageGroup) {
                window.stage.stageGroup.traverse(obj => {
                    const rp = obj.userData.roleParams;
                    if (rp) {
                        // ユーザーが設定した各種IDを拾い上げる
                        if (rp.myId) uniqueIds.add(rp.myId);
                        if (rp.portalId) uniqueIds.add(rp.portalId);
                        if (rp.mySpawnId) uniqueIds.add(rp.mySpawnId);
                    }
                });
            }

            // datalistに<option>として追加
            baseRoles.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.v;
                opt.text = `標準役割 (${r.l})`;
                dataList.appendChild(opt);
            });
            uniqueIds.forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.text = 'カスタムID (ステージ配置済み)';
                dataList.appendChild(opt);
            });
secAction.appendChild(createRow('引数/ID', tgtInp));
            const sndSel = document.createElement('select');
            sndSel.innerHTML = `<option value="">(なし)</option>`;

            if (window.soundManager) {
                Object.values(window.soundManager.library).forEach(snd => {
                    // SE（効果音）のみを抽出
                    if (snd.type === 'se') {
                        const op = document.createElement('option');
                        op.value = snd.id;
                        op.textContent = `🔊 ${snd.name}`;
                        if (p.clickSound === snd.id) op.selected = true;
                        sndSel.appendChild(op);
                    }
                });
            }

            sndSel.addEventListener('mousedown', () => this._saveHistory());
            sndSel.onchange = (e) => {
                p.clickSound = e.target.value;
                // プレビュー再生
                if (window.soundManager && e.target.value) {
                    window.soundManager.playSE(e.target.value);
                }
            };
            secAction.appendChild(createRow('クリック音', sndSel));

            this.propArea.appendChild(secAction);
        }
    }
     exportData() {
        return this.elements.map(e => ({ type: e.type, props: e.props }));
    }

    importData(dataList) {
        if (!Array.isArray(dataList)) return;
        this.elements.forEach(e => { if (e.dom.parentNode) e.dom.parentNode.removeChild(e.dom); });
        this.elements = [];
        this.activeElement = null;
        dataList.forEach(d => { this._createRawElement(d.type, d.props); });
        this._updateScreenVisibility();
    }

    alignSelection(axis) {
        if (!this.activeElement) return;
        this._saveHistory();
        const p = this.activeElement.props;
        const parentW = 800; // DESIGN_WIDTH
        const parentH = 450; // DESIGN_HEIGHT

        if (axis === 'x') p.x = (parentW - p.width) / 2;
        else if (axis === 'y') p.y = (parentH - p.height) / 2;

        this._applyStyles(this.activeElement);
        this.updateInspector(false);
    }
}