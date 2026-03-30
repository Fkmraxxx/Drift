/* ============================================================
   DRIFT KING — Canvas 2D Renderer
   AE86 car shape · dynamic headlights · rain · parallax · road texture
   ============================================================ */

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
    /* Rain drop pool (screen-space) */
    this._rainDrops = [];
    this._initRain();
    /* Parallax layer offsets */
    this._parallaxX = 0;
    this._parallaxY = 0;
    /* Cached road texture offscreen canvas */
    this._roadTexture = null;
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this._roadTexture  = null; // invalidate cache
  }

  _initRain() {
    this._rainDrops = [];
    const count = (CFG.ENV && CFG.ENV.rainDrops) || 200;
    for (let i = 0; i < count; i++) {
      this._rainDrops.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        len: 6 + Math.random() * 10,
        speed: 300 + Math.random() * 200,
        alpha: 0.2 + Math.random() * 0.5,
      });
    }
  }

  /* ── Full frame render ──────────────────────────────────── */
  render(track, car, camera, tireMarks, particles) {
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;

    const env     = CFG.ENV || { timeOfDay: 'day', weather: 'dry' };
    const tod     = env.timeOfDay;
    const ambient = (env.ambientLight || {})[tod] || {};
    const isNight = (tod === 'night');
    const isDusk  = (tod === 'dusk');
    const isRain  = (env.weather === 'rain' || env.weather === 'wet');

    /* ── Sky / background fill ── */
    const sky = ambient.sky || '#3a6a9a';
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* ── Parallax background (mountains / city silhouette) ── */
    this._drawParallax(ctx, W, H, camera, tod);

    /* ── World transform ── */
    ctx.save();
    camera.applyTransform(ctx, W, H);

    /* 1. Ground */
    this._drawBackground(ctx, camera, W, H, ambient);

    /* 2. Track surface + texture */
    this._drawTrack(ctx, track);

    /* 3. Tire marks */
    tireMarks.draw(ctx);

    /* 4. Headlight cones (world-space, under car) */
    if (isNight || isDusk) {
      this._drawHeadlightCones(ctx, car, isNight ? 1.0 : 0.6);
    }

    /* 5. Particles */
    particles.draw(ctx);

    /* 6. Car */
    this._drawCar(ctx, car, track.accentColor, isNight || isDusk);

    ctx.restore();

    /* 7. Night overlay (dim everything) */
    if (isNight) {
      ctx.fillStyle = 'rgba(0,5,20,0.35)';
      ctx.fillRect(0, 0, W, H);
    } else if (isDusk) {
      ctx.fillStyle = 'rgba(60,20,0,0.15)';
      ctx.fillRect(0, 0, W, H);
    }

    /* 8. Speed lines */
    if (car.speed > CFG.VFX.speedLineThreshold) {
      this._drawSpeedLines(ctx, W, H, car);
    }

    /* 9. Rain overlay */
    if (isRain) {
      this._drawRain(ctx, W, H, car.speed);
    }

    /* 10. Wet-road gloss overlay on screen bottom */
    if (isRain || env.weather === 'wet') {
      ctx.fillStyle = 'rgba(100,130,180,0.07)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ── Parallax background ─────────────────────────────────── */
  _drawParallax(ctx, W, H, camera, tod) {
    /* Compute camera world movement for parallax offset */
    const px = -(camera.x * 0.06) % W;
    const py = -(camera.y * 0.04);

    const isNight = tod === 'night';
    const isDusk  = tod === 'dusk';

    /* Horizon gradient */
    const horizY = H * 0.38;
    const horizGrad = ctx.createLinearGradient(0, horizY - 60, 0, horizY + 30);
    if (isNight) {
      horizGrad.addColorStop(0, '#08152e');
      horizGrad.addColorStop(1, '#0d1a10');
    } else if (isDusk) {
      horizGrad.addColorStop(0, '#c05018');
      horizGrad.addColorStop(1, '#1e1408');
    } else {
      horizGrad.addColorStop(0, '#5a9bd5');
      horizGrad.addColorStop(1, '#3d6e2a');
    }
    ctx.fillStyle = horizGrad;
    ctx.fillRect(0, horizY - 60, W, 90);

    /* Distant mountains – layer 1 (slowest) */
    const mColor1 = isNight ? '#0d1a2e' : isDusk ? '#6a2510' : '#4a6a88';
    ctx.fillStyle = mColor1;
    ctx.beginPath();
    ctx.moveTo(0, horizY + 10);
    const mPoints1 = [0.0, 0.88, 0.12, 0.55, 0.22, 0.72, 0.35, 0.42, 0.45, 0.68, 0.55, 0.38, 0.65, 0.62, 0.75, 0.45, 0.85, 0.70, 1.0, 0.80];
    const offX1 = ((px * 0.25) % W + W) % W;
    for (let i = 0; i < mPoints1.length - 1; i += 2) {
      ctx.lineTo(((mPoints1[i] * W * 2.0 + offX1) % (W * 2)) - W * 0.5, horizY - mPoints1[i+1] * 80 + py * 0.02);
    }
    ctx.lineTo(W, horizY + 10);
    ctx.closePath(); ctx.fill();

    /* Closer hills – layer 2 */
    const mColor2 = isNight ? '#0a1408' : isDusk ? '#2a1808' : '#2d5a1a';
    ctx.fillStyle = mColor2;
    ctx.beginPath();
    ctx.moveTo(0, horizY + 15);
    const offX2 = ((px * 0.5) % W + W) % W;
    const hPoints = [0.0, 0.3, 0.08, 0.55, 0.15, 0.25, 0.25, 0.50, 0.38, 0.20, 0.50, 0.45, 0.62, 0.18, 0.72, 0.40, 0.85, 0.22, 1.0, 0.35];
    for (let i = 0; i < hPoints.length - 1; i += 2) {
      ctx.lineTo(((hPoints[i] * W * 2.0 + offX2) % (W * 2)) - W * 0.5, horizY - hPoints[i+1] * 55 + py * 0.06);
    }
    ctx.lineTo(W, horizY + 15);
    ctx.closePath(); ctx.fill();

    /* Night: stars */
    if (isNight) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      /* Use deterministic pseudo-random for stable stars */
      for (let i = 0; i < 80; i++) {
        const sx = (Math.sin(i * 137.508) * 0.5 + 0.5) * W;
        const sy = (Math.sin(i * 97.31) * 0.5 + 0.5) * (horizY - 20);
        const sr = 0.5 + (Math.sin(i * 53.7) * 0.5 + 0.5) * 1.0;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Ground plane (below horizon) */
    const groundColor = isNight ? '#080f06' : isDusk ? '#1e1408' : '#2d5a1a';
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, horizY + 15, W, H - horizY - 15);
  }

  /* ── World-space background ──────────────────────────────── */
  _drawBackground(ctx, camera, W, H, ambient) {
    const inv  = 1 / camera.zoom;
    const half = Math.max(W, H) * inv * 1.3;
    const cx   = camera.x, cy = camera.y;
    const ground = (ambient && ambient.ground) || '#0e1a0e';
    ctx.fillStyle = ground;
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

    /* Subtle grid */
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth   = 0.15;
    const gridSize = 20;
    const lo  = Math.floor((cx - half) / gridSize) * gridSize;
    const hi  = Math.ceil( (cx + half) / gridSize) * gridSize;
    const loY = Math.floor((cy - half) / gridSize) * gridSize;
    const hiY = Math.ceil( (cy + half) / gridSize) * gridSize;
    for (let gx = lo; gx <= hi; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, cy - half); ctx.lineTo(gx, cy + half); ctx.stroke();
    }
    for (let gy = loY; gy <= hiY; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(cx - half, gy); ctx.lineTo(cx + half, gy); ctx.stroke();
    }
  }

  /* ── Track ───────────────────────────────────────────────── */
  _drawTrack(ctx, track) {
    const geo = track.geo;
    const m   = geo.count;
    if (m < 2) return;
    const env = CFG.ENV || {};
    const tod = env.timeOfDay || 'day';

    /* Road surface fill */
    ctx.beginPath();
    ctx.moveTo(geo.left[0][0], geo.left[0][1]);
    for (let i = 1; i < m; i++) ctx.lineTo(geo.left[i][0], geo.left[i][1]);
    for (let i = m - 1; i >= 0; i--) ctx.lineTo(geo.right[i][0], geo.right[i][1]);
    ctx.closePath();
    ctx.fillStyle = track.roadColor;
    ctx.fill();

    /* Road texture strips (simulated asphalt pattern) */
    this._drawRoadTexture(ctx, track, tod);

    /* Kerbs */
    this._drawKerbs(ctx, track);

    /* Edge lines */
    ctx.strokeStyle = track.accentColor;
    ctx.lineWidth   = 0.18;
    ctx.globalAlpha = 0.7;
    for (const edge of [geo.left, geo.right]) {
      ctx.beginPath();
      for (let i = 0; i < m; i++) {
        i === 0 ? ctx.moveTo(edge[i][0], edge[i][1]) : ctx.lineTo(edge[i][0], edge[i][1]);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* Centre dashes */
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

    /* Start/finish */
    this._drawStartLine(ctx, track);
  }

  _drawRoadTexture(ctx, track, tod) {
    /* Draw subtle lane markings / texture lines every ~30m along track */
    const geo = track.geo;
    const m   = geo.count;
    const step = 18; // segments between markings
    const alpha = tod === 'night' ? 0.06 : 0.08;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth   = 0.06;
    for (let i = 0; i < m; i += step) {
      const n  = geo.normals[i];
      const c  = geo.center[i];
      const hw = geo.width * 0.25;
      /* Two lane marker lines at 1/4 and 3/4 width */
      for (const side of [-1, 1]) {
        const lx = c[0] + n[0] * hw * side;
        const ly = c[1] + n[1] * hw * side;
        const j  = (i + step) % m;
        const c2 = geo.center[j];
        const n2 = geo.normals[j];
        const lx2 = c2[0] + n2[0] * hw * side;
        const ly2 = c2[1] + n2[1] * hw * side;
        ctx.beginPath();
        ctx.moveTo(lx, ly); ctx.lineTo(lx2, ly2);
        ctx.stroke();
      }
    }
  }

  _drawKerbs(ctx, track) {
    const geo   = track.geo;
    const m     = geo.count;
    const step  = 8;
    const kw    = 1.0;
    for (let i = 0; i < m; i += step) {
      const j    = (i + step > m) ? m - 1 : i + step - 1;
      const even = Math.floor(i / step) % 2 === 0;
      ctx.fillStyle = even ? 'rgba(220,20,20,0.65)' : 'rgba(255,255,255,0.55)';
      for (const [edge, sign] of [[geo.left, 1], [geo.right, -1]]) {
        ctx.beginPath();
        ctx.moveTo(edge[i][0] + geo.normals[i][0] * kw * sign, edge[i][1] + geo.normals[i][1] * kw * sign);
        ctx.lineTo(edge[j][0] + geo.normals[j][0] * kw * sign, edge[j][1] + geo.normals[j][1] * kw * sign);
        ctx.lineTo(edge[j][0], edge[j][1]);
        ctx.lineTo(edge[i][0], edge[i][1]);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  _drawStartLine(ctx, track) {
    const geo = track.geo;
    const L   = geo.left[0],  R  = geo.right[0];
    const sq  = 1.2;
    const dx  = R[0] - L[0], dy = R[1] - L[1];
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
        ctx.moveTo(ox + tx*r*sq,          oy + ty*r*sq);
        ctx.lineTo(ox + nx*sq + tx*r*sq,  oy + ny*sq + ty*r*sq);
        ctx.lineTo(ox + nx*sq + tx*(r+1)*sq, oy + ny*sq + ty*(r+1)*sq);
        ctx.lineTo(ox + tx*(r+1)*sq,      oy + ty*(r+1)*sq);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  /* ── Headlight cones (world-space) ───────────────────────── */
  _drawHeadlightCones(ctx, car, intensity) {
    const C    = CFG.CAR;
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle);
    const frontX = car.x + cosA * C.cgToFront * 0.9;
    const frontY = car.y + sinA * C.cgToFront * 0.9;
    const coneLen = 22 * intensity;
    const coneW   = 8  * intensity;

    for (const side of [-1, 1]) {
      const hx = frontX - sinA * C.width * 0.35 * side;
      const hy = frontY + cosA * C.width * 0.35 * side;
      const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, coneLen);
      grad.addColorStop(0, `rgba(255,255,200,${0.22 * intensity})`);
      grad.addColorStop(0.4, `rgba(255,255,180,${0.1 * intensity})`);
      grad.addColorStop(1, 'rgba(255,255,150,0)');
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(car.angle - Math.PI / 2); // point forward
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, coneLen, -0.45, 0.45);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  /* ── Car (AE86 Levin/Trueno shape) ───────────────────────── */
  _drawCar(ctx, car, accentColor, headlightsOn) {
    const C = CFG.CAR;
    const L = C.length / 2, W = C.width / 2;

    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle + Math.PI / 2);

    /* Shadow */
    ctx.shadowColor   = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur    = 8;
    ctx.shadowOffsetX = 0.5; ctx.shadowOffsetY = 0.5;

    /* ── AE86 Body (boxy 80s coupe profile) ── */
    const bodyGrad = ctx.createLinearGradient(-W, -L, W, L);
    bodyGrad.addColorStop(0,   accentColor + 'ee');
    bodyGrad.addColorStop(0.45, accentColor);
    bodyGrad.addColorStop(1,   accentColor + 'aa');
    ctx.fillStyle = bodyGrad;

    ctx.beginPath();
    ctx.moveTo(-W * 0.82, -L * 0.96);        // front-left
    ctx.lineTo( W * 0.82, -L * 0.96);        // front-right
    ctx.lineTo( W * 0.88,  L * 0.10);        // mid-right (widest)
    ctx.lineTo( W * 0.80,  L * 0.96);        // rear-right
    ctx.lineTo(-W * 0.80,  L * 0.96);        // rear-left
    ctx.lineTo(-W * 0.88,  L * 0.10);        // mid-left
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    /* Front fascia line (characteristic AE86 split front) */
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth   = 0.12;
    ctx.beginPath();
    ctx.moveTo(-W * 0.82, -L * 0.72);
    ctx.lineTo( W * 0.82, -L * 0.72);
    ctx.stroke();

    /* Roof */
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.moveTo(-W * 0.58, -L * 0.05);
    ctx.lineTo( W * 0.58, -L * 0.05);
    ctx.lineTo( W * 0.52,  L * 0.50);
    ctx.lineTo(-W * 0.52,  L * 0.50);
    ctx.closePath(); ctx.fill();

    /* Windshield */
    ctx.fillStyle = 'rgba(160,220,255,0.40)';
    ctx.beginPath();
    ctx.moveTo(-W * 0.58, -L * 0.05);
    ctx.lineTo( W * 0.58, -L * 0.05);
    ctx.lineTo( W * 0.50, -L * 0.62);
    ctx.lineTo(-W * 0.50, -L * 0.62);
    ctx.closePath(); ctx.fill();

    /* Rear window */
    ctx.fillStyle = 'rgba(140,200,240,0.30)';
    ctx.beginPath();
    ctx.moveTo(-W * 0.52,  L * 0.50);
    ctx.lineTo( W * 0.52,  L * 0.50);
    ctx.lineTo( W * 0.44,  L * 0.88);
    ctx.lineTo(-W * 0.44,  L * 0.88);
    ctx.closePath(); ctx.fill();

    /* ── Pop-up headlights (AE86 Trueno style) ── */
    if (headlightsOn) {
      ctx.fillStyle = 'rgba(255,255,200,0.95)';
      ctx.shadowColor = 'rgba(255,255,180,0.9)';
      ctx.shadowBlur = 10;
      ctx.fillRect(-W * 0.72, -L * 0.98, W * 0.32, 0.22);
      ctx.fillRect( W * 0.40, -L * 0.98, W * 0.32, 0.22);
      ctx.shadowBlur = 0;
    } else {
      const braking = car.brakeInput > 0.1;
      ctx.fillStyle = braking ? 'rgba(255,50,50,0.1)' : 'rgba(255,255,200,0.85)';
      ctx.fillRect(-W * 0.72, -L * 0.98, W * 0.30, 0.18);
      ctx.fillRect( W * 0.42, -L * 0.98, W * 0.30, 0.18);

      if (braking) {
        ctx.shadowColor = 'red';
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = 'rgba(255,30,30,0.95)';
        ctx.fillRect(-W * 0.70,  L * 0.88, W * 0.30, 0.18);
        ctx.fillRect( W * 0.40,  L * 0.88, W * 0.30, 0.18);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(200,30,30,0.55)';
        ctx.fillRect(-W * 0.70,  L * 0.88, W * 0.30, 0.18);
        ctx.fillRect( W * 0.40,  L * 0.88, W * 0.30, 0.18);
      }
    }

    /* Side sills */
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = 0.1;
    ctx.beginPath();
    ctx.moveTo(-W * 0.88, -L * 0.05);
    ctx.lineTo(-W * 0.85,  L * 0.60);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( W * 0.88, -L * 0.05);
    ctx.lineTo( W * 0.85,  L * 0.60);
    ctx.stroke();

    /* Wheels */
    this._drawWheels(ctx, car, C, L, W);

    /* Neon underglow when drifting */
    if (car.isDrifting) {
      ctx.shadowColor = accentColor;
      ctx.shadowBlur  = 14;
      ctx.strokeStyle = accentColor + '88';
      ctx.lineWidth   = 0.1;
      ctx.beginPath();
      ctx.moveTo(-W * 0.82, -L * 0.96);
      ctx.lineTo( W * 0.82, -L * 0.96);
      ctx.lineTo( W * 0.88,  L * 0.10);
      ctx.lineTo( W * 0.80,  L * 0.96);
      ctx.lineTo(-W * 0.80,  L * 0.96);
      ctx.lineTo(-W * 0.88,  L * 0.10);
      ctx.closePath(); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    /* Nitro glow */
    if (car.nitroActive) {
      ctx.shadowColor = '#6600ff';
      ctx.shadowBlur  = 20;
      ctx.strokeStyle = 'rgba(100,0,255,0.65)';
      ctx.lineWidth   = 0.15;
      ctx.beginPath();
      ctx.moveTo(-W * 0.82, -L * 0.96);
      ctx.lineTo( W * 0.82, -L * 0.96);
      ctx.lineTo( W * 0.88,  L * 0.10);
      ctx.lineTo( W * 0.80,  L * 0.96);
      ctx.lineTo(-W * 0.80,  L * 0.96);
      ctx.lineTo(-W * 0.88,  L * 0.10);
      ctx.closePath(); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      const flicker = 0.7 + Math.random() * 0.3;
      ctx.fillStyle = `rgba(100,50,255,${0.5 * flicker})`;
      ctx.shadowColor = '#6600ff'; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(0, L + 0.3, W * 0.3, 0.5 * flicker, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  _drawWheels(ctx, car, C, L, W) {
    const ww = C.tireWidth || 0.22, wl = 0.50;
    const steer = car.steerInput * C.maxSteerAngle * 0.85;
    const slipMag  = Math.min(1, Math.abs(car.rearSlipAngle || 0) * 2);
    const rimColor = '#333';

    const drawWheel = (ox, oy, angle, slip) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(angle);
      ctx.fillStyle = '#111';
      ctx.fillRect(-wl / 2, -ww / 2, wl, ww);
      ctx.fillStyle = rimColor;
      ctx.fillRect(-wl / 2 + 0.05, -ww / 2 + 0.05, wl - 0.10, ww - 0.10);
      if (car.brakeInput > 0.5 && car.speed > 5) {
        ctx.fillStyle = 'rgba(255,80,0,0.4)';
        ctx.fillRect(-wl / 2 + 0.08, -ww / 2 + 0.08, wl - 0.16, ww - 0.16);
      }
      ctx.restore();
    };

    drawWheel(-W * 0.88, -L * 0.60, steer, 0);
    drawWheel( W * 0.88, -L * 0.60, steer, 0);
    drawWheel(-W * 0.88,  L * 0.62, 0, slipMag);
    drawWheel( W * 0.88,  L * 0.62, 0, slipMag);
  }

  /* ── Speed lines ─────────────────────────────────────────── */
  _drawSpeedLines(ctx, W, H, car) {
    const t = (car.speed - CFG.VFX.speedLineThreshold) /
              (CFG.CAR.maxSpeed - CFG.VFX.speedLineThreshold);
    const intensity = Math.min(1, Math.max(0, t));
    if (intensity <= 0) return;
    const cx = W / 2, cy = H / 2;
    const lineCount = Math.floor(8 + intensity * 22);
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
      ctx.strokeStyle = car.nitroActive ? 'rgba(100,50,255,0.6)' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth   = 1 + intensity * 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ── Rain overlay (screen-space) ────────────────────────── */
  _drawRain(ctx, W, H, carSpeed) {
    const env   = CFG.ENV || {};
    const angle = env.rainAngle || 0.2;
    const speed = (env.rainSpeed || 440) + carSpeed * 2;
    const dt    = 1 / 60; // approx
    const sinA  = Math.sin(angle), cosA = Math.cos(angle);

    ctx.save();
    ctx.strokeStyle = 'rgba(180,200,255,0.35)';
    ctx.lineWidth   = 0.9;

    for (let i = 0; i < this._rainDrops.length; i++) {
      const d = this._rainDrops[i];
      d.x += sinA * speed * dt;
      d.y += cosA * speed * dt;
      if (d.y > H + 20) { d.y = -20; d.x = Math.random() * W; }
      if (d.x > W + 20) { d.x = -20; }
      ctx.globalAlpha = d.alpha;
      const ex = d.x - sinA * d.len, ey = d.y - cosA * d.len;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ── Minimap ──────────────────────────────────────────────── */
  drawMinimap(minimapCanvas, track, car) {
    const mc   = minimapCanvas;
    const mctx = mc.getContext('2d');
    const W = mc.width, H = mc.height;
    mctx.clearRect(0, 0, W, H);

    const geo = track.geo;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < geo.count; i++) {
      const [cx, cy] = geo.center[i];
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    }
    const pad  = 12;
    const scX  = (W - pad*2) / (maxX - minX);
    const scY  = (H - pad*2) / (maxY - minY);
    const scale = Math.min(scX, scY);
    const offX  = pad + (W - pad*2 - (maxX - minX) * scale) / 2;
    const offY  = pad + (H - pad*2 - (maxY - minY) * scale) / 2;

    const tx = (wx) => offX + (wx - minX) * scale;
    const ty = (wy) => offY + (wy - minY) * scale;

    /* Track outline */
    mctx.strokeStyle = track.accentColor + 'cc';
    mctx.lineWidth   = geo.width * scale * 0.9;
    mctx.lineCap     = 'round'; mctx.lineJoin = 'round';
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

    /* Turn indicator arrows */
    this._drawMinimapTurnArrows(mctx, geo, tx, ty, scale, track.accentColor);

    /* Start line mark */
    mctx.fillStyle   = 'rgba(255,255,255,0.6)';
    mctx.fillRect(tx(geo.center[0][0]) - 2, ty(geo.center[0][1]) - 2, 4, 4);

    /* Car dot — directional triangle */
    const carMX = tx(car.x), carMY = ty(car.y);
    mctx.save();
    mctx.translate(carMX, carMY);
    mctx.rotate(car.angle + Math.PI / 2);
    mctx.fillStyle   = '#00ffcc';
    mctx.shadowColor = '#00ffcc';
    mctx.shadowBlur  = 8;
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo( 4, 5);
    mctx.lineTo(-4, 5);
    mctx.closePath();
    mctx.fill();
    mctx.shadowBlur = 0;
    mctx.restore();
  }

  _drawMinimapTurnArrows(mctx, geo, tx, ty, scale, color) {
    const m     = geo.count;
    const step  = Math.max(4, Math.floor(m / 20));
    const arrowEvery = 3;
    let sampleIdx = 0;

    for (let i = 0; i < m; i += step) {
      const prev = (i - step + m) % m;
      const t1x = geo.tangents[i][0]    - geo.tangents[prev][0];
      const t1y = geo.tangents[i][1]    - geo.tangents[prev][1];
      const curv = Math.sqrt(t1x*t1x + t1y*t1y);
      if (curv < 0.05) { sampleIdx++; continue; }

      if (sampleIdx % arrowEvery !== 0) { sampleIdx++; continue; }

      const cx = tx(geo.center[i][0]);
      const cy = ty(geo.center[i][1]);
      const tang = geo.tangents[i];
      const aAngle = Math.atan2(tang[1], tang[0]);
      const cross = geo.tangents[prev][0] * geo.tangents[i][1] - geo.tangents[prev][1] * geo.tangents[i][0];
      const turnDir = cross > 0 ? 1 : -1;

      mctx.save();
      mctx.translate(cx, cy);
      mctx.rotate(aAngle + (turnDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5));
      mctx.strokeStyle = color + 'bb';
      mctx.lineWidth   = 1.0;
      mctx.globalAlpha = Math.min(1, curv * 6);
      mctx.beginPath();
      mctx.moveTo(0,  3);
      mctx.lineTo(-2, 0);
      mctx.lineTo( 2, 0);
      mctx.closePath();
      mctx.fillStyle = color + 'bb';
      mctx.fill();
      mctx.globalAlpha = 1;
      mctx.restore();

      sampleIdx++;
    }
  }
}
