/* =========================================
   js/PlayerController.js (Fixed Update Loop)
   ========================================= */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PlayerController {
    constructor(scene, world, camera, input, playerConfig, stageGroup) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.input = input;
        this.playerConfig = playerConfig;
        this.stageGroup = stageGroup;

        this.body = null;
        this.mesh = null;

        this.currentHp = playerConfig.maxHp;
        this.currentSp = playerConfig.maxSp || 100;
        this.spRegenDelay = 0; // 消費後、回復が始まるまでのディレイ時間
        this.jumpCount = 0;

        this.cameraAngle = 0;
        this.cameraPitch = 0.2;
        this.cameraHeight = 3.0;

        this.spawnPoint = new THREE.Vector3(0, 5, 0);
        this.lastCheckPoint = null;

        this._lastGroundedState = true;
        this._debugLogCounter = 0;
        this.contactCooldown = 0;
        this.damageFlashTimer = 0;
        this.cameraShakeTimer = 0;
        this.cameraShakeIntensity = 0;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.coyoteTime = 0; // ★修正: タイポの修正
        this.equipment = {};
        this.lockOnTarget = null;
        this.stepCooldown = 0;
 this.touchingObjects = new Set(); // ★追加: 現在触れているオブジェクトのリスト
        this.interactCooldown = 0;        // ★追加: 調べるボタンの連打防止
        // ★追加: 重力コントロール用変数
        this.gravityDir = new THREE.Vector3(0, -1, 0);
        this.upVector = new THREE.Vector3(0, 1, 0);
        this.targetUpVector = new THREE.Vector3(0, 1, 0);
        this.currentGravityState = 'down';
        this.lastGravityChangeTime = 0;
        this.jumpIgnoreTimer = 0;
        this.currentAnimName = 'idle';
        this.currentFrame = 0;
        this.animSpeed = 30;
        this.parts = [];
        this.prevAnimName = null;
        this.prevFrame = 0;
        this.blendFactor = 1.0; 
        this.blendDuration = 0.15; // 0.15秒かけてブレンドする
        this.charData = null;
        this._tmpVec3_1 = new THREE.Vector3();
        this._tmpVec3_2 = new THREE.Vector3();
        this._tmpVec3_3 = new THREE.Vector3();
        this._tmpCanVec_1 = new CANNON.Vec3();
        this._tmpCanVec_2 = new CANNON.Vec3();
        this._tmpQuat_1 = new THREE.Quaternion();
        this._tmpMat4_1 = new THREE.Matrix4();
    this._ccdRay = new CANNON.Ray(new CANNON.Vec3(), new CANNON.Vec3());
        this._ccdRay.collisionFilterMask = 1 | 4; // 壁と敵に反応
        this._ccdResult = new CANNON.RaycastResult();
    }
    setGravity(directionString) {
        if (this.playerConfig && this.playerConfig.allowGravityChange === false) return;
        const now = Date.now();
        // ★二度押し判定（0.5秒以内に同じ方向のアクションを受け取ったらリセット）
        if (this.currentGravityState === directionString && (now - this.lastGravityChangeTime) < 500) {
            directionString = 'down';
        }

        let newDir = new THREE.Vector3(0, -1, 0);
        switch (directionString) {
            case 'up': newDir.set(0, 1, 0); break;
            case 'down': newDir.set(0, -1, 0); break;
            case 'left': newDir.set(-1, 0, 0); break;
            case 'right': newDir.set(1, 0, 0); break;
            case 'forward': newDir.set(0, 0, -1); break;
            case 'backward': newDir.set(0, 0, 1); break;
        }

        this.gravityDir.copy(newDir);
        this.targetUpVector.copy(newDir).multiplyScalar(-1);

        this.currentGravityState = directionString;
        this.lastGravityChangeTime = now;

        // ★追加: 重力が変わった瞬間に、現在のカメラの向きから新しい角度を逆算して保持し、視点が飛ばないようにする
        const camForward = new THREE.Vector3();
        this.camera.getWorldDirection(camForward);
        const right = new THREE.Vector3(1, 0, 0);
        if (Math.abs(this.targetUpVector.x) > 0.9) right.set(0, 1, 0);
        right.cross(this.targetUpVector).normalize();
        const forward = new THREE.Vector3().crossVectors(right, this.targetUpVector).normalize();

        const px = camForward.dot(right);
        const pz = camForward.dot(forward);
        this.cameraAngle = Math.atan2(px, pz);
        this.cameraPitch = -Math.atan2(camForward.dot(this.targetUpVector), Math.sqrt(px * px + pz * pz));

        if (window.showNotification) window.showNotification(`🔄 Gravity Changed: ${directionString.toUpperCase()}`);
    }

    initSpawn(isRestart = false) {
        let foundStart = false;
        this.stageGroup.traverse(obj => {
            if (obj.userData.role === 'start') {
                const startPos = new THREE.Vector3();
                obj.getWorldPosition(startPos);
                this.spawnPoint.copy(startPos);

                 if (!isRestart) {
                    this.lastCheckPoint = {
                        pos: this.spawnPoint.clone(),
                        hp: this.playerConfig.maxHp,
                        sp: this.playerConfig.maxSp || 100,
                        inventory: []
                    };
                }
                foundStart = true;
            }
        });

        if (!foundStart) {
            this.spawnPoint.set(0, 5, 0);
            if (!isRestart) {
                this.lastCheckPoint = {
                    pos: this.spawnPoint.clone(),
                    hp: this.playerConfig.maxHp,
                    sp: this.playerConfig.maxSp || 100,
                    inventory: []
                };
            }
        }

        this.spawnPlayer();
        this.cameraAngle = 0;
        this.cameraPitch = 0.2; // ★追加: 俯角もデフォルトに戻す
    }

    setCheckPoint(position) {
        const checkPos = position.clone();

        // ★修正: 座標だけでなく、現在のステータスもスナップショットとして保存する
        this.lastCheckPoint = {
            pos: checkPos,
            hp: this.currentHp,
            sp: this.currentSp,
            maxHp: this.playerConfig.maxHp,
            maxSp: this.playerConfig.maxSp,
            // インベントリのディープコピー（持っているアイテム数）
            inventory: window.simpleGame ? JSON.parse(JSON.stringify(window.simpleGame.inventory)) : []
        };

        if (window.effectManager) window.effectManager.showEmote(this.mesh, 'heart');
    }


    spawnPlayer() {
        this.removePlayer();
if (!this.lastCheckPoint) {
        this.currentHp = this.playerConfig.maxHp;
        this.currentSp = this.playerConfig.maxSp || 100;
        this.jumpCount = 0;
    }
        // ★追加: 重力状態を完全に初期化
        this.gravityDir.set(0, -1, 0);
        this.upVector.set(0, 1, 0);
        this.targetUpVector.set(0, 1, 0);
        this.currentGravityState = 'down';

        // ★重要: カメラの「上」方向もリセットしないと画面が傾いたままになる
        if (this.camera) {
            this.camera.up.set(0, 1, 0);
        }

        // ★修正: 復活位置とステータスの復元
        let startPos = this.spawnPoint.clone();

        if (this.lastCheckPoint) {
            startPos = this.lastCheckPoint.pos.clone();
            // ステータスの復元
            this.currentHp = this.lastCheckPoint.hp;
            this.currentSp = this.lastCheckPoint.sp;
            this.playerConfig.maxHp = this.lastCheckPoint.maxHp;
            this.playerConfig.maxSp = this.lastCheckPoint.maxSp;
            if (window.simpleGame) {
                window.simpleGame.inventory = JSON.parse(JSON.stringify(this.lastCheckPoint.inventory));
            }
        } else {
            // セーブデータがない(最初から)場合は初期値
            this.currentHp = this.playerConfig.maxHp;
            this.currentSp = this.playerConfig.maxSp || 100;
        }

        startPos.y += 1.0;

        const radius = 0.4;
        const cylHeight = 0.2;

        this.body = new CANNON.Body({ mass: 50, fixedRotation: true });

        // 上下の半球
        const sphereShape = new CANNON.Sphere(radius);
        this.body.addShape(sphereShape, new CANNON.Vec3(0, cylHeight / 2, 0));
        this.body.addShape(sphereShape, new CANNON.Vec3(0, -cylHeight / 2, 0));

        // 真ん中の円柱 (CannonのCylinderはZ軸向きに作られるため、X軸で90度回転させて立てる)
        const cylShape = new CANNON.Cylinder(radius, radius, cylHeight, 16);
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
        this.body.addShape(cylShape, new CANNON.Vec3(0, 0, 0), q);

        // 摩擦ゼロ用のマテリアルを設定
        this.body.material = new CANNON.Material('player_material');
        this.body.material.friction = 0.0;

        this.body.position.set(startPos.x, startPos.y, startPos.z);
        this.body.linearDamping = 0.0;
        this.body.velocity.set(0, 0, 0);
        this.body.addEventListener('collide', (e) => this._onCollide(e));
        this.world.addBody(this.body);
this.contactCooldown = 0;
        // ★修正: キャラクタモデルの構築
        this.mesh = new THREE.Group(); 
        if (this.charData) {
            this._buildCharacterMesh(); 
        } else {
            // キャラデータがない場合のフォールバック(カプセル)
            const geo = new THREE.CapsuleGeometry(radius, cylHeight, 4, 16);
            const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
            const fallbackMesh = new THREE.Mesh(geo, mat);
            this.mesh.add(fallbackMesh);
        }
        this.scene.add(this.mesh);
        
        this.currentHp = this.playerConfig.maxHp;
        this.currentSp = this.playerConfig.maxSp || 100;
        this.jumpCount = 0;
        this.playAnimation('idle');
    }


    removePlayer() {
        if (this.body) {
            this.world.removeBody(this.body);
            this.body = null;
        }
        if (this.mesh) {
            this.scene.remove(this.mesh);
            // ★修正: プレイヤーパーツのメモリも確実に解放する
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(m => m.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
            this.mesh = null;
        }
    }
    update(dt) {
        if (!this.body || !this.mesh) return;

        const conf = this.playerConfig; // 設定値のショートカット

        if (this.contactCooldown > 0) this.contactCooldown -= dt;

        // ★修正: SP自動回復 (設定値を使用)
        if (this.spRegenDelay > 0) {
            this.spRegenDelay -= dt;
        } else {
            const spRegenRate = conf.spRegen !== undefined ? conf.spRegen : 20;
            if (this.currentSp < conf.maxSp) {
                this.currentSp = Math.min(conf.maxSp, this.currentSp + spRegenRate * dt);
                if (window.simpleGame) window.simpleGame.notifySp();
            }
        }

        // ★追加: HP自動回復 (設定値を使用)
        const hpRegenRate = conf.hpRegen || 0;
        if (hpRegenRate > 0 && this.currentHp > 0 && this.currentHp < conf.maxHp) {
            this.currentHp = Math.min(conf.maxHp, this.currentHp + hpRegenRate * dt);
            if (window.simpleGame) window.simpleGame.notifyDamage(0); // UI更新用
        }

        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= dt;
            this.isInvincible = true;
            this.mesh.visible = (Math.floor(this.invincibleTimer * 10) % 2 === 0);
        } else {
            this.isInvincible = false;
            this.mesh.visible = true;
        }

        this._updatePhysics(dt);
        this._checkBoundary(); 
        this._updateAnimation(dt);

        if (this.damageFlashTimer > 0 && this.mesh && this.mesh.material) {
            this.damageFlashTimer -= dt;
            const flashRatio = Math.max(0, this.damageFlashTimer / 0.2);
            this.mesh.material.emissive.setRGB(flashRatio, 0, 0);
        }
    }

    consumeSp(amount) {
        if (this.currentSp >= amount) {
            this.currentSp -= amount;
            // ★修正: 遅延時間も設定値を使用
            this.spRegenDelay = this.playerConfig.spDelay !== undefined ? this.playerConfig.spDelay : 1.0;
            if (window.simpleGame) window.simpleGame.notifySp();
            return true;
        }
        return false;
    }
    _checkGrounded() {
        const start = this.body.position;
        const currentVel = new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
        // 重力方向への落下速度を抽出
        const fallSpeed = Math.max(0, currentVel.dot(this.gravityDir));

        let radius = 0.4;
        let playerHeight = 1.0;
        if (this.body.shapes.length > 0) {
            const bottomShape = this.body.shapes[this.body.shapes.length - 1];
            if (bottomShape instanceof CANNON.Sphere) {
                radius = bottomShape.radius;
                playerHeight = Math.abs(this.body.shapeOffsets[this.body.shapes.length - 1].y) + radius;
            }
        }

        const rayLen = playerHeight + 0.15 + (fallSpeed * 0.02);
        let isGrounded = false;
        this.currentHitNormal = null;

        // ★修正: Upベクトル(重力の逆)基準でRaycast用のオフセットを計算
        const up = this.upVector.clone().normalize();
        let right = new THREE.Vector3(1, 0, 0);
        if (Math.abs(up.x) > 0.9) right.set(0, 1, 0);
        right.cross(up).normalize();
        const forward = new THREE.Vector3().crossVectors(right, up).normalize();

        const checkOffsets = [
            new THREE.Vector3(0, 0, 0),
            right.clone().multiplyScalar(radius * 0.7),
            right.clone().multiplyScalar(-radius * 0.7),
            forward.clone().multiplyScalar(radius * 0.7),
            forward.clone().multiplyScalar(-radius * 0.7)
        ];

        const result = new CANNON.RaycastResult();

        for (const offset of checkOffsets) {
            // 現在の姿勢に基づいた始点と終点
            const rStart = new CANNON.Vec3(start.x + offset.x, start.y + offset.y, start.z + offset.z);
            const rEnd = new CANNON.Vec3(
                rStart.x + this.gravityDir.x * rayLen,
                rStart.y + this.gravityDir.y * rayLen,
                rStart.z + this.gravityDir.z * rayLen
            );

            result.reset();
            this.world.raycastClosest(rStart, rEnd, {
                skipBackfaces: true, collisionFilterMask: 1 | 4
            }, result);

            if (result.hasHit && result.body !== this.body) {
                const hitNormal = new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z);
                // hitNormal.y ではなく、現在の「上」方向との内積で斜面を判定
                if (Math.acos(hitNormal.dot(up)) < 1.05) {
                    isGrounded = true;
                    this.currentHitNormal = hitNormal;
                    break;
                }
            }
        }

        if (!this.body.material) this.body.material = new CANNON.Material('player_material');
        this.body.material.friction = 0.0; // 常に摩擦ゼロ(移動ロジックで制御)

        this._lastGroundedState = isGrounded;
        return isGrounded;
    } 
    _updatePhysics(dt) {
        const body = this.body;
        const conf = this.playerConfig;

        // ★追加: Upベクトルの滑らかな追従 (これがカメラや姿勢の基準になる)
        this.upVector.lerp(this.targetUpVector, 0.1).normalize();

        // ★追加: Cannon.jsの世界重力をキャンセルし、プレイヤー専用の重力を毎フレーム力(Force)として加算する
        const worldGrav = this.world.gravity;
        body.force.x -= worldGrav.x * body.mass;
        body.force.y -= worldGrav.y * body.mass;
        body.force.z -= worldGrav.z * body.mass;

        const gVal = Math.abs(conf.gravity !== undefined ? conf.gravity : -20);
        body.force.x += this.gravityDir.x * gVal * body.mass;
        body.force.y += this.gravityDir.y * gVal * body.mass;
        body.force.z += this.gravityDir.z * gVal * body.mass;

        const isCurrentlyGrounded = this._checkGrounded();

        // --- ステップ(回避) ---
         if (this.input.step && isCurrentlyGrounded && this.stepCooldown <= 0 && this.currentSp >= 20) {
            this.consumeSp(20); 
            this.playAnimation('step'); 
            const camForward = new THREE.Vector3();
            this.camera.getWorldDirection(camForward);
            camForward.sub(this.upVector.clone().multiplyScalar(camForward.dot(this.upVector))).normalize();
            const camRight = new THREE.Vector3().crossVectors(camForward, this.upVector).normalize();

            let moveVec = new THREE.Vector3();
            if (Math.abs(this.input.x) > 0.1 || Math.abs(this.input.y) > 0.1) {
                moveVec.add(camRight.multiplyScalar(this.input.x)).add(camForward.multiplyScalar(-this.input.y)).normalize();
            } else {
                moveVec.copy(camForward);
            }

            const stepPower = 15.0 * conf.speed;
            body.velocity.x += moveVec.x * stepPower;
            body.velocity.y += moveVec.y * stepPower;
            body.velocity.z += moveVec.z * stepPower;

            this.invincibleTimer = 0.3;
            this.stepCooldown = 0.8;

            if (window.effectManager) {
                // ★修正: Cannon.jsの座標をThree.jsのVector3に変換してから計算する
                const feet = new THREE.Vector3(body.position.x, body.position.y, body.position.z).add(this.upVector.clone().multiplyScalar(-0.5));
                window.effectManager.spawnEffect('dust', feet);
            }
            this.input.step = false;
        }
        if (this.stepCooldown > 0) this.stepCooldown -= dt;

        // --- ダッシュ ---
        let isDashing = false;
        const dashCost = conf.spCostDash !== undefined ? conf.spCostDash : 10;
        if (this.input.dash && this.currentSp > 0) {
            if (dashCost > 0) {
                this.consumeSp(dashCost * dt);
                this.spRegenDelay = conf.spDelay !== undefined ? conf.spDelay : 1.0;
            }
            isDashing = true;
        }

        const dashMult = isDashing ? (conf.dashMult || 2.0) : 1.0;
        const speed = 7.0 * conf.speed * dashMult;

// ★ここから「調べる」「滞在ダメージ」の処理を上書き
        if (this.interactCooldown > 0) this.interactCooldown -= dt;
        
        let canInteract = false;
        // input.interact はUIエディタで設定した「調べる」ボタンの信号
        if (this.input.interact && this.interactCooldown <= 0) {
            canInteract = true;
            this.interactCooldown = 0.5;
            this.input.interact = false;
        }

        this.touchingObjects.forEach(targetBody => {
            if (!targetBody || !targetBody.userData) { 
                this.touchingObjects.delete(targetBody); 
                return; 
            }
            
            // ★超重要：距離が3m以上離れたら、触れていないとみなしてリストから消す
            const dist = this.body.position.distanceTo(targetBody.position);
            if (dist > 3.0) {
                this.touchingObjects.delete(targetBody);
                return;
            }

            const role = targetBody.userData.role;
            const params = targetBody.userData.roleParams || {};

            // 滞在ダメージ（毒沼など）
            if (role === 'damage' && this.contactCooldown <= 0) {
                this.takeDamage(params.damageVal || 10);
                this.body.velocity.y = 5.0; // 少し浮かす
                this.contactCooldown = 1.0;
            }

            // 調べる (スイッチ・会話)
            if (canInteract) {
                if (role === 'talkable') {
                    if (window.simpleGame) {
                        window.simpleGame.triggerEventUI('dialogue', true);
                        window.simpleGame.showDialogue(params.speakerName, params.message, params.bindKeyName, params.bindKeyText);
                    }
                } 
                else if (role === 'switch' && (params.triggerType === 'interact' || !params.triggerType)) {
                    if (params.targetId && window.simpleGame) {
                        window.simpleGame.activateReceiver(params.targetId);
                        if (window.effectManager) window.effectManager.spawnEffect('hit', targetBody.position);
                    }
                }else if (role === 'receiver' && params.triggerType === 'interact') {
                    if (window.simpleGame) {
                        window.simpleGame.activateReceiver(params.myId);
                    }
                }
            }
        });
        body.wakeUp();
        if (this.jumpIgnoreTimer > 0) this.jumpIgnoreTimer -= dt;
        // --- 基本移動 (アクション特化型: 接地無視タイマー対応) ---
        if (this.stepCooldown <= 0) {
            const calcUp = this.targetUpVector;

            let moveVec = new THREE.Vector3();
            if (Math.abs(this.input.x) > 0.1 || Math.abs(this.input.y) > 0.1) {
                const camForward = new THREE.Vector3();
                this.camera.getWorldDirection(camForward);
                camForward.sub(calcUp.clone().multiplyScalar(camForward.dot(calcUp))).normalize();
                const camRight = new THREE.Vector3().crossVectors(camForward, calcUp).normalize();

                moveVec.add(camRight.multiplyScalar(this.input.x))
                    .add(camForward.multiplyScalar(-this.input.y))
                    .normalize()
                    .multiplyScalar(speed);

                if (!isCurrentlyGrounded) {
                    let wallNormal = null;
                    for (let i = 0; i < this.world.contacts.length; i++) {
                        const c = this.world.contacts[i];
                        if (c.bi === this.body || c.bj === this.body) {
                            const n = c.ni;
                            const normal = c.bi === this.body ? n.clone() : n.clone().negate();
                            // 現在のUpベクトルと直交に近い（水平な法線＝壁）かどうか
                            if (Math.abs(normal.dot(this.upVector)) < 0.5) {
                                wallNormal = new THREE.Vector3(normal.x, normal.y, normal.z);
                                break;
                            }
                        }
                    }
                    if (wallNormal) {
                        const dot = moveVec.dot(wallNormal);
                        if (dot < 0) { // 壁に向かっている場合
                            // 壁へ向かう速度成分をカットし、壁に沿ってスライドさせる
                            moveVec.sub(wallNormal.multiplyScalar(dot));
                        }
                    }
                }

                if (conf.cameraMode !== 'fps') {
                    const targetLook = moveVec.clone().normalize();
                    if (targetLook.lengthSq() > 0.001) {
                        // 進行方向を向く行列を作成
                        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), targetLook, this.upVector);
                        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);

                        // ★修正: モデルの作り（+Z正面）に合わせて180度回転を加える
                        const offsetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
                        targetQuat.multiply(offsetQuat);

                        this.mesh.quaternion.slerp(targetQuat, 0.2);
                        this.body.quaternion.copy(this.mesh.quaternion);
                    }
                }
            }


            // ★修正: 「接地している」かつ「ジャンプ直後ではない」場合のみ地上モード
            if (isCurrentlyGrounded && this.jumpIgnoreTimer <= 0) {
                const stickToGroundVel = this.gravityDir.clone().normalize().multiplyScalar(2.0);
                body.velocity.x = moveVec.x + stickToGroundVel.x;
                body.velocity.y = moveVec.y + stickToGroundVel.y;
                body.velocity.z = moveVec.z + stickToGroundVel.z;
                
                // アニメーションの適用をここに統合 (ステップ中は上書きしない)
                if (Math.abs(this.input.x) > 0.1 || Math.abs(this.input.y) > 0.1) {
                    this.playAnimation(this.input.dash ? 'run' : 'walk');
                } else {
                    this.playAnimation('idle');
                }
            } else {
                // 【空中モード】
                const currentVel = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
                const upVelScalar = currentVel.dot(calcUp);
                const upVel = calcUp.clone().multiplyScalar(upVelScalar);
                const currentPlanarVel = currentVel.clone().sub(upVel);

                 if (moveVec.lengthSq() > 0.01) {
                    currentPlanarVel.lerp(moveVec, 0.1); // 空中制御を少し機敏に
                } else {
                    // 入力がない時は急減速させる（滑り防止）
                    currentPlanarVel.multiplyScalar(0.8); 
                    if(currentPlanarVel.lengthSq() < 0.01) currentPlanarVel.set(0,0,0);
                }
                const finalVel = upVel.add(currentPlanarVel);
                body.velocity.set(finalVel.x, finalVel.y, finalVel.z);
            }
        }

        if (isCurrentlyGrounded) {
            this.jumpCount = 0;
            this.coyoteTime = 0.15;
        } else {
            this.coyoteTime -= dt;
        }

        // --- ジャンプ処理の修正 ---
        const maxJumps = 1 + conf.doubleJump;
        const jumpCost = conf.spCostJump !== undefined ? conf.spCostJump : 15;

        if (this.input.jump) {
            const canJump = (this.coyoteTime > 0) || (conf.doubleJump > 0 && this.jumpCount < maxJumps);
            if (conf.doubleJump === -1 || canJump) {
                if (this.consumeSp(jumpCost)) {
                    this.jumpIgnoreTimer = 0.2; 
                    this.playAnimation('jump'); // ★追加
                    
                    const jumpVec = this.upVector.clone().multiplyScalar(9.0 * conf.jumpPower);
                    const currentVel = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
                    const upVelScalar = currentVel.dot(this.upVector);
                    const upVel = this.upVector.clone().multiplyScalar(upVelScalar);
                    const newVel = currentVel.sub(upVel).add(jumpVec);

                    body.velocity.set(newVel.x, newVel.y, newVel.z);
                    this.jumpCount++;
                    this.coyoteTime = 0;
                }
            }
            this.input.jump = false;
        }


        if (!isCurrentlyGrounded && this.input.jumpHeld && conf.doubleJump === -1) {
            const boostCostPerFrame = jumpCost * dt;
            if (this.currentSp > boostCostPerFrame) {
                this.consumeSp(boostCostPerFrame);
                const boostPower = 15.0 * conf.jumpPower;
                const targetBoostVel = 5.0;

                const currentVel = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
                if (currentVel.dot(this.upVector) < targetBoostVel) {
                    const force = this.upVector.clone().multiplyScalar(boostPower * 100);
                    body.applyForce(new CANNON.Vec3(force.x, force.y, force.z), body.position);
                }

                if (Math.random() < 0.3 && window.effectManager) {
                    // ★修正: Cannon.jsの座標をThree.jsのVector3に変換してから計算する
                    const jetPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z).add(this.upVector.clone().multiplyScalar(-0.6));
                    window.effectManager.spawnEffect('dust', jetPos);
                }
            } else {
                if (window.effectManager) window.effectManager.showEmote(this.mesh, 'sweat');
            }
            this.input.jump = false;
        }
 const expectedMovement = new CANNON.Vec3(body.velocity.x * dt, body.velocity.y * dt, body.velocity.z * dt);
        // 1フレームの移動距離が大きい(約0.5m以上)場合のみチェックを実行（負荷軽減）
        if (expectedMovement.lengthSquared() > 0.25) {
            this._ccdRay.from.copy(body.position);
            this._ccdRay.to.set(
                body.position.x + expectedMovement.x,
                body.position.y + expectedMovement.y,
                body.position.z + expectedMovement.z
            );

            this._ccdResult.reset();
             this.world.raycastClosest(this._ccdRay.from, this._ccdRay.to, { collisionFilterMask: 1 | 4 }, this._ccdResult);

            if (this._ccdResult.hasHit) {
                // 壁にめり込む直前の座標で速度を殺す
                const hitDist = this._ccdResult.distance;
                const safeDist = Math.max(0, hitDist - 0.5); // 0.5はプレイヤーの半径的な余白
                
                const dir = expectedMovement.clone();
                dir.normalize();
                
                body.position.x += dir.x * safeDist;
                body.position.y += dir.y * safeDist;
                body.position.z += dir.z * safeDist;
                
                // ぶつかった方向の速度だけ0にする
                const normal = this._ccdResult.hitNormalWorld;
                const dot = body.velocity.dot(normal);
                if (dot < 0) {
                    body.velocity.x -= normal.x * dot;
                    body.velocity.y -= normal.y * dot;
                    body.velocity.z -= normal.z * dot;
                }
            }
        }
    }_updateCamera(dt) {
        if (!this.mesh || !this.body) return; 

        // カメラの基本の「上」をキャラクターの「上」に合わせる
        this.camera.up.lerp(this.upVector, 0.1);

        // ロックオン時の視点補正
        if (window.simpleGame && window.simpleGame.lockOnTarget) {
            const target = window.simpleGame.lockOnTarget.meshGroup;
            if (target && target.parent) {
                const diff = target.position.clone().sub(this.mesh.position);
                const heightDiff = diff.dot(this.upVector);
                const planarDiff = diff.clone().sub(this.upVector.clone().multiplyScalar(heightDiff));

                const right = new THREE.Vector3(1, 0, 0);
                if (Math.abs(this.upVector.x) > 0.9) right.set(0, 1, 0);
                right.cross(this.upVector).normalize();
                const forward = new THREE.Vector3().crossVectors(right, this.upVector).normalize();

                const px = planarDiff.dot(right);
                const pz = planarDiff.dot(forward);

                this.cameraAngle = Math.atan2(px, pz);
                this.cameraPitch = -Math.atan2(heightDiff, Math.sqrt(px * px + pz * pz)) * 0.5;
            }
        }

        const mode = this.playerConfig.cameraMode || 'tps';
        const dist = this.playerConfig.cameraDist || 8.0;
        const sensitivity = 2.0;

        // ★追加・修正: カメラモード別の計算
        let idealCamPos = new THREE.Vector3();
        const targetPos = this.mesh.position.clone().add(this.upVector.clone().multiplyScalar(1.5));

        // 右スティック（マウス）によるカメラ操作の入力
        if (Math.abs(this.input.camX) > 0.1) this.cameraAngle -= this.input.camX * sensitivity * dt;
        if (Math.abs(this.input.camY) > 0.1) {
            this.cameraPitch -= this.input.camY * sensitivity * dt;
            this.cameraPitch = Math.max(-Math.PI / 2 + 0.2, Math.min(Math.PI / 2 - 0.2, this.cameraPitch));
        }

        const right = new THREE.Vector3(1, 0, 0);
        if (Math.abs(this.upVector.x) > 0.9) right.set(0, 1, 0);
        right.cross(this.upVector).normalize();
        const forward = new THREE.Vector3().crossVectors(right, this.upVector).normalize();

        if (mode === 'fps') {
            // 【一人称視点】 キャラを透明にして頭の位置にカメラを置く
            this.mesh.visible = false;
            
            idealCamPos.copy(targetPos);
            // 視線の計算
            const hDist = Math.cos(this.cameraPitch);
            const vDist = Math.sin(this.cameraPitch);
            this._tmpVec3_1.copy(right).multiplyScalar(Math.sin(this.cameraAngle) * hDist);
            this._tmpVec3_2.copy(forward).multiplyScalar(Math.cos(this.cameraAngle) * hDist);
            this._tmpVec3_3.copy(this.upVector).multiplyScalar(vDist);
            
            const lookTarget = idealCamPos.clone().add(this._tmpVec3_1).add(this._tmpVec3_2).add(this._tmpVec3_3);
            
            this.camera.position.lerp(idealCamPos, 0.5); // すばやく追従
            this.camera.lookAt(lookTarget);

            // キャラ本体も視線に合わせて回転させる（攻撃判定などのため）
            this.mesh.rotation.y = this.cameraAngle;
            this.body.quaternion.copy(this.mesh.quaternion);

        } else if (mode === 'top_down') {
            // 【俯瞰（見下ろし）視点】 真上から見下ろす（右スティックの回転を無視）
            this.mesh.visible = true;
            
            idealCamPos.copy(targetPos).add(this.upVector.clone().multiplyScalar(dist));
            // 少し手前(Z方向)にずらして完全な真上を避ける
            idealCamPos.add(forward.clone().multiplyScalar(dist * 0.3));
            
            this.camera.position.lerp(idealCamPos, 0.1);
            this.camera.lookAt(targetPos);

        } else if (mode === 'side_scroll') {
            // 【横スクロール視点】 真横から見る
            this.mesh.visible = true;
            
            // X軸を横移動とし、Z軸の手前側にカメラを固定する
            idealCamPos.copy(targetPos).add(forward.clone().multiplyScalar(dist));
            idealCamPos.add(this.upVector.clone().multiplyScalar(dist * 0.2)); // 少し見下ろす
            
            this.camera.position.lerp(idealCamPos, 0.1);
            this.camera.lookAt(targetPos);

        } else {
            // 【三人称視点 (TPS)】 既存のロジック
            this.mesh.visible = true;

            const hDist = Math.cos(this.cameraPitch) * dist;
            const vDist = Math.sin(this.cameraPitch) * dist;

            this._tmpVec3_1.copy(right).multiplyScalar(Math.sin(this.cameraAngle) * hDist);
            this._tmpVec3_2.copy(forward).multiplyScalar(Math.cos(this.cameraAngle) * hDist);
            this._tmpVec3_3.copy(this.upVector).multiplyScalar(vDist);

            idealCamPos.copy(targetPos).add(this._tmpVec3_1).add(this._tmpVec3_2).add(this._tmpVec3_3);

            // 障害物回避
            this._tmpCanVec_1.set(targetPos.x, targetPos.y, targetPos.z);
            this._tmpCanVec_2.set(idealCamPos.x, idealCamPos.y, idealCamPos.z);
            const ray = new CANNON.Ray(this._tmpCanVec_1, this._tmpCanVec_2);
            ray.collisionFilterMask = 1; // Stageの壁のみ
            const result = new CANNON.RaycastResult();
            ray.intersectWorld(this.world, { mode: CANNON.Ray.CLOSEST, result: result });

            if (result.hasHit) {
                const hitPoint = new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
                const dir = new THREE.Vector3().subVectors(targetPos, hitPoint).normalize();
                idealCamPos.copy(hitPoint).add(dir.multiplyScalar(0.2)); // 壁にめり込まないように少し前に出す
            }

            this.camera.position.lerp(idealCamPos, 0.1);
            this.camera.lookAt(targetPos);
        }

        // カメラ揺れ
        if (this.cameraShakeTimer > 0) {
            this.cameraShakeTimer -= dt;
            const intensity = this.cameraShakeIntensity * (this.cameraShakeTimer / 0.3);
            this.camera.position.x += (Math.random() - 0.5) * intensity;
            this.camera.position.y += (Math.random() - 0.5) * intensity;
        }
    }



    _checkBoundary() {
        const pos = this.body.position;

        // ★追加: スポーン直後の物理エンジンの荒ぶりによる即死判定を防ぐ
        if (Math.abs(this.body.velocity.y) > 100) return;

        const boundary = this.playerConfig.boundary || { x: 50, y: 50, z: 50 };
        const boundsMode = this.playerConfig.boundaryMode || 'block';

        const halfX = boundary.x / 2;
        const halfZ = boundary.z / 2;
        const minY = -boundary.y / 2;

        let outOfBoundsXZ = Math.abs(pos.x) > halfX || Math.abs(pos.z) > halfZ;
        let outOfBoundsY = pos.y < minY;

        if (this.body.linearFactor.y !== 1 && !outOfBoundsY) {
            this.body.linearFactor.y = 1;
        }

        if (boundsMode === 'none') {
            // ★追加: 「制限なし」設定でも、奈落の底 (-500m) に落ちたら強制的にデス判定にしてフリーズを防ぐ
            if (pos.y < -500) {
                if (window.simpleGame) window.simpleGame.takeDamage(this.playerConfig.maxHp + 999);
            }
            return;
        }

        if (boundsMode === 'kill') {
            if (outOfBoundsXZ || outOfBoundsY) {
                // システム経由でダメージを与える (HP以上のダメージ)
                if (window.simpleGame) window.simpleGame.takeDamage(this.playerConfig.maxHp + 999);
                // ★追加: 死亡した時点でボディが削除されるため、以降の処理を即座に中断してエラーを防ぐ
                return;
            }
        }
        else if (boundsMode === 'block') {
            if (outOfBoundsXZ) {
                pos.x = Math.max(-halfX, Math.min(halfX, pos.x));
                pos.z = Math.max(-halfZ, Math.min(halfZ, pos.z));
                this.body.velocity.x = 0;
                this.body.velocity.z = 0;
                this.body.position.copy(pos);
            }
            if (outOfBoundsY) {
                pos.y = minY;
                this.body.velocity.y = 0;
                this.body.linearFactor.y = 0;
                this.body.position.copy(pos);
                this.jumpCount = 0;
                this._lastGroundedState = true;
            }
        }
    }
