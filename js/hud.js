/* ============================================================
   DRIFT KING — HUD (drawn on top of canvas, HTML overlay)
   With drift ratings, nitro bar, and near-miss indicators
   ============================================================ */

const HUD = (() => {

  /* Element refs — resolved lazily */
  let _els = null;

  function _init() {
    if (_els) return;
    _els = {
      scoreVal:    document.getElementById('hud-score-value'),
      comboVal:    document.getElementById('hud-combo-value'),
      driftInd:    document.getElementById('hud-drift-ind'),
      speedVal:    document.getElementById('hud-speed-value'),
      gearVal:     document.getElementById('hud-gear-value'),
      lapTime:     document.getElementById('hud-lap-time'),
      bestLap:     document.getElementById('hud-best-lap'),
      lapCount:    document.getElementById('hud-lap-count'),
      rpmGauge:    document.getElementById('hud-rpm-canvas'),
      minimap:     document.getElementById('hud-minimap'),
      nitroBar:    document.getElementById('hud-nitro-fill'),
      driftRating: document.getElementById('hud-drift-rating'),
      nearMiss:    document.getElementById('hud-near-miss'),
    };
  }

  function update(car, scoring, lapTracker, track, renderer, nowMs) {
    _init();
    if (!_els.scoreVal) return;

    /* Score */
    _els.scoreVal.textContent = DriftScoring.formatScore(scoring.displayScore);

    /* Multiplier / drift indicator */
    if (car.isDrifting) {
      _els.driftInd.classList.remove('hidden');
      _els.driftInd.textContent = `DRIFTING  ×${scoring.multiplier.toFixed(1)}`;
      _els.driftInd.style.opacity = 0.7 + 0.3 * Math.sin(Date.now() * 0.008);
    } else {
      _els.driftInd.classList.add('hidden');
    }

    /* Combo */
    if (scoring.multiplier > 1.05) {
      _els.comboVal.textContent = `×${scoring.multiplier.toFixed(1)}`;
      _els.comboVal.style.opacity = '1';
    } else {
      _els.comboVal.textContent = '';
    }

    /* Speed (m/s → km/h) */
    _els.speedVal.textContent = Math.round(car.speed * 3.6);

    /* Gear */
    _els.gearVal.textContent = car.gear;

    /* Lap time */
    const curMs = lapTracker.currentLapMs(nowMs);
    _els.lapTime.textContent  = DriftScoring.formatTime(curMs);
    _els.bestLap.textContent  = lapTracker.bestLap
                                ? 'BEST ' + DriftScoring.formatTime(lapTracker.bestLap)
                                : 'BEST --';
    const total = CFG.GAME.totalLaps;
    _els.lapCount.textContent = `LAP ${Math.min(lapTracker.laps + 1, total)} / ${total}`;

    /* RPM gauge */
    _drawRPMGauge(_els.rpmGauge, car.rpm, car.engineRev);

    /* Minimap */
    if (renderer && _els.minimap) {
      renderer.drawMinimap(_els.minimap, track, car);
    }

    /* Nitro bar */
    if (_els.nitroBar) {
      const pct = (car.nitro / CFG.NITRO.maxCharge) * 100;
      _els.nitroBar.style.width = pct + '%';
      if (car.nitroActive) {
        _els.nitroBar.style.background = 'linear-gradient(90deg, #6600ff, #cc44ff)';
        _els.nitroBar.style.boxShadow = '0 0 8px #6600ff';
      } else {
        _els.nitroBar.style.background = 'linear-gradient(90deg, #00aaff, #00ffcc)';
        _els.nitroBar.style.boxShadow = '0 0 4px #00aaff';
      }
    }

    /* Drift rating popup */
    if (_els.driftRating) {
      if (scoring.ratingTimer > 0 && scoring.driftRating) {
        _els.driftRating.textContent = scoring.driftRating + '!';
        _els.driftRating.classList.remove('hidden');
        const colors = {
          'GOOD': '#00ddff',
          'GREAT': '#ffdd00',
          'INSANE': '#ff5500',
          'LEGENDARY': '#ff00ff',
        };
        _els.driftRating.style.color = colors[scoring.driftRating] || '#fff';
        _els.driftRating.style.textShadow = `0 0 12px ${colors[scoring.driftRating] || '#fff'}`;
        const scale = 1 + Math.max(0, scoring.ratingTimer - 1.5) * 0.8;
        _els.driftRating.style.transform = `scale(${scale})`;
        _els.driftRating.style.opacity = Math.min(1, scoring.ratingTimer / 0.5);
      } else {
        _els.driftRating.classList.add('hidden');
      }
    }

    /* Near-miss indicator */
    if (_els.nearMiss) {
      if (scoring.nearMissTimer > 0) {
        _els.nearMiss.classList.remove('hidden');
        _els.nearMiss.style.opacity = Math.min(1, scoring.nearMissTimer / 0.3);
      } else {
        _els.nearMiss.classList.add('hidden');
      }
    }

    /* Weather indicator */
    const weatherEl = document.getElementById('hud-weather');
    if (weatherEl) {
      const w = CFG.ENV ? CFG.ENV.weather : 'dry';
      const icons = { dry: '☀', wet: '🌧', rain: '⛈' };
      weatherEl.textContent = (icons[w] || '') + ' ' + w.toUpperCase();
      weatherEl.className = 'hud-weather-' + w;
    }

    /* Tire temp indicator (optional - shows hottest tire) */
    const tireEl = document.getElementById('hud-tire-temp');
    if (tireEl && car.tireTempRL !== undefined) {
      const maxTemp = Math.max(car.tireTempFL, car.tireTempFR, car.tireTempRL, car.tireTempRR);
      const optimal = CFG.CAR.tireTempOptimal || 85;
      if (maxTemp < 40) {
        tireEl.textContent = '🥶 COLD TYRES';
        tireEl.style.color = '#88ccff';
      } else if (maxTemp < optimal - 10) {
        tireEl.textContent = `TYRES ${Math.round(maxTemp)}°C`;
        tireEl.style.color = '#aaddff';
      } else if (maxTemp < optimal + 20) {
        tireEl.textContent = `TYRES ${Math.round(maxTemp)}°C ✓`;
        tireEl.style.color = '#00ff88';
      } else if (maxTemp < 120) {
        tireEl.textContent = `⚠ TYRES ${Math.round(maxTemp)}°C`;
        tireEl.style.color = '#ffaa00';
      } else {
        tireEl.textContent = `🔥 TYRES ${Math.round(maxTemp)}°C`;
        tireEl.style.color = '#ff3300';
      }
      tireEl.classList.remove('hidden');
    }
  }

  function _drawRPMGauge(canvas, rpm, norm) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, r = W * 0.42;
    ctx.clearRect(0, 0, W, H);

    /* Background arc */
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 7;
    ctx.stroke();

    /* RPM arc */
    const end    = Math.PI * 0.75 + norm * Math.PI * 1.5;
    const color  = norm < 0.7 ? '#00ddff' : norm < 0.88 ? '#ffdd00' : '#ff3300';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, end);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 7;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    /* RPM text */
    ctx.fillStyle   = '#ffffff';
    ctx.font        = `bold ${W * 0.17}px "Rajdhani", sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(rpm / 100) + '00', cx, cy);

    /* Label */
    ctx.font        = `${W * 0.1}px "Rajdhani", sans-serif`;
    ctx.fillStyle   = 'rgba(255,255,255,0.5)';
    ctx.fillText('RPM', cx, cy + W * 0.22);
  }

  /* Show the countdown overlay */
  function showCountdown(n, onGo) {
    const el = document.getElementById('hud-countdown');
    const num = document.getElementById('hud-countdown-num');
    if (!el || !num) return;

    el.classList.remove('hidden');
    let count = n;

    const tick = () => {
      if (count > 0) {
        num.textContent = count;
        num.className   = 'countdown-num';
        void num.offsetWidth; // reflow for animation restart
        num.classList.add('countdown-pop');
        AudioManager.playBeep(count === 1 ? 880 : 440, 0.2);
        count--;
        setTimeout(tick, 900);
      } else {
        num.textContent = 'GO!';
        num.className   = 'countdown-num go';
        void num.offsetWidth;
        num.classList.add('countdown-pop');
        AudioManager.playBeep(1320, 0.3);
        setTimeout(() => {
          el.classList.add('hidden');
          if (onGo) onGo();
        }, 700);
      }
    };
    tick();
  }

  function hideCountdown() {
    const el = document.getElementById('hud-countdown');
    if (el) el.classList.add('hidden');
  }

  return { update, showCountdown, hideCountdown };
})();
