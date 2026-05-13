import * as THREE from 'three';

export class EffectManager {
    constructor(scene) {
        this.scene = scene;
        this.activeEffects = []; // 更新が必要なエフェクトのリスト
        
        // テクスチャキャッシュ
        this.textures = {
            alert: this._createEmojiTexture('!', '#ff0000'),
            question: this._createEmojiTexture('?', '#ffeb3b'),
            heart: this._createEmojiTexture('♥', '#ff4081'),
            sweat: this._createEmojiTexture('💦', '#00d2ff')
        };
        this.cache = {
            explosionGeo: new THREE.SphereGeometry(0.5, 16, 16),
            explosionMat: new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, depthWrite: false }),
            hitGeo: new THREE.BoxGeometry(0.3, 0.3, 0.3),
            hitMat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }),
            dustGeo: new THREE.SphereGeometry(0.2, 8, 8),
            dustMat: new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 })
        };
    }

    // --- メインループ更新 ---

    update(dt) {
        for (let i = this.activeEffects.length - 1; i >= 0; i--) {
            const fx = this.activeEffects[i];
            fx.life -= dt;
            
            // アニメーション処理
            if (fx.type === 'emote') {
                fx.mesh.position.y += dt * 0.5;
                fx.mesh.material.opacity = fx.life / fx.maxLife; 
            } else if (fx.type === 'dust') {
                // ★追加: 砂煙のアニメーション (上に上がりながら薄くなり、広がる)
                fx.mesh.position.y += dt * 0.5;
                const scale = 1.0 + (1.0 - fx.life / fx.maxLife) * 1.5;
                fx.mesh.scale.set(scale, scale, scale);
                fx.mesh.material.opacity = (fx.life / fx.maxLife) * 0.6;
            }
            else if (fx.type === 'explosion') {
                const scale = 1.0 + (1.0 - fx.life / fx.maxLife) * 3.0;
                fx.mesh.scale.set(scale, scale, scale);
                fx.mesh.material.opacity = fx.life / fx.maxLife;
            }
            else if (fx.type === 'hit') {
                fx.mesh.scale.multiplyScalar(1.1);
                fx.mesh.material.opacity = fx.life / fx.maxLife;
            }

            // 寿命切れで削除
            if (fx.life <= 0) {
                this.scene.remove(fx.mesh);
                
                // ★修正: キャッシュされた共有ジオメトリは破棄（dispose）しない
                if (fx.mesh.geometry && 
                    fx.mesh.geometry !== this.cache.explosionGeo && 
                    fx.mesh.geometry !== this.cache.hitGeo && 
                    fx.mesh.geometry !== this.cache.dustGeo) {
                    fx.mesh.geometry.dispose();
                }
                
                // マテリアルのメモリリークを確実に防ぐ（キャッシュされていないもののみ）
                if (fx.mesh.material) {
                    if (Array.isArray(fx.mesh.material)) {
                        fx.mesh.material.forEach(m => m.dispose());
                    } else {
                        fx.mesh.material.dispose();
                    }
                }
                
                this.activeEffects.splice(i, 1);
            }
        }
    }

    // --- 1. エモート (アイコン) 表示 ---
    showEmote(targetObj, type) {
        if (!this.textures[type]) return;

        const material = new THREE.SpriteMaterial({ 
            map: this.textures[type], 
            transparent: true, 
            depthTest: false // 最前面に表示
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.0, 1.0, 1.0);
        
        // ターゲットの頭上
        const pos = new THREE.Vector3();
        targetObj.getWorldPosition(pos);
        sprite.position.set(pos.x, pos.y + 1.5, pos.z); // 高さ調整

        this.scene.add(sprite);

        this.activeEffects.push({
            type: 'emote',
            mesh: sprite,
            life: 1.0,
            maxLife: 1.0
        });
    }

    // --- 2. エフェクト生成 ---
    spawnEffect(type, position, color = 0xffaa00) {
        if (type === 'explosion') {
            const mesh = new THREE.Mesh(this.cache.explosionGeo, this.cache.explosionMat);
            // マテリアルの透明度は共有されてしまうため、クローンして個別管理する
            mesh.material = mesh.material.clone();
            mesh.position.copy(position);
            this.scene.add(mesh);

            this.activeEffects.push({
                type: 'explosion',
                mesh: mesh,
                life: 0.5,
                maxLife: 0.5
            });

            // 簡易パーティクル (飛び散る破片) も少し出すと良いが、まずは本体のみ
        } 
        else if (type === 'hit' || type === 'slash') {
            // ヒット: 白い閃光
            const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
            this.scene.add(mesh);

            this.activeEffects.push({
                type: 'hit',
                mesh: mesh,
                life: 0.2,
                maxLife: 0.2
            });
        }
    else if (type === 'dust') {
            // ★追加: 砂煙エフェクト (ジャンプやダッシュ時に足元から出る)
            const geo = new THREE.SphereGeometry(0.2, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });
            const mesh = new THREE.Mesh(geo, mat);
            
            // 少しだけ散らす
            mesh.position.copy(position);
            mesh.position.x += (Math.random() - 0.5) * 0.4;
            mesh.position.z += (Math.random() - 0.5) * 0.4;
            this.scene.add(mesh);

            this.activeEffects.push({
                type: 'dust', // アニメーション処理用
                mesh: mesh,
                life: 0.3, // 0.3秒で消える
                maxLife: 0.3
            });
        }
    }

    // --- 内部ヘルパー: Canvasでアイコン作成 ---
    _createEmojiTexture(emoji, color) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.font = 'bold 100px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 縁取り
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 8;
        ctx.strokeText(emoji, size/2, size/2);
        
        // 中身
        ctx.fillStyle = color;
        ctx.fillText(emoji, size/2, size/2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }
}