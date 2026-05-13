

import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';

class ProjectilePoolManager {
    constructor() {
        this.scene = null;
        this.pools = {}; // タイプごとのプール (bullet, missile, beam)
        this.geometries = {}; // ジオメトリのキャッシュ
    }

    // main.js で最初に一度だけ呼ぶ
    init(scene) {
        this.scene = scene;
        
        // ジオメトリを事前に作っておく (共有するため)
        this.geometries['bullet'] = new THREE.SphereGeometry(0.2, 8, 8);
        
        const missileGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
        missileGeo.rotateX(Math.PI / 2); // 向き調整
        this.geometries['missile'] = missileGeo;

        const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 2, 8);
        beamGeo.rotateX(Math.PI / 2);
        this.geometries['beam'] = beamGeo;
    }

    // 弾丸を取得する
    getMesh(type, colorHex) {
        if (!this.scene) return null;

        // まだそのタイプのプールがなければ作る
        if (!this.pools[type]) {
            this.pools[type] = new ObjectPool(
                () => this._createMesh(type),      // 新規作成関数
                (mesh) => { mesh.visible = true; } // リセット関数
            );
        }

        const mesh = this.pools[type].get();
mesh.scale.set(1, 1, 1); // スケールをリセット
mesh.rotation.set(0, 0, 0); // 回転をリセット
        // 色の更新 (必要な場合のみ)
        if (mesh.material.color.getHex() !== colorHex) {
            mesh.material.color.setHex(colorHex);
        }

        // 初回のみシーンに追加
        if (!mesh.parent) {
            this.scene.add(mesh);
        }

        return mesh;
    }

    // 弾丸を回収する
    releaseMesh(type, mesh) {
        if (this.pools[type]) {
            // 画面外に飛ばしておく（判定事故防止）
            mesh.position.set(0, -999, 0);
            this.pools[type].release(mesh);
        }
    }

    // 内部用: メッシュ生成
    _createMesh(type) {
        // キャッシュしておいたジオメトリを使う
        const geo = this.geometries[type] || this.geometries['bullet'];
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const mesh = new THREE.Mesh(geo, mat);
        return mesh;
    }

    recoveryAll() {
        if (!this.pools) return;
        Object.keys(this.pools).forEach(type => {
            // 各プールの「使用中」のリストを管理していないため、
            // シーン内の弾丸メッシュを直接探して releaseMesh する仕組みが必要
            // simpleGame側で管理するのがスマートなので、ここではクリア処理のみ
        });
    }
}

// どこからでも使えるようにシングルトン（1つのインスタンス）として公開
export const ProjectilePool = new ProjectilePoolManager();