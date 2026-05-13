

import * as THREE from 'three';

// ==========================================
//  コマンドの基底クラス (設計図)
// ==========================================
class Command {
    execute() {} // 実行（Redo）
    undo() {}    // 元に戻す（Undo）
}

// ==========================================
//  1. 移動・回転・拡大縮小用コマンド (軽量!)
// ==========================================
export class TransformCommand extends Command {
    /**
     * @param {THREE.Object3D} object - 操作したオブジェクト
     * @param {Object} oldState - { pos, rot, scl } (変更前)
     * @param {Object} newState - { pos, rot, scl } (変更後)
     */
    constructor(object, oldState, newState) {
        super();
        this.object = object;
        this.oldState = oldState; // { position: Vector3, rotation: Euler, scale: Vector3 }
        this.newState = newState;
    }

    execute() {
        this._applyState(this.newState);
    }

    undo() {
        this._applyState(this.oldState);
    }

    _applyState(state) {
        if (!this.object) return;
        
        // 座標・回転・スケールを復元
        this.object.position.copy(state.position);
        this.object.rotation.copy(state.rotation);
        this.object.scale.copy(state.scale);

        // 物理演算(Cannon.js)のボディがある場合は同期
        if (window.stage && window.stage.createPhysicsBody) {
            window.stage.createPhysicsBody(this.object);
        }
        
        // インスペクタが開いていればUI更新
        if (window.syncUI) window.syncUI(this.object);
        // 選択枠(BoxHelper)の更新
        if (window.selection) window.selection.updateHelpers();
    }
}

// ==========================================
//  2. 従来のスナップショット用コマンド (互換性用)
// ==========================================
export class SnapshotCommand extends Command {
    constructor(ioManager, jsonString) {
        super();
        this.ioManager = ioManager;
        this.data = jsonString; // 変更前の全体データ(JSON文字列)
    }

    execute() {
        // Redo時は現在の状態に戻す必要があるが、
        // スナップショット方式は「Undoスタック」に積むのが基本なので
        // ここでは実装を省略し、HistoryManager側で制御します。
    }

    undo() {
        const data = JSON.parse(this.data);
        if (data.objects || data.world) {
            // ステージ単体データの場合
            this.ioManager.selection.deselectAll();
            this.ioManager.stage.clearStage();
            this.ioManager.animatedSprites.length = 0;
            this.ioManager._restoreStageOnly(data);
            if (window.updateOutliner) window.updateOutliner();
        } else {
            // プロジェクト全体データの場合
            this.ioManager.restore(data);
        }
    }
}

// ==========================================
//  履歴管理マネージャー
// ==========================================
export class HistoryManager {
    constructor(ioManager) {
        this.ioManager = ioManager;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 15; 
    }

    /**
     * コマンドを実行して履歴に追加する
     * @param {Command} command 
     */
    execute(command) {
        // コマンドを実行（スナップショットの場合は何もしない）
        if (!(command instanceof SnapshotCommand)) {
            command.execute(); 
        }
        
        this.undoStack.push(command);
        
        // Redoスタックはクリア（新しい歴史が始まったため）
        this.redoStack = [];

        // 履歴制限
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }
saveSnapshot() {
        if (window.isPlaying) return;
        
        // ★修正: プロジェクト全体ではなく、現在のステージデータのみをスナップショットにする
        // これにより、オブジェクト追加時の Undo/Redo が劇的に軽くなります
        if (!this.ioManager.serializeStageOnly) return; 
        
        const data = this.ioManager.serializeStageOnly();
        const json = JSON.stringify(data);
        
        if (this.undoStack.length > 0) {
            const lastCmd = this.undoStack[this.undoStack.length - 1];
            if (lastCmd instanceof SnapshotCommand && lastCmd.data === json) {
                return;
            }
        }
        
        const cmd = new SnapshotCommand(this.ioManager, json);
        this.undoStack.push(cmd);
        this.redoStack = [];
        
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    }
undo() {
        if (this.undoStack.length === 0) return;

        // ★追加: Undo実行前に選択状態を強制解除し、構造(親子関係)が壊れるのを防ぐ
        if (this.ioManager && this.ioManager.selection) {
            this.ioManager.selection.deselectAll();
        }

        const cmd = this.undoStack.pop();
        
        // ★修正: Redoスタックに積む際も「ステージのみ」か「プロジェクト全体」かを正しく判別する
        if (cmd instanceof SnapshotCommand) {
             let currentData;
             const parsedData = JSON.parse(cmd.data);
             
             if (parsedData.objects || parsedData.world) {
                 // ステージのみの復元コマンドだった場合
                 currentData = JSON.stringify(this.ioManager.serializeStageOnly());
             } else {
                 // プロジェクト全体の復元コマンドだった場合
                 currentData = JSON.stringify(this.ioManager.serialize());
             }
             
             const redoCmd = new SnapshotCommand(this.ioManager, currentData);
             this.redoStack.push(redoCmd);
        } else {
            this.redoStack.push(cmd);
        }

        cmd.undo();
        if (window.showNotification) window.showNotification("Undo");
    }

    redo() {
        if (this.redoStack.length === 0) return;

        // ★追加: Redo実行前にも選択状態を強制解除
        if (this.ioManager && this.ioManager.selection) {
            this.ioManager.selection.deselectAll();
        }

        const cmd = this.redoStack.pop();
        
         if (cmd instanceof SnapshotCommand) {
            // ★修正: Redoを行う前に、"現在の状態"をUndoスタックに積む
            const currentData = JSON.stringify(this.ioManager.serialize());
            this.undoStack.push(new SnapshotCommand(this.ioManager, currentData));
            
            // その後で、対象のスナップショットに復元する
            cmd.undo(); 
        } else {
            cmd.execute();
            this.undoStack.push(cmd);
        }

        if (window.showNotification) window.showNotification("Redo");
    }
}