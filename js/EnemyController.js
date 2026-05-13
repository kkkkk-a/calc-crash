/* =========================================
   js/enemyController.js
   ========================================= */

import * as THREE from 'three';
import * as CANNON from 'cannon-es'; // index.htmlのimportmap設定を使用
import { ProjectilePool } from './ProjectilePool.js'; // ★追加: プール管理クラス

export class EnemyController {
    constructor(charData, spawnPos, scene, world) {
        this.charData = charData;
        this.scene = scene;
        this.world = world;

        // --- ステータス初期化 ---
        this.hp = charData.hp || 100;
        this.speed = charData.speed || 1.0;
        
        // --- ロジックパラメータ初期化 ---
        const logic = charData.logic || {};
        this.visionRange = logic.visionRange || 15.0;
        this.attackRange = logic.attackRange || 1.5;
        this.searchTime = logic.searchTime || 3.0; // 見失った後の探索時間
this.isFlying = logic.isFlying || false;
        // --- 状態変数 ---
        this.state = 'idle'; // idle, chase, search, attack, damage, dead
        this.searchTimer = 0; 
        this.actionCooldown = 0;
        this.lastAttackHit = false; // コンボ判定用フラグ
        this.hitStopTimer = 0;      // ヒットストップ用

        // 飛び道具管理
        this.projectiles = []; 

        // 移動AI用
        this.wanderTimer = 0;
        this.wanderTarget = new CANNON.Vec3();
        this.originalPos = new CANNON.Vec3(spawnPos.x, spawnPos.y, spawnPos.z); // パトロール基準点
        this.patrolDir = 1;

        // --- アニメーション初期化 ---
        this.currentAnimName = 'idle';
        this.currentFrame = 0;
        this.totalFrames = 60; 
        this.loop = true;
        this.animSpeed = 30; // FPS

        // --- 1. 物理ボディ作成 ---
        const radius = 0.4;
        this.body = new CANNON.Body({
            mass: 10, // プレイヤー(50)より軽く、吹き飛びやすく
            shape: new CANNON.Sphere(radius),
            fixedRotation: true,
            position: new CANNON.Vec3(spawnPos.x, spawnPos.y, spawnPos.z),
            material: new CANNON.Material({ friction: 0.0, restitution: 0.0 }),
            linearDamping: this.isFlying ? 0.95 : 0.9,
            collisionFilterGroup: 4, // Enemy
            collisionFilterMask: 1 | 2 | 4 // Stage | Player | Enemy
        });
        this.world.addBody(this.body);

        // --- 2. 見た目の作成 ---
        this.meshGroup = new THREE.Group();
        this.parts = []; // アニメーション適用用配列 (インデックス順)
        this.partsMap = {}; // UUID -> Mesh Map (飛び道具の発射位置特定用)
        this._buildCharacterMesh();
        this.scene.add(this.meshGroup);
this._buildDebugSensors();
        // 初期アニメーション開始
        this.playAnimation('idle');
        this._frameCount = Math.floor(Math.random() * 10);
        this._terrainCache = { isCliff: false, isWall: false };
        
        // ★追加: 毎フレーム使い回すRaycast用のキャッシュ変数 (GCスパイク対策)
        this._rayOrigin = new CANNON.Vec3();
        this._rayDest = new CANNON.Vec3();
        this._wallRayDest = new CANNON.Vec3();
        this._rayCliff = new CANNON.Ray(this._rayOrigin, this._rayDest);
       this._rayCliff.collisionFilterMask = 1;
        this._rayWall = new CANNON.Ray(this._rayOrigin, this._wallRayDest);
        this._rayWall.collisionFilterMask = 1;
        this._raycastResult = new CANNON.RaycastResult();

        // ★追加: 弾丸用の一時変数キャッシュ
        this._projRayOrigin = new CANNON.Vec3();
        this._projRayDest = new CANNON.Vec3();
        this._projRay = new CANNON.Ray(this._projRayOrigin, this._projRayDest);
        this._projRay.collisionFilterMask = 1;
        this._projRaycastResult = new CANNON.RaycastResult();
        this._tmpMissileTarget = new THREE.Vector3();

        this.damageFlashTimer = 0;
        this._buildHpBar();
    }