_onCollide(e) {
        const contact = e.contact;
        let targetBody = (contact.bi === this.body) ? contact.bj : contact.bi;
        
        if (!targetBody || !targetBody.userData) return;

        // ★触れた物体をリストに登録（離れたら _updatePhysics 側で自動削除される）
        this.touchingObjects.add(targetBody);

        if (this.contactCooldown > 0) return;

        const role = targetBody.userData.role;
        const params = targetBody.userData.roleParams || {};

        if (role === 'item_pickup') {
            if (targetBody.userData.isCollected) return;
            if (window.simpleGame) {
                window.simpleGame.inventory.push({
                    name: params.itemName || '謎のアイテム', icon: params.itemIcon || '📦', desc: params.itemDesc || '効果はわからない。',
                    type: params.itemType || 'hp_heal', value: params.amount !== undefined ? params.amount : 30
                });
                targetBody.userData.isCollected = true;
                if (window.effectManager) window.effectManager.spawnEffect('hit', targetBody.position);
                if (window.showNotification) window.showNotification(`📥 ${params.itemName || 'アイテム'} を拾った！`);
                const mesh = this.stageGroup.getObjectByProperty('uuid', targetBody.userData.meshUUID);
                if (mesh) mesh.visible = false;
                targetBody.position.set(0, -9999, 0);
            }
            return;
        } 
        // --- SimpleGame.js (またはPlayerController.js内の該当箇所) ---

        else if (role === 'chest') {
            if (targetBody.userData.isOpened) return;
            if (params.isLocked) {
                const hasKey = this.inventory.find(i => i.type === 'key' && i.name === params.requiredKeyId);
                if (!hasKey) {
                    if (window.showNotification) window.showNotification(`🔒 鍵（${params.requiredKeyId}）が必要です`);
                    if (window.effectManager) window.effectManager.showEmote(this.player.mesh, 'question');
                    this.contactCooldown = 1.0;
                    return;
                } else {
                    if (window.showNotification) window.showNotification(`🔓 鍵を使って開けました！`);
                }
            }

            if (window.simpleGame) {
                const itemData = {
                    name: params.itemName || '宝箱の遺物', 
                    icon: params.itemIcon || '🎁', 
                    desc: params.itemDesc || '中に入っていたもの。',
                    type: params.itemType || 'hp_heal', 
                    equipSlot: params.equipSlot || 'weapon',
                    value: params.amount !== undefined ? params.amount : 20
                };
                window.simpleGame.inventory.push(itemData);
                targetBody.userData.isOpened = true;
                
                // 演出処理
                const mesh = this.stageGroup.getObjectByProperty('uuid', targetBody.userData.meshUUID);
                if (mesh) {
                    mesh.scale.multiplyScalar(0.5);
                    if (window.effectManager) window.effectManager.spawnEffect('explosion', mesh.position);
                }
                if (window.showNotification) window.showNotification(`🎁 [${itemData.name}] を手に入れた！`);
            }
            this.contactCooldown = 1.0;
        }
        else if (role === 'switch') {
            // ★「踏む(step_on)」設定のスイッチだけ、ここで即座に反応させる
            if (params.triggerType === 'step_on' && params.targetId && window.simpleGame) {
                window.simpleGame.activateReceiver(params.targetId);
                if (window.effectManager) window.effectManager.spawnEffect('hit', targetBody.position);
                this.contactCooldown = 1.0;
            }
        } 
        else if (role === 'heal') {
            if (this.currentHp < this.playerConfig.maxHp) {
                this.currentHp = Math.min(this.playerConfig.maxHp, this.currentHp + (params.amount || 20));
                if (window.simpleGame) window.simpleGame.notifyDamage(0);
                if (window.effectManager) window.effectManager.showEmote(this.mesh, 'heart');
                this.contactCooldown = 2.0;
            }
        } 
        else if (role === 'goal') {
            const cond = params.condition || 'touch';
            if (cond === 'all_flags' && window.simpleGame && window.simpleGame.collectedFlags < window.simpleGame.totalFlags) {
                if (window.effectManager) window.effectManager.showEmote(this.mesh, 'question');
                return;
            } else if (cond === 'kill_all' && window.simpleGame && window.simpleGame.enemies.length > 0) {
                if (window.effectManager) window.effectManager.showEmote(this.mesh, 'alert');
                return;
            }
            if (window.simpleGame) window.simpleGame.gameClear();
            this.contactCooldown = 999.0;
        } 
         else if (role === 'stage_portal') {
            const nextStageName = params.targetStage;
            const spawnId = params.spawnPointId; // ★追加

            if (nextStageName && window.ioManager) {
                window.showNotification(`🚀 ${nextStageName} へ移動中...`);
                if (window.effectManager) window.effectManager.spawnEffect('explosion', targetBody.position);
                this.contactCooldown = 999.0;
                this.body.velocity.set(0, 0, 0);
                
                // ★追加: 予約IDを渡してロード
                window.ioManager.loadStageFromURL(nextStageName, true, spawnId);
            }
        }
        else if (role === 'warp') {
            const targetId = params.targetId;
            let exitPos = null;
            this.stageGroup.traverse(obj => {
                if (obj.userData.role === 'warp_exit' && obj.userData.roleParams.myId === targetId) {
                    exitPos = new THREE.Vector3();
                    obj.getWorldPosition(exitPos);
                }
            });
            if (exitPos) {
                this.body.position.set(exitPos.x, exitPos.y + 1.0, exitPos.z);
                this.body.velocity.set(0, 0, 0);
                if (window.effectManager) window.effectManager.spawnEffect('hit', exitPos);
                this.contactCooldown = 1.0;
            }
        } else if (role === 'portal') {
            const portalId = params.portalId;
            if (portalId && this.contactCooldown <= 0) {
                let exitPos = null;
                // 自分以外の同じ portalId を持つポータルを探す
                this.stageGroup.traverse(obj => {
                    if (obj.userData.role === 'portal' && 
                        obj.userData.roleParams.portalId === portalId && 
                        obj.uuid !== targetBody.userData.meshUUID) {
                        exitPos = new THREE.Vector3();
                        obj.getWorldPosition(exitPos);
                    }
                });

                if (exitPos) {
                    this.body.position.set(exitPos.x, exitPos.y + 1.0, exitPos.z);
                    this.body.velocity.set(0, 0, 0);
                    if (window.effectManager) window.effectManager.spawnEffect('hit', exitPos);
                    // 無限ループワープを防ぐため長めのクールダウン
                    this.contactCooldown = 2.0; 
                }
            }
        }
        // ★追加: ジャンプ台
        else if (role === 'jump_pad') {
            const power = params.power !== undefined ? params.power : 1.5;
            // プレイヤーのジャンプ力基準値 × ジャンプ台の倍率
            const boost = 9.0 * this.playerConfig.jumpPower * power;
            
            this.body.velocity.y = boost; // 一気に上へ飛ばす
            
            // エフェクトとアニメーション
            if (window.effectManager) window.effectManager.spawnEffect('dust', targetBody.position);
            this.playAnimation('jump');
            
            this.contactCooldown = 0.5; // 連続跳ね防止
        }
        else if (role === 'save') {
            this.setCheckPoint(this.body.position);
            this.contactCooldown = 2.0;
        } else if (role === 'receiver') {
            // 起動方法が「触れる(touch)」に設定されている場合のみ実行
            if (params.triggerType === 'touch' && window.simpleGame) {
                window.simpleGame.activateReceiver(params.myId);
                // 連続発火を防ぐためのクールダウン（任意で調整）
                this.contactCooldown = 1.0; 
            }
        }
        else if (role === 'event_trigger') {
            const oneShot = params.oneShot !== undefined ? params.oneShot : true;
            if (oneShot && targetBody.userData.hasTriggered) return;
            if (oneShot) targetBody.userData.hasTriggered = true;
            if (params.eventType === 'open_ui' && window.simpleGame) {
                window.simpleGame.triggerEventUI(params.targetScreenId || 'tutorial_1', params.pauseGame !== undefined ? params.pauseGame : true);
            }
            this.contactCooldown = 1.0;
        }
    }
    takeDamage(amount) {
        if (this.isInvincible || this.currentHp <= 0) return this.currentHp;

        this.currentHp = Math.max(0, this.currentHp - amount);

        this.invincibleTimer = 0.5;
        this.damageFlashTimer = 0.2;
        this.cameraShakeTimer = 0.3;
        this.cameraShakeIntensity = 0.5;

        // UIと生死判定をシステムに依頼
        if (window.simpleGame) window.simpleGame.notifyDamage(amount);
        return this.currentHp;
    }
    executeAttack() {
        if (!window.simpleGame) return;
        this.playAnimation('attack1'); 
        
        // ★追加: プレイヤーの攻撃音（仮で固定のシステム音か、後で装備品に紐付ける）
        // 現状は剣の素振り音のようなエフェクトがあれば鳴らす
        if (window.soundManager) {
            // "snd_player_attack" のような特定のIDの音があれば鳴らす（なければ無視される）
            window.soundManager.playSE('snd_player_attack', 0.8);
        }

        // 装備中の武器から性能を取得（未装備なら基本ステータス）
        const weapon = window.simpleGame.equipment['weapon'];
        const damage = this.playerConfig.baseAtk + (weapon ? weapon.value : 0);
        const range = 2.5; // 射程 2.5m
        const angleLimit = Math.PI / 2; // 前方90度 (±45度) の扇形判定

        // 1. 踏み込み (誘導) 処理
        // ロックオン中、かつ敵が少し離れていれば敵に向かって踏み込む
        let attackDir = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));

        if (window.simpleGame.lockOnTarget && window.simpleGame.lockOnTarget.meshGroup && window.simpleGame.lockOnTarget.meshGroup.parent) {
            const targetPos = window.simpleGame.lockOnTarget.meshGroup.position;
            const distToTarget = this.mesh.position.distanceTo(targetPos);

            // 敵が射程より少し遠い場合のみ、強力な踏み込みを行う
            if (distToTarget > range * 0.5 && distToTarget < range * 2.0) {
                const dirToTarget = targetPos.clone().sub(this.mesh.position).normalize();
                // 物理速度を書き換えて一瞬で前進
                this.body.velocity.x = dirToTarget.x * 12.0;
                this.body.velocity.z = dirToTarget.z * 12.0;
                // 向きも強制的に敵に向ける
                this.mesh.rotation.y = Math.atan2(dirToTarget.x, dirToTarget.z);
                this.body.quaternion.copy(this.mesh.quaternion);
                attackDir = dirToTarget;
            }
        } else {
            // ロックオンなしの時は向いている方向に軽く踏み込む
            this.body.velocity.x = attackDir.x * 5.0;
            this.body.velocity.z = attackDir.z * 5.0;
        }

        // エフェクト（斬撃の軌跡）
        if (window.effectManager) {
            const slashPos = this.mesh.position.clone().add(attackDir.clone().multiplyScalar(1.0));
            slashPos.y += 0.5;
            window.effectManager.spawnEffect('slash', slashPos);
        }

        // 2. 当たり判定（扇状の範囲チェック）
        const pPos = this.mesh.position;
        window.simpleGame.enemies.forEach(enemy => {
            if (enemy.state === 'dead' || !enemy.meshGroup) return;

            const ePos = enemy.meshGroup.position;
            const dist = pPos.distanceTo(ePos);

            // 射程内か？
            if (dist <= range) {
                // 前方角度内か？（内積で計算）
                const vecToEnemy = ePos.clone().sub(pPos).normalize();
                const dot = attackDir.dot(vecToEnemy);
                const angleToEnemy = Math.acos(dot);

                if (angleToEnemy <= angleLimit) {
                    const isUnaware = (enemy.state === 'idle' || enemy.state === 'search');

                    // 自分が敵の背後にいるか？ (敵の正面と、敵から自分へのベクトルの内積がマイナス)
                    const eForward = new THREE.Vector3(Math.sin(enemy.meshGroup.rotation.y), 0, Math.cos(enemy.meshGroup.rotation.y));
                    const toPlayer = pPos.clone().sub(ePos).normalize();
                    const isBehind = eForward.dot(toPlayer) < -0.5; // 背後 約120度の範囲内

                    let finalDamage = damage;

                    // 気づかれておらず、背後からの攻撃ならステルスキル発動！
                    if (isUnaware && isBehind) {
                        finalDamage *= 10; // ダメージ10倍の致命傷
                        if (window.showNotification) window.showNotification("🗡️ ステルスキル！ (Damage x10)");

                        // 特別なエフェクト（爆発エフェクトを流用して血しぶきっぽく）
                        if (window.effectManager) {
                            const hitPos = ePos.clone(); hitPos.y += 1.0;
                            window.effectManager.spawnEffect('explosion', hitPos);
                        }
                    }

                    // 命中！
                    enemy.takeDamage(finalDamage);
                    // ノックバック効果
                    if (enemy.body) {
                        // ステルスキルの時は大きく吹き飛ばす
                        const kbPower = (isUnaware && isBehind) ? 15.0 : 5.0;
                        enemy.body.velocity.x = attackDir.x * kbPower;
                        enemy.body.velocity.y = 3.0; // 少し浮かす
                        enemy.body.velocity.z = attackDir.z * 5.0;
                    }
                }
            }
        });
