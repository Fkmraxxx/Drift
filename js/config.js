/* ============================================================
   DRIFT KING — Configuration & Constants
   ============================================================ */

const CFG = {

  /* ── Vehicle physics (Toyota AE86 Levin/Trueno 4A-GE) ──── */
  CAR: {
    mass:             940,    // kg
    inertia:          1350,   // kg·m²
    wheelbase:        2.40,   // m
    cgToFront:        1.10,   // m (52% front bias)
    cgToRear:         1.30,   // m
    cgHeight:         0.44,   // m
    trackWidth:       1.47,   // m (lateral weight transfer)
    maxSteerAngle:    0.54,   // rad (~31°)
    steerSpeedFactor: 0.008,
    /* Full Pacejka params per axle: B=stiffness, C=shape, D=peak, E=curvature */
    tireBFront: 11.0, tireCFront: 1.9, tireDFront: 1.05, tireEFront: 0.96,
    tireBRear:  10.0, tireCRear:  1.85, tireDRear: 1.00, tireERear:  0.96,
    handbrakeGrip:    0.06,
    maxEngineForce:   6800,   // N
    maxBrakeForce:    11500,  // N
    engineBrakeForce: 1200,   // N  engine braking when off throttle
    dragCoeff:        0.36,
    rollingResist:    80,
    downforceCoeff:   0.3,    // AE86 minimal aero
    maxSpeed:         52,     // m/s (~187 km/h)
    /* Tire relaxation length — force builds up over distance, not instantly */
    tireRelaxLen:     0.14,   // m  (lower = snappier, higher = smoother lag)
    /* Load sensitivity — grip/N decreases as vertical load increases */
    loadSensitivity:  0.00035,
    /* Self-aligning torque (pneumatic trail) */
    alignTorqueCoeff: 0.05,
    maxRPM:           8500,   // 4A-GE redline
    minRPM:           900,
    gearRatios:       [0, 3.587, 2.022, 1.384, 1.000, 0.861], // 5-speed
    finalDrive:       4.10,
    wheelRadius:      0.295,
    length:           4.18,
    width:            1.85,
    autoShiftUp:      0.87,
    autoShiftDown:    0.24,
    offroadDrag:      3.2,
    offroadGrip:      0.50,
    tireWidth:        0.22,
    /* Tire temperature model */
    tireTempOptimal:  85,   // °C
    tireTempHeat:     14,   // °C/s when slipping hard
    tireTempCool:     3.5,  // °C/s cooling
    tireTempGripMin:  0.65, // minimum grip fraction at extreme temps
  },

  /* ── Nitro / Boost ───────────────────────────────────────── */
  NITRO: {
    maxCharge:       100,     // max nitro units
    rechargeRate:    8,       // units/s recovered while drifting
    useRate:         40,      // units/s consumed while active
    forceMult:       1.9,     // engine force multiplier during nitro
    speedBoost:      12,      // extra m/s cap during nitro
  },

  /* ── Camera ──────────────────────────────────────────────── */
  CAM: {
    baseZoom:        10.0,    // px / m
    lerpPos:         0.09,    // position follow speed
    lerpAngle:       0.07,    // angle follow speed
    driftLead:       18,      // m ahead to offset camera in drift dir
    speedZoom:       0.008,   // zoom-out per (m/s)  above 20 m/s (was 0.006)
    shakeDecay:      0.82,    // per-frame shake decay
    driftTilt:       0.08,    // max tilt rad during drift
  },

  /* ── Drift scoring ───────────────────────────────────────── */
  DRIFT: {
    minAngle:        0.14,    // rad  minimum drift angle to score
    minSpeed:        7,       // m/s
    baseScore:       100,     // pts/s at threshold angle
    angleBonus:      380,     // pts/s per extra radian
    speedBonus:      5,       // pts/s per extra m/s
    comboTimeout:    2.8,     // s  — reset combo if no drift for this long
    maxMultiplier:   12,      // raised from 8 for longer drift chains
    comboStep:       0.35,    // multiplier increase per continuous drift-second
    comboAccel:      0.04,    // comboStep grows by this much per second of drift
    comboStepMax:    3,       // max multiplier of base comboStep (acceleration cap)
    wallPenalty:    -700,     // pts on wall hit
    offroadPenalty: -200,     // pts/s off-road
    nearMissDist:    1.8,     // m — distance from wall for near-miss bonus
    nearMissBonus:   250,     // pts per second of near-miss drifting
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
    maxTireMarks:   3000,    // segments kept in memory (increased)
    tireMarkFade:   25,      // seconds to fade to invisible (increased)
    maxParticles:   600,     // increased for richer effects
    smokeLifetime:  2.0,     // s (increased)
    smokeSpeed:     3.5,     // m/s initial velocity
    sparkLifetime:  0.7,
    speedLineThreshold: 24,
  },

  /* ── Environment / Weather ───────────────────────────────── */
  ENV: {
    timeOfDay: 'day',        // 'day' | 'dusk' | 'night'
    weather:   'dry',        // 'dry' | 'wet' | 'rain'
    weatherGrip: { dry: 1.0, wet: 0.82, rain: 0.62 },
    ambientLight: {
      day:   { sky: '#5a9bd5', ground: '#2d5a1a', roadTint: null },
      dusk:  { sky: '#c85010', ground: '#1e1408', roadTint: 'rgba(255,80,10,0.12)' },
      night: { sky: '#05101e', ground: '#080f06', roadTint: 'rgba(0,0,0,0.55)' },
    },
    rainDrops: 200,
    rainSpeed: 440,   // px/s
    rainAngle: 0.2,   // rad
  },
};
