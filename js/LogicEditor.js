/* =========================================
   Logic Editor (AI & Behavior) - 完全版
   ========================================= */
export class LogicEditor {
    constructor() {
        this.container = document.getElementById('logic-editor-area');
    }

    // =========================================================
    //  下部パネル描画 (メイン設定画面)
    // =========================================================
     renderBottomUI(character) {
        // ★修正: 毎回最新のDOM要素を取得し直す
        this.container = document.getElementById('logic-editor-area');
        if (!this.container) return;
        this.container.innerHTML = '';

        if (!character) {
            this.container.innerHTML = '<div style="color:#888; padding:20px; text-align:center;">キャラクターを選択してください</div>';
            return;
        }

        // 1. データ初期化 & デフォルト値設定
        this._initializeData(character);
        const logic = character.logic;

        // 2. コンテナ作成
        const wrapper = document.createElement('div');
        wrapper.className = 'logic-container';

        // 3. 各カラムの構築
        this._renderBasicColumn(wrapper, logic);     // 基本・防御
        this._renderTriggerColumn(wrapper, logic);   // 敵対トリガー
        this._renderSensorColumn(wrapper, logic);    // 感知・センサー
        this._renderRelationColumn(wrapper, logic);  // 関係・移動
        this._renderPatternsColumn(wrapper, logic);  // ★行動パターン (セリフ連携追加)
        this._renderDialogueColumn(wrapper, logic);  
        this._renderDropColumn(wrapper, logic); // ★追加: ドロップ設定カラム

        // 4. 表示
        this.container.appendChild(wrapper);

        // 5. イベント登録
        this._bindStaticEvents(wrapper, logic);
    }

    // --- データ初期化 ---
    _initializeData(character) {
        if (!character.logic) character.logic = {};
        const l = character.logic;

        // デフォルト値の定義
        const defaults = {
            triggers: { onSight: true, onDamage: true, always: false },
            faction: "Enemy",
            targetPlayer: true,
            damageFromPlayer: true,
            friendlyFire: false,
            invincibleBeforeAggro: false,
            visionRange: 15,
            searchTime: 3,
            attackRange: 1.5,
            moveType: 'stand',
            patrolRange: 5.0,
            combatType: 'chase',
            avoidCliffs: false,
            jumpObstacles: false,
            patterns: [],
            dialogues: [],
            // ★追加: ドロップ設定の初期値
            drop: { 
                chance: 50, itemName: '戦利品', itemIcon: '💎', 
                itemDesc: '敵が落としたアイテム。', itemType: 'equipment', 
                equipSlot: 'body', amount: 5 
            }
        };

        // 未定義のプロパティのみデフォルト値を適用
        for (const key in defaults) {
            if (l[key] === undefined) l[key] = defaults[key];
        }
        if (!l.triggers) l.triggers = defaults.triggers;
    }

    // --- ヘルパー: カラム作成 ---
    _createColumn(title) {
        const div = document.createElement('div');
        div.className = 'logic-column';
        div.innerHTML = `<div class="logic-title">${title}</div>`;
        return div;
    }

    // =========================================================
    //  各カラムのレンダリング (HTML生成)
    // =========================================================

    _renderBasicColumn(wrapper, logic) {
        const col = this._createColumn("基本・防御 (Attributes)");
        col.innerHTML += `
            <div>
                <label class="param-label">所属 (Faction)</label>
                <input type="text" id="lg-faction" value="${logic.faction}" class="param-input">
            </div>
            <label class="toggle-switch-label">
                <input type="checkbox" id="lg-friendly-fire" ${logic.friendlyFire ? 'checked' : ''}> 同族攻撃 (Friendly Fire)
            </label>
            <label class="toggle-switch-label" style="color:#4caf50;">
                <input type="checkbox" id="lg-invincible-aggro" ${logic.invincibleBeforeAggro ? 'checked' : ''}> 🔰 接敵まで無敵
            </label>
        `;
        wrapper.appendChild(col);
    }

    _renderTriggerColumn(wrapper, logic) {
        const col = this._createColumn("敵対条件 (Triggers)");
        col.innerHTML += `
            <label class="toggle-switch-label">
                <input type="checkbox" id="lg-trig-sight" ${logic.triggers.onSight ? 'checked' : ''}> 👁️ 視覚感知
            </label>
            <label class="toggle-switch-label">
                <input type="checkbox" id="lg-trig-damage" ${logic.triggers.onDamage ? 'checked' : ''}> 💢 被弾反撃
            </label>
            <label class="toggle-switch-label">
                <input type="checkbox" id="lg-trig-always" ${logic.triggers.always ? 'checked' : ''}> 🔥 常時敵対
            </label>
        `;
        wrapper.appendChild(col);
    }

