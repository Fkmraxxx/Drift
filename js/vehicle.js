/* ============================================================
   DRIFT KING — Vehicle Physics
   Simplified but realistic 2-axle tire model with drift
   ============================================================ */

class Vehicle {
  constructor(settings) {
    /* settings = { power, grip, steering }  (1-10 each) */
    settings = settings || { power: 5, grip: 5, steering: 5 };

    /* ── Position & kinematics ── */
    this.x         = 0;
    this.y         = 0;
    this.angle     = 0;   // heading, radians (0 = +X right)
    this.vx        = 0;   // world-space velocity m/s
    this.vy        = 0;
    this.angularVel = 0;  // yaw rate rad/s

    /* ── Engine & transmission ── */
    this.gear      = 1;
    this.rpm       = CFG.CAR.minRPM;
    this.engineRev = 0;   // 0-1 normalised

    /* ── Inputs (written each physics step from InputManager) ── */
    this.steerInput    = 0;
    this.throttleInput = 0;
    this.brakeInput    = 0;
    this.handbrakeIn   = false;

    /* ── Derived / observable state ── */
    this.speed         = 0;   // |v| m/s
    this.localVx       = 0;   // forward velocity
    this.localVy       = 0;   // lateral velocity
    this.driftAngle    = 0;   // rad
    this.isDrifting    = false;
    this.onTrack       = true;
    this.trackIdx      = 0;

    /* ── Tuning multipliers from settings ── */
    this._powerMult   = 0.7 + settings.power   * 0.06;   // 0.76 – 1.30
    this._gripMult    = 0.6 + settings.grip     * 0.08;   // 0.68 – 1.40
    this._steerMult   = 0.7 + settings.steering * 0.06;   // 0.76 – 1.30

    /* ── Collision / wall state ── */
    this.wallHit      = false;
    this.wallHitVel   = 0;
  }

  /* Reset to a spawn position */
  spawn(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle;
    this.vx = this.vy = this.angularVel = 0;
    this.gear = 1; this.rpm = CFG.CAR.minRPM;
    this.steerInput = this.throttleInput = this.brakeInput = 0;
    this.handbrakeIn = false;
    this.wallHit = false;
  }

