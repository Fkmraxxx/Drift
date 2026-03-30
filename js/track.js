/* ============================================================
   DRIFT KING — Track system
   Two tracks, Catmull-Rom spline geometry, collision & lap logic
   ============================================================ */

/* ── Maths helpers ─────────────────────────────────────────── */
function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ];
}

/* Build smooth geometry from control points (closed loop) */
function buildTrackGeometry(ctrl, width, stepsPerSeg) {
  stepsPerSeg = stepsPerSeg || 28;
  const n = ctrl.length;
  const center = [];

  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let s = 0; s < stepsPerSeg; s++) {
      center.push(catmullRomPoint(p0, p1, p2, p3, s / stepsPerSeg));
    }
  }

  const m = center.length;
  const left = [], right = [], tangents = [], normals = [];

  for (let i = 0; i < m; i++) {
    const prev = center[(i - 1 + m) % m];
    const next = center[(i + 1) % m];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const len = Math.sqrt(tx*tx + ty*ty) || 1;
    tx /= len; ty /= len;
    tangents.push([tx, ty]);

    /* Left-hand normal (in Y-down canvas space, "left" is −Y rotated) */
    const nx = -ty, ny = tx;
    normals.push([nx, ny]);

    const hw = width / 2;
    left.push( [center[i][0] + nx * hw, center[i][1] + ny * hw]);
    right.push([center[i][0] - nx * hw, center[i][1] - ny * hw]);
  }

  /* Arc-length lookup */
  const arcLen = [0];
  for (let i = 1; i < m; i++) {
    const dx = center[i][0] - center[i-1][0], dy = center[i][1] - center[i-1][1];
    arcLen.push(arcLen[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const totalLen = arcLen[m - 1];

  return { center, left, right, tangents, normals, arcLen, totalLen, width, count: m };
}

/* Find index of closest centre point (with wrapping search window) */
function findClosestIdx(geo, x, y, hint, window) {
  hint   = (hint   === undefined) ? 0  : hint;
  window = (window === undefined) ? 60 : window;
  const m = geo.count;
  let best = Infinity, bestIdx = hint;

  const lo = hint - window, hi = hint + window;
  for (let i = lo; i <= hi; i++) {
    const ii = ((i % m) + m) % m;
    const dx = x - geo.center[ii][0], dy = y - geo.center[ii][1];
    const d = dx*dx + dy*dy;
    if (d < best) { best = d; bestIdx = ii; }
  }
  return bestIdx;
}

/* Signed lateral distance from track centre at index idx */
function lateralDist(geo, x, y, idx) {
  const c = geo.center[idx], n = geo.normals[idx];
  return (x - c[0]) * n[0] + (y - c[1]) * n[1];
}

/* Progress 0→1 along track */
function trackProgress(geo, idx) {
  return geo.arcLen[idx] / geo.totalLen;
}

/* ── Lap Tracker ───────────────────────────────────────────── */
class LapTracker {
  constructor(track) {
    this.track       = track;
    this.laps        = 0;
    this.lapTimes    = [];   // milliseconds
    this.bestLap     = null;
    this._start      = performance.now(); // avoids huge initial readout
    this._lastProg   = -1;
    this._minLapMs   = 8000; // debounce – ignore wrap-around faster than this
  }

  reset(nowMs) {
    this.laps      = 0;
    this.lapTimes  = [];
    this.bestLap   = null;
    this._start    = nowMs;
    this._lastProg = -1;
  }

  /* Call every physics step; returns laps completed so far */
  update(trackIdx, nowMs) {
    const prog = trackProgress(this.track.geo, trackIdx);
    let completed = false;

    if (this._lastProg >= 0) {
      /* Detect forward crossing of the start line (progress 0.9+→0.1−) */
      if (this._lastProg > 0.88 && prog < 0.12) {
        const elapsed = nowMs - this._start;
        if (elapsed > this._minLapMs) {
          this.lapTimes.push(elapsed);
          if (!this.bestLap || elapsed < this.bestLap) this.bestLap = elapsed;
          this._start = nowMs;
          this.laps++;
          completed = true;
        }
      }
    }
    this._lastProg = prog;
    return completed;
  }

  currentLapMs(nowMs) { return nowMs - this._start; }
}

/* ── Track definitions ─────────────────────────────────────── */

/*  Track 1 — "Neon Circuit"
    Flowing, 16-point closed loop, ~500 m, 13 m wide
    Good for long sweeping drifts                         */
const T1_CTRL = [
  [  0, 200],   //  0  Start / Finish
  [ 85, 200],   //  1  Main straight
  [175, 198],   //  2  End of main straight
  [240, 178],   //  3  T1 entry
  [280, 140],   //  4  T1 apex
  [288,  88],   //  5  T1 exit
  [272,  38],   //  6  Back section
  [230,   4],   //  7  Top curve
  [165,  -8],   //  8  Top straight
  [ 95,   0],   //  9  Top section
  [ 42,  22],   // 10  T2 entry
  [  8,  62],   // 11  T2 apex
  [  8, 115],   // 12  T2 exit
  [-22, 155],   // 13  Chicane
  [-12, 182],   // 14  Final straight
  [ -5, 197],   // 15  Approaching finish
];

/*  Track 2 — "Industrial Complex"
    Technical tight circuit, 20-point loop, ~400 m, 11 m wide */
const T2_CTRL = [
  [  0,   0],   //  0  Start / Finish
  [ 60,   0],   //  1  Straight
  [110, -22],   //  2  T1 entry
  [148, -68],   //  3  T1
  [158,-118],   //  4
  [138,-165],   //  5  T2
  [ 92,-190],   //  6  Hairpin
  [ 40,-182],   //  7
  [  8,-152],   //  8  Hairpin exit
  [ -8,-108],   //  9  Section
  [-22, -62],   // 10  T3 left
  [-18, -20],   // 11
  [  8,  12],   // 12  T4
  [ 40,  18],   // 13  Chicane
  [ 52,  45],   // 14
  [ 40,  72],   // 15  Final corner
  [ 12,  80],   // 16
  [-14,  52],   // 17
  [-18,  22],   // 18
  [ -6,   4],   // 19
];

/* ── Build & export ────────────────────────────────────────── */

function makeTrack(id, name, ctrl, width, roadColor, accentColor, surface) {
  const geo        = buildTrackGeometry(ctrl, width);
  /* Start heading: tangent at first centre point */
  const t0         = geo.tangents[0];
  const startAngle = Math.atan2(t0[1], t0[0]);

  return {
    id, name, ctrl, geo, width,
    startPos:    [ctrl[0][0], ctrl[0][1]],
    startAngle,
    roadColor:   roadColor   || '#1e2030',
    accentColor: accentColor || '#1155ff',
    surface:     surface     || 'asphalt',
  };
}

const TRACKS = [
  makeTrack('neon',       'Neon Circuit',       T1_CTRL, 13, '#1c1c2e', '#00aaff'),
  makeTrack('industrial', 'Industrial Complex', T2_CTRL, 11, '#22201a', '#ff8800'),
];