if (window.stage && window.stage.physicsMap) {
            window.stage.physicsMap.forEach((targetBody, uuid) => {
                const s = targetBody.userData.physicsSettings;
                if (!s || !s.destructible) return; // 破壊可能フラグがない物は無視

                // 距離チェック
                const dPos = new THREE.Vector3(targetBody.position.x, targetBody.position.y, targetBody.position.z);
                const dist = pPos.distanceTo(dPos);
                
                if (dist <= range) {
                    // 角度チェック
                    const vecToTarget = dPos.clone().sub(pPos).normalize();
                    const dot = attackDir.dot(vecToTarget);
                    
                    if (Math.acos(dot) <= angleLimit) {
                        // ダメージ処理
                        s.hp -= damage;
                        
                        if (window.effectManager) window.effectManager.spawnEffect('hit', dPos);
                        
                        if (s.hp <= 0) {
                            // 破壊されたら物理ボディを消し、メッシュを非表示にする
                            const mesh = this.stageGroup.getObjectByProperty('uuid', uuid);
                            if (mesh) {
                                mesh.visible = false;
                                if (window.effectManager) window.effectManager.spawnEffect('explosion', dPos);
                            }
                            // 物理エンジンから削除（すり抜けられるようにする）
                            targetBody.collisionResponse = false;
                            targetBody.position.set(0, -9999, 0);
                        }
                    }
                }
            });
        }
    }
    /**
     * アセンブル：装備品を含めた最終的なステータスを計算する
     */
    updateFinalStats() {
        if (!window.simpleGame) return;
        const gear = window.simpleGame.equipment;

        if (this._baseConfig === undefined) {
            this._baseConfig = {
                speed: this.playerConfig.speed,
                maxHp: this.playerConfig.maxHp,
                jumpPower: this.playerConfig.jumpPower // ★追加
            };
        }
        if (window.ioManager && document.getElementById('world-plr-speed')) {
            const uiConfig = window.ioManager.getWorldConfigFromUI();
            this._baseConfig.speed = uiConfig.playerSpeed;
            this._baseConfig.maxHp = uiConfig.maxHp;
            this._baseConfig.jumpPower = uiConfig.playerJump; // ★追加
        }

        this.playerConfig.speed = this._baseConfig.speed;
        this.playerConfig.maxHp = this._baseConfig.maxHp;
        this.playerConfig.jumpPower = this._baseConfig.jumpPower; // ★追加

        // 装備品ごとのボーナスを加算
        Object.values(gear).forEach(item => {
            if (item.type === 'equipment') {
                if (item.equipSlot !== 'weapon') {
                    // 足パーツ(leg)ならジャンプ力も上げるなどのロジック
                    if (item.equipSlot === 'leg') {
                        this.playerConfig.jumpPower += (item.value || 0) * 0.05;
                    }
                    this.playerConfig.speed += (item.value || 0) * 0.01;
                    this.playerConfig.maxHp += (item.value || 0);
                }
            }
        });

        this.currentHp = Math.max(0, Math.min(this.currentHp, this.playerConfig.maxHp));
        this.currentSp = Math.max(0, Math.min(this.currentSp, this.playerConfig.maxSp));
        
        // ★追加: 装備によって重量やスピードが極端になりすぎないよう制限
        this.playerConfig.speed = Math.max(0.1, Math.min(this.playerConfig.speed, 5.0));
        this.playerConfig.jumpPower = Math.max(0.5, Math.min(this.playerConfig.jumpPower, 3.0));

        if (window.simpleGame) {
            window.simpleGame.updateUI(); // UIに確実に反映させる
        }
    }
    /**
     * アセンブル機能（装備アイテムの見た目をプレイヤーに反映させる）
     */
    updateEquippedMeshes() {
        if (!window.simpleGame || !this.mesh) return;

        // 1. 古い装備のメッシュをすべて消去する
        const toRemove = [];
        this.mesh.children.forEach(child => {
            if (child.userData.isEquipMesh) toRemove.push(child);
        });
        toRemove.forEach(child => {
            this.mesh.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });

        // 2. 現在の装備品を3Dモデルとして構築する
        const gear = window.simpleGame.equipment;

        Object.values(gear).forEach(item => {
            if (item.type === 'equipment') {
                let geo, mat;
                let offset = new THREE.Vector3(0, 0, 0);

                if (item.equipSlot === 'weapon') {
                    // 右手(weapon)には剣のような長細い箱
                    geo = new THREE.BoxGeometry(0.1, 1.0, 0.2);
                    mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });
                    offset.set(0.5, 0, 0.4); // 体の右前方に配置
                }
                else if (item.equipSlot === 'head') {
                    // 頭には王冠や兜のようなリング
                    geo = new THREE.TorusGeometry(0.25, 0.05, 8, 16);
                    geo.rotateX(Math.PI / 2);
                    mat = new THREE.MeshStandardMaterial({ color: 0xffeb3b });
                    offset.set(0, 0.6, 0); // 頭上
                }
                else {
                    // その他（盾など）
                    geo = new THREE.BoxGeometry(0.4, 0.4, 0.1);
                    mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
                    offset.set(-0.5, 0, 0.4); // 左手
                }

                const equipMesh = new THREE.Mesh(geo, mat);
                equipMesh.position.copy(offset);
                equipMesh.userData.isEquipMesh = true; // 目印
                equipMesh.castShadow = true;

                // プレイヤーのMesh（カプセル）の子要素として追加
                this.mesh.add(equipMesh);
            }
        });
    }

