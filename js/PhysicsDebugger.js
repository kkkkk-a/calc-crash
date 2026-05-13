

import * as THREE from 'three';
import * as CANNON from 'cannon-es'; // importmapを使っている前提

export class PhysicsDebugger {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        
        // デバッグ表示用グループ
        this.debugGroup = new THREE.Group();
        this.debugGroup.visible = false;
        this.scene.add(this.debugGroup);

        // 作成済みメッシュのプール（配列）
        this.meshes = []; 
        
        // マテリアル（使い回す）
        this.material = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            wireframe: true,
            depthTest: false,
            transparent: true,
            opacity: 0.7
        });
        
        // 計算用の一時変数（GC発生防止）
        this._tmpVec = new CANNON.Vec3();
        this._tmpQuat = new CANNON.Quaternion();
    }

    setEnabled(enabled) {
        this.debugGroup.visible = enabled;
        // OFFにした時は全メッシュ非表示
        if (!enabled) {
            this.meshes.forEach(m => m.visible = false);
        }
    }

    update() {
        if (!this.debugGroup.visible) return;

        const bodies = this.world.bodies;
        let meshIndex = 0;

        for (const body of bodies) {
            for (let i = 0; i < body.shapes.length; i++) {
                const shape = body.shapes[i];
                const offset = body.shapeOffsets[i];
                const orientation = body.shapeOrientations[i];

                // プールからメッシュを取得（なければ新規作成）
                const mesh = this._getMesh(meshIndex, shape);

                if (mesh) {
                    // --- 座標計算 ---
                    // Bodyの位置 + Shapeのオフセット
                    this._tmpVec.copy(offset);
                    orientation.vmult(this._tmpVec, this._tmpVec); // オフセットの回転適用ではないバグ修正: bodyQではなくorientationだけでは不足。通常は body.quaternion * offset ではない
                    // Cannonの仕様: WorldPos = BodyPos + BodyRot * (ShapeOffset)
                    // 正確には:
                    // globalPos = body.position + body.quaternion * shapeOffset
                    // globalRot = body.quaternion * shapeOrientation
                    
                    const bodyPos = body.position;
                    const bodyQuat = body.quaternion;

                    // オフセット計算
                    this._tmpVec.copy(offset);
                    bodyQuat.vmult(this._tmpVec, this._tmpVec);
                    this._tmpVec.vadd(bodyPos, this._tmpVec);

                    mesh.position.set(this._tmpVec.x, this._tmpVec.y, this._tmpVec.z);

                    // 回転計算
                    this._tmpQuat.copy(bodyQuat);
                    this._tmpQuat.mult(orientation, this._tmpQuat);
                    mesh.quaternion.set(this._tmpQuat.x, this._tmpQuat.y, this._tmpQuat.z, this._tmpQuat.w);

                    mesh.visible = true;
                    meshIndex++;
                }
            }
        }

        // 使わなかった残りのメッシュを非表示にする（削除はしない！）
        for (let i = meshIndex; i < this.meshes.length; i++) {
    this.meshes[i].visible = false;
    // ★追加: 数が多すぎる場合は完全にメモリ解放して配列から間引く
    if (this.meshes.length > bodies.length * 3) {
        this.meshes[i].geometry.dispose();
        this.debugGroup.remove(this.meshes[i]);
        this.meshes.splice(i, 1);
        i--; 
    }
}
    }

    // メッシュ取得（プールまたは新規作成）
    _getMesh(index, shape) {
        let mesh = this.meshes[index];

        // 既にメッシュがある場合
        if (mesh) {
            // 形状タイプが変わっていたらジオメトリを作り直す必要があるが
            // 今回は簡易化のため「同じインデックスのメッシュは同じ形状」と仮定するか、
            // 形状タイプをチェックして不一致ならジオメトリ交換を行うのが理想。
            
            // 簡易実装: ジオメトリの整合性チェック（userDataにタイプを保存しておく）
            if (mesh.userData.shapeType !== shape.type) {
                // タイプが違うならジオメトリを作り直す
                mesh.geometry.dispose();
                mesh.geometry = this._createGeometry(shape);
                mesh.userData.shapeType = shape.type;
            }
            return mesh;
        }

        // メッシュが足りないので新規作成
        const geometry = this._createGeometry(shape);
        if (geometry) {
            mesh = new THREE.Mesh(geometry, this.material);
            mesh.userData.shapeType = shape.type; // タイプを記憶
            this.debugGroup.add(mesh);
            this.meshes.push(mesh);
            return mesh;
        }

        return null;
    }

    _createGeometry(shape) {
        switch (shape.type) {
            case CANNON.Shape.types.SPHERE:
                return new THREE.SphereGeometry(shape.radius, 8, 8);
                
            case CANNON.Shape.types.BOX:
                return new THREE.BoxGeometry(shape.halfExtents.x * 2, shape.halfExtents.y * 2, shape.halfExtents.z * 2);
                
            case CANNON.Shape.types.CYLINDER:
                return new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, shape.numSegments);
            
            case CANNON.Shape.types.PLANE:
                return new THREE.PlaneGeometry(100, 100);

            case CANNON.Shape.types.TRIMESH:
                // 簡易ボックス表示
                return new THREE.BoxGeometry(1, 1, 1); 

            default:
                return new THREE.BoxGeometry(0.5, 0.5, 0.5);
        }
    }
}