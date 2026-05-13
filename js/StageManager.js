/* =========================================
   js/StageManager.js (Fixed: Kinematic Logic & Loop Control)
   ========================================= */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'; 
export class StageManager {
    constructor(scene) {
        this.scene = scene;
        
        this.stageGroup = new THREE.Group();
        this.stageGroup.name = "StageGroup";
        this.scene.add(this.stageGroup);

        this.objectCounter = 1;

        // --- 物理エンジンの初期化 ---
        this.world = new CANNON.World();
        this.world.gravity.set(0, -20, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 20;
        this.world.allowSleep = true; 

        // マテリアル設定
        this.defaultMaterial = new CANNON.Material('default');
        
        // ★修正: 摩擦と反発の計算をよりゲーム向けに最適化
        // プレイヤーと壁/床の「めり込み解消力（Stiffness）」を極限まで高める
        const defaultContactMaterial = new CANNON.ContactMaterial(
            this.defaultMaterial, 
            this.defaultMaterial, 
            {
                friction: 0.1,        // 基本の摩擦は低めにして引っかかりを防ぐ
                restitution: 0.0,     // 弾まないようにする (0 = 弾まない)
                contactEquationStiffness: 1e9,   // ★めり込みを押し返す力 (超強力に)
                contactEquationRelaxation: 4     // ★押し返しの安定性 (数値を上げてガタつき防止)
            }
        );
        this.world.addContactMaterial(defaultContactMaterial);

        this.physicsMap = new Map();
        this.assetLibrary = {};
        this.boundaryMesh = null;
        this.elapsedTime = 0;

        // ★追加: GC最適化用の一時変数
        this._tmpKinematicAxis = new CANNON.Vec3();
        this._tmpKinematicQuat = new CANNON.Quaternion();
        this._tmpWorldPos = new THREE.Vector3();
        this._tmpWorldQuat = new THREE.Quaternion();
        this._tmpMat4 = new THREE.Matrix4();
        this._tmpInvMat4 = new THREE.Matrix4();
    }

    addObject(type, position) {
        const geo = this._createGeometry(type);
        if (!geo) return null;
        if (!geo.userData.offset) geo.userData.offset = new THREE.Vector3(0, 0, 0);

        const mat = new THREE.MeshStandardMaterial({ 
            color: 0xcccccc, roughness: 0.5, metalness: 0, side: THREE.DoubleSide 
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // ★修正: 生成されるデフォルト名は、日本語ではなく英語表記の綺麗な名前に変換する
        const cleanNames = {
            'cube': 'Cube', 'plane': 'Plane', 'sphere': 'Sphere', 'cylinder': 'Cylinder',
            'cone': 'Cone', 'torus': 'Torus', 'capsule': 'Capsule', 'dome': 'Dome',
            'slope': 'Slope', 'stairs': 'Stairs', 'pipe': 'Pipe', 'arch': 'Arch',
            'ring': 'Ring', 'terrain': 'Terrain', 'rock': 'Rock', 'floating_island': 'Island',
            'rand_rock': 'Rand_Rock', 'rand_tree': 'Rand_Tree', 'rand_cloud': 'Rand_Cloud',
            'rand_grass': 'Rand_Grass', 'rand_crystal': 'Crystal'
        };
        const displayName = cleanNames[type] || type.charAt(0).toUpperCase() + type.slice(1);
        mesh.name = `${displayName}_${this.objectCounter++}`;
        
        if (position) mesh.position.copy(position);
        else mesh.position.set(0, 0, 0);

        // デフォルト設定
        if (type === 'plane') {
            mesh.scale.set(5, 1, 5);
            mesh.userData.physics = { state: 'static', mass: 0, bounce: 0.2, fixedRotation: false };
        } else {
            mesh.userData.physics = { state: 'dynamic', mass: 1, bounce: 0.5, fixedRotation: false };
        }

        // 移動設定のデフォルト
        mesh.userData.physics.moveMode = 'none';
        mesh.userData.physics.trigger = 'auto';
        mesh.userData.physics.moveLoop = 'loop';
        mesh.userData.physics.moveAxis = 'x';
        mesh.userData.physics.moveRange = 3.0;
        mesh.userData.physics.moveSpeed = 1.0;
        
        mesh.userData.type = type;
        mesh.userData.pivot = 'center';
        mesh.userData.role = 'none';
        mesh.userData.roleParams = {};

        this.stageGroup.add(mesh);
        this.createPhysicsBody(mesh);

        return mesh;
    }
deleteObject(object) {
        if (this.physicsMap.has(object.uuid)) {
            this.world.removeBody(this.physicsMap.get(object.uuid));
            this.physicsMap.delete(object.uuid);
        }

        object.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        // ★修正: プロパティを手書きせず、マテリアルの中身を走査して完全破棄
                        for (const key in m) {
                            if (m[key] && m[key].isTexture) {
                                // キャッシュ管理から外れた一時テクスチャ（グラデーション等）は破棄する
                                // (ImageManagerで管理しているベーステクスチャはImageManagerに任せる)
                                if (!m[key].userData || !m[key].userData.isCached) {
                                    m[key].dispose();
                                }
                                m[key] = null;
                            }
                        }
                        m.dispose();
                    });
                }
            }
        });

        if (object.parent) object.parent.remove(object);
    }

    clearStage() {
        while (this.stageGroup.children.length > 0) {
            this.deleteObject(this.stageGroup.children[0]);
        }
        this.objectCounter = 1;
    }

    updatePhysics(dt) {
        // 0除算防止のための安全なdt (最小1ミリ秒)
        const safeDt = Math.max(dt, 0.001);
        this.elapsedTime += safeDt;

        // Kinematicボディ（動く床）を動かす
        this.physicsMap.forEach((body, uuid) => {
            if (body.type === CANNON.Body.KINEMATIC) {
                const s = body.userData.physicsSettings;
                const logic = body.userData.kinematicLogic;

                if (logic && logic.isActive) {
                    logic.activeTime += safeDt;
                    const time = logic.activeTime;

                    if (s && s.moveMode) {
                        const initPos = logic.initialPos;
                        const initQuat = logic.initialQuat;
                        const range = s.moveRange !== undefined ? s.moveRange : 3.0;
                        const speed = s.moveSpeed !== undefined ? s.moveSpeed : 1.0;
                        const axis = s.moveAxis || 'x';
                        const loop = s.moveLoop || 'loop';

                        const nextPos = initPos.clone();
                        const nextQuat = initQuat.clone();

                        if (s.moveMode === 'linear') {
                            let factor = (loop === 'once') ? Math.sin(Math.min(time * speed, Math.PI / 2)) : Math.sin(time * speed);
                            const offset = factor * range;
                            if (axis === 'x') nextPos.x += offset;
                            if (axis === 'y') nextPos.y += offset;
                            if (axis === 'z') nextPos.z += offset;
                        }
                         else if (s.moveMode === 'rotate') {
                            let angle = (loop === 'once') ? Math.min(time * speed, range) : (time * speed);
                            
                            if (axis === 'x') this._tmpKinematicAxis.set(1, 0, 0);
                            else if (axis === 'z') this._tmpKinematicAxis.set(0, 0, 1);
                            else this._tmpKinematicAxis.set(0, 1, 0);
                            
                            this._tmpKinematicQuat.setFromAxisAngle(this._tmpKinematicAxis, angle);
                            initQuat.mult(this._tmpKinematicQuat, nextQuat);
                        }

                        // ★修正: Kinematicは velocity を使わず、直接 position を書き換えて強制移動させる
                        // これによりプレイヤーが上に乗った時の挙動が安定します
                        body.position.copy(nextPos);
                        body.quaternion.copy(nextQuat);
                        
                        // 念のため微小な速度だけ残して乗っている物体に追従させる
                        body.velocity.set(0, 0, 0); 
                    }
                }
            }
        });

        // 物理計算を実行
        this.world.step(1 / 60, safeDt, 10);

        // ★修正: 階層はフラット化されている前提なので、複雑な行列計算は不要！
        // 単純にワールド座標をコピーするだけの超高速処理にする
        this.physicsMap.forEach((body, uuid) => {
            const mesh = this.stageGroup.getObjectByProperty('uuid', uuid);
            if (!mesh) return;

            if (window.isPlaying && body.type !== CANNON.Body.STATIC) {
                const bPos = body.interpolatedPosition || body.position;
                const bQuat = body.interpolatedQuaternion || body.quaternion;

                // 親が stageGroup ではなく、別のオブジェクトに属している場合 (逆行列計算が必要)
                if (mesh.parent && mesh.parent !== this.stageGroup && mesh.parent !== this.scene) {
                    mesh.parent.updateMatrixWorld();
                    this._tmpInvMat4.copy(mesh.parent.matrixWorld).invert();
                    
                    this._tmpWorldPos.set(bPos.x, bPos.y, bPos.z);
                    this._tmpWorldQuat.set(bQuat.x, bQuat.y, bQuat.z, bQuat.w);
                    this._tmpMat4.compose(this._tmpWorldPos, this._tmpWorldQuat, mesh.scale);
                    
                    this._tmpMat4.premultiply(this._tmpInvMat4);
                    this._tmpMat4.decompose(mesh.position, mesh.quaternion, mesh.scale);
                } else {
                    // 親がルートならそのままコピーでOK (高速)
                    mesh.position.set(bPos.x, bPos.y, bPos.z);
                    mesh.quaternion.set(bQuat.x, bQuat.y, bQuat.z, bQuat.w);
                }
            }
        });
    }
