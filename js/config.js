/* ============================================================
   DRIFT KING — Configuration & Constants
   ============================================================ */

const CFG = {

  /* ── Vehicle physics ─────────────────────────────────────── */
  CAR: {
    mass:             1200,   // kg
    inertia:          2000,   // kg·m²  (yaw moment)
    wheelbase:        2.6,    // m
    cgToFront:        1.1,    // m  (CG → front axle)
    cgToRear:         1.5,    // m  (CG → rear axle)
    maxSteerAngle:    0.55,   // rad  (~31°)
    steerSpeedFactor: 0.007,  // reduces steer at speed
    frontGrip:        14.5,   // lateral stiffness
    rearGrip:         11.5,
    handbrakeGrip:    0.08,   // rear grip fraction when handbrake on
    maxEngineForce:   9000,   // N
    maxBrakeForce:    13000,  // N
    dragCoeff:        0.42,
    rollingResist:    110,    // N constant rolling drag
    maxSpeed:         68,     // m/s  (~245 km/h hard cap)
    maxRPM:           8500,
    minRPM:           800,
    gearRatios:       [0, 3.4, 2.1, 1.45, 1.1, 0.91, 0.76],
    finalDrive:       3.6,
    wheelRadius:      0.32,   // m
    length:           4.4,    // m  (rendering)
    width:            2.0,    // m  (rendering)
    autoShiftUp:      0.88,   // shift up at this fraction of maxRPM
    autoShiftDown:    0.22,   // shift down at this fraction of maxRPM
  },

  /* ── Camera ──────────────────────────────────────────────── */
  CAM: {
    baseZoom:        10.0,    // px / m
    lerpPos:         0.09,    // position follow speed
    lerpAngle:       0.07,    // angle follow speed
    driftLead:       18,      // m ahead to offset camera in drift dir
    speedZoom:       0.006,   // zoom-out per (m/s)  above 20 m/s
    shakeDecay:      0.82,    // per-frame shake decay
  },

  /* ── Drift scoring ───────────────────────────────────────── */
  DRIFT: {
    minAngle:        0.14,    // rad  minimum drift angle to score
    minSpeed:        7,       // m/s
    baseScore:       100,     // pts/s at threshold angle
    angleBonus:      380,     // pts/s per extra radian
    speedBonus:      5,       // pts/s per extra m/s
    comboTimeout:    2.8,     // s  — reset combo if no drift for this long
    maxMultiplier:   8,
    comboStep:       0.35,    // multiplier increase per continuous drift-second
    wallPenalty:    -700,     // pts on wall hit
    offroadPenalty: -200,     // pts/s off-road
  },

  /* ── Game rules ──────────────────────────────────────────── */
  GAME: {
    totalLaps:    3,
    physicsDt:    1 / 120,   // fixed physics step
    maxSteps:     5,         // max physics steps per render frame
    resetPenalty: 3,         // seconds added to lap on reset
  },

  /* ── VFX ─────────────────────────────────────────────────── */
  VFX: {
    tireMarkWidth:  0.22,    // m
    maxTireMarks:   2000,    // segments kept in memory
    tireMarkFade:   20,      // seconds to fade to invisible
    maxParticles:   350,
    smokeLifetime:  1.6,     // s
    smokeSpeed:     3.0,     // m/s initial velocity
    sparkLifetime:  0.6,
  },
};