    _renderSensorColumn(wrapper, logic) {
        const col = this._createColumn("感知・警戒 (Sensors)");
        col.innerHTML += `
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span>索敵距離 (Radius)</span><span id="val-vision" style="color:#00d2ff;">${logic.visionRange}m</span>
                </div>
                <input type="range" id="lg-vision" min="1" max="50" step="1" value="${logic.visionRange}" style="width:100%;">
            </div>
            <!-- ★追加: 視野角 (FOV) -->
            <div style="margin-top:5px; border-bottom:1px dashed #555; padding-bottom:5px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span>視野角 (FOV)</span><span id="val-fov" style="color:#00d2ff;">${logic.fov !== undefined ? logic.fov : 120}°</span>
                </div>
                <input type="range" id="lg-fov" min="30" max="360" step="10" value="${logic.fov !== undefined ? logic.fov : 120}" style="width:100%;">
            </div>
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span>見失い猶予 (警戒時間)</span><span id="val-search-time" style="color:#ffeb3b;">${logic.searchTime}s</span>
                </div>
                <input type="range" id="lg-search-time" min="0" max="20" step="1" value="${logic.searchTime}" style="width:100%;">
            </div>
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span>攻撃開始距離</span><span id="val-atk-range" style="color:#ff4444;">${logic.attackRange}m</span>
                </div>
                <input type="range" id="lg-atk-range" min="0.5" max="20" step="0.5" value="${logic.attackRange}" style="width:100%;">
            </div>
        `;
        wrapper.appendChild(col);
    }
_renderRelationColumn(wrapper, logic) {
        const col = this._createColumn("関係・移動 (Relation/Move)");
        col.innerHTML += `
            <label class="toggle-switch-label">
                <input type="checkbox" id="lg-target-player" ${logic.targetPlayer ? 'checked' : ''}> プレイヤーを狙う
            </label>
            <label class="toggle-switch-label">
                <input type="checkbox" id="lg-dmg-player" ${logic.damageFromPlayer ? 'checked' : ''}> 被弾判定あり
            </label>
            
            <!-- ★追加: 飛行型オプション -->
            <label class="toggle-switch-label" style="color:#00d2ff; margin-top:5px; padding-top:5px; border-top:1px dashed #555;">
                <input type="checkbox" id="lg-is-flying" ${logic.isFlying ? 'checked' : ''}> 🕊️ 飛行タイプにする
            </label>
            <div id="flight-options" style="display:${logic.isFlying ? 'block' : 'none'}; padding-left:15px; margin-top:5px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span>目標高度 (m)</span><span id="val-flight-h">${logic.flightHeight || 2.5}</span>
                </div>
                <input type="range" id="lg-flight-h" min="0.5" max="10" step="0.5" value="${logic.flightHeight || 2.5}" style="width:100%;">
            </div>

            <div style="margin-top:8px; border-top:1px solid #444; padding-top:5px;">
                <label style="color:#00d2ff; font-size:0.75rem;">平常時の移動</label>
                <select id="lg-move-type" class="param-select">
                    <option value="stand" ${logic.moveType==='stand'?'selected':''}>🧍 待機</option>
                    <option value="patrol" ${logic.moveType==='patrol'?'selected':''}>↔️ 巡回</option>
                    <option value="wander" ${logic.moveType==='wander'?'selected':''}>🎲 徘徊</option>
                </select>
            </div>
            <div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span>移動範囲</span><span id="val-move-range">${logic.patrolRange}m</span>
                </div>
                <input type="range" id="lg-move-range" min="1" max="30" value="${logic.patrolRange}" style="width:100%;">
            </div>

            <div style="margin-top:8px; border-top:1px solid #444; padding-top:5px;">
                <label style="color:#ff4444; font-size:0.75rem;">戦闘スタイル</label>
                <select id="lg-combat-type" class="param-select">
                    <option value="chase" ${logic.combatType==='chase'?'selected':''}>🏃 追跡 (Chase)</option>
                    <option value="keep_dist" ${logic.combatType==='keep_dist'?'selected':''}>🏹 距離維持 (Range)</option>
                    <option value="ambush" ${logic.combatType==='ambush'?'selected':''}>🥷 待伏せ (Ambush)</option>
                </select>
            </div>
            <div style="margin-top:5px;">
                <label class="toggle-switch-label">
                    <input type="checkbox" id="lg-avoid-cliffs" ${logic.avoidCliffs ? 'checked' : ''}> ⛰️ 崖回避
                </label>
                <label class="toggle-switch-label">
                    <input type="checkbox" id="lg-jump-obstacles" ${logic.jumpObstacles ? 'checked' : ''}> 🐇 障害物ジャンプ
                </label>
            </div>
        `;
        wrapper.appendChild(col);
    }

