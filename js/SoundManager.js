import * as THREE from 'three';

export class SoundManager {
    constructor(camera) {
        this.listener = new THREE.AudioListener();
        if (camera) camera.add(this.listener);

        this.audioLoader = new THREE.AudioLoader();
        
        // 音響データライブラリ { id: { name, type: 'bgm'|'se', src: base64, buffer: AudioBuffer } }
        this.library = {}; 
        
        this.bgmAudio = new THREE.Audio(this.listener);
        this.positionalPool = [];
        
        // ★追加: 2D SE用のボイスプール (同時発音数制限)
        this.sePoolSize = 10;
        this.sePool = [];
        for(let i=0; i<this.sePoolSize; i++) {
            this.sePool.push(new THREE.Audio(this.listener));
        }
        // UI要素
        this.container = document.getElementById('sound-editor-area');
        this.listArea = document.getElementById('audio-list-content');
        this.inspectorArea = document.getElementById('audio-inspector-content');
        this.activeAudioId = null;

        this._initUIEvents();
    }

    // --- データ管理 ---
    
    async addSoundFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Src = e.target.result;
                const safeName = file.name.replace(/\.[^/.]+$/, ""); // 拡張子なし
                const id = "snd_" + Date.now();

                // ロードしてバッファを作成
                this.audioLoader.load(base64Src, (buffer) => {
                    this.library[id] = {
                        id: id,
                        name: safeName,
                        type: 'se', // デフォルトはSE
                        volume: 1.0,
                        src: base64Src,
                        buffer: buffer
                    };
                    this.renderList();
                    resolve();
                }, undefined, reject);
            };
            reader.readAsDataURL(file);
        });
    }

    deleteSound(id) {
        if (!this.library[id]) return;
        delete this.library[id];
        if (this.activeAudioId === id) {
            this.activeAudioId = null;
            this.renderInspector();
        }
        this.renderList();
    }

    // --- エディタ UI関連 ---

    activateEditor() {
        if (this.container) this.container.style.display = 'flex';
        this.renderList();
        
        // 3Dビューを隠す
        const canvas = document.querySelector('canvas');
        if (canvas) canvas.style.display = 'none';
        
        const inspector = document.getElementById('inspector-panel');
        const outliner = document.getElementById('outliner-panel');
        if (inspector) inspector.classList.remove('visible');
        if (outliner) outliner.classList.remove('visible');
    }

    deactivateEditor() {
        if (this.container) this.container.style.display = 'none';
        const canvas = document.querySelector('canvas');
        if (canvas) canvas.style.display = 'block';
    }

    _initUIEvents() {
        const btnImport = document.getElementById('btn-import-audio');
        const fileInput = document.getElementById('file-audio');
        
        if (btnImport && fileInput) {
            btnImport.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                for (let file of e.target.files) {
                    await this.addSoundFromFile(file);
                }
                e.target.value = '';
                if(window.showNotification) window.showNotification("🎵 音声をインポートしました");
            });
        }
    }

    renderList() {
        if (!this.listArea) return;
        this.listArea.innerHTML = '';

        if (Object.keys(this.library).length === 0) {
            this.listArea.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">登録された音声はありません</div>';
            return;
        }

        Object.values(this.library).forEach(data => {
            const row = document.createElement('div');
            const isActive = (this.activeAudioId === data.id);
            row.style.cssText = `
                display:flex; justify-content:space-between; align-items:center; 
                padding:10px; background:${isActive ? '#3a3a3c' : '#2a2a2a'}; 
                border:1px solid ${isActive ? '#ffeb3b' : '#444'}; border-radius:4px; cursor:pointer;
            `;

            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.2rem;">${data.type === 'bgm' ? '🎼' : '🔊'}</span>
                    <span style="color:#fff; font-weight:bold;">${data.name}</span>
                </div>
                <button class="btn-del" data-id="${data.id}" style="background:none; border:none; color:#ff4444; font-size:1.2rem; cursor:pointer;">×</button>
            `;

            row.onclick = () => {
                this.activeAudioId = data.id;
                this.renderList();
                this.renderInspector();
            };

            row.querySelector('.btn-del').onclick = (e) => {
                e.stopPropagation();
                if(confirm(`「${data.name}」を削除しますか？`)) this.deleteSound(data.id);
            };

            this.listArea.appendChild(row);
        });
    }

    renderInspector() {
        if (!this.inspectorArea) return;
        const data = this.library[this.activeAudioId];

        if (!data) {
            this.inspectorArea.innerHTML = '左のリストから音声を選択してください。';
            return;
        }

        this.inspectorArea.innerHTML = `
            <div>
                <label style="color:#ccc; font-size:0.8rem; display:block; margin-bottom:5px;">表示名 (Name)</label>
                <input type="text" id="snd-name" value="${data.name}" style="width:100%; padding:5px; background:#111; color:#fff; border:1px solid #555; border-radius:4px;">
            </div>
            
            <div style="margin-top:15px;">
                <label style="color:#ccc; font-size:0.8rem; display:block; margin-bottom:5px;">種類 (Type)</label>
                <select id="snd-type" style="width:100%; padding:5px; background:#111; color:#fff; border:1px solid #555; border-radius:4px;">
                    <option value="se" ${data.type === 'se' ? 'selected' : ''}>🔊 効果音 (SE)</option>
                    <option value="bgm" ${data.type === 'bgm' ? 'selected' : ''}>🎼 BGM (ループ音楽)</option>
                </select>
            </div>

            <div style="margin-top:15px;">
                <div style="display:flex; justify-content:space-between; color:#ccc; font-size:0.8rem; margin-bottom:5px;">
                    <span>基本音量 (Volume)</span>
                    <span id="snd-vol-val">${data.volume.toFixed(2)}</span>
                </div>
                <input type="range" id="snd-vol" min="0" max="2" step="0.1" value="${data.volume}" style="width:100%;">
            </div>

            <div style="margin-top:30px; display:flex; gap:10px;">
                <button id="btn-snd-play" style="flex:1; padding:10px; background:#2196f3; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">▶ 試聴する</button>
                <button id="btn-snd-stop" style="flex:1; padding:10px; background:#f44336; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">■ 停止</button>
            </div>

            <div style="margin-top:20px; font-size:0.8rem; color:#888; padding:10px; background:#111; border-radius:4px; border:1px dashed #444;">
                <strong>内部ID:</strong> <span style="user-select:all;">${data.id}</span><br>
                UIやキャラクターの設定でこのIDを指定すると再生されます。
            </div>
        `;

        // イベントバインド
        document.getElementById('snd-name').oninput = (e) => { data.name = e.target.value; this.renderList(); };
        document.getElementById('snd-type').onchange = (e) => { data.type = e.target.value; this.renderList(); };
        document.getElementById('snd-vol').oninput = (e) => { 
            data.volume = parseFloat(e.target.value); 
            document.getElementById('snd-vol-val').textContent = data.volume.toFixed(2);
        };

        // 試聴用オーディオの生成（一時的）
        const previewAudio = new Audio(data.src);
        
        document.getElementById('btn-snd-play').onclick = () => {
            previewAudio.volume = data.volume;
            previewAudio.loop = (data.type === 'bgm');
            previewAudio.currentTime = 0;
            previewAudio.play();
        };
        document.getElementById('btn-snd-stop').onclick = () => {
            previewAudio.pause();
            previewAudio.currentTime = 0;
        };
    }

    // --- 実行時の再生インターフェース ---
    
    playBGM(id) {
        const data = this.library[id];
        if (!data || !data.buffer) return;
        if (this.bgmAudio.isPlaying) this.bgmAudio.stop();
        this.bgmAudio.setBuffer(data.buffer);
        this.bgmAudio.setLoop(true);
        const masterVol = window.gameSettings ? window.gameSettings.bgmVolume : 0.5;
        this.bgmAudio.setVolume(data.volume * masterVol);
        this.bgmAudio.play();
    }

    playSE(id) {
        const data = this.library[id];
        if (!data || !data.buffer) return;
        
        // ★最適化: 使用されていない（再生が終了した）Audioオブジェクトを再利用する
        let se = this.sePool.find(audio => !audio.isPlaying);
        
        // 全部使用中なら一番古いものを強制停止して使い回す（クラッシュ防止）
        if (!se) {
            se = this.sePool[0];
            se.stop();
            // 配列の末尾に回す
            this.sePool.push(this.sePool.shift());
        }

        se.setBuffer(data.buffer);
         const masterVol = window.gameSettings ? window.gameSettings.seVolume : 0.5;
        se.setVolume(data.volume * masterVol);
        se.play();
    }

    play3DSE(id, position, distance = 10) {
        const data = this.library[id];
        if (!data || !data.buffer) return;

        // ★最適化: プール数の上限（20個）を設定し、無限生成によるメモリリークを防ぐ
        let pAudio = this.positionalPool.find(a => !a.isPlaying);
        
        if (!pAudio) {
            if (this.positionalPool.length < 20) {
                pAudio = new THREE.PositionalAudio(this.listener);
                this.positionalPool.push(pAudio);
            } else {
                pAudio = this.positionalPool[0];
                if(pAudio.isPlaying) pAudio.stop();
                this.positionalPool.push(this.positionalPool.shift());
            }
        }

        pAudio.setBuffer(data.buffer);
        const masterVol = window.gameSettings ? window.gameSettings.seVolume : 0.5;
        pAudio.setRefDistance(distance);
        pAudio.setVolume(data.volume * masterVol);
        
        // ★修正: 毎回ダミーオブジェクトを作らず、pAudio自体の座標を更新するだけでよい
        pAudio.position.copy(position);
        pAudio.play();
    }
    stopBGM() {
        if (this.bgmAudio.isPlaying) {
            this.bgmAudio.stop();
        }
    }
}