_buildCharacterMesh() {
        this.parts = [];
        const tempParts = [];
        this.charData.parts.forEach((pData) => {
            let geo;
            const type = pData.userData.geometryType || 'cube';
            if (type === 'sphere') geo = new THREE.SphereGeometry(0.5, 16, 16);
            else if (type === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
            else if (type === 'cone') geo = new THREE.ConeGeometry(0.5, 1, 16);
            else geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshStandardMaterial({
                color: pData.color, transparent: pData.opacity < 1.0, opacity: pData.opacity
            });
            const m = new THREE.Mesh(geo, mat);
            m.name = pData.name; m.uuid = pData.uuid;
            m.position.fromArray(pData.pos); m.quaternion.fromArray(pData.rot); m.scale.fromArray(pData.scl);
            tempParts.push(m);
        });
        this.charData.parts.forEach((pData, index) => {
            const m = tempParts[index];
            if (pData.parentIndex === -1 || pData.parentIndex === undefined) this.mesh.add(m);
            else if (tempParts[pData.parentIndex]) tempParts[pData.parentIndex].add(m);
        });
        this.parts = tempParts;
    }

    playAnimation(name) {
        if (!this.charData || !this.charData.animations[name]) return;
        
        // 優先順位の設定（攻撃や被弾は途中でキャンセルさせない）
        const priority = { 
            'idle': 0, 'walk': 1, 'run': 1, 'jump': 2, 
            'step': 3, // ★ステップを追加
            'attack1': 4, 'damage': 5 
        };
        const currentP = priority[this.currentAnimName] || 0;
        const nextP = priority[name] || 0;

        if (this.currentAnimName === name) return;

        // 現在のアニメが「攻撃」などで、まだ終わっていない（55フレーム未満）なら、低い優先度のアニメは無視する
        if (currentP >= 3 && this.currentFrame < 55 && nextP < currentP) return;

        // ★追加: ブレンドのために過去のポーズを記憶
        this.prevAnimName = this.currentAnimName;
        this.prevFrame = this.currentFrame;
        this.blendFactor = 0.0;

        this.currentAnimName = name;
        this.currentFrame = 0;
    }
_updateAnimation(dt) {
    if (!this.charData || !this.charData.animations[this.currentAnimName]) return;
    this.currentFrame += dt * this.animSpeed;
    if (this.currentFrame >= 60) this.currentFrame = 0; 
    
    // ★追加: キャッシュ変数を不足なく全て用意する
    if(!this._tempV) this._tempV = new THREE.Vector3();
    if(!this._tempV2) this._tempV2 = new THREE.Vector3();
    if(!this._tempQ) this._tempQ = new THREE.Quaternion();
    if(!this._tempQ2) this._tempQ2 = new THREE.Quaternion();

    const animData = this.charData.animations[this.currentAnimName];
    this.charData.parts.forEach((pData, index) => {
        const track = animData[pData.uuid];
        if (!track || track.length === 0) return;
        const m = this.parts[index];
        let prev = track[0], next = track[track.length - 1];
        for (let i = 0; i < track.length - 1; i++) {
            if (track[i].frame <= this.currentFrame && track[i+1].frame >= this.currentFrame) {
                prev = track[i]; next = track[i+1]; break;
            }
        }
        let alpha = (next.frame !== prev.frame) ? (this.currentFrame - prev.frame) / (next.frame - prev.frame) : 0;
        alpha = alpha * alpha * alpha * (alpha * (alpha * 6 - 15) + 10); // Smootherstep

        // 現在のアニメの目標ポーズを計算 (それぞれ専用の型を使う)
        this._tempV.fromArray(prev.pos).lerp(this._tempV2.fromArray(next.pos), alpha);
        this._tempQ.fromArray(prev.rot).slerp(this._tempQ2.fromArray(next.rot), alpha); 

        // ブレンディング処理
        if (this.blendFactor < 1.0 && this.prevAnimName && this.charData.animations[this.prevAnimName]) {
            this.blendFactor += dt / this.blendDuration;
            if (this.blendFactor > 1.0) this.blendFactor = 1.0;

            const prevTrack = this.charData.animations[this.prevAnimName][pData.uuid];
            if (prevTrack && prevTrack.length > 0) {
                const oldKey = prevTrack.find(k => k.frame >= this.prevFrame) || prevTrack[0];
                
                m.position.fromArray(oldKey.pos).lerp(this._tempV, this.blendFactor);
                m.quaternion.fromArray(oldKey.rot).slerp(this._tempQ, this.blendFactor);
                // スケールもキャッシュ(_tempV2)を使ってGCを抑える
                m.scale.fromArray(oldKey.scl).lerp(this._tempV2.fromArray(next.scl), this.blendFactor); 
            } else {
                m.position.copy(this._tempV); m.quaternion.copy(this._tempQ);
            }
        } else {
            // ブレンド完了後
            m.position.copy(this._tempV);
            m.quaternion.copy(this._tempQ);
        }
    });
}
};