syncPhysicsBodyPosition(obj) {
        const body = this.physicsMap.get(obj.uuid);
        if (!body) return;

        obj.updateMatrixWorld(true);
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        obj.getWorldPosition(worldPos);
        obj.getWorldQuaternion(worldQuat);

        body.position.set(worldPos.x, worldPos.y, worldPos.z);
        body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
        
        // 強制的にスリープ解除して位置を確定させる
        body.wakeUp();
    }
createPhysicsBody(obj) {
        const phy = obj.userData.physics;
        if (!phy) return;
        
        // ★修正: 階層構造に関係なく「世界空間での絶対位置とサイズ」を取得する
        obj.updateMatrixWorld(true); 
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        obj.getWorldQuaternion(worldQuat);
        obj.getWorldScale(worldScale);

        const role = obj.userData.role;
        this._removeBodyIfExists(obj.uuid); // 役割問わず一旦作り直す

        let mass = 0;
        let bodyType = CANNON.Body.STATIC;
        let isSensor = false; // ★追加: すり抜けるが判定はするフラグ
let colResponse = true;
        if (phy.state === 'dynamic') { 
            mass = phy.mass || 1; bodyType = CANNON.Body.DYNAMIC; 
        } else if (phy.state === 'kinematic') { 
            bodyType = CANNON.Body.KINEMATIC; 
        } else if (phy.state === 'ghost') {
            bodyType = CANNON.Body.STATIC;
            isSensor = true; 
            colResponse = false; // ★Ghostの場合は衝突反発を消す
        }

        const group = (phy.state === 'dynamic') ? 2 : 1; 
        const mask = 1 | 2 | 4 | 8; 

        const body = new CANNON.Body({
            mass: mass, type: bodyType, material: this.defaultMaterial,
            linearDamping: (phy.damping !== undefined) ? phy.damping : 0.01, angularDamping: 0.01,
            collisionFilterGroup: group, collisionFilterMask: mask    
        });
body.collisionResponse = colResponse; 
        if (isSensor) body.isTrigger = true; 

        body.allowSleep = true;
        if (obj.geometry && obj.geometry.userData.offset) {
    const offset = obj.geometry.userData.offset.clone().applyQuaternion(worldQuat).multiply(worldScale);
    body.position.set(worldPos.x + offset.x, worldPos.y + offset.y, worldPos.z + offset.z);
} else {
    body.position.set(worldPos.x, worldPos.y, worldPos.z);
}
body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
        body.sleepSpeedLimit = 0.1;
        body.sleepTimeLimit = 1.0;

        // ★修正: ボディの位置は常に「ワールド座標」に固定する
        body.position.set(worldPos.x, worldPos.y, worldPos.z);
        body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);

        // --- シェイプ生成 ---
        const type = obj.userData.type;
        const safeSize = (val) => Math.max(Math.abs(val), 0.01);

        const complexTypes = [
            'model', 'arch', 'torus', 'torus_knot', 'pipe', 'stairs', 'slope', 'smooth_slope', 'ring', 
            'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron', 
            'tube', 'hollow_box', 'corner_slope', 'gear', 'star', 'heart', 'terrain', 'sector',
            'rock', 'spiral_stairs', 'quarter_pipe', 'floating_island','rand_rock', 'rand_crystal', 'rand_tree', 'rand_cloud', 'rand_grass' // ★追加
        ];

        if (complexTypes.includes(type) && bodyType === CANNON.Body.STATIC) {
            this._addTrimeshShapes(obj, obj, body);
        } else {
            let shape;
            if (type === 'plane' || type === 'sprite') {
                shape = new CANNON.Box(new CANNON.Vec3(safeSize(worldScale.x * 0.5), 0.05, safeSize(worldScale.z * 0.5)));
            } else if (['cylinder', 'pipe', 'tube', 'capsule'].includes(type)) {
                // ★修正: Z軸のサイズ計算に worldScale.x が誤って使われていたのを worldScale.z に修正
                shape = new CANNON.Box(new CANNON.Vec3(safeSize(worldScale.x * 0.5), safeSize(worldScale.y * 0.5), safeSize(worldScale.z * 0.5)));
            } else if (type === 'sphere' || type === 'dome') {
                const r = Math.max(worldScale.x, worldScale.y, worldScale.z) * 0.5;
                shape = new CANNON.Sphere(safeSize(r));
            } else {
                if (obj.geometry) {
                    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
                    const box = obj.geometry.boundingBox;
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    const hx = safeSize((size.x * worldScale.x) * 0.5);
                    const hy = safeSize((size.y * worldScale.y) * 0.5);
                    const hz = safeSize((size.z * worldScale.z) * 0.5);
                    shape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
                } else {
                    shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
                }
            }
            body.addShape(shape);
        }

        if (phy.fixedRotation) {
            body.fixedRotation = true;
            body.updateMassProperties();
        }

         body.userData = { 
            meshUUID: obj.uuid, 
            physicsSettings: phy,
            role: obj.userData.role || 'none',
            roleParams: obj.userData.roleParams || {},
            kinematicLogic: {
                // ★修正: worldPos ではなく「オブジェクト自身の本来の座標」を記録する
                // (リスタート時に再構築された際、ズレないようにするため)
                initialPos: new CANNON.Vec3(obj.position.x, obj.position.y, obj.position.z), 
                initialQuat: new CANNON.Quaternion(obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w),
                activeTime: 0,
                isActive: (phy.trigger === 'auto' || !phy.trigger) 
            }
        };

        if (body.type === CANNON.Body.KINEMATIC && phy.trigger && phy.trigger !== 'auto') {
            const onCollide = (e) => {
                const l = body.userData.kinematicLogic;
                if (!l || l.isActive) {
                    body.removeEventListener('collide', onCollide);
                    return; 
                }
                const contactBody = e.body; 
                let activate = false;
                if (phy.trigger === 'touch_any') activate = true;
                else {
                    if (contactBody.collisionFilterGroup === 2 && phy.trigger === 'touch_player') activate = true;
                    else if (contactBody.collisionFilterGroup === 4 && phy.trigger === 'touch_enemy') activate = true;
                    else if (contactBody.mass > 0 && phy.trigger === 'touch_player') activate = true;
                }
                if (activate) {
                    l.isActive = true;
                    body.removeEventListener('collide', onCollide);
                }
            };
            body.addEventListener('collide', onCollide);
        }

        this.world.addBody(body);
        this.physicsMap.set(obj.uuid, body);
    }

    _removeBodyIfExists(uuid) {
        if (this.physicsMap.has(uuid)) {
            this.world.removeBody(this.physicsMap.get(uuid));
            this.physicsMap.delete(uuid);
        }
    }

    _addTrimeshShapes(target, rootObj, body) {
        if (target.isMesh) {
            const geometry = target.geometry;
            const scale = target.scale.clone();
            
            let parent = target.parent;
            while(parent && parent !== rootObj.parent && parent !== rootObj) {
                scale.multiply(parent.scale);
                parent = parent.parent;
            }

            const vertices = [];
            const indices = [];
            const posAttr = geometry.attributes.position;
            if (!posAttr) return;

            for (let i = 0; i < posAttr.count; i++) {
                vertices.push(posAttr.getX(i) * scale.x);
                vertices.push(posAttr.getY(i) * scale.y);
                vertices.push(posAttr.getZ(i) * scale.z);
            }

            if (geometry.index) {
                for (let i = 0; i < geometry.index.count; i++) indices.push(geometry.index.getX(i));
            } else {
                for (let i = 0; i < posAttr.count; i++) indices.push(i);
            }

            if (vertices.length >= 9) {
                const shape = new CANNON.Trimesh(vertices, indices);
                let offset = new CANNON.Vec3(0,0,0);
                let orient = new CANNON.Quaternion(0,0,0,1);

                if (target !== rootObj) {
                    offset.set(target.position.x, target.position.y, target.position.z);
                    orient.set(target.quaternion.x, target.quaternion.y, target.quaternion.z, target.quaternion.w);
                }
                body.addShape(shape, offset, orient);
            }
        }
        if (target.children) {
            target.children.forEach(child => this._addTrimeshShapes(child, rootObj, body));
        }
    }

    _createGeometry(type) {
        // ... (ジオメトリ生成ロジックは変更なし、そのまま) ...
        const s = { depth: 1, bevelEnabled: false };
        let geo;
        const alignCenter = (g) => { g.computeBoundingBox(); g.center(); return g; };

        switch (type) {
            case 'cube': return new THREE.BoxGeometry(1, 1, 1);
            case 'plane': geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); return geo;
            case 'sprite': return new THREE.PlaneGeometry(1, 1);
            case 'sphere': return new THREE.SphereGeometry(0.5, 32, 16);
            case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
            case 'cone': return new THREE.ConeGeometry(0.5, 1, 32);
            case 'torus': geo = new THREE.TorusGeometry(0.4, 0.2, 16, 32); geo.rotateX(-Math.PI / 2); return geo;
            case 'capsule': return new THREE.CapsuleGeometry(0.3, 1, 4, 8);
            case 'dome': geo = new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2); return alignCenter(geo);
            case 'slope': { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1, 0); sh.lineTo(1, 1); sh.closePath(); geo = new THREE.ExtrudeGeometry(sh, s); geo.rotateY(Math.PI / 2); return alignCenter(geo); }
            case 'smooth_slope': { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1, 0); sh.lineTo(1, 1); sh.bezierCurveTo(0.5, 1.0, 0.5, 0.0, 0, 0); sh.closePath(); geo = new THREE.ExtrudeGeometry(sh, s); geo.rotateY(Math.PI / 2); return alignCenter(geo); }
            case 'stairs': { const sh = new THREE.Shape(); const st = 4, sz = 1 / st; sh.moveTo(0, 0); for (let i = 0; i < st; i++) { sh.lineTo((i + 1) * sz, i * sz); sh.lineTo((i + 1) * sz, (i + 1) * sz); } sh.lineTo(0, 1); sh.closePath(); geo = new THREE.ExtrudeGeometry(sh, s); geo.rotateY(Math.PI / 2); geo.rotateZ(Math.PI); return alignCenter(geo); }
            case 'pipe': { const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.6, 0.2, 0), new THREE.Vector3(0.3, 0.0, 0), new THREE.Vector3(0.3, 0.6, 0)); geo = new THREE.TubeGeometry(path, 20, 0.15, 8, false); return alignCenter(geo); }
            case 'arch': { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(-0.5, 1.0); sh.absarc(0, 1.0, 0.5, Math.PI, 0, true); sh.lineTo(0.5, 0); sh.lineTo(0.3, 0); sh.lineTo(0.3, 1.0); sh.absarc(0, 1.0, 0.3, 0, Math.PI, false); sh.lineTo(-0.3, 0); sh.closePath(); geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); return alignCenter(geo); }
            case 'ring': geo = new THREE.RingGeometry(0.3, 0.5, 32); geo.rotateX(-Math.PI / 2); return geo;
            case 'tetrahedron': return new THREE.TetrahedronGeometry(0.5); // 四面体
            case 'octahedron': return new THREE.OctahedronGeometry(0.5);   // 八面体
            case 'dodecahedron': return new THREE.DodecahedronGeometry(0.5); // 十二面体
            case 'icosahedron': return new THREE.IcosahedronGeometry(0.5); // 二十面体
            case 'torus_knot': return new THREE.TorusKnotGeometry(0.3, 0.1, 64, 16); // 結び目
            // --- ★今回追加する新・拡張図形 ---
            case 'tube': { 
                const sh = new THREE.Shape(); sh.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
                const hole = new THREE.Path(); hole.absarc(0, 0, 0.4, 0, Math.PI * 2, true);
                sh.holes.push(hole);
                geo = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 32 });
                geo.rotateX(Math.PI / 2); return alignCenter(geo); 
            }
            case 'hollow_box': { 
                const sh = new THREE.Shape(); sh.moveTo(-0.5, -0.5); sh.lineTo(0.5, -0.5); sh.lineTo(0.5, 0.5); sh.lineTo(-0.5, 0.5); sh.closePath();
                const hole = new THREE.Path(); hole.moveTo(-0.4, -0.4); hole.lineTo(-0.4, 0.4); hole.lineTo(0.4, 0.4); hole.lineTo(0.4, -0.4); hole.closePath();
                sh.holes.push(hole);
                geo = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); return alignCenter(geo); 
            }
            case 'pyramid': {
                geo = new THREE.CylinderGeometry(0, 0.707, 1, 4); geo.rotateY(Math.PI / 4); return geo;
            }
            case 'trapezoid': {
                geo = new THREE.CylinderGeometry(0.35, 0.707, 1, 4); geo.rotateY(Math.PI / 4); return geo;
            }
            case 'corner_slope': {
                const vertices = new Float32Array([ -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5,0.5,  -0.5,-0.5,0.5,  -0.5,0.5,-0.5 ]);
                const indices = [ 0,2,1, 0,3,2, 0,1,4, 1,2,4, 2,3,4, 3,0,4 ];
                geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return alignCenter(geo);
            }
            case 'hex_prism': return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
            case 'gear': {
                const sh = new THREE.Shape(); const teeth = 12; const outerR = 0.5, innerR = 0.4, holeR = 0.2;
                for (let i = 0; i < teeth * 2; i++) {
                    const angle = (i / (teeth * 2)) * Math.PI * 2; const r = i % 2 === 0 ? outerR : innerR;
                    if (i === 0) sh.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); else sh.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                }
                sh.closePath();
                const hole = new THREE.Path(); hole.absarc(0, 0, holeR, 0, Math.PI * 2, true); sh.holes.push(hole);
                geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); geo.rotateX(Math.PI / 2); return alignCenter(geo);
            }
            case 'star': {
                const sh = new THREE.Shape(); const points = 5; const outerR = 0.5, innerR = 0.2;
                for (let i = 0; i < points * 2; i++) {
                    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
                    const r = i % 2 === 0 ? outerR : innerR;
                    if (i === 0) sh.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); else sh.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                }
                sh.closePath();
                geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05 }); return alignCenter(geo);
            }
            case 'heart': {
                const sh = new THREE.Shape(); const x = 0, y = 0;
                sh.moveTo(x + 0.25, y + 0.25); sh.bezierCurveTo(x + 0.25, y + 0.25, x + 0.20, y, x, y); sh.bezierCurveTo(x - 0.30, y, x - 0.30, y + 0.35, x - 0.30, y + 0.35); sh.bezierCurveTo(x - 0.30, y + 0.55, x - 0.10, y + 0.77, x + 0.25, y + 0.95); sh.bezierCurveTo(x + 0.60, y + 0.77, x + 0.80, y + 0.55, x + 0.80, y + 0.35); sh.bezierCurveTo(x + 0.80, y + 0.35, x + 0.80, y, x + 0.50, y); sh.bezierCurveTo(x + 0.35, y, x + 0.25, y + 0.25, x + 0.25, y + 0.25);
                geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05 }); geo.rotateZ(Math.PI); return alignCenter(geo);
            }
            // ------------------------------------