    // --- キャラクター構築 ---
_buildCharacterMesh() {
        const tempParts = [];
        
        // 1. パーツ生成 (メッシュのみ作成し、親には追加しない)
        this.charData.parts.forEach((pData, index) => { 
            let geo;
            const type = pData.userData.geometryType || 'cube';
            
            if (type === 'sphere') geo = new THREE.SphereGeometry(0.5, 16, 16);
            else if (type === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
            else if (type === 'cone') geo = new THREE.ConeGeometry(0.5, 1, 16);
            else geo = new THREE.BoxGeometry(1, 1, 1);

            const mat = new THREE.MeshStandardMaterial({
                color: pData.color !== undefined ? pData.color : 0xaaaaaa,
                transparent: (pData.opacity || 1.0) < 1.0,
                opacity: pData.opacity !== undefined ? pData.opacity : 1.0
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = pData.name;
            mesh.uuid = pData.uuid; 
            
            // デフォルト配列を適用し、エラーを抑制
            mesh.position.fromArray(pData.pos || [0, 0, 0]); 
            mesh.quaternion.fromArray(pData.rot || [0, 0, 0, 1]); 
            mesh.scale.fromArray(pData.scl || [1, 1, 1]); 
            
            mesh.userData = JSON.parse(JSON.stringify(pData.userData));
            
            this.partsMap[mesh.uuid] = mesh;
            tempParts.push(mesh);
            
            // ★重要: ここではまだ Root に追加しない
        });

        // 2. 親子関係構築
        this.charData.parts.forEach((pData, index) => {
            const mesh = tempParts[index];
            const parentIndex = pData.parentIndex;

            if (parentIndex === -1 || parentIndex === undefined) {
                // ★修正: 親がいない場合のみ、ルートグループに追加
                this.meshGroup.add(mesh);
            } else {
                const parentMesh = tempParts[parentIndex];
                if (parentMesh) {
                    // 親子関係を構築
                    parentMesh.add(mesh);
                } else {
                    // 予期せぬエラーの場合、ルートグループにフォールバック
                    this.meshGroup.add(mesh);
                    console.warn(`[Enemy|Link] Parent index ${parentIndex} not found for ${pData.name}. Attached to Root.`);
                }
            }
        });

        this.parts = tempParts;
    }

    _buildHpBar() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        this.hpBarCanvas = canvas;
        this.hpBarCtx = ctx;

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
        this.hpBarSprite = new THREE.Sprite(mat);
        this.hpBarSprite.scale.set(1.5, 0.4, 1);
        this.hpBarSprite.position.y = 1.5; // 頭上
        this.meshGroup.add(this.hpBarSprite);
        
        this._updateHpBarTexture();
    }

    _updateHpBarTexture() {
        const ctx = this.hpBarCtx;
        ctx.clearRect(0, 0, 128, 32);
        // 背景(黒)
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 128, 32);
        // HPゲージ(緑)
        const hpPct = Math.max(0, this.hp / (this.charData.hp || 100));
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(2, 2, 124 * hpPct, 28);
        this.hpBarSprite.material.map.needsUpdate = true;
    }

    // --- 外部からの通知 ---
    notifyHit() { 
        this.lastAttackHit = true; 
    }

    // --- メインループ ---
     update(dt, playerBody) {
        if (this.state === 'dead') return;

        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
            const flashRatio = Math.max(0, this.damageFlashTimer / 0.2);
            this.parts.forEach(mesh => {
                if (mesh && mesh.material && mesh.material.emissive) {
                    mesh.material.emissive.setRGB(flashRatio * 0.8, 0, 0); 
                }
            });
        }

        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= dt;
            this.body.velocity.set(0,0,0);
            return;
        }

        // ★追加: 飛行型の浮遊ロジック（重力相殺と高度維持）
        if (this.isFlying) {
            this.body.force.y -= this.world.gravity.y * this.body.mass; // 重力を打ち消す
            
            // プレイヤーの頭上、またはスポーン位置の頭上を目標高度にする
            const targetY = (playerBody ? playerBody.position.y : this.originalPos.y) + (this.charData.logic.flightHeight || 2.5);
            const diffY = targetY - this.body.position.y;
            
            // 上下方向へのフワフワした追従
            this.body.velocity.y += diffY * dt * 5.0;
        }

        this._updateProjectiles(dt, playerBody);
        if (this.actionCooldown > 0) this.actionCooldown -= dt;
        this._updateAI(dt, playerBody);
        this._updateAnimation(dt);

        this.meshGroup.position.copy(this.body.interpolatedPosition || this.body.position);
    }

