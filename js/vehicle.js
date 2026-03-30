/* ============================================================
   DRIFT KING — Vehicle Physics
   Full Pacejka Magic Formula, lateral weight transfer,
   tire temperature model, AE86 engine torque curve
   ============================================================ */

class Vehicle {
  constructor(settings) {
    settings = settings || { power: 5, grip: 5, steering: 5 };

    this.x = 0; this.y = 0; this.angle = 0;
    this.vx = 0; this.vy = 0;
    this.angularVel = 0;

    this.gear = 1; this.rpm = CFG.CAR.minRPM; this.engineRev = 0; this.prevGear = 1;

    this.steerInput = 0; this.throttleInput = 0; this.brakeInput = 0;
    this.handbrakeIn = false;

    this.speed = 0; this.localVx = 0; this.localVy = 0;
    this.driftAngle = 0; this.isDrifting = false;
    this.onTrack = true; this.trackIdx = 0;

    /* Weight distribution (per-axle fraction) */
    this.frontLoad = 0.52; // AE86 52/48 front bias
    this.rearLoad  = 0.48;

    /* Tire temperatures (start slightly cold) */
    this.tireTempFL = 25; this.tireTempFR = 25;
    this.tireTempRL = 25; this.tireTempRR = 25;

    this.nitro = CFG.NITRO.maxCharge;
    this.nitroActive = false; this.nitroInput = false;

    /* Lateral G for suspension lean (visual only) */
    this.lateralG = 0;
    this.longG = 0;

    /* Settings multipliers */
    this._powerMult   = 0.72 + settings.power    * 0.056;
    this._gripMult    = 0.65 + settings.grip      * 0.07;
    this._steerMult   = 0.75 + settings.steering  * 0.05;

    this.wallHit = false; this.wallHitVel = 0;
    this.nearMiss = false; this.nearMissDist = Infinity;
    this.gearShifted = false;

    /* Slip values (for tire temp / audio) */
    this.rearSlipAngle = 0;
    this.frontSlipAngle = 0;

    /* Tire relaxation state (lagged slip angles, build up over distance) */
    this._relaxFrontSlip = 0;
    this._relaxRearSlip  = 0;
  }

  spawn(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle;
    this.vx = this.vy = this.angularVel = 0;
    this.gear = 1; this.prevGear = 1; this.rpm = CFG.CAR.minRPM;
    this.steerInput = this.throttleInput = this.brakeInput = 0;
    this.handbrakeIn = false; this.wallHit = false;
    this.nitro = CFG.NITRO.maxCharge; this.nitroActive = false;
    this.gearShifted = false;
    this.tireTempFL = this.tireTempFR = this.tireTempRL = this.tireTempRR = 25;
    this.lateralG = 0; this.longG = 0;
    this._relaxFrontSlip = 0; this._relaxRearSlip = 0;
  }

