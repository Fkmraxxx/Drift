/* ============================================================
   DRIFT KING — Vehicle Physics
   Realistic 2-axle tire model with weight transfer, downforce,
   nitro boost, and drift mechanics
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
    this.prevGear  = 1;   // for gear-shift detection

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

    /* ── Weight transfer ── */
    this.frontLoad     = 0.5; // 0–1 front weight fraction
    this.rearLoad      = 0.5;

    /* ── Nitro system ── */
    this.nitro         = CFG.NITRO.maxCharge;
    this.nitroActive   = false;
    this.nitroInput    = false;

    /* ── Tuning multipliers from settings ── */
    this._powerMult   = 0.7 + settings.power   * 0.06;   // 0.76 – 1.30
    this._gripMult    = 0.6 + settings.grip     * 0.08;   // 0.68 – 1.40
    this._steerMult   = 0.7 + settings.steering * 0.06;   // 0.76 – 1.30

    /* ── Collision / wall state ── */
    this.wallHit      = false;
    this.wallHitVel   = 0;

    /* ── Near-miss tracking ── */
    this.nearMiss     = false;
    this.nearMissDist = Infinity;

    /* ── Gear shift event (for audio) ── */
    this.gearShifted  = false;
  }

  /* Reset to a spawn position */
  spawn(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle;
    this.vx = this.vy = this.angularVel = 0;
    this.gear = 1; this.prevGear = 1; this.rpm = CFG.CAR.minRPM;
    this.steerInput = this.throttleInput = this.brakeInput = 0;
    this.handbrakeIn = false;
    this.wallHit = false;
    this.nitro = CFG.NITRO.maxCharge;
    this.nitroActive = false;
    this.gearShifted = false;
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
    this.nitroInput    = input.nitro || false;
    this.gearShifted   = false;

    /* ── Nitro logic ── */
    if (this.nitroInput && this.nitro > 0 && this.throttleInput > 0.1) {
      this.nitroActive = true;
      this.nitro = Math.max(0, this.nitro - CFG.NITRO.useRate * dt);
    } else {
      this.nitroActive = false;
    }
    /* Recharge nitro while drifting */
    if (this.isDrifting && !this.nitroActive) {
      this.nitro = Math.min(CFG.NITRO.maxCharge, this.nitro + CFG.NITRO.rechargeRate * dt);
    }

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

    /* ── Weight transfer (longitudinal) ── */
    const accelG = (input.throttle - input.brake) * C.maxEngineForce / C.mass / g;
    const transferLong = clamp(C.cgHeight / C.wheelbase * accelG * 0.3, -0.15, 0.15);
    this.rearLoad  = 0.5 + transferLong;
    this.frontLoad = 0.5 - transferLong;

    /* ── Aerodynamic downforce ── */
    const downforce = C.downforceCoeff * spd * spd;
    const effectiveMass = C.mass + downforce / g;

    /* ── Steer angle (reduces at high speed) ── */
    const spdFactor   = 1 - Math.min(spd * C.steerSpeedFactor, 0.55);
    const steerAngle  = input.steer * C.maxSteerAngle * spdFactor * this._steerMult;

    /* ── Slip angles at each axle ── */
    const omega = this.angularVel;
    const frontSlip = Math.atan2(ly + omega * C.cgToFront, absFwd) - steerAngle;
    const rearSlip  = Math.atan2(ly - omega * C.cgToRear,  absFwd);

    /* ── Tire forces (improved Pacejka-like saturation) ── */
    const maxLatFront = effectiveMass * g * this.frontLoad;
    const maxLatRear  = effectiveMass * g * this.rearLoad;

    /* Off-road grip reduction */
    const gripScale = this.onTrack ? 1.0 : C.offroadGrip;

    const rearGripCoeff = this.handbrakeIn
                          ? C.handbrakeGrip
                          : this._gripMult * gripScale;

    const frontGripScaled = C.frontGrip * this._gripMult * gripScale;

    /* Pacejka-like saturation: F = Fmax * sin(atan(B * slip)) */
    const pacejka = (slip, grip, maxF) => {
      const B = grip * 2.5;
      return -maxF * Math.sin(Math.atan(B * slip));
    };

    let Fy_front = pacejka(frontSlip, frontGripScaled / C.frontGrip, maxLatFront);
    let Fy_rear  = pacejka(rearSlip,  rearGripCoeff,                 maxLatRear);

    /* Clamp forces */
    Fy_front = clamp(Fy_front, -maxLatFront, maxLatFront);
    Fy_rear  = clamp(Fy_rear,  -maxLatRear,  maxLatRear);

    /* ── Engine / brake force ── */
    const gear    = this.gear;
    const ratio   = C.gearRatios[gear] * C.finalDrive;
    /* Power drops at high speed (constant-power model) */
    const fwdSpd  = Math.max(Math.abs(lx), 0.1);
    let maxEng  = (C.maxEngineForce * this._powerMult) / Math.max(1, fwdSpd / 8);

    /* Apply nitro force boost */
    if (this.nitroActive) {
      maxEng *= CFG.NITRO.forceMult;
    }

    const engineF = input.throttle * clamp(maxEng, 0, C.maxEngineForce * this._powerMult * (this.nitroActive ? 3.0 : 1.6));
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
      let dragMul = this.onTrack ? 1.0 : C.offroadDrag;
      const dragAccel = (C.dragCoeff * dragMul * spd * spd) / C.mass;
      this.vx -= dragAccel * (this.vx / spd) * dt;
      this.vy -= dragAccel * (this.vy / spd) * dt;
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

    /* Speed cap (increased during nitro) */
    const maxSpd = this.nitroActive ? C.maxSpeed + CFG.NITRO.speedBoost : C.maxSpeed;
    const spd2 = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    if (spd2 > maxSpd) {
      this.vx *= maxSpd / spd2;
      this.vy *= maxSpd / spd2;
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
    this.prevGear = this.gear;
    const ratio  = C.gearRatios[this.gear] * C.finalDrive;
    const wRPM   = (Math.abs(fwdSpd) / (2 * Math.PI * C.wheelRadius)) * 60;
    this.rpm     = clamp(wRPM * ratio, C.minRPM, C.maxRPM * 1.05);
    this.engineRev = (this.rpm - C.minRPM) / (C.maxRPM - C.minRPM);

    if (this.throttleInput > 0.05) {
      if (this.rpm > C.maxRPM * C.autoShiftUp   && this.gear < 6) this.gear++;
      if (this.rpm < C.maxRPM * C.autoShiftDown  && this.gear > 1) this.gear--;
    }
    if (this.gear !== this.prevGear) this.gearShifted = true;
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