_updateAI(dt, playerBody) {
        if (!playerBody || !playerBody.position) {
            this.state = 'idle';
            this.body.velocity.set(0, this.isFlying ? this.body.velocity.y : 0, 0);
            this.playAnimation('idle');
            return;
        }

        const myPos = this.body.position;
        const targetPos = playerBody.position;
        const dist = myPos.distanceTo(targetPos);
        
        const vecToPlayer = targetPos.vsub(myPos);
        // ★修正: 飛行型でない場合のみY軸(上下)の追跡ベクトルを無視する
        if (!this.isFlying) vecToPlayer.y = 0; 
        
        if (vecToPlayer.lengthSquared() > 0.0001) vecToPlayer.normalize();
        else vecToPlayer.set(1, 0, 0);

        const logic = this.charData.logic || {};
        
        // ★最適化: ステートマシンによる状態管理
        switch (this.state) {
            case 'idle':
            case 'search':
                // 1. 敵対チェック (視覚・聴覚)
                if (this._checkAggro(dist, vecToPlayer, logic, myPos, targetPos)) {
                    this._transitionTo('chase');
                    if (window.effectManager) window.effectManager.showEmote(this.meshGroup, 'alert');
                    if (window.soundManager) window.soundManager.play3DSE('aggro_sound', myPos);
                    break;
                }

                // 2. 状態ごとの振る舞い
                if (this.state === 'search') {
                    this._behaviorSearch(dt, vecToPlayer);
                } else {
                    this._behaviorPatrol(dt, logic);
                }
                break;

            case 'chase':
                // 見失い判定
                if (dist > this.visionRange * 1.5 && !logic.triggers?.always) {
                    this._transitionTo('search');
                    if (window.effectManager) window.effectManager.showEmote(this.meshGroup, 'question');
                    break;
                }
                // 戦闘・追跡行動
                this._behaviorCombat(dt, logic, dist, vecToPlayer);
                break;

            case 'attack':
                // 攻撃中の動作（突進など）
                this._behaviorAttack(vecToPlayer, logic);
                break;
        }
    }
 _transitionTo(newState) {
        this.state = newState;
        if (newState === 'search') {
            this.searchTimer = this.searchTime;
            this.playAnimation('idle'); 
            this.body.velocity.set(0, 0, 0);
        } else if (newState === 'chase') {
            this.playAnimation('run');
        }
    }

    _checkAggro(dist, vecToPlayer, logic, myPos, targetPos) {
        if (!logic.targetPlayer) return false;
        const triggers = logic.triggers || {};
        if (triggers.always) return true;
        
        if (triggers.onSight && dist < this.visionRange) {
            const fovAngle = logic.fov !== undefined ? logic.fov : 120; 
            const forward = new THREE.Vector3(Math.sin(this.meshGroup.rotation.y), 0, Math.cos(this.meshGroup.rotation.y));
            if (forward.dot(vecToPlayer) >= Math.cos((fovAngle / 2) * THREE.MathUtils.DEG2RAD)) {
                // Raycastによる壁抜けチェック
                const rayStart = new CANNON.Vec3(myPos.x, myPos.y + 1, myPos.z);
                const rayEnd = new CANNON.Vec3(targetPos.x, targetPos.y + 1, targetPos.z);
                this._raycastResult.reset();
                this.world.raycastClosest(rayStart, rayEnd, { collisionFilterMask: 1 }, this._raycastResult);
                if (!(this._raycastResult.hasHit && this._raycastResult.distance < dist)) return true;
            }
        }
        return false;
    }

    _behaviorSearch(dt, vecToPlayer) {
        this.searchTimer -= dt;
        this.body.velocity.set(0, 0, 0);
        if (Math.floor(this.searchTimer * 2) % 2 === 0) this.meshGroup.rotation.y += dt * 2;
        else this.meshGroup.rotation.y -= dt * 2;
        if (this.searchTimer <= 0) this._transitionTo('idle');
    }

    _behaviorPatrol(dt, logic) {
        const moveType = logic.moveType || 'stand';
        if (moveType === 'patrol') this._updatePatrol(logic);
        else if (moveType === 'wander') this._updateWander(dt, logic);
        else { this.body.velocity.set(0, 0, 0); this.playAnimation('idle'); }
    }

    _behaviorCombat(dt, logic, dist, vecToPlayer) {
        if (logic.combatType === 'sniper') {
            this.body.velocity.set(0, this.body.velocity.y, 0); // ★修正: y軸(落下)は維持
            this.meshGroup.rotation.y = Math.atan2(vecToPlayer.x, vecToPlayer.z) + Math.PI; 
            this.playAnimation('idle');
            if (dist > logic.attackRange) return; 
        }

        if (this.actionCooldown <= 0) {
            let actionDecided = false;
            for (const pat of (logic.patterns || [])) {
                let conditionMet = false;
                if (pat.cond === 'dist_lt' && dist < pat.val) conditionMet = true;
                else if (pat.cond === 'dist_gt' && dist > pat.val) conditionMet = true;
                else if (pat.cond === 'hp_lt' && (this.hp / (this.charData.hp||100)*100) < pat.val) conditionMet = true;
                else if (pat.cond === 'always') conditionMet = true;
                else if (pat.cond === 'last_hit' && this.lastAttackHit) conditionMet = true;

                if (conditionMet && Math.random() * 100 < pat.prob) {
                    this._executeAction(pat.act, vecToPlayer);
                    actionDecided = true;
                    break;
                }
            }

            if (!actionDecided && logic.combatType !== 'sniper') {
                if (dist > this.attackRange) {
                    const terrain = this._checkTerrain(vecToPlayer);
                    
                    if (logic.avoidCliffs && terrain.isCliff) {
                        this.body.velocity.set(0, this.body.velocity.y, 0); 
                        this.playAnimation('idle');
                    } else if (terrain.isWall) {
                        // ★強化: 壁がある場合、ジャンプ設定がONならジャンプして乗り越える
                        if (logic.jumpObstacles && this._isGrounded()) {
                            this._executeAction('jump', vecToPlayer);
                        } else {
                            this.body.velocity.set(0, this.body.velocity.y, 0); 
                            this.playAnimation('idle');
                        }
                    } else {
                        // 通常の追跡
                        const moveSpeed = 3.0 * this.speed;
                        this.body.velocity.set(vecToPlayer.x * moveSpeed, this.body.velocity.y, vecToPlayer.z * moveSpeed);
                        this.meshGroup.rotation.y = Math.atan2(vecToPlayer.x, vecToPlayer.z) + Math.PI; 
                        this.playAnimation('run');
                    }
                } else {
                    this.body.velocity.set(0, this.body.velocity.y, 0);
                    this.playAnimation('idle');
                    this.meshGroup.rotation.y = Math.atan2(vecToPlayer.x, vecToPlayer.z) + Math.PI; 
                }
            }
        }
    }
