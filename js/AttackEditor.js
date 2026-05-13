export class AttackEditor {
    constructor() {
        this.container = document.getElementById('attack-editor-area');
    }
renderBottomUI(character) {
        // ★修正: 毎回最新のDOM要素を取得し直す
        this.container = document.getElementById('attack-editor-area');
        if (!this.container) return;
        
        this.container.innerHTML = '';

        if (!character) {
            this.container.innerHTML = '<div style="color:#888; padding:20px;">Select a character</div>';
            return;
        }

        if (!character.logic) character.logic = {};
        if (!character.logic.attacks) character.logic.attacks = {};

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; gap:10px; color:#e0e0e0; font-size:0.9rem; height:100%; min-width:1200px;';

        // 1. ヘッダー (Attack ID選択のみのシンプルな構成)
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex; gap:10px; align-items:center; padding-bottom:5px; border-bottom:1px solid #444;';

        headerRow.innerHTML = `
            <label style="font-weight:bold; color:#ff4444;">Edit Attack:</label>
            <select id="atk-select" style="padding:4px; background:#333; color:#fff; border:1px solid #555;">
                ${[...Array(10)].map((_,i)=>`<option value="attack${i+1}">Attack ${i+1}</option>`).join('')}
            </select>
        `; // ★注釈テキストを削除しました
        wrapper.appendChild(headerRow);

        // 2. 詳細設定エリア (スクロール対応)
        const contentArea = document.createElement('div');
        contentArea.style.cssText = 'flex:1; display:flex; gap:15px; overflow-x:hidden; overflow-y:auto; padding-bottom:20px;';
        wrapper.appendChild(contentArea);

        this.container.appendChild(wrapper);

        const select = headerRow.querySelector('#atk-select');
        select.addEventListener('change', () => {
            this._renderAttackDetails(character, select.value, contentArea);
        });

        this._renderAttackDetails(character, 'attack1', contentArea);
    }


    _renderAttackDetails(character, atkId, container) {
        container.innerHTML = '';
        
        const attacks = character.logic.attacks;
        if (!attacks[atkId]) {
            attacks[atkId] = {
                // 基本
                damage: 10, knockback: 5.0, range: 2.0, angle: 90,
                // 挙動
                moveStyle: 'stop', moveSpeed: 0, tracking: false,
                // 飛び道具
                isProjectile: false, projectileType: 'bullet', muzzlePart: '', 
                projectileCount: 1, projectileSpeed: 10, projectileDuration: 2.0,
                // 高度設定
                invincible: false, hitStop: 0.0, penetrate: false,
                // 演出
                vfx: 'none', sfx: 'none'
            };
        }
        const data = attacks[atkId];

        // 親子関係から「銃口」候補を作成
        let muzzleOptions = `<option value="">(Root / Center)</option>`;
        character.parts.forEach(p => {
            muzzleOptions += `<option value="${p.uuid}" ${data.muzzlePart===p.uuid?'selected':''}>📦 ${p.name}</option>`;
        });

        // --- カラム1: 基本性能 ---
        const colStats = this._createColumn("威力・範囲 (Stats)");
        colStats.innerHTML += `
            <div style="margin-bottom:10px;"><label>ダメージ</label><input type="number" id="atk-dmg" value="${data.damage}" style="width:100%;"></div>
            <div style="margin-bottom:10px;"><label>吹き飛ばし</label><input type="number" id="atk-kb" value="${data.knockback}" style="width:100%;"></div>
            <div style="margin-bottom:10px;">
                <label>射程: <span id="val-atk-rng">${data.range}</span>m</label>
                <input type="range" id="atk-rng" min="0.5" max="50" step="0.5" value="${data.range}" style="width:100%;">
            </div>
             <div style="margin-bottom:10px;">
                <label>角度: <span id="val-atk-ang">${data.angle}</span>°</label>
                <input type="range" id="atk-ang" min="0" max="360" step="10" value="${data.angle}" style="width:100%;">
            </div>
        `;

        // --- カラム2: 挙動 ---
        const colMove = this._createColumn("本体挙動 (Body Motion)");
        colMove.innerHTML += `
            <div style="margin-bottom:10px;"><label>移動スタイル</label>
                <select id="atk-move" style="width:100%;">
                    <option value="stop" ${data.moveStyle==='stop'?'selected':''}>🛑 停止</option>
                    <option value="slide" ${data.moveStyle==='slide'?'selected':''}>⛸️ 滑り</option>
                    <option value="dash" ${data.moveStyle==='dash'?'selected':''}>💨 突進</option>
                    <option value="jump" ${data.moveStyle==='jump'?'selected':''}>🦘 ジャンプ</option>
                </select>
            </div>
            <div style="margin-bottom:10px;"><label>移動速度</label><input type="number" id="atk-spd" value="${data.moveSpeed}" style="width:100%;"></div>
            <div style="margin-bottom:10px;"><label><input type="checkbox" id="atk-track" ${data.tracking?'checked':''}> 🎯 追尾 (Homing)</label></div>
        `;

        // --- カラム3: 飛び道具 (Projectile) ---
        const colProj = this._createColumn("飛び道具 (Projectile)");
        colProj.innerHTML += `
            <div style="margin-bottom:10px; border-bottom:1px solid #555; padding-bottom:5px;">
                <label style="color:#00d2ff;"><input type="checkbox" id="atk-is-proj" ${data.isProjectile?'checked':''}> 🔫 飛び道具にする</label>
            </div>
            <div id="proj-settings" style="display:${data.isProjectile?'block':'none'};">
                <div style="margin-bottom:10px;"><label>発射タイプ</label>
                    <select id="atk-proj-type" style="width:100%;">
                        <option value="bullet" ${data.projectileType==='bullet'?'selected':''}>弾丸 (Bullet)</option>
                        <option value="shotgun" ${data.projectileType==='shotgun'?'selected':''}>散弾 (Shotgun)</option>
                        <option value="missile" ${data.projectileType==='missile'?'selected':''}>誘導弾 (Missile)</option>
                        <option value="beam" ${data.projectileType==='beam'?'selected':''}>照射ビーム (Beam)</option>
                    </select>
                </div>
                <div style="margin-bottom:10px;"><label>銃口 (Muzzle)</label><select id="atk-muzzle" style="width:100%;">${muzzleOptions}</select></div>
                <div style="margin-bottom:10px;"><label>弾数 (Count)</label><input type="number" id="atk-p-count" value="${data.projectileCount}" min="1"></div>
                <div style="margin-bottom:10px;"><label>弾速 (Speed)</label><input type="number" id="atk-p-speed" value="${data.projectileSpeed}"></div>
                <div style="margin-bottom:10px;"><label>持続 (Sec)</label><input type="number" id="atk-p-dur" value="${data.projectileDuration}"></div>
            </div>
        `;

        // --- カラム4: 高度な戦闘 (Advanced) ---
        const colAdv = this._createColumn("特殊効果 (Advanced)");
        colAdv.innerHTML += `
            <div style="margin-bottom:10px;">
                <label style="color:#ffeb3b;"><input type="checkbox" id="atk-invincible" ${data.invincible?'checked':''}> 🔰 動作中無敵</label>
            </div>
            <div style="margin-bottom:10px;">
                <label style="color:#ff9800;"><input type="checkbox" id="atk-penetrate" ${data.penetrate?'checked':''}> 🧱 地形貫通</label>
            </div>
            <div style="margin-bottom:10px;">
                <label>ヒットストップ (秒)</label>
                <input type="number" id="atk-hitstop" value="${data.hitStop}" step="0.1" min="0">
                <div style="font-size:0.7rem; color:#888;">命中時に硬直する時間</div>
            </div>
        `;

        // --- カラム5: 演出 (Effects) ---
        const colFx = this._createColumn("演出 (Effects)");
         let sfxOptions = `<option value="none" ${data.sfx==='none'?'selected':''}>なし (無音)</option>`;
        if (window.soundManager) {
            Object.values(window.soundManager.library).forEach(snd => {
                if (snd.type === 'se') {
                    const isSelected = (data.sfx === snd.id) ? 'selected' : '';
                    sfxOptions += `<option value="${snd.id}" ${isSelected}>🔊 ${snd.name}</option>`;
                }
            });
        }

        colFx.innerHTML += `
            <div style="margin-bottom:10px;"><label>ヒットVFX</label>
                <select id="atk-vfx" style="width:100%;">
                    <option value="none" ${data.sfx==='none'?'selected':''}>なし</option>
                    <option value="slash" ${data.vfx==='slash'?'selected':''}>斬撃</option>
                    <option value="hit" ${data.vfx==='hit'?'selected':''}>打撃</option>
                    <option value="explosion" ${data.vfx==='explosion'?'selected':''}>爆発</option>
                    <option value="fire" ${data.vfx==='fire'?'selected':''}>炎</option>
                </select>
            </div>
            <div style="margin-bottom:10px;"><label>攻撃時の音 (SE)</label>
                <!-- ★固定リストを廃止し、登録サウンドのリストに差し替え -->
                <select id="atk-sfx" style="width:100%;">
                    ${sfxOptions}
                </select>
            </div>
        `;

        container.appendChild(colStats);
        container.appendChild(colMove);
        container.appendChild(colProj);
        container.appendChild(colAdv);
        container.appendChild(colFx);

        this._bindDetailEvents(data, container);
    }

   _createColumn(title) {
        const div = document.createElement('div');
        div.style.cssText = 'flex:1; min-width:200px; background:#2a2a2a; padding:10px; border-radius:6px; border:1px solid #333;';
        div.innerHTML = `<div style="color:#ff4444; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #444; font-size:0.8rem;">${title}</div>`;
        return div;
    }
    _bindDetailEvents(data, container) {
        container.querySelectorAll('input, select').forEach(el => {
            if (el.type === 'checkbox') {
                el.style.width = '18px';
                el.style.height = '18px';
                el.style.cursor = 'pointer';
            } else {
                el.style.cssText += "background:#111; color:#fff; border:1px solid #555; width:100%;";
            }
        });
        const inputBg = "background:#111; color:#fff; border:1px solid #555; width:100%;";
        container.querySelectorAll('input, select').forEach(el => el.style.cssText += inputBg);

        // Stats
        container.querySelector('#atk-dmg').oninput = (e) => data.damage = parseInt(e.target.value);
        container.querySelector('#atk-kb').oninput = (e) => data.knockback = parseFloat(e.target.value);
                // 射程 (Range)
        container.querySelector('#atk-rng').oninput = (e) => { 
            data.range = parseFloat(e.target.value); 
            container.querySelector('#val-atk-rng').textContent = data.range;
            this.updateAttackGuide(data); // ★ガイド更新
        };

        // 角度 (Angle)
        container.querySelector('#atk-ang').oninput = (e) => { 
            data.angle = parseInt(e.target.value); 
            container.querySelector('#val-atk-ang').textContent = data.angle;
            this.updateAttackGuide(data); // ★ガイド更新
        };
        // Motion
        container.querySelector('#atk-move').onchange = (e) => data.moveStyle = e.target.value;
        container.querySelector('#atk-spd').oninput = (e) => data.moveSpeed = parseFloat(e.target.value);
        container.querySelector('#atk-track').onchange = (e) => data.tracking = e.target.checked;

        // Projectile
        const projSettings = container.querySelector('#proj-settings');
        container.querySelector('#atk-is-proj').onchange = (e) => {
            data.isProjectile = e.target.checked;
            projSettings.style.display = e.target.checked ? 'block' : 'none';
        };
        container.querySelector('#atk-proj-type').onchange = (e) => data.projectileType = e.target.value;
        container.querySelector('#atk-muzzle').onchange = (e) => data.muzzlePart = e.target.value;
        container.querySelector('#atk-p-count').oninput = (e) => data.projectileCount = parseInt(e.target.value);
        container.querySelector('#atk-p-speed').oninput = (e) => data.projectileSpeed = parseFloat(e.target.value);
        container.querySelector('#atk-p-dur').oninput = (e) => data.projectileDuration = parseFloat(e.target.value);

        // Advanced
        container.querySelector('#atk-invincible').onchange = (e) => data.invincible = e.target.checked;
        container.querySelector('#atk-penetrate').onchange = (e) => data.penetrate = e.target.checked;
        container.querySelector('#atk-hitstop').oninput = (e) => data.hitStop = parseFloat(e.target.value);

        // FX
        container.querySelector('#atk-vfx').onchange = (e) => data.vfx = e.target.value;
        container.querySelector('#atk-sfx').onchange = (e) => data.sfx = e.target.value;
    }
    updateAttackGuide(atkData) {
        const charEditor = window.charEditor;
        if (!charEditor || !charEditor.attackGuide) return;

        const guide = charEditor.attackGuide;
        guide.visible = true;

        // 1. 射程に合わせて拡大
        guide.scale.set(atkData.range, 1, atkData.range);

        // 2. 角度(扇形)に合わせてジオメトリを作り直す (もっと効率的な方法もあるが、これが確実)
        const rad = (atkData.angle || 360) * (Math.PI / 180);
        guide.geometry.dispose();
        // 第7引数が開始角度、第8引数が扇の広さ
        guide.geometry = new THREE.CylinderGeometry(1, 1, 0.1, 32, 1, false, -rad/2, rad);

        // 3. 位置をキャラクターの足元に合わせる
        if (charEditor.activeCharacter) {
            guide.position.copy(charEditor.activeCharacter.rootGroup.position);
            guide.position.y += 0.1; // 地面とのチラつき防止
            // 向きも合わせる
            guide.rotation.copy(charEditor.activeCharacter.rootGroup.rotation);
        }
    }
}