/* ============================================================
   DRIFT KING — Canvas 2D Renderer
   Draws track, effects, car, speed lines each frame
   ============================================================ */

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /* ── Full frame render ──────────────────────────────────── */
  render(track, car, camera, tireMarks, particles) {
    const ctx  = this.ctx;
    const W    = this.canvas.width;
    const H    = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    /* ── World transform ── */
    ctx.save();
    camera.applyTransform(ctx, W, H);

    /* 1. Background (grass) */
    this._drawBackground(ctx, camera, W, H);

    /* 2. Track surface */
    this._drawTrack(ctx, track);

    /* 3. Tire marks (under car) */
    tireMarks.draw(ctx);

    /* 4. Particles */
    particles.draw(ctx);

    /* 5. Car */
    this._drawCar(ctx, car, track.accentColor);

    ctx.restore();

    /* 6. Speed lines (screen-space overlay) */
    if (car.speed > CFG.VFX.speedLineThreshold) {
      this._drawSpeedLines(ctx, W, H, car);
    }
  }

  /* ── Background ─────────────────────────────────────────── */
  _drawBackground(ctx, camera, W, H) {
    /* World-space bounding rect visible to camera */
    const inv  = 1 / camera.zoom;
    const half = Math.max(W, H) * inv * 1.2;

    /* Grass gradient */
    const cx = camera.x, cy = camera.y;
    ctx.fillStyle = '#0e1a0e';
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

    /* Subtle grid */
    const gridSize = 20;
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth   = 0.15;
    const lo = Math.floor((cx - half) / gridSize) * gridSize;
    const hi = Math.ceil( (cx + half) / gridSize) * gridSize;
    for (let gx = lo; gx <= hi; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, cy - half); ctx.lineTo(gx, cy + half); ctx.stroke();
    }
    const loY = Math.floor((cy - half) / gridSize) * gridSize;
    const hiY = Math.ceil( (cy + half) / gridSize) * gridSize;
    for (let gy = loY; gy <= hiY; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(cx - half, gy); ctx.lineTo(cx + half, gy); ctx.stroke();
    }
  }

  /* ── Track ───────────────────────────────────────────────── */
  _drawTrack(ctx, track) {
    const geo = track.geo;
    const m   = geo.count;
    if (m < 2) return;

    /* ─ Road surface ─ */
    ctx.beginPath();
    ctx.moveTo(geo.left[0][0], geo.left[0][1]);
    for (let i = 1; i < m; i++) ctx.lineTo(geo.left[i][0], geo.left[i][1]);
    for (let i = m - 1; i >= 0; i--) ctx.lineTo(geo.right[i][0], geo.right[i][1]);
    ctx.closePath();
    ctx.fillStyle = track.roadColor;
    ctx.fill();

    /* ─ Kerb stripes (every ~8 m segment along edge) ─ */
    this._drawKerbs(ctx, track);

    /* ─ Road edge lines ─ */
    ctx.strokeStyle = track.accentColor;
    ctx.lineWidth   = 0.18;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      i === 0 ? ctx.moveTo(geo.left[i][0], geo.left[i][1])
              : ctx.lineTo(geo.left[i][0], geo.left[i][1]);
    }
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      i === 0 ? ctx.moveTo(geo.right[i][0], geo.right[i][1])
              : ctx.lineTo(geo.right[i][0], geo.right[i][1]);
    }
    ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;

    /* ─ Centre dashes ─ */
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 0.12;
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const c = geo.center[i];
      i === 0 ? ctx.moveTo(c[0], c[1]) : ctx.lineTo(c[0], c[1]);
    }
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);

    /* ─ Start / Finish line ─ */
    this._drawStartLine(ctx, track);
  }

  _drawKerbs(ctx, track) {
    const geo    = track.geo;
    const m      = geo.count;
    const step   = 8;   // every ~step world-units
    const kw     = 1.0; // kerb width in metres

    for (let i = 0; i < m; i += step) {
      const j     = (i + step > m) ? m - 1 : i + step - 1;
      const even  = Math.floor(i / step) % 2 === 0;
      ctx.fillStyle = even ? 'rgba(220,20,20,0.65)' : 'rgba(255,255,255,0.55)';

      /* Left kerb strip */
      ctx.beginPath();
      ctx.moveTo(geo.left[i][0]  + geo.normals[i][0]  * kw, geo.left[i][1]  + geo.normals[i][1]  * kw);
      ctx.lineTo(geo.left[j][0]  + geo.normals[j][0]  * kw, geo.left[j][1]  + geo.normals[j][1]  * kw);
      ctx.lineTo(geo.left[j][0],  geo.left[j][1]);
      ctx.lineTo(geo.left[i][0],  geo.left[i][1]);
      ctx.closePath(); ctx.fill();

      /* Right kerb strip */
      ctx.beginPath();
      ctx.moveTo(geo.right[i][0] - geo.normals[i][0] * kw, geo.right[i][1] - geo.normals[i][1] * kw);
      ctx.lineTo(geo.right[j][0] - geo.normals[j][0] * kw, geo.right[j][1] - geo.normals[j][1] * kw);
      ctx.lineTo(geo.right[j][0], geo.right[j][1]);
      ctx.lineTo(geo.right[i][0], geo.right[i][1]);
      ctx.closePath(); ctx.fill();
    }
  }

  _drawStartLine(ctx, track) {
    const geo  = track.geo;
    const L    = geo.left[0],  R  = geo.right[0];
    const L1   = geo.left[1],  R1 = geo.right[1];
    const sq   = 1.2; // checker square size (m)

    /* Chequered pattern */
    const dx = R[0] - L[0], dy = R[1] - L[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const nx  = dx / len, ny = dy / len;
    const tx  = geo.tangents[0][0], ty = geo.tangents[0][1];

    const cols = Math.max(2, Math.round(len / sq));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 3; r++) {
        const even = (c + r) % 2 === 0;
        ctx.fillStyle = even ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';
        const ox = L[0] + nx * c * sq, oy = L[1] + ny * c * sq;
        ctx.beginPath();
        ctx.moveTo(ox           + tx*r*sq,       oy           + ty*r*sq);
        ctx.lineTo(ox + nx*sq   + tx*r*sq,       oy + ny*sq   + ty*r*sq);
        ctx.lineTo(ox + nx*sq   + tx*(r+1)*sq,   oy + ny*sq   + ty*(r+1)*sq);
        ctx.lineTo(ox           + tx*(r+1)*sq,   oy           + ty*(r+1)*sq);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  /* ── Car ──────────────────────────────────────────────────── */
  _drawCar(ctx, car, accentColor) {
    const C = CFG.CAR;
    const L = C.length / 2, W = C.width / 2;

    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle + Math.PI / 2); // nose points "up" in camera space

    /* Shadow */
    ctx.shadowColor  = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur   = 6 / Math.max(1, /* zoom */ 1);
    ctx.shadowOffsetX = 0.4;
    ctx.shadowOffsetY = 0.4;

    /* Body */
    const bodyGrad = ctx.createLinearGradient(-W, -L, W, L);
    bodyGrad.addColorStop(0,   accentColor + 'cc');
    bodyGrad.addColorStop(0.5, accentColor);
    bodyGrad.addColorStop(1,   accentColor + '99');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-W * 0.9, -L);
    ctx.lineTo( W * 0.9, -L);
    ctx.lineTo( W,        L * 0.1);
    ctx.lineTo( W * 0.85, L);
    ctx.lineTo(-W * 0.85, L);
    ctx.lineTo(-W,        L * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';

    /* Roof panel */
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(-W * 0.55, -L * 0.1);
    ctx.lineTo( W * 0.55, -L * 0.1);
    ctx.lineTo( W * 0.45,  L * 0.45);
    ctx.lineTo(-W * 0.45,  L * 0.45);
    ctx.closePath(); ctx.fill();

    /* Windshield */
    ctx.fillStyle = 'rgba(160,220,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(-W * 0.55, -L * 0.1);
    ctx.lineTo( W * 0.55, -L * 0.1);
    ctx.lineTo( W * 0.5,  -L * 0.55);
    ctx.lineTo(-W * 0.5,  -L * 0.55);
    ctx.closePath(); ctx.fill();

    /* Headlights */
    ctx.fillStyle = car.brakeInput > 0.1 ? 'rgba(255,50,50,0.95)' : 'rgba(255,255,200,0.9)';
    const hly = car.brakeInput > 0.1 ? L * 0.9 : -L * 0.92;
    ctx.fillRect(-W * 0.7, hly - 0.12, W * 0.5, 0.24);
    ctx.fillRect( W * 0.2, hly - 0.12, W * 0.5, 0.24);

    if (car.brakeInput > 0.1) {
      /* Brake glow */
      ctx.shadowColor = 'red';
      ctx.shadowBlur  = 8;
      ctx.fillStyle   = 'rgba(255,80,80,0.8)';
      ctx.fillRect(-W * 0.7, L * 0.88, W * 0.5, 0.24);
      ctx.fillRect( W * 0.2, L * 0.88, W * 0.5, 0.24);
      ctx.shadowColor = 'transparent';
    }

    /* Wheels */
    this._drawWheels(ctx, car, C, L, W);

    /* Neon underglow when drifting */
    if (car.isDrifting) {
      ctx.shadowColor = accentColor;
      ctx.shadowBlur  = 12;
      ctx.strokeStyle = accentColor + '88';
      ctx.lineWidth   = 0.1;
      ctx.beginPath();
      ctx.moveTo(-W * 0.9, -L);
      ctx.lineTo( W * 0.9, -L);
      ctx.lineTo( W,        L * 0.1);
      ctx.lineTo( W * 0.85, L);
      ctx.lineTo(-W * 0.85, L);
      ctx.lineTo(-W,        L * 0.1);
      ctx.closePath(); ctx.stroke();
      ctx.shadowColor = 'transparent';
    }

    /* Nitro glow (blue/purple fire when boosting) */
    if (car.nitroActive) {
      ctx.shadowColor = '#6600ff';
      ctx.shadowBlur  = 18;
      ctx.strokeStyle = 'rgba(100,0,255,0.6)';
      ctx.lineWidth   = 0.15;
      ctx.beginPath();
      ctx.moveTo(-W * 0.9, -L);
      ctx.lineTo( W * 0.9, -L);
      ctx.lineTo( W,        L * 0.1);
      ctx.lineTo( W * 0.85, L);
      ctx.lineTo(-W * 0.85, L);
      ctx.lineTo(-W,        L * 0.1);
      ctx.closePath(); ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      /* Exhaust glow */
      const flicker = 0.7 + Math.random() * 0.3;
      ctx.fillStyle = `rgba(100,50,255,${0.5 * flicker})`;
      ctx.shadowColor = '#6600ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(0, L + 0.3, W * 0.3, 0.5 * flicker, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  _drawWheels(ctx, car, C, L, W) {
    const ww = C.tireWidth || 0.22, wl = 0.52;
    const steer = car.steerInput * C.maxSteerAngle * 0.8;

    const drawWheel = (ox, oy, angle) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(angle);
      ctx.fillStyle = '#111';
      ctx.fillRect(-wl / 2, -ww / 2, wl, ww);
      ctx.fillStyle = '#444';
      ctx.fillRect(-wl / 2 + 0.04, -ww / 2 + 0.04, wl - 0.08, ww - 0.08);
      ctx.restore();
    };

    /* Front left / right */
    drawWheel(-W * 0.9, -L * 0.6, steer);
    drawWheel( W * 0.9, -L * 0.6, steer);
    /* Rear */
    drawWheel(-W * 0.9,  L * 0.62, 0);
    drawWheel( W * 0.9,  L * 0.62, 0);
  }

  /* ── Speed Lines (screen-space overlay) ──────────────────── */
  _drawSpeedLines(ctx, W, H, car) {
    const t = (car.speed - CFG.VFX.speedLineThreshold) /
              (CFG.CAR.maxSpeed - CFG.VFX.speedLineThreshold);
    const intensity = Math.min(1, Math.max(0, t));
    if (intensity <= 0) return;

    const cx = W / 2, cy = H / 2;
    const lineCount = Math.floor(8 + intensity * 20);
    const maxR = Math.sqrt(cx * cx + cy * cy);

    ctx.save();
    ctx.globalAlpha = intensity * 0.35;

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + performance.now() * 0.0003;
      const r1 = maxR * (0.4 + Math.random() * 0.2);
      const r2 = maxR * (0.75 + Math.random() * 0.25);

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);

      const isNitro = car.nitroActive;
      ctx.strokeStyle = isNitro ? 'rgba(100,50,255,0.6)' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth   = 1 + intensity * 2;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ── Minimap ──────────────────────────────────────────────── */
  drawMinimap(minimapCanvas, track, car) {
    const mc  = minimapCanvas;
    const mctx = mc.getContext('2d');
    const W   = mc.width, H = mc.height;
    mctx.clearRect(0, 0, W, H);

    /* Compute bounding box of track */
    const geo = track.geo;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < geo.count; i++) {
      const [cx, cy] = geo.center[i];
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    }
    const pad    = 12;
    const scaleX = (W - pad*2) / (maxX - minX);
    const scaleY = (H - pad*2) / (maxY - minY);
    const scale  = Math.min(scaleX, scaleY);
    const offX   = pad + (W - pad*2 - (maxX - minX) * scale) / 2;
    const offY   = pad + (H - pad*2 - (maxY - minY) * scale) / 2;

    const tx = (wx) => offX + (wx - minX) * scale;
    const ty = (wy) => offY + (wy - minY) * scale;

    /* Track outline */
    mctx.strokeStyle = track.accentColor + 'cc';
    mctx.lineWidth   = geo.width * scale * 0.9;
    mctx.lineCap     = 'round';
    mctx.lineJoin    = 'round';
    mctx.beginPath();
    for (let i = 0; i < geo.count; i++) {
      const [cx, cy] = geo.center[i];
      i === 0 ? mctx.moveTo(tx(cx), ty(cy)) : mctx.lineTo(tx(cx), ty(cy));
    }
    mctx.closePath(); mctx.stroke();

    /* Road fill */
    mctx.strokeStyle = track.roadColor;
    mctx.lineWidth   = geo.width * scale * 0.7;
    mctx.beginPath();
    for (let i = 0; i < geo.count; i++) {
      const [cx, cy] = geo.center[i];
      i === 0 ? mctx.moveTo(tx(cx), ty(cy)) : mctx.lineTo(tx(cx), ty(cy));
    }
    mctx.closePath(); mctx.stroke();

    /* Car dot */
    mctx.fillStyle   = '#00ffcc';
    mctx.shadowColor = '#00ffcc';
    mctx.shadowBlur  = 6;
    mctx.beginPath();
    mctx.arc(tx(car.x), ty(car.y), 4, 0, Math.PI * 2);
    mctx.fill();
    mctx.shadowBlur = 0;
  }
}