case 'terrain': {
                const size = 1, segments = 16; // 16x16の網目で作る
                const geo = new THREE.PlaneGeometry(size, size, segments, segments);
                const pos = geo.attributes.position;

                // 山の形を作るアルゴリズム
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i);
                    const y = pos.getY(i);
                    
                    // 1. 中心を高くする（山の基本形）
                    const dist = Math.sqrt(x * x + y * y);
                    let h = Math.max(0, (0.5 - dist) * 1.5); 
                    
                    // 2. ランダムな凹凸を加える（岩肌感）
                    h += (Math.random() - 0.5) * 0.1;
                    
                    pos.setZ(i, h); // PlaneのZを高さにする
                }
                geo.computeVertexNormals(); // 影を綺麗に出す
                geo.rotateX(-Math.PI / 2); // 横に寝かせる
                return geo;
            }
            case 'sector': {
                // 円柱の機能を使って、開始角度(0)から90度(PI/2)分だけ作成
                // 第7引数が開始角度、第8引数が扇の広さ
                geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1, false, 0, Math.PI / 2);
                return geo;
            }
            case 'rock': {
                geo = new THREE.DodecahedronGeometry(0.5, 0); 
                geo.scale(1.2, 0.8, 1.0); 
                geo = geo.toNonIndexed();
                geo.computeVertexNormals(); 

                return geo;
            }
            case 'spiral_stairs': {
                const steps = 16;       // 段数
                const totalHeight = 3;  // 全体の高さ
                const radius = 1.2;     // 階段の半径
                const winding = 1.0;    // 1回転(360度)
                
                const climb = totalHeight / steps; // 1段ごとの上昇量
                const stepAngle = (Math.PI * 2 * winding) / steps; // 1段ごとの角度
                const geometries = [];

                // 1. 2Dの扇形（踏み板の形）を定義
                const shape = new THREE.Shape();
                shape.moveTo(0, 0);
                shape.absarc(0, 0, radius, 0, stepAngle, false);
                shape.lineTo(0, 0);

                for (let i = 0; i < steps; i++) {
                    // 2. 厚みを climb (上昇量) と同じにして押し出す
                    // これにより、一段一段が「厚みのあるケーキの切り崩し」のようになります
                    const stepGeo = new THREE.ExtrudeGeometry(shape, { 
                        depth: climb, 
                        bevelEnabled: false 
                    });
                    
                    // 押し出し方向を上に向けるための回転
                    stepGeo.rotateX(Math.PI / 2);
                    
                    // 3. 螺旋状に配置（1段ずつ積み上げながら回転）
                    // 垂直位置をずらす
                    stepGeo.translate(0, i * climb, 0);
                    // 角度をずらす (右上がりにするためにマイナス回転)
                    stepGeo.rotateY(-i * stepAngle);
                    
                    geometries.push(stepGeo.toNonIndexed());
                }

                // 4. 中央の支柱
                const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, totalHeight, 8).toNonIndexed();
                poleGeo.translate(0, (totalHeight / 2) - climb, 0);
                
                geometries.push(poleGeo);

                const merged = BufferGeometryUtils.mergeGeometries(geometries);
                merged.computeVertexNormals();
                
                return merged;
            }
            case 'quarter_pipe': {
                // 1/4の円筒（内側が曲面の坂）
                geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1, true, 0, Math.PI / 2);
                geo.rotateZ(Math.PI / 2);
                return alignCenter(geo);
            }
            case 'floating_island': {
                // 上が広く下が狭い、ラピュタのような浮島
                geo = new THREE.CylinderGeometry(0.5, 0.05, 1, 6);
                return geo;
            }// --- 改良版：ランダムオブジェクト ---
