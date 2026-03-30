/* ============================================================
   DRIFT KING — Drift Scoring & Combo System
   ============================================================ */

class DriftScoring {
  constructor() {
    this.score      = 0;
    this.totalScore = 0;  // persistent across laps
    this.multiplier = 1;
    this.comboTimer = 0;  // countdown until combo breaks (s)
    this.isDrifting = false;
    this.driftTime  = 0;  // current continuous drift seconds

    /* Display helpers */
    this.displayScore   = 0;      // smoothed for HUD
    this.lastScoreDelta = 0;      // points earned this step
    this.comboPopup     = 0;      // show "COMBO x!" for this many seconds
    this.newRecord      = false;
    this._bonusPending  = 0;
  }

  reset() {
    this.score        = 0;
    this.multiplier   = 1;
    this.comboTimer   = 0;
    this.isDrifting   = false;
    this.driftTime    = 0;
    this.displayScore = 0;
    this.newRecord    = false;
    this._bonusPending = 0;
  }

  /* Call every physics step */
  update(car, dt, onTrack) {
    const D = CFG.DRIFT;
    this.lastScoreDelta = 0;

    /* Off-road penalty */
    if (!onTrack) {
      this._breakCombo();
      if (car.speed > 2) {
        const pen = D.offroadPenalty * dt;
        this.score     = Math.max(0, this.score + pen);
        this.totalScore = Math.max(0, this.totalScore + pen);
      }
      return;
    }

    /* Wall hit */
    if (car.wallHit) {
      const pen = D.wallPenalty;
      this.score      = Math.max(0, this.score + pen);
      this.totalScore = Math.max(0, this.totalScore + pen);
      this._breakCombo();
      car.wallHit = false;
      return;
    }

    /* Drifting */
    if (car.isDrifting) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftTime  = 0;
      }

      this.driftTime  += dt;
      this.comboTimer  = D.comboTimeout;

      /* Base score per second */
      const anglePts  = (car.driftAngle - D.minAngle) * D.angleBonus;
      const speedPts  = Math.max(0, car.speed - D.minSpeed) * D.speedBonus;
      const pts       = (D.baseScore + anglePts + speedPts) * this.multiplier * dt;

      this.score          += pts;
      this.totalScore     += pts;
      this.lastScoreDelta  = pts;

      /* Increase multiplier */
      const incr = D.comboStep * dt;
      this.multiplier = Math.min(D.maxMultiplier, this.multiplier + incr);

    } else {
      if (this.isDrifting) {
        /* Just stopped drifting — bank the drift run as a bonus */
        this.isDrifting = false;
      }

      /* Combo timeout */
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this._breakCombo();
      }
    }

    /* Smooth display score */
    this.displayScore += (this.score - this.displayScore) * Math.min(1, dt * 6);

    /* Countdown popup timer */
    if (this.comboPopup > 0) this.comboPopup -= dt;
  }

  _breakCombo() {
    if (this.multiplier > 1.5) {
      this.comboPopup = 1.5;
    }
    this.multiplier  = 1;
    this.comboTimer  = 0;
    this.isDrifting  = false;
    this.driftTime   = 0;
  }

  /* Format lap time ms → "1:23.456" */
  static formatTime(ms) {
    if (!ms && ms !== 0) return '--:--.---';
    const m   = Math.floor(ms / 60000);
    const s   = Math.floor((ms % 60000) / 1000);
    const cs  = Math.floor(ms % 1000);
    return `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(3,'0')}`;
  }

  static formatScore(s) {
    return Math.floor(s).toLocaleString();
  }
}
