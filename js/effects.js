/* ============================================================
   DRIFT KING — Visual Effects
   Tire marks, smoke particles, sparks, speed lines, nitro flames
   ============================================================ */

/* ── Tire Mark System ──────────────────────────────────────── */
class TireMarkSystem {
  constructor() {
    this.segs = [];   // { x0,y0,x1,y1,a,w,age }  (world coords)
    this._prevL = null;
    this._prevR = null;
  }

  /* Call each physics step when car is drifting / braking */
  addMark(car, intensity) {
    /* intensity 0..1 — controls opacity */
    if (intensity <= 0) { this._prevL = this._prevR = null; return; }

    const C    = CFG.CAR;
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle);
    /* Rear axle centre */
    const rx   = car.x - cosA * C.cgToRear;
    const ry   = car.y - sinA * C.cgToRear;
    /* Left / right wheel positions (perpendicular to heading) */
    const perp = (C.width / 2 - 0.15);
    const lx   = rx - sinA * perp,  ly = ry + cosA * perp;
    const rx2  = rx + sinA * perp,  ry2 = ry - cosA * perp;

    /* Width varies with intensity */
    const markW = CFG.VFX.tireMarkWidth * (0.7 + intensity * 0.6);
    const now   = performance.now() / 1000;

    if (this._prevL && this._prevR) {
      const push = (seg) => {
        this.segs.push(seg);
        if (this.segs.length > CFG.VFX.maxTireMarks) this.segs.shift();
      };
      push({ x0: this._prevL[0], y0: this._prevL[1], x1: lx,  y1: ly,  a: intensity, born: now, w: markW });
      push({ x0: this._prevR[0], y0: this._prevR[1], x1: rx2, y1: ry2, a: intensity, born: now, w: markW });
    }
    this._prevL = [lx,  ly];
    this._prevR = [rx2, ry2];
  }

  breakLine() { this._prevL = this._prevR = null; }

  draw(ctx) {
    if (this.segs.length === 0) return;
    const now    = performance.now() / 1000;
    const fade   = CFG.VFX.tireMarkFade;
    ctx.lineCap  = 'round';

    for (let i = 0; i < this.segs.length; i++) {
      const s   = this.segs[i];
      const age = now - s.born;
      if (age > fade) continue;
      const alpha = s.a * (1 - age / fade) * 0.85;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(15,10,8,${alpha})`;
      ctx.lineWidth   = s.w;
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
  }
}

/* ── Particle System (smoke + sparks + nitro flames) ───────── */
class Particle {
  constructor() { this.active = false; this.type = 'smoke'; }

  spawn(x, y, vx, vy, life, r, colorStr, type) {
    this.x    = x;  this.y    = y;
    this.vx   = vx; this.vy   = vy;
    this.life = life;
    this.maxLife = life;
    this.r    = r;
    this.color = colorStr;
    this.active = true;
    this.type = type || 'smoke';
  }
}

class ParticleSystem {
  constructor() {
    this.pool = [];
    for (let i = 0; i < CFG.VFX.maxParticles; i++) this.pool.push(new Particle());
  }

  _get() {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return null; // pool exhausted
  }

  /* Emit a puff of smoke from rear wheels */
  emitSmoke(car, count) {
    count = count || 2;
    const C    = CFG.CAR;
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle);
    const rx   = car.x - cosA * C.cgToRear;
    const ry   = car.y - sinA * C.cgToRear;

    for (let i = 0; i < count; i++) {
      const p = this._get(); if (!p) continue;
      const spread = (Math.random() - 0.5) * 2;
      const spd    = CFG.VFX.smokeSpeed * (0.6 + Math.random() * 0.8);
      const angle  = car.angle + Math.PI + spread * 0.6;
      /* Color varies: white-ish to gray based on drift intensity */
      const bright = Math.floor(160 + Math.random() * 80);
      p.spawn(
        rx + (Math.random() - 0.5) * C.width * 0.8,
        ry + (Math.random() - 0.5) * C.width * 0.8,
        car.vx * 0.15 + Math.cos(angle) * spd,
        car.vy * 0.15 + Math.sin(angle) * spd,
        CFG.VFX.smokeLifetime * (0.6 + Math.random() * 0.8),
        0.3 + Math.random() * 0.5,
        `rgb(${bright},${bright},${bright - 10})`,
        'smoke'
      );
    }
  }

  /* Emit sparks on wall hit */
  emitSparks(x, y, nx, ny, count) {
    count = count || 8;
    for (let i = 0; i < count; i++) {
      const p = this._get(); if (!p) continue;
      const angle = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 2.0;
      const spd   = 4 + Math.random() * 10;
      p.spawn(x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        CFG.VFX.sparkLifetime * (0.4 + Math.random()),
        0.08 + Math.random() * 0.1,
        `rgb(255,${Math.floor(160 + Math.random()*95)},50)`,
        'spark'
      );
    }
  }

  /* Emit small sparks from drifting tires scraping the ground */
  emitDriftSparks(car, count) {
    count = count || 3;
    const C    = CFG.CAR;
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle);
    const rx   = car.x - cosA * C.cgToRear;
    const ry   = car.y - sinA * C.cgToRear;

    for (let i = 0; i < count; i++) {
      const p = this._get(); if (!p) continue;
      const side = Math.random() > 0.5 ? 1 : -1;
      const perp = (C.width / 2 - 0.1) * side;
      const wx = rx - sinA * perp;
      const wy = ry + cosA * perp;
      const angle = car.angle + Math.PI + (Math.random() - 0.5) * 1.2;
      const spd = 2 + Math.random() * 5;
      p.spawn(wx, wy,
        car.vx * 0.3 + Math.cos(angle) * spd,
        car.vy * 0.3 + Math.sin(angle) * spd,
        0.15 + Math.random() * 0.3,
        0.04 + Math.random() * 0.06,
        `rgb(255,${Math.floor(200 + Math.random()*55)},${Math.floor(60 + Math.random()*80)})`,
        'spark'
      );
    }
  }

  /* Emit nitro flames from exhaust */
  emitNitroFlame(car, count) {
    count = count || 4;
    const C    = CFG.CAR;
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle);
    /* Exhaust at rear center */
    const ex   = car.x - cosA * (C.cgToRear + 0.3);
    const ey   = car.y - sinA * (C.cgToRear + 0.3);

    for (let i = 0; i < count; i++) {
      const p = this._get(); if (!p) continue;
      const spread = (Math.random() - 0.5) * 0.5;
      const angle  = car.angle + Math.PI + spread;
      const spd    = 6 + Math.random() * 8;
      /* Flame colors: blue core → orange tips */
      const t = Math.random();
      const r = Math.floor(50 + t * 200);
      const g = Math.floor(100 + t * 100);
      const b = Math.floor(255 - t * 100);
      p.spawn(
        ex + (Math.random() - 0.5) * 0.3,
        ey + (Math.random() - 0.5) * 0.3,
        car.vx * 0.2 + Math.cos(angle) * spd,
        car.vy * 0.2 + Math.sin(angle) * spd,
        0.15 + Math.random() * 0.25,
        0.12 + Math.random() * 0.15,
        `rgb(${r},${g},${b})`,
        'flame'
      );
    }
  }

  update(dt) {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      const dragFactor = p.type === 'spark' ? 0.94 : p.type === 'flame' ? 0.92 : 0.96;
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      if (p.type === 'smoke') p.r += dt * 0.7;
      else if (p.type === 'flame') p.r += dt * 0.4;
    }
  }

  draw(ctx) {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const t     = 1 - p.life / p.maxLife;
      let alpha;
      if (p.type === 'flame') {
        alpha = (1 - t * t) * 0.9;
      } else {
        alpha = (1 - t) * 0.55;
      }
      ctx.beginPath();
      ctx.fillStyle = p.color.replace('rgb', 'rgba').replace(')', `,${alpha})`);
      if (p.type === 'flame') {
        /* Additive-looking glow for flames */
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.r * 3;
      }
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.type === 'flame') {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }
  }
}
