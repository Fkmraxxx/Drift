/* ============================================================
   DRIFT KING — Menu / Screen Manager
   ============================================================ */

const MenuManager = (() => {

  let _activeScreen = null;
  let _onPlay = null;        // callback(trackIndex, settings)
  let _selectedTrack = 0;

  const SETTINGS_DEF = [
    { key: 'power',    label: 'ENGINE POWER',   min: 1, max: 10, step: 1 },
    { key: 'grip',     label: 'TYRE GRIP',      min: 1, max: 10, step: 1 },
    { key: 'steering', label: 'STEERING',       min: 1, max: 10, step: 1 },
    { key: 'sfxVol',   label: 'SFX VOLUME',     min: 0, max: 1,  step: 0.1, format: v => Math.round(v * 100) + '%' },
  ];

  function init(onPlay) {
    _onPlay = onPlay;
    _buildTrackGrid();
    _buildSettings();
    _buildEnvSettings();
    _bindButtons();
    _updateBestScores();
    showScreen('menu');
  }

  /* ── Screen switching ─────────────────────────────────────── */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) { el.classList.add('active'); _activeScreen = id; }
  }

  function hideAll() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    _activeScreen = null;
  }

  /* ── Build track selection ───────────────────────────────── */
  function _buildTrackGrid() {
    const grid = document.getElementById('track-grid');
    if (!grid) return;
    grid.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const card = document.createElement('div');
      card.className = 'track-card' + (i === _selectedTrack ? ' selected' : '');
      card.innerHTML = `
        <div class="track-canvas-wrap">
          <canvas class="track-preview" data-idx="${i}" width="200" height="130"></canvas>
        </div>
        <div class="track-name">${t.name}</div>
        <div class="track-info">${Math.round(t.geo.totalLen)} m &nbsp;·&nbsp; ${t.width} m wide</div>
      `;
      card.addEventListener('click', () => {
        _selectedTrack = i;
        document.querySelectorAll('.track-card').forEach((c, j) =>
          c.classList.toggle('selected', j === i));
      });
      grid.appendChild(card);
      /* Draw preview after DOM insert */
      setTimeout(() => _drawTrackPreview(card.querySelector('.track-preview'), t), 50);
    });
  }

  function _drawTrackPreview(canvas, track) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const geo = track.geo;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < geo.count; i++) {
      const [cx, cy] = geo.center[i];
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    }
    const pad = 14;
    const scale = Math.min((W - pad*2)/(maxX-minX), (H - pad*2)/(maxY-minY));
    const ox = pad + (W - pad*2 - (maxX-minX)*scale)/2;
    const oy = pad + (H - pad*2 - (maxY-minY)*scale)/2;
    const tx = wx => ox + (wx - minX) * scale;
    const ty = wy => oy + (wy - minY) * scale;

    /* Background */
    ctx.fillStyle = '#0e1a0e';
    ctx.fillRect(0, 0, W, H);

    /* Track strip */
    ctx.strokeStyle = track.roadColor;
    ctx.lineWidth   = geo.width * scale;
    ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < geo.count; i++) {
      const [cx, cy] = geo.center[i];
      i === 0 ? ctx.moveTo(tx(cx), ty(cy)) : ctx.lineTo(tx(cx), ty(cy));
    }
    ctx.closePath(); ctx.stroke();

    /* Accent line */
    ctx.strokeStyle = track.accentColor + 'aa';
    ctx.lineWidth   = geo.width * scale * 0.15;
    ctx.beginPath();
    for (let i = 0; i < geo.count; i++) {
      const [cx, cy] = geo.center[i];
      i === 0 ? ctx.moveTo(tx(cx), ty(cy)) : ctx.lineTo(tx(cx), ty(cy));
    }
    ctx.closePath(); ctx.stroke();

    /* Start dot */
    ctx.fillStyle   = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.arc(tx(geo.center[0][0]), ty(geo.center[0][1]), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ── Build settings sliders ──────────────────────────────── */
  function _buildSettings() {
    const grid = document.getElementById('settings-grid');
    if (!grid) return;
    grid.innerHTML = '';
    SETTINGS_DEF.forEach(s => {
      const val = Storage.getSetting(s.key) !== undefined
                  ? Storage.getSetting(s.key) : (s.key === 'sfxVol' ? 0.7 : 5);
      const row = document.createElement('div');
      row.className = 'setting-row';
      const fmt = s.format || (v => Math.round(v));
      row.innerHTML = `
        <label class="setting-label">${s.label}</label>
        <div class="setting-control">
          <input type="range" min="${s.min}" max="${s.max}" step="${s.step}"
                 value="${val}" id="set-${s.key}" class="setting-slider" />
          <span class="setting-val" id="setval-${s.key}">${fmt(val)}</span>
        </div>
      `;
      grid.appendChild(row);
      const input  = row.querySelector('input');
      const valEl  = row.querySelector('.setting-val');
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        Storage.setSetting(s.key, v);
        valEl.textContent = fmt(v);
        if (s.key === 'sfxVol') AudioManager.setVolume(v);
      });
    });
  }

  /* ── Build ENV (weather / time of day) selectors ────────── */
  function _buildEnvSettings() {
    const grid = document.getElementById('env-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="font-size:.75rem;letter-spacing:2px;opacity:.55;margin-bottom:8px;">ENVIRONMENT</div>';

    const mkSelect = (label, key, options, currentVal) => {
      const row = document.createElement('div');
      row.className = 'setting-row';
      const optHtml = options.map(o => `<option value="${o.v}"${o.v === currentVal ? ' selected' : ''}>${o.l}</option>`).join('');
      row.innerHTML = `<label class="setting-label">${label}</label>
        <div class="setting-control">
          <select id="env-${key}" class="setting-slider" style="background:#1a1e2e;color:#fff;border:1px solid #334;padding:4px 8px;font-family:inherit;">
            ${optHtml}
          </select>
        </div>`;
      grid.appendChild(row);
      row.querySelector('select').addEventListener('change', (e) => {
        CFG.ENV[key] = e.target.value;
        Storage.setSetting('env_' + key, e.target.value);
      });
    };

    const savedTod = Storage.getSetting('env_timeOfDay') || 'day';
    const savedWx  = Storage.getSetting('env_weather')   || 'dry';
    if (savedTod) CFG.ENV.timeOfDay = savedTod;
    if (savedWx)  CFG.ENV.weather   = savedWx;

    mkSelect('TIME OF DAY', 'timeOfDay', [
      { v: 'day',   l: '☀  DAY'   },
      { v: 'dusk',  l: '🌇 DUSK'  },
      { v: 'night', l: '🌙 NIGHT' },
    ], savedTod);

    mkSelect('WEATHER', 'weather', [
      { v: 'dry',  l: '☀  DRY'  },
      { v: 'wet',  l: '🌧 WET'  },
      { v: 'rain', l: '⛈ RAIN' },
    ], savedWx);
  }

  /* ── Wire up all buttons ─────────────────────────────────── */
  function _bindButtons() {
    _btn('btn-play',    () => _startGame());
    _btn('btn-tracks',  () => showScreen('tracks'));
    _btn('btn-car',     () => showScreen('car'));
    _btn('btn-controls',() => showScreen('controls'));
    _btn('btn-fullscreen', _toggleFullscreen);
    _btn('btn-track-back', () => showScreen('menu'));
    _btn('btn-car-back',   () => showScreen('menu'));
    _btn('btn-ctrl-back',  () => showScreen('menu'));

    /* In-game */
    _btn('btn-resume',  () => { if (_onPlay) _onPlay('resume'); });
    _btn('btn-restart', () => { if (_onPlay) _onPlay('restart'); });
    _btn('btn-quit',    () => { if (_onPlay) _onPlay('quit'); });
    _btn('btn-race-restart', () => { if (_onPlay) _onPlay('restart'); });
    _btn('btn-race-quit',    () => { if (_onPlay) _onPlay('quit'); });
  }

  function _btn(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  function _startGame() {
    const settings = {
      power:    Storage.getSetting('power')    || 5,
      grip:     Storage.getSetting('grip')     || 5,
      steering: Storage.getSetting('steering') || 5,
    };
    hideAll();
    if (_onPlay) _onPlay('play', _selectedTrack, settings);
  }

  function _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }

  function _updateBestScores() {
    const el = document.getElementById('best-scores');
    if (!el) return;
    let html = '';
    TRACKS.forEach(t => {
      const lap   = Storage.getBestLap(t.id);
      const score = Storage.getBestScore(t.id);
      html += `<div class="best-row">
        <span class="best-track">${t.name}</span>
        <span class="best-info">${lap ? DriftScoring.formatTime(lap) : '--:--.---'}
          &nbsp; ${DriftScoring.formatScore(score)} pts</span>
      </div>`;
    });
    el.innerHTML = html;
  }

  /* ── Race-end screen ─────────────────────────────────────── */
  function showRaceEnd(lapTracker, scoring, track) {
    const el = document.getElementById('race-end-panel');
    if (!el) return;
    const stats = document.getElementById('race-stats');
    if (stats) {
      const isNewLap   = lapTracker.bestLap && Storage.submitLap(track.id, lapTracker.bestLap);
      const isNewScore = Storage.submitScore(track.id, scoring.totalScore);
      _updateBestScores();

      let html = `<div class="stat-row"><span>Total Score</span><span class="stat-val">${DriftScoring.formatScore(scoring.totalScore)}</span></div>`;
      html += `<div class="stat-row"><span>Best Lap</span><span class="stat-val">${DriftScoring.formatTime(lapTracker.bestLap)}</span></div>`;
      lapTracker.lapTimes.forEach((t, i) => {
        html += `<div class="stat-row"><span>Lap ${i+1}</span><span class="stat-val">${DriftScoring.formatTime(t)}</span></div>`;
      });
      if (isNewLap)   html += `<div class="new-record">🏆 NEW LAP RECORD!</div>`;
      if (isNewScore) html += `<div class="new-record">🏆 NEW SCORE RECORD!</div>`;
      stats.innerHTML = html;
    }
    el.classList.remove('hidden');
  }

  function hideRaceEnd() {
    const el = document.getElementById('race-end-panel');
    if (el) el.classList.add('hidden');
  }

  function showPause()  { const el = document.getElementById('pause-panel'); if(el) el.classList.remove('hidden'); }
  function hidePause()  { const el = document.getElementById('pause-panel'); if(el) el.classList.add('hidden');    }

  return { init, showScreen, hideAll, showRaceEnd, hideRaceEnd, showPause, hidePause };
})();