    // =========================================================
    //  行動ロジック (セリフ連携対応版)
    // =========================================================
     _renderPatternsColumn(wrapper, logic) {
        const col = this._createColumn("Action Logic"); // タイトルを英語に
        
        // ★解説テキストの削除
        const listArea = document.createElement('div');
        listArea.className = 'logic-list-area';
        listArea.style.background = 'transparent';
        listArea.style.border = 'none';

        const render = () => {
            listArea.innerHTML = '';
            if (logic.patterns.length === 0) {
                listArea.innerHTML = '<div style="color:#666; text-align:center; padding:10px; font-size:0.8rem;">No rules defined.</div>';
                return;
            }
            
            logic.patterns.forEach((pat, index) => {
                const row = document.createElement('div');
                row.className = 'logic-pattern-row';
                row.style.cssText = 'background:#333; padding:8px; margin-bottom:5px; border-radius:6px; display:flex; flex-direction:column; gap:2px; border-left:4px solid #00d2ff;';

                const condOpts = [
                    { v: 'dist_lt', l: 'Dist <' }, { v: 'dist_gt', l: 'Dist >' },
                    { v: 'hp_lt',   l: 'HP < %' }, { v: 'always',  l: 'Always' }
                ];

                const actOpts = [ { v: 'chase', l: 'Chase' } ];
                for (let i = 1; i <= 10; i++) actOpts.push({ v: `attack${i}`, l: `Attack ${i}` });
                actOpts.push({ v: 'retreat', l: 'Retreat' }, { v: 'jump', l: 'Jump' }, { v: 'stand', l: 'Wait' });

                let condHtml = `<select class="pat-cond param-select" data-idx="${index}" style="background:#222; border:1px solid #555;">`;
                condOpts.forEach(o => condHtml += `<option value="${o.v}" ${pat.cond===o.v?'selected':''}>${o.l}</option>`);
                condHtml += `</select>`;

                let actHtml = `<select class="pat-act param-select" data-idx="${index}" style="background:#222; border:1px solid #555; color:#ffeb3b;">`;
                actOpts.forEach(o => actHtml += `<option value="${o.v}" ${pat.act===o.v?'selected':''}>${o.l}</option>`);
                actHtml += `</select>`;

                row.innerHTML = `
                    <div style="display:flex; align-items:center; gap:5px; font-size:0.85rem;">
                        <span style="color:#00d2ff; font-weight:bold;">IF</span>
                        ${condHtml}
                        <input type="number" class="pat-val param-input" data-idx="${index}" value="${pat.val}" style="width:50px;">
                        <button class="btn-del-pat" data-idx="${index}" style="margin-left:auto; color:#ff4444; background:none; border:none; cursor:pointer;">×</button>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; font-size:0.85rem; padding-left:10px;">
                        <span style="color:#ffeb3b;">THEN</span>
                        ${actHtml}
                        <input type="number" class="pat-prob param-input" data-idx="${index}" value="${pat.prob}" style="width:40px;">
                        <span>%</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; font-size:0.75rem; padding-left:10px; color:#888;">
                        <span>Speech ID:</span>
                        <input type="text" class="pat-speech param-input" data-idx="${index}" value="${pat.speech || ''}" style="flex:1; background:#222; border:1px solid #444;">
                    </div>
                `;
                listArea.appendChild(row);
            });
            this._rebindPatternEvents(listArea, logic, render);
        };
        render();

        const btnAdd = document.createElement('button');
        btnAdd.textContent = "+ Add Rule";
        btnAdd.className = "btn-secondary";
        btnAdd.onclick = () => {
            logic.patterns.push({ cond: 'dist_lt', val: 3.0, act: 'attack1', prob: 100, speech: '' });
            render();
        };

        col.appendChild(listArea);
        col.appendChild(btnAdd);
        wrapper.appendChild(col);
    }

