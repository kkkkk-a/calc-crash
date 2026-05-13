export class InputManager {
    constructor() {
        // 現在のキー入力状態
        this.keys = {};
        
        // アクションの状態 (PlayerControllerに渡す用)
        this.actions = {
            up: false, down: false, left: false, right: false,
            jump: false, dash: false, attack: false, step: false, interact: false,
            camUp: false, camDown: false, camLeft: false, camRight: false
        };

        // アクションが押された瞬間のフラグ
        this.actionTriggers = {};

        // デフォルトのキーバインド (後でUIから変更可能)
        this.keyBinds = {
            up: ['KeyW', 'ArrowUp'],
            down: ['KeyS', 'ArrowDown'],
            left: ['KeyA', 'ArrowLeft'],
            right: ['KeyD', 'ArrowRight'],
            jump: ['Space'],
            dash: ['ShiftLeft', 'ShiftRight'],
            step: ['KeyV'],
            attack: ['Enter', 'KeyF'],
            interact: ['KeyE']
        };

        this._keydown = this._onKeyDown.bind(this);
        this._keyup = this._onKeyUp.bind(this);
    }

    start() {
        window.addEventListener('keydown', this._keydown);
        window.addEventListener('keyup', this._keyup);
    }

    stop() {
        window.removeEventListener('keydown', this._keydown);
        window.removeEventListener('keyup', this._keyup);
        this.keys = {};
        for(let key in this.actions) this.actions[key] = false;
        this.actionTriggers = {};
        
        // ★修正: 仮想ジョイスティックやカメラの内部入力値も確実にリセットする
        this.axisX = 0;
        this.axisY = 0;
        this.camAxisX = 0;
        this.camAxisY = 0;
    }

    _onKeyDown(e) {
        if (e.repeat) return; // 長押しによる連続発火を無視
        this.keys[e.code] = true;
        this._updateActions(e.code, true);
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
        this._updateActions(e.code, false);
    }

    _updateActions(code, isPressed) {
        for (const [actionName, codes] of Object.entries(this.keyBinds)) {
            if (codes.includes(code)) {
                this.actions[actionName] = isPressed;
                if (isPressed) {
                    this.actionTriggers[actionName] = true; // 押した瞬間フラグ
                }
            }
        }
    }

    // 押した瞬間だけTrueを返すメソッド
    isTriggered(actionName) {
        if (this.actionTriggers[actionName]) {
            this.actionTriggers[actionName] = false; // 読み取ったら消費する
            return true;
        }
        return false;
    }

    // UIボタン(仮想ジョイスティックなど)からの入力を直接受け取る用
    setVirtualAction(actionName, isPressed) {
        this.actions[actionName] = isPressed;
        if (isPressed) this.actionTriggers[actionName] = true;
    }

    setVirtualAxis(x, y) {
        this.actions.left = (x < -0.2);
        this.actions.right = (x > 0.2);
        this.actions.up = (y < -0.2);
        this.actions.down = (y > 0.2);
        // アナログ値そのものも保持しておく
        this.axisX = x;
        this.axisY = y;
    }
    
    setVirtualCamAxis(x, y) {
        this.camAxisX = x;
        this.camAxisY = y;
    }

    // キーバインドの変更
    setKeyBind(actionName, newCode) {
        if (this.keyBinds[actionName]) {
            this.keyBinds[actionName] = [newCode];
            if (window.showNotification) window.showNotification(`キー変更: ${actionName} -> ${newCode}`);
        }
    }
}