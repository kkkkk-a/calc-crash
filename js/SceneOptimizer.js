/* =========================================
   js/SceneOptimizer.js
   プレイモード時に、同じ見た目のオブジェクトをまとめて
   描画負荷(DrawCall)を劇的に下げるクラス
   ========================================= */
import * as THREE from 'three';

export class SceneOptimizer {
    constructor(scene) {
        this.scene = scene;
        this.generatedMeshes = []; // 生成したInstancedMeshのリスト
        this.originalVisibility = new Map(); // 元の表示状態を記録
    }

    /**
     * 最適化を実行 (PLAY開始時に呼ぶ)
     * @param {THREE.Group} targetGroup - 最適化対象のグループ (stageGroup)
     */
    optimize(targetGroup) {
        if (this.generatedMeshes.length > 0) {
            this.restore(targetGroup);
        }

        const groups = new Map();
        targetGroup.traverse((obj) => {
            if (obj.isMesh && obj.visible) {
                const physics = obj.userData.physics;
                const role = obj.userData.role;
                
                const isStatic = (!physics || physics.state === 'static');
                const isNoRole = (!role || role === 'none');
                
                // ★修正: Array.isArray を使ってマルチマテリアルを確実にはじく
                const isOpaque = (obj.material && !Array.isArray(obj.material) && obj.material.opacity >= 1.0); 
                
                if (isStatic && isNoRole && isOpaque) {
                    const key = this._generateKey(obj);
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(obj);
                }
            }
        });

        // 2. InstancedMeshの生成
        groups.forEach((meshList, key) => {
            // 1つしかないなら最適化の意味がないのでスキップ
            if (meshList.length < 2) return;

            const count = meshList.length;
            const source = meshList[0];
            
            // InstancedMeshを作成
            const instancedMesh = new THREE.InstancedMesh(
                source.geometry,
                source.material, // マテリアルは参照コピー
                count
            );
            
            // 影の設定などを引き継ぐ
            instancedMesh.castShadow = source.castShadow;
            instancedMesh.receiveShadow = source.receiveShadow;
            instancedMesh.name = `Optimized_${key}`;

            // 座標データをコピー
            const dummy = new THREE.Object3D();
            for (let i = 0; i < count; i++) {
                const mesh = meshList[i];
                
                dummy.position.copy(mesh.position);
                dummy.rotation.copy(mesh.rotation);
                dummy.scale.copy(mesh.scale);
                dummy.updateMatrix();
                
                instancedMesh.setMatrixAt(i, dummy.matrix);

                // 元のメッシュを非表示にする (削除はしない)
                this.originalVisibility.set(mesh.uuid, mesh.visible);
                mesh.visible = false; 
            }

            instancedMesh.instanceMatrix.needsUpdate = true;
            
            // シーンに追加
            this.scene.add(instancedMesh);
            this.generatedMeshes.push(instancedMesh);
        });

        console.log(`🚀 Optimized: Merged into ${this.generatedMeshes.length} batches.`);
    }

    /**
     * 最適化を解除 (STOP時に呼ぶ)
     */
    restore(targetGroup) {
        // 生成したInstancedMeshを削除
        this.generatedMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            
            // ★修正: メッシュを消すだけでなく、ジオメトリとマテリアルもVRAMから完全消去(Dispose)する
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
            
            // ★追加: InstancedMesh特有のリソースも確実に解放
            if (mesh.dispose) mesh.dispose();
        });
        this.generatedMeshes = [];

        // 元のメッシュの表示状態を戻す
        this.originalVisibility.forEach((visible, uuid) => {
            const obj = targetGroup.getObjectByProperty('uuid', uuid);
            if (obj) {
                obj.visible = visible;
            }
        });
        this.originalVisibility.clear();

        // ★追加: Three.jsの内部キャッシュを強制クリアし、次回プレイ時の負荷を下げる
        THREE.Cache.clear();
    }

    _generateKey(mesh) {
    let key = mesh.geometry.uuid;
    
    // ★修正: マテリアルが配列(マルチマテリアル)の場合に対応
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    
    mats.forEach(mat => {
        if (mat) {
            key += "_" + (mat.color ? mat.color.getHexString() : "noCol");
            key += "_" + mat.opacity;
            if (mat.map) key += "_" + mat.map.uuid;
            else key += "_noTex";
        }
    });
    
    return key;
}
}