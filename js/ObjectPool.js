

export class ObjectPool {
    /**
     * @param {Function} createFn - オブジェクトを新規作成する関数
     * @param {Function} resetFn - オブジェクトを再利用する際のリセット関数 (任意)
     */
    constructor(createFn, resetFn = null) {
        this.pool = [];
        this.createFn = createFn;
        this.resetFn = resetFn;
    }

    /**
     * プールからオブジェクトを取得する（なければ新規作成）
     */
    get() {
        if (this.pool.length > 0) {
            const item = this.pool.pop();
            // 必要ならリセット処理を呼ぶ（座標を0に戻す、など）
            if (this.resetFn) {
                this.resetFn(item);
            }
            // Three.jsのMeshなら表示をONにする
            if (item.visible !== undefined) {
                item.visible = true;
            }
            return item;
        } else {
            return this.createFn();
        }
    }

    /**
     * 使用終わったオブジェクトをプールに戻す
     */
    release(item) {
        // Three.jsのMeshなら表示をOFFにする（シーンから削除はしない）
        if (item.visible !== undefined) {
            item.visible = false;
        }
        this.pool.push(item);
    }

    /**
     * プールの中身を空にする（シーン切替時など）
     */
    clear() {
        this.pool = [];
    }
}