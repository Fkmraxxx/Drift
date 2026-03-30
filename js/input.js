/* ============================================================
   DRIFT KING — Input Manager  (keyboard + gamepad)
   ============================================================ */

class InputManager {
  constructor() {
    this._keys   = new Set();
    this._gpIdx  = null;

    /* Axis / button outputs — read each frame */
    this.steer     = 0;   // −1 … +1
    this.throttle  = 0;   //  0 … +1
    this.brake     = 0;   //  0 … +1
    this.handbrake = false;
    this.nitro     = false;

    /* Rising-edge events (true for exactly one update call) */
    this.pausePressed  = false;
    this.resetPressed  = false;
    this.camPressed    = false;

    this._ph = this._rh = this._ch = false; // "held" state for edge detection

    this._bind();
  }

  _bind() {
    const NO_DEFAULT = new Set(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
    window.addEventListener('keydown', e => {
      this._keys.add(e.code);
      if (NO_DEFAULT.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup',   e => this._keys.delete(e.code));
    window.addEventListener('gamepadconnected',    e => {
      if (this._gpIdx === null) this._gpIdx = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', e => {
      if (this._gpIdx === e.gamepad.index) this._gpIdx = null;
    });
  }

  update() {
    const k = this._keys;
    let steer = 0, throttle = 0, brake = 0, hb = false, nitro = false;

    /* ── Keyboard (QWERTY + AZERTY) ── */
    if (k.has('ArrowLeft')  || k.has('KeyA') || k.has('KeyQ')) steer    -= 1;
    if (k.has('ArrowRight') || k.has('KeyD'))                  steer    += 1;
    if (k.has('ArrowUp')    || k.has('KeyW') || k.has('KeyZ')) throttle  = 1;
    if (k.has('ArrowDown')  || k.has('KeyS'))                  brake     = 1;
    if (k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight')) hb = true;
    if (k.has('KeyN') || k.has('KeyB')) nitro = true;

    /* ── Gamepad ── */
    if (this._gpIdx !== null) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp   = pads[this._gpIdx];
      if (gp) {
        const ax = gp.axes[0] ?? 0;
        if (Math.abs(ax) > 0.08) steer = ax;
        throttle = Math.max(throttle, gp.buttons[7]?.value ?? 0);
        brake    = Math.max(brake,    gp.buttons[6]?.value ?? 0);
        if ((gp.axes[1] ?? 0) < -0.5) throttle = Math.max(throttle, 1);
        if ((gp.axes[1] ?? 0) >  0.5) brake    = Math.max(brake,    1);
        if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) hb = true;
        if (gp.buttons[1]?.pressed || gp.buttons[3]?.pressed) nitro = true;
      }
    }

    this.steer     = Math.max(-1, Math.min(1, steer));
    this.throttle  = Math.max(0,  Math.min(1, throttle));
    this.brake     = Math.max(0,  Math.min(1, brake));
    this.handbrake = hb;
    this.nitro     = nitro;

    /* Rising-edge detection */
    const pn = k.has('Escape') || k.has('KeyP');
    this.pausePressed = pn && !this._ph; this._ph = pn;

    const rn = k.has('KeyR');
    this.resetPressed = rn && !this._rh; this._rh = rn;

    const cn = k.has('KeyC');
    this.camPressed = cn && !this._ch; this._ch = cn;
  }
}
