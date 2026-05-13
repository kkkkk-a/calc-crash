/* =========================================
   js/ImageManager.js
   画像のBase64変換・復元を一手に引き受けるクラス
   ========================================= */
import * as THREE from 'three';

export class ImageManager {
    constructor() {
        // 同じ画像の無駄な生成を防ぐキャッシュ
        this.textureCache = new Map(); 
    }
clearCache() {
        this.textureCache.forEach(texture => {
            texture.dispose();
        });
        this.textureCache.clear();
    }
    /**
     * ファイル(input type="file")から読み込んで
     * { texture, base64 } を返す
     */
    async loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // ★追加: テクスチャの自動リサイズと容量圧縮処理
                    const MAX_SIZE = 1024; // テクスチャの最大解像度
                    let width = img.width;
                    let height = img.height;

                    // アスペクト比を維持して縮小
                    if (width > MAX_SIZE || height > MAX_SIZE) {
                        if (width > height) {
                            height = Math.round(height * (MAX_SIZE / width));
                            width = MAX_SIZE;
                        } else {
                            width = Math.round(width * (MAX_SIZE / height));
                            height = MAX_SIZE;
                        }
                    }

                    // Canvasに描画
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // WebP形式（0.8の品質）で出力し、ファイルサイズを劇的に軽量化
                    const compressedBase64 = canvas.toDataURL('image/webp', 0.8);

                    this._createTextureFromBase64(compressedBase64).then(texture => {
                        resolve({ texture, base64: compressedBase64 });
                    });
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            
            reader.onerror = reject;
            reader.readAsDataURL(file); 
        });
    }

    /**
     * Base64文字列からテクスチャを復元する
     */
    async loadFromBase64(base64) {
        // キャッシュにあればそれを返す（メモリ節約）
        if (this.textureCache.has(base64)) {
            return this.textureCache.get(base64).clone();
        }

        const texture = await this._createTextureFromBase64(base64);
        
        // キャッシュに保存
        this.textureCache.set(base64, texture);
        return texture;
    }

    /**
     * 内部処理: 画像タグを作ってTexture化
     */
    _createTextureFromBase64(base64) {
        return new Promise((resolve) => {
            const image = new Image();
            image.src = base64;
            image.onload = () => {
                const texture = new THREE.Texture(image);
                texture.colorSpace = THREE.SRGBColorSpace;
                // テクスチャの設定（ドット絵ならNearestFilterなど）
                texture.magFilter = THREE.LinearFilter; 
                texture.minFilter = THREE.LinearMipMapLinearFilter;
                texture.needsUpdate = true;
                resolve(texture);
            };
        });
    }
}

// シングルトン（1つのインスタンス）として公開
export const imageManager = new ImageManager();