case 'rand_rock': {
                // 1. ベースを十二面体にする
                geo = new THREE.DodecahedronGeometry(0.5, 0); 
                
                // 2. 頂点を動かすのではなく、全体をランダムに引き伸ばす（これで隙間を完璧に防ぐ）
                const sx = 0.8 + Math.random() * 0.6;
                const sy = 0.6 + Math.random() * 0.4; // 少し低く
                const sz = 0.8 + Math.random() * 0.6;
                geo.scale(sx, sy, sz);

                // 3. 適当な角度に回してバリエーションを出す
                geo.rotateX(Math.random() * Math.PI);
                geo.rotateY(Math.random() * Math.PI);

                // 4. フラットな面にする（隙間を出さないタイミングで実行）
                geo.computeVertexNormals(); 
                return geo;
            }case 'rand_crystal': {
                const createCrystalBit = (r, h, tipRatio, rx, ry, rz) => {
                    const bodyH = h * (1 - tipRatio);
                    const tipH = h * tipRatio;
                    const segments = 6;

                    // 1. 胴体と先端を作成
                    const bodyGeo = new THREE.CylinderGeometry(r, r, bodyH, segments);
                    const tipGeo = new THREE.CylinderGeometry(0, r, tipH, segments);

                    // 2. 位置合わせ
                    bodyGeo.translate(0, bodyH / 2, 0);
                    tipGeo.translate(0, bodyH + tipH / 2, 0);

                    // 3. 合体させて頂点を溶接（これで隙間が消える）
                    let mergedBit = BufferGeometryUtils.mergeGeometries([bodyGeo, tipGeo]);
                    mergedBit = BufferGeometryUtils.mergeVertices(mergedBit);

                    // 4. フラット（カクカク）にする
                    mergedBit = mergedBit.toNonIndexed();

                    // 根元を中心に回転
                    mergedBit.rotateX(rx);
                    mergedBit.rotateY(ry);
                    mergedBit.rotateZ(rz);
                    return mergedBit;
                };

                const bits = [];
                const mainR = 0.28; // 巨大さを出すため少しだけ太く

                // 1. 【中央の母岩】
                const rockBase = new THREE.DodecahedronGeometry(0.5, 0).toNonIndexed();
                rockBase.scale(1.2, 0.4, 1.2);
                rockBase.rotateY(Math.random() * Math.PI);
                bits.push(rockBase);

                // 2. 【中心のメイン巨大クリスタル】
                // ★胴体を長くするため、全体の高さをアップしつつ、トゲの比率(tipRatio)を小さく設定
                const mainH = 1.5 + Math.random() * 0.5; // 全長 1.5m〜2.7m
                const mainTipRatio = 0.1; // ★トゲは全体の10%だけに抑える（＝胴体が90%）
                const main = createCrystalBit(
                    mainR, mainH, mainTipRatio,
                    (Math.random() - 0.5) * 0.5, // rx
Math.random() * Math.PI,      // ry
(Math.random() - 0.5) * 0.5  // rz
                );
                main.translate(0, -0.05, 0);
                bits.push(main);

                // 3. 【周囲の小結晶群】
                const count = 10 + Math.floor(Math.random() * 10); 
                for(let i=0; i<count; i++) {
                    const r = 0.08 + Math.random() * 0.08; 
                    const h = 0.4 + Math.random() * 0.5;
                    const smallTipRatio = 0.3; // 周りは少しトゲを強調
                    
                    const angle = Math.random() * Math.PI * 2;
                    const tilt = 0.8 + Math.random() * 0.7;
                    const twist = (Math.random() - 0.5) * 0.4;
                    
                    const bit = createCrystalBit(r, h, smallTipRatio, tilt, angle, twist);
                    
                    const spread = mainR*0.8 + (Math.random() * 0.15); 
                    const px = Math.sin(angle) * spread;
                    const pz = Math.cos(angle) * spread;
                    const py = 0.05 + (Math.random() * 0.15);
                    bit.translate(px, py, pz);
                    
                    bits.push(bit);
                }
                
                const merged = BufferGeometryUtils.mergeGeometries(bits);
                merged.computeVertexNormals();
                return merged;
            }
            case 'rand_tree': {
                const h = 1 + Math.random() * 1.0;
                const trunk = new THREE.CylinderGeometry(0.1, 0.15, h, 6).toNonIndexed();
                trunk.translate(0, h/2, 0);
                const leaves = new THREE.DodecahedronGeometry(0.6 + Math.random()*0.4, 0).toNonIndexed();
                leaves.translate(0, h, 0);
                return BufferGeometryUtils.mergeGeometries([trunk, leaves]);
            }

            case 'rand_cloud': {
                // 塊の数を少し増やして密度を上げる (8〜13個)
                const count = 8 + Math.floor(Math.random() * 6); 
                const geometries = [];
                
                // 横方向の基準となる長さ (1.5m 〜 3.0m)
                const mainWidth = 1.5 + Math.random() * 1.5; 

                for (let i = 0; i < count; i++) {
                    // 個々のモコモコの大きさ
                    const s = 0.4 + Math.random() * 0.5;
                    // 分割数を少し上げて滑らかに
                    const ball = new THREE.SphereGeometry(s, 12, 12).toNonIndexed();

                    // ★形状の工夫：個々の球体を横に長く、縦に少し潰す
                    // これにより「モコモコ感」を残しつつ、全体が平べったくなります
                    ball.scale(
                        1.2 + Math.random() * 0.6, // X軸（横長）
                        0.7 + Math.random() * 0.4, // Y軸（縦に潰す）
                        1.0 + Math.random() * 0.5  // Z軸（奥行き）
                    );

                    // ★配置の工夫：横軸（X）に沿って長く配置する
                    const px = (Math.random() - 0.5) * mainWidth;
                    // 縦（Y）と奥行き（Z）のバラツキは抑える
                    const py = (Math.random() - 0.5) * 0.4;
                    const pz = (Math.random() - 0.5) * (mainWidth * 0.4); 

                    ball.translate(px, py, pz);
                    geometries.push(ball);
                }

                const merged = BufferGeometryUtils.mergeGeometries(geometries);
                merged.computeVertexNormals();
                return merged;
            
            }case 'rand_grass': {
                const geometries = [];
                // 画像のような密集感を出すため、本数を多めに設定 (40〜60本)
                const count = 40 + Math.floor(Math.random() * 20);

                for (let i = 0; i < count; i++) {
                    const h = 0.5 + Math.random() * 0.7; // 葉の高さ (0.5m 〜 1.2m)
                    const w = 0.02 + Math.random() * 0.03; // 葉の幅 (かなり細く)
                    
                    // ★しなりと折り目を作るためのジオメトリ
                    // radialSegments: 4 (ダイヤモンド型の断面 = V字の折り目)
                    // heightSegments: 4 (縦に4分割することでカーブを可能にする)
                    const blade = new THREE.CylinderGeometry(0, w, h, 4, 4).toNonIndexed();
                    
                    const pos = blade.attributes.position;
                    const v = new THREE.Vector3();
                    
                    // 葉ごとの個別のしなり具合
                    const curveForce = 0.2 + Math.random() * 0.4;
                    const curveDir = Math.random() * Math.PI * 2; // しなる方向

                    // 頂点を操作して「しなり」と「厚みの調整」を行う
                    for (let j = 0; j < pos.count; j++) {
                        v.fromBufferAttribute(pos, j);
                        
                        // 地面からの高さの割合 (0.0 〜 1.0)
                        const normalizedY = (v.y + h/2) / h;
                        
                        // 1. 上にいくほどカーブさせる (2次関数的な曲げ)
                        const bend = Math.pow(normalizedY, 2) * curveForce;
                        v.x += Math.cos(curveDir) * bend;
                        v.z += Math.sin(curveDir) * bend;
                        
                        // 2. 葉の厚みを極限まで潰して「板状」にする
                        // (ただし完全な0にはせず、光の当たり具合のためにわずかに残す)
                        v.z *= 0.1; 

                        pos.setXYZ(j, v.x, v.y, v.z);
                    }
                    
                    // 接地位置の調整
                    blade.translate(0, h / 2, 0);

                    // ★密集ロジック
                    const angle = Math.random() * Math.PI * 2;
                    // 中心ほど密度が高くなるように、平方根(sqrt)を使って配置
                    const dist = Math.sqrt(Math.random()) * 0.4; 
                    
                    // 葉の向きをランダムに回転
                    blade.rotateY(Math.random() * Math.PI);
                    
                    // 全体の配置
                    blade.translate(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

                    geometries.push(blade);
                }

                const merged = BufferGeometryUtils.mergeGeometries(geometries);
                merged.computeVertexNormals();
                return merged;
            }
            default: return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    applyGradient(mesh, config) {
        // ... (省略なしでそのまま維持) ...
        const { colorStart, colorEnd, type, direction, mapping, offset } = config;
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        let gradient;
        if (type === 'radial') { gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2); }
        else {
            if (direction === 'x') gradient = ctx.createLinearGradient(0, 0, size, 0);
            else if (direction === 'diag') gradient = ctx.createLinearGradient(0, 0, size, size);
            else gradient = ctx.createLinearGradient(0, 0, 0, size);
        }
        gradient.addColorStop(0, colorStart);
        gradient.addColorStop(1, colorEnd);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.map = texture;
        mesh.material.color.set(0xffffff);
        mesh.material.needsUpdate = true;
        this._updateMeshUVs(mesh, mapping, direction, offset || 0);
        mesh.userData.gradient = { enabled: true, colorStart, colorEnd, type, direction, mapping, offset: offset || 0 };
    }

    _updateMeshUVs(mesh, mode, direction, offset) {
        // ... (省略なしでそのまま維持) ...
        const geometry = mesh.geometry;
        if (!geometry.userData.originalUV) geometry.userData.originalUV = geometry.attributes.uv.clone();
        const posAttribute = geometry.attributes.position;
        const uvAttribute = geometry.attributes.uv;
        const originalUV = geometry.userData.originalUV;
        if (mode === 'object') {
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            if (direction === 'diag') {
                const minX = box.min.x, maxX = box.max.x, rangeX = maxX - minX;
                const minY = box.min.y, maxY = box.max.y, rangeY = maxY - minY;
                for (let i = 0; i < posAttribute.count; i++) {
                    let normX = (rangeX > 0.0001) ? (posAttribute.getX(i) - minX) / rangeX : 0;
                    let normY = (rangeY > 0.0001) ? (posAttribute.getY(i) - minY) / rangeY : 0;
                    uvAttribute.setXY(i, normX - offset, normY - offset);
                }
            } else {
                const useX = (direction === 'x');
                const min = useX ? box.min.x : box.min.y;
                const max = useX ? box.max.x : box.max.y;
                const range = max - min;
                for (let i = 0; i < posAttribute.count; i++) {
                    const val = useX ? posAttribute.getX(i) : posAttribute.getY(i);
                    let norm = (range > 0.0001) ? (val - min) / range : 0;
                    norm -= offset;
                    if (useX) uvAttribute.setXY(i, norm, originalUV.getY(i));
                    else uvAttribute.setXY(i, originalUV.getX(i), norm);
                }
            }
        } else {
            for (let i = 0; i < originalUV.count; i++) {
                let u = originalUV.getX(i), v = originalUV.getY(i);
                if (direction === 'x') u -= offset; else if (direction === 'y') v -= offset; else { u -= offset; v -= offset; }
                uvAttribute.setXY(i, u, v);
            }
        }
        uvAttribute.needsUpdate = true;
    }

    removeGradient(mesh) {
        if (mesh.material.map) { mesh.material.map.dispose(); mesh.material.map = null; mesh.material.needsUpdate = true; }
        this._updateMeshUVs(mesh, 'face', 'y', 0);
        if (mesh.userData.gradient) mesh.userData.gradient.enabled = false;
    }
    
   updateBoundaryHelper(config) {
        // ... (前回修正済みのコードを維持) ...
        const boundary = config.boundary || { x: 50, y: 50, z: 50 };
        const color = config.boundaryColor || '#00d2ff';
        const isVisible = config.boundaryVisible; 
        const isShowGuide = document.getElementById('world-bounds-show')?.checked || false; 

        if (this.boundaryMesh) {
            this.stageGroup.remove(this.boundaryMesh);
            // ★修正: 子要素（wireframe等）も含めて完全に破棄する
            this.boundaryMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if(Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
            this.boundaryMesh = null;
        }

        if (!isShowGuide) return;

        const sizeX = boundary.x;
        const sizeY = boundary.y;
        const sizeZ = boundary.z;

        const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.5 });
        const edges = new THREE.EdgesGeometry(geo);
        const wireframe = new THREE.LineSegments(edges, wireMat);
        
        if (config.boundaryMode === 'block' && isVisible) {
             const wallMat = new THREE.MeshBasicMaterial({ 
                color: new THREE.Color(color), transparent: true, opacity: 0.15, side: THREE.DoubleSide
            });
             this.boundaryMesh = new THREE.Mesh(geo, wallMat);
             this.boundaryMesh.add(wireframe); 
        } else {
             this.boundaryMesh = wireframe;
        }

        this.boundaryMesh.position.set(0, 0, 0); 
        this.boundaryMesh.name = "Boundary_Helper";
        this.boundaryMesh.renderOrder = 99; 
        this.boundaryMesh.userData.isHelper = true;

        this.stageGroup.add(this.boundaryMesh);
        this.createPhysicsBody(this.boundaryMesh); 
    }
     updateRoleIcon(mesh) {
        // 古いアイコンがあれば削除
        const oldIcon = mesh.children.find(c => c.userData.isRoleIcon);
        if (oldIcon) {
            mesh.remove(oldIcon);
            if (oldIcon.material.map) oldIcon.material.map.dispose();
            oldIcon.material.dispose();
        }

        const role = mesh.userData.role;
        if (!role || role === 'none') return;

        // 役割ごとの絵文字と色
        const icons = {
            start: { e: '🏁', c: '#4caf50' }, goal: { e: '🚩', c: '#ffeb3b' },
            enemy_spawn: { e: '👿', c: '#ff4444' }, warp: { e: '🚪', c: '#9c27b0' },
            damage: { e: '☠️', c: '#d32f2f' }, heal: { e: '💖', c: '#e91e63' },
            switch: { e: '🔘', c: '#00d2ff' }, chest: { e: '📦', c: '#ff9800' },
            talkable: { e: '🗣️', c: '#ffffff' }, event_trigger: { e: '💡', c: '#ffeb3b' },
            random_spawner: { e: '🎲', c: '#ff9800' }
        };

        const iconData = icons[role];
        if (!iconData) return;

        // Canvasで絵文字テクスチャを作成
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.font = '80px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = iconData.c;
        ctx.fillText(iconData.e, size/2, size/2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({ 
            map: texture, 
            transparent: true,
            depthTest: false // 壁に埋もれないように最前面に表示
        });

        const sprite = new THREE.Sprite(material);
        sprite.userData.isRoleIcon = true;
        sprite.renderOrder = 999;
        
        // オブジェクトのサイズに合わせて頭上に浮かせる
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        const height = (box.max.y - box.min.y) * mesh.scale.y;
        sprite.position.y = (height / 2) + 1.0; 
        sprite.scale.set(1.5, 1.5, 1.5);

        mesh.add(sprite);
    }
}