_behaviorAttack(vecToPlayer, logic) {
        const spec = (logic.attacks && logic.attacks[this.currentAnimName]) ? logic.attacks[this.currentAnimName] : {};
        if (spec.tracking) {
            const angle = Math.atan2(vecToPlayer.x, vecToPlayer.z) + Math.PI; 
            // ★強化: 最短回転方向を計算して滑らかに旋回
            let diff = angle - this.meshGroup.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.meshGroup.rotation.y += diff * 0.1;
        }
        if (spec.moveStyle === 'slide' || spec.moveStyle === 'dash') {
            const spd = (spec.moveStyle === 'dash') ? 10.0 : 2.0;
            const rot = this.meshGroup.rotation.y;
            this.body.velocity.x = Math.sin(rot) * spd;
            this.body.velocity.z = Math.cos(rot) * spd;
            // ★修正: velocity.yは上書きしない（攻撃中の落下を妨げない）
        } else {
            this.body.velocity.x = 0; 
            this.body.velocity.z = 0;
        }
    }
    // --- アクション実行 ---
    _executeAction(actName, vecToPlayer) {
        if (actName.startsWith('attack')) {
            this.state = 'attack';
            this.playAnimation(actName);
            this.body.velocity.set(0, this.body.velocity.y, 0); // ★修正: y軸(落下)は維持
            this.meshGroup.rotation.y = Math.atan2(vecToPlayer.x, vecToPlayer.z) + Math.PI; 
            
            this.actionCooldown = 1.5; 
            this.lastAttackHit = false;

            const logic = this.charData.logic || {};
            const spec = (logic.attacks && logic.attacks[actName]) ? logic.attacks[actName] : null;
            
            if (spec) {
                if (spec.sfx && spec.sfx !== 'none' && window.soundManager) {
                    window.soundManager.play3DSE(spec.sfx, this.body.position, 10, 1.0);
                }
                if (spec.isProjectile) {
                    this._fireProjectile(spec, vecToPlayer);
                }
            }
        }
        else if (actName === 'retreat') {
            const retreatDir = vecToPlayer.scale(-1);
            const terrain = this._checkTerrain(retreatDir);
            if (!terrain.isCliff && !terrain.isWall) {
                this.body.velocity.x = retreatDir.x * 3.0 * this.speed;
                this.body.velocity.z = retreatDir.z * 3.0 * this.speed;
                this.meshGroup.rotation.y = Math.atan2(vecToPlayer.x, vecToPlayer.z) + Math.PI; 
                this.playAnimation('walk'); 
                this.actionCooldown = 0.5;
            }
        }
        else if (actName === 'jump') {
            if (this._isGrounded()) {
                // ★強化: 上だけでなく、向いている方向（前）にも少し力を加えて段差に乗りやすくする
                const jumpForward = new THREE.Vector3(Math.sin(this.meshGroup.rotation.y), 0, Math.cos(this.meshGroup.rotation.y));
                this.body.velocity.y = 6.0;
                this.body.velocity.x = jumpForward.x * 4.0;
                this.body.velocity.z = jumpForward.z * 4.0;
            }
            this.playAnimation('jump');
            this.actionCooldown = 0.8;
        }
        else if (actName === 'idle') {
            this.body.velocity.set(0, this.body.velocity.y, 0);
            this.playAnimation('idle');
            this.actionCooldown = 1.0;
        }
        else if (actName === 'chase') {
            this.actionCooldown = 0.1;
        }
    }
    // --- 飛び道具システム (★修正: ProjectilePool使用) ---
    _fireProjectile(spec, dirVec) {
        // 銃口位置の特定
        let spawnPos = this.body.position.clone();
        spawnPos.y += 0.5; // デフォルト高さ

        if (spec.muzzlePart && this.partsMap[spec.muzzlePart]) {
            const muzzleMesh = this.partsMap[spec.muzzlePart];
            const worldPos = new THREE.Vector3();
            muzzleMesh.getWorldPosition(worldPos);
            spawnPos.set(worldPos.x, worldPos.y, worldPos.z);
        }

        // 発射設定
        const count = spec.projectileCount || 1;
        const type = spec.projectileType || 'bullet';
        const speed = spec.projectileSpeed || 10;

        for (let i = 0; i < count; i++) {
            // 拡散 (Shotgun)
            let fireDir = new CANNON.Vec3(dirVec.x, dirVec.y, dirVec.z);
            if (count > 1) {
                const spread = 0.2; 
                fireDir.x += (Math.random() - 0.5) * spread;
                fireDir.z += (Math.random() - 0.5) * spread;
                fireDir.normalize();
            }

            // ★修正: ProjectilePoolからメッシュ取得
            let color = 0xffff00;
            if (type === 'beam') color = 0x00ffff;
            else if (type === 'missile') color = 0xff9900;
            
            const mesh = ProjectilePool.getMesh(type, color);
            
            mesh.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
            // 向き合わせ
            mesh.lookAt(mesh.position.clone().add(new THREE.Vector3(fireDir.x, fireDir.y, fireDir.z)));
            
            // エフェクト (マズルフラッシュ的な)
            if (window.effectManager) window.effectManager.spawnEffect('hit', mesh.position);

            // 弾丸データ登録
            this.projectiles.push({
                mesh: mesh,
                pos: spawnPos.clone(),
                dir: fireDir,
                speed: speed,
                type: type, // ★回収時に必要
                life: spec.projectileDuration || 2.0,
                damage: spec.damage,
                penetrate: spec.penetrate,
                vfx: spec.vfx // ヒット時のエフェクト
            });
        }
    }

    // --- 飛び道具更新 (★修正: ProjectilePool使用) ---
    _updateProjectiles(dt, playerBody) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= dt;

            // ミサイルのホーミング
            if (p.type === 'missile' && playerBody) {
                const toPlayer = playerBody.position.vsub(p.pos);
                toPlayer.normalize();
                p.dir.x += (toPlayer.x - p.dir.x) * 0.05;
                p.dir.z += (toPlayer.z - p.dir.z) * 0.05;
                p.dir.normalize();
                this._tmpMissileTarget.set(p.pos.x + p.dir.x, p.pos.y + p.dir.y, p.pos.z + p.dir.z);
                p.mesh.lookAt(this._tmpMissileTarget);
            }

            // 移動前の位置を記録
            const oldPos = p.pos.clone();

            // 移動
            p.pos.x += p.dir.x * p.speed * dt;
            p.pos.y += p.dir.y * p.speed * dt;
            p.pos.z += p.dir.z * p.speed * dt;
            p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);

            // 衝突判定
            let hit = false;
            
            // 1. 対プレイヤー判定
            if (playerBody) {
                const d = p.pos.distanceTo(playerBody.position);
                if (d < 1.0) { 
                    if (window.simpleGame) window.simpleGame.takeDamage(p.damage);
                    this.notifyHit();
                    hit = true;
                }
            }
            
            // 2. ★修正: 対地形 (軽量なRaycastによる正確な壁・床判定)
            if (!hit && !p.penetrate) {
                this._projRayOrigin.copy(oldPos);
                this._projRayDest.copy(p.pos);
                this._projRay.from.copy(this._projRayOrigin);
                this._projRay.to.copy(this._projRayDest);
                
                this._projRaycastResult.reset();
                this._projRay.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST, result: this._projRaycastResult });
                
                // 壁に当たった、または落下しすぎた場合
                if (this._projRaycastResult.hasHit || p.pos.y < -10) {
                    hit = true;
                    // めり込み防止のためにヒット地点に少し戻す
                    if (this._projRaycastResult.hasHit) p.mesh.position.copy(this._projRaycastResult.hitPointWorld);
                }
            }

            // 削除処理
            if (p.life <= 0 || hit) {
                if (hit && window.effectManager) {
                    if (p.type === 'missile' || p.vfx === 'explosion') {
                        window.effectManager.spawnEffect('explosion', p.mesh.position);
                    } else {
                        window.effectManager.spawnEffect('hit', p.mesh.position);
                    }
                }
                
                ProjectilePool.releaseMesh(p.type, p.mesh);
                this.projectiles.splice(i, 1);
            }
        }
    }

    // --- パトロール・徘徊・地形 ---

    _updatePatrol(logic) {
        const rad = this.meshGroup.rotation.y;
        const forward = new CANNON.Vec3(Math.sin(rad), 0, Math.cos(rad));
        const terrain = this._checkTerrain(forward);
        
        let needTurn = false;
        if (terrain.isWall) needTurn = true;
        if (logic.avoidCliffs && terrain.isCliff) needTurn = true;

        const distFromOrigin = this.body.position.distanceTo(this.originalPos);
        if (distFromOrigin > logic.patrolRange) {
            const vecToOrigin = this.originalPos.vsub(this.body.position);
            if (forward.dot(vecToOrigin) < 0) needTurn = true;
        }

        if (needTurn) {
            this.meshGroup.rotation.y += Math.PI;
            this.body.velocity.set(0, 0, 0);
        } else {
            const speed = 1.5 * this.speed;
            this.body.velocity.x = forward.x * speed;
            this.body.velocity.z = forward.z * speed;
            this.meshGroup.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI; 
            this.playAnimation('walk');
        }
    }

    _updateWander(dt, logic) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            const range = logic.patrolRange || 5.0;
            const rX = (Math.random() - 0.5) * 2 * range;
            const rZ = (Math.random() - 0.5) * 2 * range;
            this.wanderTarget.set(this.originalPos.x + rX, this.originalPos.y, this.originalPos.z + rZ);
            this.wanderTimer = 3.0 + Math.random() * 3.0;
        }

        const toTgt = this.wanderTarget.vsub(this.body.position);
        toTgt.y = 0;
        const dist = toTgt.length();

        if (dist > 0.5) {
            if (toTgt.lengthSquared() > 0.0001) toTgt.normalize();
            else toTgt.set(1, 0, 0);
            const terrain = this._checkTerrain(toTgt);
            if ((logic.avoidCliffs && terrain.isCliff) || terrain.isWall) {
                this.wanderTimer = 0;
                this.body.velocity.set(0,0,0);
                this.playAnimation('idle');
            } else {
                const speed = this.speed * 0.8;
                this.body.velocity.x = toTgt.x * speed;
                this.body.velocity.z = toTgt.z * speed;
                this.meshGroup.rotation.y = Math.atan2(toTgt.x, toTgt.z);
                this.playAnimation('walk');
            }
        } else {
            this.body.velocity.set(0,0,0);
            this.playAnimation('idle');
        }
    }

    _checkTerrain(moveDir) {
        this._frameCount++;
        if (this._frameCount % 5 !== 0) {
            return this._terrainCache;
        }

        const start = this.body.position;
        const result = { isCliff: false, isWall: false };

        const checkDist = 0.8; 
        
        // --- 崖(落下)判定 ---
        this._rayOrigin.set(start.x + moveDir.x * checkDist, start.y, start.z + moveDir.z * checkDist);
        this._rayDest.set(this._rayOrigin.x, this._rayOrigin.y - 2.0, this._rayOrigin.z);
        this._rayCliff.from.copy(this._rayOrigin);
        this._rayCliff.to.copy(this._rayDest);
        
        this._raycastResult.reset();
        this._rayCliff.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST, result: this._raycastResult });
        if (!this._raycastResult.hasHit) result.isCliff = true;

        // --- ★強化: 壁判定 (胸の高さと足元の2本でチェックし、障害物を正確に検知) ---
        // 1. 胸の高さ (高すぎる壁)
        this._wallRayDest.set(start.x + moveDir.x * checkDist, start.y + 0.5, start.z + moveDir.z * checkDist);
        this._rayWall.from.set(start.x, start.y + 0.5, start.z);
        this._rayWall.to.copy(this._wallRayDest);
        this._raycastResult.reset();
        this._rayWall.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST, result: this._raycastResult });
        if (this._raycastResult.hasHit) result.isWall = true;

        // 2. 足元 (低い段差・階段は乗り越えられるように判定を少し浮かせる)
        if (!result.isWall) {
            this._wallRayDest.set(start.x + moveDir.x * checkDist, start.y - 0.1, start.z + moveDir.z * checkDist);
            this._rayWall.from.set(start.x, start.y - 0.1, start.z);
            this._rayWall.to.copy(this._wallRayDest);
            this._raycastResult.reset();
            this._rayWall.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST, result: this._raycastResult });
            if (this._raycastResult.hasHit) result.isWall = true;
        }

        // 結果をキャッシュに保存
        this._terrainCache = result;
        return result;
    }

    _isGrounded() {
        const start = this.body.position;
        const end = new CANNON.Vec3(start.x, start.y - 0.6, start.z);
        const ray = new CANNON.Ray(start, end);
        ray.collisionFilterMask = 1;
        const res = new CANNON.RaycastResult();
        ray.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST, result: res });
        return res.hasHit;
    }

    // --- アニメーション ---
    playAnimation(animName) {
        if (this.currentAnimName === animName) return;
        
        let targetAnim = animName;
        // データチェック & フォールバック
        if (!this.charData.animations || !this.charData.animations[targetAnim]) {
            if (targetAnim === 'run' && this.charData.animations['walk']) targetAnim = 'walk';
            else if (targetAnim !== 'idle' && this.charData.animations['idle']) targetAnim = 'idle';
            else return;
        }

        this.currentAnimName = targetAnim;
        this.currentFrame = 0;
        
        // ワンショットアニメの定義
        const oneShotAnims = ['damage', 'dead'];
        this.loop = !(oneShotAnims.includes(targetAnim) || targetAnim.startsWith('attack'));
    }

    _updateAnimation(dt) {
    const animData = this.charData.animations ? this.charData.animations[this.currentAnimName] : null;
    if (!animData) return;
    this.currentFrame += dt * this.animSpeed;
    if (this.currentFrame >= 60) {
        if (this.loop) { this.currentFrame = 0; } 
        else { this.currentFrame = 60; this._onAnimationComplete(); return; }
    }
    // 計算用の一時変数を再利用（GC対策）
    if(!this._tempV) this._tempV = new THREE.Vector3();
    if(!this._tempQ) this._tempQ = new THREE.Quaternion();
    if(!this._tempS) this._tempS = new THREE.Vector3();

    this.charData.parts.forEach((pData, index) => {
        const track = animData[pData.uuid];
        if (!track || track.length === 0) return;
        const mesh = this.parts[index];
        let prevKey = track[0], nextKey = track[track.length - 1];
        for (let i = 0; i < track.length - 1; i++) {
            if (track[i].frame <= this.currentFrame && track[i+1].frame >= this.currentFrame) {
                prevKey = track[i]; nextKey = track[i+1]; break;
            }
        }
        let alpha = (nextKey.frame !== prevKey.frame) ? (this.currentFrame - prevKey.frame) / (nextKey.frame - prevKey.frame) : 0;
        alpha = alpha * alpha * alpha * (alpha * (alpha * 6 - 15) + 10); // Smootherstep

        mesh.position.lerpVectors(this._tempV.fromArray(prevKey.pos), this._tempS.fromArray(nextKey.pos), alpha);
        mesh.quaternion.copy(this._tempQ.fromArray(prevKey.rot)).slerp(this._tempS.fromArray(nextKey.rot), alpha);
        mesh.scale.lerpVectors(this._tempV.fromArray(prevKey.scl), this._tempS.fromArray(nextKey.scl), alpha);
    });
}

    _onAnimationComplete() {
        if (this.state === 'attack' || this.state === 'damage') {
            this.state = 'chase';
            this.playAnimation('run');
        }
    }

    // --- ダメージ ---
    takeDamage(amount) {
        const logic = this.charData.logic || {};
        const triggers = logic.triggers || { onDamage: true };
        
        // 無敵チェック
        if (logic.invincibleBeforeAggro && this.state === 'idle') return;
        
        // 攻撃中無敵チェック
        const atkId = this.currentAnimName;
        if (this.state === 'attack' && logic.attacks && logic.attacks[atkId] && logic.attacks[atkId].invincible) return;

        if (logic.damageFromPlayer === false) return;

        this.hp -= amount;
        
        // ★追加: ダメージ点滅のトリガー
        this.damageFlashTimer = 0.2; // 0.2秒間赤くする
        
        this.hitStopTimer = 0.1;
        this.body.velocity.set(0, 0, 0); // 物理挙動も止める
        
        if (window.effectManager) window.effectManager.spawnEffect('hit', this.body.position);
        if (this.hp <= 0) {
            this.die();
        } else {
            // ★追加: ダメージを受けたらHPバーを更新
            this._updateHpBarTexture();
            
            if (this.state === 'idle' && triggers.onDamage) {
                this.state = 'chase';
            }
            if (this.state !== 'dead') {
                this.state = 'damage';
                this.playAnimation('damage');
            }
        }
    }

    die(cleanupOnly = false) { 
        if (this.state === 'dead' && !cleanupOnly) return;

        // ★修正: ユーザー設定のドロップ設定を反映
        if (!cleanupOnly && window.simpleGame && this.charData.logic && this.charData.logic.drop) {
            const d = this.charData.logic.drop;
            const dropChance = (d.chance !== undefined) ? d.chance / 100 : 0.5;
            
            if (Math.random() < dropChance) {
                const item = {
                    name: d.itemName || '謎のアイテム',
                    icon: d.itemIcon || '📦',
                    desc: d.itemDesc || `${this.charData.name}が残したもの。`,
                    type: d.itemType || 'equipment',
                    equipSlot: d.equipSlot || 'weapon',
                    value: d.amount !== undefined ? d.amount : 10
                };
                window.simpleGame.inventory.push(item);
                if (window.showNotification) window.showNotification(`${item.icon} ${item.name} を手に入れた！`);
            }
        }

        this.state = 'dead';
        
        if (this.body) {
            this.world.removeBody(this.body);
            this.body = null;
        }

        const disposeMesh = () => {
            if(!this.meshGroup || !this.scene) return;
            
            if(this.meshGroup.parent) {
                this.scene.remove(this.meshGroup);
            }
            
            this.meshGroup.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            m.dispose();
                        });
                    }
                }
            });
        };
        
        if (!cleanupOnly) {
             this.playAnimation('dead');
             setTimeout(disposeMesh, 3000);
        } else {
             disposeMesh();
        }
    }

    // ★新規追加: デバッグ用のセンサー範囲メッシュを生成
    _buildDebugSensors() {
        this.debugGroup = new THREE.Group();
        
        // 1. 視界範囲 (黄色)
        const visionGeo = new THREE.RingGeometry(Math.max(0.1, this.visionRange - 0.2), this.visionRange, 32);
        visionGeo.rotateX(-Math.PI / 2);
        const visionMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, wireframe: true, transparent: true, opacity: 0.3 });
        this.visionMesh = new THREE.Mesh(visionGeo, visionMat);
        this.debugGroup.add(this.visionMesh);

        // 2. 攻撃範囲 (赤色)
        const attackGeo = new THREE.RingGeometry(Math.max(0.1, this.attackRange - 0.2), this.attackRange, 32);
        attackGeo.rotateX(-Math.PI / 2);
        const attackMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, wireframe: true, transparent: true, opacity: 0.3 });
        this.attackMesh = new THREE.Mesh(attackGeo, attackMat);
        this.debugGroup.add(this.attackMesh);
        
        // y位置を少し浮かせて地面とのZファイティング(チラつき)を防止
        this.debugGroup.position.y = 0.2;
        this.debugGroup.visible = false; // デフォルトは非表示
        
        this.meshGroup.add(this.debugGroup);
    }
}