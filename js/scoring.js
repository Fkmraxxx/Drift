/* ============================================================
   DRIFT KING — Drift Scoring & Combo System
   With drift ratings, near-miss bonuses, and chain acceleration
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

    /* Drift rating system */
    this.driftRating    = '';     // GOOD / GREAT / INSANE / LEGENDARY
    this.ratingTimer    = 0;     // seconds to show rating
    this.ratingPulse    = 0;     // animation timer

    /* Near-miss tracking */
    this.nearMissActive = false;
    this.nearMissTimer  = 0;

    /* Combo step acceleration */
    this._comboStepCurrent = CFG.DRIFT.comboStep;
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
    this.driftRating  = '';
    this.ratingTimer  = 0;
    this._comboStepCurrent = CFG.DRIFT.comboStep;
  }

  /* Call every physics step */
  update(car, dt, onTrack) {
    const D = CFG.DRIFT;
    this.lastScoreDelta = 0;

    /* Rating timer countdown */
    if (this.ratingTimer > 0) this.ratingTimer -= dt;
    if (this.nearMissTimer > 0) this.nearMissTimer -= dt;

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

    /* Near-miss bonus — drifting close to walls */
    if (car.isDrifting && car.nearMiss) {
      const nmBonus = D.nearMissBonus * dt;
      this.score      += nmBonus;
      this.totalScore += nmBonus;
      this.nearMissActive = true;
      this.nearMissTimer  = 1.0;
    } else {
      this.nearMissActive = false;
    }

    /* Drifting */
    if (car.isDrifting) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftTime  = 0;
        this._comboStepCurrent = D.comboStep;
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

      /* Increase multiplier (accelerates over time) */
      this._comboStepCurrent = Math.min(
        D.comboStep * 3,
        this._comboStepCurrent + D.comboAccel * dt
      );
      const incr = this._comboStepCurrent * dt;
      this.multiplier = Math.min(D.maxMultiplier, this.multiplier + incr);

      /* Update drift rating based on angle & duration */
      this._updateRating(car);

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

  _updateRating(car) {
    const angle = car.driftAngle;
    const spd   = car.speed;
    const time  = this.driftTime;

    let rating = '';
    if (angle > 0.8 && spd > 30 && time > 2) {
      rating = 'LEGENDARY';
    } else if (angle > 0.55 && spd > 22 && time > 1.5) {
      rating = 'INSANE';
    } else if (angle > 0.35 && spd > 15 && time > 0.8) {
      rating = 'GREAT';
    } else if (angle > 0.2 && spd > 10) {
      rating = 'GOOD';
    }

    if (rating && rating !== this.driftRating) {
      this.driftRating = rating;
      this.ratingTimer = 2.0;
      this.ratingPulse = 1.0;
    }
  }

  _breakCombo() {
    if (this.multiplier > 1.5) {
      this.comboPopup = 1.5;
    }
    this.multiplier  = 1;
    this.comboTimer  = 0;
    this.isDrifting  = false;
    this.driftTime   = 0;
    this.driftRating = '';
    this._comboStepCurrent = CFG.DRIFT.comboStep;
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