    _renderDialogueColumn(wrapper, logic) {
        const col = this._createColumn("セリフ登録 (辞書)");
        const listArea = document.createElement('div');
        listArea.className = 'logic-list-area';
        listArea.style.maxHeight = "200px";

        const render = () => {
            listArea.innerHTML = '';
            if (!logic.dialogues || logic.dialogues.length === 0) {
                listArea.innerHTML = '<div style="color:#666;text-align:center;font-size:0.8rem;padding:10px;">登録なし</div>';
                return;
            }
            logic.dialogues.forEach((d, idx) => {
                const row = document.createElement('div');
                row.className = 'logic-pattern-row';
                row.style.flexDirection = 'column';
                row.style.alignItems = 'stretch';
                row.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <input type="text" class="diag-key param-input" data-idx="${idx}" value="${d.key}" placeholder="ID (例: shout)" style="width:70%; font-weight:bold; color:#ffeb3b; background:#222; font-size:0.8rem;">
                        <button class="btn-del-diag" data-idx="${idx}" style="color:#ff4444; background:none; border:none; cursor:pointer; font-size:1.2rem;">×</button>
                    </div>
                    <textarea class="diag-text param-input" data-idx="${idx}" rows="2" placeholder="セリフ内容" style="width:100%; background:#222; font-size:0.85rem;">${d.text}</textarea>
                `;
                listArea.appendChild(row);
            });
            this._rebindDialogueEvents(listArea, logic, render);
        };
        render();

        const btnAdd = document.createElement('button');
        btnAdd.textContent = "+ セリフ追加";
        btnAdd.className = "btn-secondary";
        btnAdd.onclick = () => {
            logic.dialogues.push({ key: 'new_msg', text: '' });
            render();
        };

        col.appendChild(listArea);
        col.appendChild(btnAdd);
        wrapper.appendChild(col);
    }

    // =========================================================
    //  イベントバインディング
    // =========================================================

    _bindStaticEvents(wrapper, logic) {
        const bind = (id, event, callback) => {
            const el = wrapper.querySelector(id);
            if (el) el.addEventListener(event, callback);
        };

        // Basic
        bind('#lg-faction', 'input', (e) => logic.faction = e.target.value);
        bind('#lg-friendly-fire', 'change', (e) => logic.friendlyFire = e.target.checked);
        bind('#lg-invincible-aggro', 'change', (e) => logic.invincibleBeforeAggro = e.target.checked);

        // Triggers
        bind('#lg-trig-sight', 'change', (e) => logic.triggers.onSight = e.target.checked);
        bind('#lg-trig-damage', 'change', (e) => logic.triggers.onDamage = e.target.checked);
        bind('#lg-trig-always', 'change', (e) => logic.triggers.always = e.target.checked);

        // Sensors
        bind('#lg-vision', 'input', (e) => { logic.visionRange = parseFloat(e.target.value); wrapper.querySelector('#val-vision').textContent = logic.visionRange + 'm'; });
        // ★追加: FOVのバインド
        bind('#lg-fov', 'input', (e) => { logic.fov = parseInt(e.target.value); wrapper.querySelector('#val-fov').textContent = logic.fov + '°'; });
        bind('#lg-search-time', 'input', (e) => { logic.searchTime = parseFloat(e.target.value); wrapper.querySelector('#val-search-time').textContent = logic.searchTime + 's'; });
        bind('#lg-atk-range', 'input', (e) => { logic.attackRange = parseFloat(e.target.value); wrapper.querySelector('#val-atk-range').textContent = logic.attackRange + 'm'; });

        // Relations & Move
        bind('#lg-target-player', 'change', (e) => logic.targetPlayer = e.target.checked);
        bind('#lg-dmg-player', 'change', (e) => logic.damageFromPlayer = e.target.checked);
        bind('#lg-move-type', 'change', (e) => logic.moveType = e.target.value);
        bind('#lg-move-range', 'input', (e) => { logic.patrolRange = parseFloat(e.target.value); wrapper.querySelector('#val-move-range').textContent = logic.patrolRange + 'm'; });
        
        bind('#lg-combat-type', 'change', (e) => logic.combatType = e.target.value);
        bind('#lg-avoid-cliffs', 'change', (e) => logic.avoidCliffs = e.target.checked);
        bind('#lg-jump-obstacles', 'change', (e) => logic.jumpObstacles = e.target.checked);
        bind('#lg-is-flying', 'change', (e) => {
            logic.isFlying = e.target.checked;
            const options = wrapper.querySelector('#flight-options');
            if (options) options.style.display = e.target.checked ? 'block' : 'none';
        });
        bind('#lg-flight-h', 'input', (e) => {
            logic.flightHeight = parseFloat(e.target.value);
            const valLabel = wrapper.querySelector('#val-flight-h');
            if (valLabel) valLabel.textContent = logic.flightHeight;
        });
    }

    _rebindPatternEvents(container, logic, renderCallback) {
        const update = (cls, key, parser) => {
            container.querySelectorAll(cls).forEach(el => el.onchange = el.oninput = (e) => {
                logic.patterns[e.target.dataset.idx][key] = parser ? parser(e.target.value) : e.target.value;
            });
        };
        update('.pat-cond', 'cond');
        update('.pat-val', 'val', parseFloat);
        update('.pat-act', 'act');
        update('.pat-prob', 'prob', parseInt);
        update('.pat-speech', 'speech'); // ★追加: セリフIDの保存処理

        container.querySelectorAll('.btn-del-pat').forEach(el => el.onclick = (e) => {
            logic.patterns.splice(e.target.dataset.idx, 1);
            renderCallback();
        });
    }

    _rebindDialogueEvents(container, logic, renderCallback) {
        const update = (cls, key) => {
            container.querySelectorAll(cls).forEach(el => el.oninput = (e) => {
                logic.dialogues[e.target.dataset.idx][key] = e.target.value;
            });
        };
        update('.diag-key', 'key');
        update('.diag-text', 'text');
        
        container.querySelectorAll('.btn-del-diag').forEach(el => el.onclick = (e) => {
            logic.dialogues.splice(e.target.dataset.idx, 1);
            renderCallback();
        });
    }

    // =========================================================
    //  右パネル (インスペクタ) 用
    // =========================================================
    
    renderUI(character) {
        return `
            <div class="prop-section" style="border-left: 3px solid #9c27b0; padding-left: 8px;">
                <div class="prop-title" style="color:#9c27b0">AI Logic / Dialogue</div>
                <div class="help-text">
                    行動パターンやセリフの設定は<br>
                    画面下部の <strong>「Logic / AI」</strong> パネルで行ってください。
                </div>
            </div>
        `;
    }

    bindEvents(character) {}
 _renderDropColumn(wrapper, logic) {
        const col = this._createColumn("ドロップ報酬 (Drops)");
        if (!logic.drop) logic.drop = { chance: 50, itemName: '素材', itemIcon: '⚙️', itemDesc: '', itemType: 'equipment', equipSlot: 'body', amount: 5 };
        const d = logic.drop;

        col.innerHTML += `
            <div style="margin-bottom:8px;">
                <label class="param-label">ドロップ率 (%)</label>
                <input type="number" id="lg-drop-chance" value="${d.chance}" class="param-input">
            </div>
            <div style="margin-bottom:8px;">
                <label class="param-label">種類 (Type)</label>
                <select id="lg-drop-type" class="param-select">
                    <option value="equipment" ${d.itemType==='equipment'?'selected':''}>🛡️ 装備品</option>
                    <option value="hp_heal" ${d.itemType==='hp_heal'?'selected':''}>💚 HP回復</option>
                    <option value="sp_heal" ${d.itemType==='sp_heal'?'selected':''}>💙 SP回復</option>
                    <option value="hp_max_up" ${d.itemType==='hp_max_up'?'selected':''}>❤️ 最大HPアップ</option>
                    <option value="sp_max_up" ${d.itemType==='sp_max_up'?'selected':''}>💧 最大SPアップ</option>
                </select>
            </div>
            <div style="margin-bottom:8px;">
                <label class="param-label">アイテム名</label>
                <input type="text" id="lg-drop-name" value="${d.itemName}" class="param-input">
            </div>

            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <div style="flex:1;">
                    <label class="param-label">アイコン</label>
                    <input type="text" id="lg-drop-icon" value="${d.itemIcon}" class="param-input" placeholder="絵文字">
                </div>
                <div style="flex:2;">
                    <label class="param-label">性能値 (Value)</label>
                    <input type="number" id="lg-drop-val" value="${d.amount}" class="param-input">
                </div>
            </div>
            <div style="margin-bottom:8px;">
                <label class="param-label">装備部位 (Slot)</label>
                <input type="text" id="lg-drop-slot" value="${d.equipSlot}" class="param-input" placeholder="weapon, headなど">
            </div>
        `;
        wrapper.appendChild(col);

        // イベント登録
        col.querySelector('#lg-drop-chance').oninput = (e) => d.chance = parseInt(e.target.value);
        col.querySelector('#lg-drop-type').onchange = (e) => d.itemType = e.target.value; // ★追加
        col.querySelector('#lg-drop-name').oninput = (e) => d.itemName = e.target.value;
        col.querySelector('#lg-drop-icon').oninput = (e) => d.itemIcon = e.target.value;
        col.querySelector('#lg-drop-val').oninput = (e) => d.amount = parseInt(e.target.value);
        col.querySelector('#lg-drop-slot').oninput = (e) => d.equipSlot = e.target.value;
    }
}