  step(dt, input) {
    if (dt <= 0) return;
    const C = CFG.CAR;
    const g = 9.81;

    this.steerInput    = input.steer;
    this.throttleInput = input.throttle;
    this.brakeInput    = input.brake;
    this.handbrakeIn   = input.handbrake;
    this.nitroInput    = input.nitro || false;
    this.gearShifted   = false;

    /* ── Nitro ── */
    if (this.nitroInput && this.nitro > 0 && this.throttleInput > 0.1) {
      this.nitroActive = true;
      this.nitro = Math.max(0, this.nitro - CFG.NITRO.useRate * dt);
    } else {
      this.nitroActive = false;
    }
    if (this.isDrifting && !this.nitroActive) {
      this.nitro = Math.min(CFG.NITRO.maxCharge, this.nitro + CFG.NITRO.rechargeRate * dt);
    }

    /* ── Weather grip multiplier ── */
    const weatherGrip = CFG.ENV.weatherGrip[CFG.ENV.weather] || 1.0;

    /* ── Local velocity ── */
    const cosA = Math.cos(this.angle), sinA = Math.sin(this.angle);
    const lx   =  this.vx * cosA + this.vy * sinA;
    const ly   = -this.vx * sinA + this.vy * cosA;
    this.localVx = lx; this.localVy = ly;

    const spd = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    this.speed = spd;
    const absFwd = Math.max(Math.abs(lx), 0.5);

    /* ── Drift angle ── */
    this.driftAngle = Math.atan2(Math.abs(ly), absFwd);
    this.isDrifting = (this.driftAngle > CFG.DRIFT.minAngle && spd > CFG.DRIFT.minSpeed);

    /* ── Longitudinal weight transfer ── */
    const throttleBrake = input.throttle - input.brake;
    const longAccelG = throttleBrake * C.maxEngineForce / C.mass / g;
    const longTransfer = clamp(C.cgHeight / C.wheelbase * longAccelG * 0.28, -0.18, 0.18);

    /* ── Lateral weight transfer (based on yaw rate * speed) ── */
    const latAccelG = this.angularVel * spd / g;
    const latTransfer = clamp(C.cgHeight / C.trackWidth * latAccelG * 0.22, -0.20, 0.20);
    this.lateralG = latAccelG;
    this.longG    = longAccelG;

    /* Per-axle load — derive both axles from the already-clamped longTransfer */
    this.rearLoad  = 0.48 + longTransfer;
    this.frontLoad = 1.0 - this.rearLoad;
    /* Lateral makes outer wheels heavier: affects rear oversteer tendency */
    const rearLatLoad = clamp(0.50 + Math.abs(latTransfer) * 0.5, 0.5, 0.75);

    /* ── Aerodynamic downforce ── */
    const downforce = C.downforceCoeff * spd * spd;
    const effMass = C.mass + downforce / g;

    /* ── Steer angle ── */
    const spdFactor  = 1 - Math.min(spd * C.steerSpeedFactor, 0.55);
    const steerAngle = input.steer * C.maxSteerAngle * spdFactor * this._steerMult;

    /* ── Slip angles ── */
    const omega = this.angularVel;
    const rawFrontSlip = Math.atan2(ly + omega * C.cgToFront, absFwd) - steerAngle;
    const rawRearSlip  = Math.atan2(ly - omega * C.cgToRear,  absFwd);

    /* ── Tire relaxation length ──
       Tires don't generate force instantly — the contact patch deforms over
       a characteristic distance (relaxation length). This is modelled as a
       first-order lag: dα_eff/ds = (α_raw − α_eff) / σ
       where ds = speed · dt and σ = relaxation length.
       At very low speed the filter is bypassed to avoid division issues. */
    const relaxLen = C.tireRelaxLen || 0.14;
    const ds = Math.max(spd, 0.5) * dt;            // distance travelled this step
    const relaxK = clamp(ds / relaxLen, 0, 1);      // blend factor (0=no change, 1=instant)
    this._relaxFrontSlip += (rawFrontSlip - this._relaxFrontSlip) * relaxK;
    this._relaxRearSlip  += (rawRearSlip  - this._relaxRearSlip)  * relaxK;

    const frontSlip = this._relaxFrontSlip;
    const rearSlip  = this._relaxRearSlip;
    this.frontSlipAngle = frontSlip;
    this.rearSlipAngle  = rearSlip;

    /* ── Tire temperature effect on grip ── */
    const gripFromTemp = (temp) => {
      const tOpt = C.tireTempOptimal;
      const tMin = C.tireTempGripMin || 0.65;
      if (temp <= tOpt) {
        return tMin + (1 - tMin) * clamp((temp - 20) / (tOpt - 20), 0, 1);
      } else {
        return 1.0 - (1 - tMin) * clamp((temp - tOpt) / (140 - tOpt), 0, 1);
      }
    };
    const tempGripFront = (gripFromTemp(this.tireTempFL) + gripFromTemp(this.tireTempFR)) * 0.5;
    const tempGripRear  = (gripFromTemp(this.tireTempRL) + gripFromTemp(this.tireTempRR)) * 0.5;

    /* ── Update tire temperatures ── */
    const frontSlipMag = Math.abs(frontSlip);
    const rearSlipMag  = Math.abs(rearSlip);
    const heatRate = C.tireTempHeat || 14;
    const coolRate = C.tireTempCool || 3.5;
    const tHeat = (slip) => clamp(slip * 4, 0, 1) * heatRate * dt;
    const tCool = coolRate * dt;
    this.tireTempFL = clamp(this.tireTempFL + tHeat(frontSlipMag) - tCool, 20, 150);
    this.tireTempFR = clamp(this.tireTempFR + tHeat(frontSlipMag) - tCool, 20, 150);
    this.tireTempRL = clamp(this.tireTempRL + tHeat(rearSlipMag) - tCool + (this.handbrakeIn ? heatRate * dt * 0.5 : 0), 20, 150);
    this.tireTempRR = clamp(this.tireTempRR + tHeat(rearSlipMag) - tCool + (this.handbrakeIn ? heatRate * dt * 0.5 : 0), 20, 150);

    /* ── Full Pacejka Magic Formula: F = D*sin(C*atan(B*s - E*(B*s - atan(B*s)))) ── */
    const pacejka = (slip, B, Cv, D, E, maxF) => {
      const Bs  = B * slip;
      const val = D * Math.sin(Cv * Math.atan(Bs - E * (Bs - Math.atan(Bs))));
      return clamp(-val * maxF, -maxF, maxF);
    };

    const offGrip  = this.onTrack ? 1.0 : C.offroadGrip;
    const rearGrip = this.handbrakeIn ? C.handbrakeGrip : this._gripMult * offGrip * weatherGrip;
    const frtGrip  = this._gripMult * offGrip * weatherGrip;

    /* ── Load sensitivity ──
       Real tires lose efficiency per unit of vertical load as load increases.
       µ_eff = µ_base * (1 − loadSens * Fz)
       This makes weight transfer effects much more pronounced:
       the lighter wheel gains proportionally more than the heavier wheel loses. */
    const loadSens  = C.loadSensitivity || 0;
    const Fz_front  = effMass * g * this.frontLoad;
    const Fz_rear   = effMass * g * this.rearLoad * rearLatLoad;
    const lsFront   = clamp(1 - loadSens * Fz_front, 0.5, 1.0);
    const lsRear    = clamp(1 - loadSens * Fz_rear,  0.5, 1.0);
    const maxLatFront = Fz_front * tempGripFront * lsFront;
    const maxLatRear  = Fz_rear  * tempGripRear  * lsRear;

    let Fy_front = pacejka(frontSlip, C.tireBFront * frtGrip, C.tireCFront, C.tireDFront, C.tireEFront, maxLatFront);
    let Fy_rear  = pacejka(rearSlip,  C.tireBRear  * rearGrip, C.tireCRear, C.tireDRear,  C.tireERear,  maxLatRear);

    /* ── Engine torque curve (4A-GE approximation) ── */
    const gear   = this.gear;
    const ratio  = C.gearRatios[gear] * C.finalDrive;
    const fwdSpd = Math.max(Math.abs(lx), 0.1);
    /* Normalised RPM-based torque multiplier: peaks ~0.65 RPM norm */
    const rpmNorm  = clamp((this.rpm - C.minRPM) / (C.maxRPM - C.minRPM), 0, 1);
    let torqueMult;
    if (rpmNorm < 0.25) torqueMult = 0.60 + rpmNorm * 1.4;
    else if (rpmNorm < 0.70) torqueMult = 0.95 + (rpmNorm - 0.25) * 0.11;
    else if (rpmNorm < 0.85) torqueMult = 1.0;
    else torqueMult = 1.0 - (rpmNorm - 0.85) * 2.5;
    torqueMult = clamp(torqueMult, 0.2, 1.0);

    let maxEng = C.maxEngineForce * this._powerMult * torqueMult / Math.max(1, fwdSpd / 9);
    if (this.nitroActive) maxEng *= CFG.NITRO.forceMult;
    const engineF = input.throttle * clamp(maxEng, 0, C.maxEngineForce * this._powerMult * (this.nitroActive ? 3.0 : 1.5));
    const brakeF  = input.brake * C.maxBrakeForce;

    /* ── Engine braking ──
       When the driver lifts off the throttle, the engine provides a
       retarding force through internal friction and pumping losses.
       This is proportional to RPM and only applies when going forward. */
    const engBrake = (C.engineBrakeForce || 0) * rpmNorm * clamp(1 - input.throttle, 0, 1);

    const goingFwd = lx > -1;
    const Fx_local = goingFwd ? engineF - brakeF - engBrake : -brakeF * 0.5;

    /* ── Self-aligning torque ──
       The pneumatic trail creates a restoring moment that tends to
       straighten the front wheels. Proportional to front lateral force. */
    const alignCoeff = C.alignTorqueCoeff || 0;
    const selfAlignTorque = -Fy_front * alignCoeff;

    /* ── Yaw torque & integration ── */
    const torque = Fy_front * C.cgToFront - Fy_rear * C.cgToRear + selfAlignTorque;
    this.angularVel += (torque / C.inertia) * dt;

    /* Speed-dependent yaw damping: more damping at low speed (parking),
       less artificial damping at high speed where tire forces dominate */
    const yawDampBase = 1.5;
    const yawDampSpd  = 0.8;
    const yawDamp = yawDampBase + yawDampSpd / (1 + spd * 0.15);
    this.angularVel *= Math.max(0, 1 - yawDamp * dt);

    /* ── World forces ── */
    const Fy_total = Fy_front + Fy_rear;
    const ax = (Fx_local * cosA - Fy_total * sinA) / C.mass;
    const ay = (Fx_local * sinA + Fy_total * cosA) / C.mass;
    this.vx += ax * dt;
    this.vy += ay * dt;

    /* ── Drag ── */
    if (spd > 0.01) {
      const dragMul = this.onTrack ? 1.0 : C.offroadDrag;
      const dragAcc = C.dragCoeff * dragMul * spd * spd / C.mass;
      this.vx -= dragAcc * (this.vx / spd) * dt;
      this.vy -= dragAcc * (this.vy / spd) * dt;
    }
    if (spd > 0.1) {
      const rr = C.rollingResist / C.mass;
      this.vx -= rr * (this.vx / spd) * dt;
      this.vy -= rr * (this.vy / spd) * dt;
    } else {
      this.vx *= Math.pow(0.04, dt);
      this.vy *= Math.pow(0.04, dt);
    }

    /* Speed cap */
    const maxSpd = this.nitroActive ? C.maxSpeed + CFG.NITRO.speedBoost : C.maxSpeed;
    const spd2 = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    if (spd2 > maxSpd) { this.vx *= maxSpd / spd2; this.vy *= maxSpd / spd2; }

    this.x     += this.vx * dt;
    this.y     += this.vy * dt;
    this.angle += this.angularVel * dt;
    while (this.angle >  Math.PI) this.angle -= 2 * Math.PI;
    while (this.angle < -Math.PI) this.angle += 2 * Math.PI;

    this._updateGear(lx, C);
  }

  _updateGear(fwdSpd, C) {
    this.prevGear = this.gear;
    const ratio  = C.gearRatios[this.gear] * C.finalDrive;
    const wRPM   = (Math.abs(fwdSpd) / (2 * Math.PI * C.wheelRadius)) * 60;
    this.rpm     = clamp(wRPM * ratio, C.minRPM, C.maxRPM * 1.05);
    this.engineRev = (this.rpm - C.minRPM) / (C.maxRPM - C.minRPM);

    if (this.throttleInput > 0.05) {
      if (this.rpm > C.maxRPM * C.autoShiftUp   && this.gear < 5) this.gear++;
      if (this.rpm < C.maxRPM * C.autoShiftDown  && this.gear > 1) this.gear--;
    }
    if (this.gear !== this.prevGear) this.gearShifted = true;
  }

  bounceOffWall(nx, ny) {
    const dot = this.vx * nx + this.vy * ny;
    if (dot < 0) {
      const restitution = 0.30;
      this.vx -= (1 + restitution) * dot * nx;
      this.vy -= (1 + restitution) * dot * ny;
      this.wallHit    = true;
      this.wallHitVel = Math.abs(dot);
      this.angularVel *= 0.55;
    }
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
