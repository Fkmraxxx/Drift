/* ============================================================
   DRIFT KING — Camera
   Smooth chase camera with drift lead, speed zoom-out,
   drift tilt, and impact shake
   ============================================================ */

class Camera {
  constructor() {
    this.x      = 0;
    this.y      = 0;
    this.angle  = 0;
    this.zoom   = CFG.CAM.baseZoom;
    this.shakeX = 0;
    this.shakeY = 0;
    this._shakeAmt = 0;
    this.tilt   = 0;    // slight rotation during drift
  }

  /* Call each render frame (dt = real elapsed seconds) */
  update(car, dt) {
    const C    = CFG.CAM;
    const lerp = (a, b, t) => a + (b - a) * t;

    /* Lead target in drift / velocity direction */
    const vspd   = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    const leadD  = C.driftLead * Math.min(vspd / 20, 1.5);
    const velAng = (vspd > 1) ? Math.atan2(car.vy, car.vx) : car.angle;

    const targetX = car.x + Math.cos(velAng) * leadD;
    const targetY = car.y + Math.sin(velAng) * leadD;

    /* Smooth position follow */
    const factor = 1 - Math.pow(1 - C.lerpPos, dt * 60);
    this.x = lerp(this.x, targetX, factor);
    this.y = lerp(this.y, targetY, factor);

    /* Smooth angle follow (car heading) */
    let dAngle = car.angle - this.angle;
    while (dAngle >  Math.PI) dAngle -= 2 * Math.PI;
    while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
    this.angle += dAngle * (1 - Math.pow(1 - C.lerpAngle, dt * 60));

    /* Zoom: base − speed factor (more aggressive for sense of speed) */
    const excess      = Math.max(0, vspd - 20);
    const nitroExtra  = car.nitroActive ? 0.03 * excess : 0;
    const targetZoom  = C.baseZoom - (C.speedZoom + nitroExtra) * excess;
    this.zoom = lerp(this.zoom, Math.max(targetZoom, CFG.CAM.baseZoom * 0.45), 0.05);

    /* Drift tilt — subtle lean into the slide direction */
    const tiltTarget = car.isDrifting
      ? car.steerInput * C.driftTilt * Math.min(car.driftAngle / 0.5, 1)
      : 0;
    this.tilt = lerp(this.tilt, tiltTarget, 0.06);

    /* Screen shake */
    if (this._shakeAmt > 0.01) {
      const a = Math.random() * 2 * Math.PI;
      this.shakeX = Math.cos(a) * this._shakeAmt;
      this.shakeY = Math.sin(a) * this._shakeAmt;
      this._shakeAmt *= C.shakeDecay;
    } else {
      this.shakeX = this.shakeY = this._shakeAmt = 0;
    }
  }

  shake(amount) {
    this._shakeAmt = Math.max(this._shakeAmt, amount);
  }

  /* Apply canvas transform so everything drawn is in world space */
  applyTransform(ctx, canvasW, canvasH) {
    ctx.translate(canvasW / 2 + this.shakeX, canvasH / 2 + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.rotate(-this.angle - Math.PI / 2 + this.tilt);
    ctx.translate(-this.x, -this.y);
  }

  /* Snap immediately (e.g., on spawn) */
  snapTo(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle;
    this.zoom = CFG.CAM.baseZoom;
    this._shakeAmt = 0;
    this.tilt = 0;
  }
}