  /* ── Main physics step (fixed dt = CFG.GAME.physicsDt) ── */
  step(dt, input) {
    if (dt <= 0) return;
    const C = CFG.CAR;
    const g = 9.81;

    /* Copy inputs */
    this.steerInput    = input.steer;
    this.throttleInput = input.throttle;
    this.brakeInput    = input.brake;
    this.handbrakeIn   = input.handbrake;

    /* ── Local velocity ── */
    const cosA = Math.cos(this.angle), sinA = Math.sin(this.angle);
    const lx   =  this.vx * cosA + this.vy * sinA;   // forward
    const ly   = -this.vx * sinA + this.vy * cosA;   // lateral (+= sliding right)
    this.localVx = lx;
    this.localVy = ly;

    const spd = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    this.speed = spd;

    /* ── Drift angle ── */
    const absFwd = Math.max(Math.abs(lx), 0.5);
    this.driftAngle  = Math.atan2(Math.abs(ly), absFwd);
    this.isDrifting  = (this.driftAngle > CFG.DRIFT.minAngle && spd > CFG.DRIFT.minSpeed);

    /* ── Steer angle (reduces at high speed) ── */
    const spdFactor   = 1 - Math.min(spd * C.steerSpeedFactor, 0.55);
    const steerAngle  = input.steer * C.maxSteerAngle * spdFactor * this._steerMult;

    /* ── Slip angles at each axle ── */
    const omega = this.angularVel;
    const frontSlip = Math.atan2(ly + omega * C.cgToFront, absFwd) - steerAngle;
    const rearSlip  = Math.atan2(ly - omega * C.cgToRear,  absFwd);

    /* ── Tire forces (simplified Pacejka peak model) ── */
    const maxLat        = C.mass * g * 0.5;
    const rearGripCoeff = this.handbrakeIn
                          ? C.handbrakeGrip
                          : this._gripMult;

    let Fy_front = -clamp(C.frontGrip * this._gripMult * frontSlip * C.mass * g * 0.5,
                          -maxLat, maxLat);
    let Fy_rear  = -clamp(C.rearGrip  * rearGripCoeff  * rearSlip  * C.mass * g * 0.5,
                          -maxLat, maxLat);

    /* ── Engine / brake force ── */
    const gear    = this.gear;
    const ratio   = C.gearRatios[gear] * C.finalDrive;
    /* Power drops at high speed (constant-power model) */
    const fwdSpd  = Math.max(Math.abs(lx), 0.1);
    const maxEng  = (C.maxEngineForce * this._powerMult) / Math.max(1, fwdSpd / 8);
    const engineF = input.throttle * clamp(maxEng, 0, C.maxEngineForce * this._powerMult * 1.6);
    const brakeF  = input.brake    * C.maxBrakeForce;

    /* Only drive when going forward */
    const goingFwd = lx > -1;
    const Fx_local = goingFwd
                     ? engineF - brakeF
                     : -brakeF * 0.5;

    /* ── Torque & yaw ── */
    const torque   = Fy_front * C.cgToFront - Fy_rear * C.cgToRear;
    const yawAccel = torque / C.inertia;
    this.angularVel += yawAccel * dt;

    /* Angular drag — prevents infinite spin */
    this.angularVel *= Math.max(0, 1 - 2.2 * dt);

    /* ── Convert local forces → world ── */
    const Fy_total = Fy_front + Fy_rear;
    const ax = (Fx_local * cosA - Fy_total * sinA) / C.mass;
    const ay = (Fx_local * sinA + Fy_total * cosA) / C.mass;

    /* ── Integrate velocity ── */
    this.vx += ax * dt;
    this.vy += ay * dt;

    /* ── Aerodynamic drag ── */
    if (spd > 0.01) {
      const drag = C.dragCoeff * spd * spd;
      this.vx -= drag * (this.vx / spd) * dt;
      this.vy -= drag * (this.vy / spd) * dt;
    }

    /* Rolling resistance */
    if (spd > 0.1) {
      const rr = C.rollingResist / C.mass;
      this.vx -= rr * (this.vx / spd) * dt;
      this.vy -= rr * (this.vy / spd) * dt;
    } else {
      this.vx *= Math.pow(0.04, dt);
      this.vy *= Math.pow(0.04, dt);
    }

    /* Speed cap */
    const spd2 = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    if (spd2 > C.maxSpeed) {
      this.vx *= C.maxSpeed / spd2;
      this.vy *= C.maxSpeed / spd2;
    }

    /* ── Integrate position & heading ── */
    this.x     += this.vx * dt;
    this.y     += this.vy * dt;
    this.angle += this.angularVel * dt;

    /* Normalise angle */
    while (this.angle >  Math.PI) this.angle -= 2 * Math.PI;
    while (this.angle < -Math.PI) this.angle += 2 * Math.PI;

    /* ── Engine RPM (auto-gearbox) ── */
    this._updateGear(lx, C);
  }

  _updateGear(fwdSpd, C) {
    const ratio  = C.gearRatios[this.gear] * C.finalDrive;
    const wRPM   = (Math.abs(fwdSpd) / (2 * Math.PI * C.wheelRadius)) * 60;
    this.rpm     = clamp(wRPM * ratio, C.minRPM, C.maxRPM * 1.05);
    this.engineRev = (this.rpm - C.minRPM) / (C.maxRPM - C.minRPM);

    if (this.throttleInput > 0.05) {
      if (this.rpm > C.maxRPM * C.autoShiftUp   && this.gear < 6) this.gear++;
      if (this.rpm < C.maxRPM * C.autoShiftDown  && this.gear > 1) this.gear--;
    }
  }

  /* Wall / boundary bounce */
  bounceOffWall(nx, ny) {
    const dot = this.vx * nx + this.vy * ny;
    if (dot < 0) {
      const restitution = 0.35;
      this.vx -= (1 + restitution) * dot * nx;
      this.vy -= (1 + restitution) * dot * ny;
      this.wallHit    = true;
      this.wallHitVel = Math.abs(dot);
      /* Kill some angular velocity */
      this.angularVel *= 0.6;
    }
  }
}

/* ── Utility ── */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
