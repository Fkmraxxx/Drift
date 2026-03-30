/* ============================================================
   DRIFT KING — Audio Engine  (Sample-based, Hellcat SFX)
   Dodge Charger SRT Hellcat Redeye Widebody sound pack
   with RPM-crossfaded engine layers, looping effects,
   and one-shot samples via Web Audio API
   ============================================================ */

const AudioManager = (() => {
  let ctx  = null;
  let vol  = 0.7;
  let _started = false;
  let _ready   = false;
  let _masterGain = null;

  const SFX = 'sfx/hellcat/';

  /* ── Decoded AudioBuffers keyed by name ────────────────────── */
  const buf = {};

  /* ── Engine RPM layers ─────────────────────────────────────── */
  const ENG_RPMS = [891, 1636, 2451, 3812, 4363, 5443, 6207];
  const engLayers = [];  /* { srcA, srcExh, gainA, gainExh } per RPM point */

  /* ── Continuous-loop nodes ─────────────────────────────────── */
  let skidGain  = null, skidNode  = null;
  let windGain  = null, windNode  = null;
  let turboGain = null, turboNode = null;
  let transGain = null, transNode = null;
  let rollGain  = null, rollNode  = null;

  /* ── Helpers ───────────────────────────────────────────────── */
  function _ctx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function _loadFile(name, filename) {
    return fetch(SFX + encodeURIComponent(filename))
      .then(function (resp) {
        if (!resp.ok) throw new Error(resp.status);
        return resp.arrayBuffer();
      })
      .then(function (ab) { return _ctx().decodeAudioData(ab); })
      .then(function (decoded) { buf[name] = decoded; })
      .catch(function (e) { console.warn('Audio: failed to load ' + filename, e); });
  }

  function _makeLoop(bufName, dest, startGain) {
    if (!buf[bufName]) return { src: null, gain: null };
    var ac  = _ctx();
    var g   = ac.createGain();
    g.gain.value = startGain;
    g.connect(dest);
    var src = ac.createBufferSource();
    src.buffer = buf[bufName];
    src.loop   = true;
    src.connect(g);
    src.start();
    return { src: src, gain: g };
  }

  function _playShot(bufName, volume, rate) {
    if (!buf[bufName] || !_ready) return;
    var ac  = _ctx();
    var src = ac.createBufferSource();
    src.buffer = buf[bufName];
    src.playbackRate.value = rate || 1;
    var g = ac.createGain();
    g.gain.value = (volume || 1) * vol;
    src.connect(g);
    g.connect(_masterGain || ac.destination);
    src.start();
  }

  /* ── Start / load ──────────────────────────────────────────── */
  function start(sfxVol) {
    vol = (sfxVol !== undefined) ? sfxVol : vol;
    if (_started) return;
    _started = true;
    _loadAll();
  }

  function _loadAll() {
    var ac = _ctx();

    _masterGain = ac.createGain();
    _masterGain.gain.value = 1;
    _masterGain.connect(ac.destination);

    /* ── Files to load ───────────────────────────────────────── */
    var files = [
      /* Engine layers: EngA + ExhL at each RPM */
      ['eng0', '1 EngA_00891 (2).wav'], ['exh0', '1 ExhL_00891.wav'],
      ['eng1', '4 EngA_01636.wav'],     ['exh1', '4 ExhL_01636.wav'],
      ['eng2', '7 EngA_02451.wav'],     ['exh2', '7 ExhL_02451.wav'],
      ['eng3', '9 EngA_03812.wav'],     ['exh3', '10 ExhL_03812.wav'],
      ['eng4', '10 EngA_04363.wav'],    ['exh4', '11 ExhL_04363.wav'],
      ['eng5', '12 EngA_05443.wav'],    ['exh5', '13 ExhL_05443.wav'],
      ['eng6', '14 EngA_06207.wav'],    ['exh6', '15 ExhL_06207.wav'],
      /* Continuous effects */
      ['skid',  'skid_ext_mono.wav'],
      ['wind',  'wind.wav'],
      ['turbo', 'turbo.wav'],
      ['trans', 'transmission.wav'],
      ['roll',  'tyre_rolling.wav'],
      /* One-shot effects */
      ['shift',        'shift.wav'],
      ['gearup',       'gearupEXT.wav'],
      ['geardn',       'geardnEXT.wav'],
      ['bodywork',     'bodywork.wav'],
      ['backfire1',    'ext_backfire1.wav'],
      ['backfire3',    'ext_backfire3.wav'],
      ['supercharger', 'fordgtgt1_supercharger.wav'],
    ];

    var loads = files.map(function (f) { return _loadFile(f[0], f[1]); });

    Promise.all(loads).then(function () {
      /* ── Engine bus ──────────────────────────────────────── */
      var engBus = ac.createGain();
      engBus.gain.value = vol * 0.55;
      engBus.connect(_masterGain);

      for (var i = 0; i < ENG_RPMS.length; i++) {
        var eKey = 'eng' + i;
        var xKey = 'exh' + i;

        var gA = ac.createGain(); gA.gain.value = 0; gA.connect(engBus);
        var gX = ac.createGain(); gX.gain.value = 0; gX.connect(engBus);

        var sA = null, sX = null;
        if (buf[eKey]) {
          sA = ac.createBufferSource();
          sA.buffer = buf[eKey]; sA.loop = true;
          sA.connect(gA); sA.start();
        }
        if (buf[xKey]) {
          sX = ac.createBufferSource();
          sX.buffer = buf[xKey]; sX.loop = true;
          sX.connect(gX); sX.start();
        }
        engLayers.push({ srcA: sA, srcExh: sX, gainA: gA, gainExh: gX });
      }

      /* ── Skid loop ─────────────────────────────────────── */
      var skidBus = ac.createGain();
      skidBus.gain.value = vol * 0.30;
      skidBus.connect(_masterGain);
      var sl = _makeLoop('skid', skidBus, 0);
      skidNode = sl.src; skidGain = sl.gain;

      /* ── Wind loop ─────────────────────────────────────── */
      var windBus = ac.createGain();
      windBus.gain.value = vol * 0.12;
      windBus.connect(_masterGain);
      var wl = _makeLoop('wind', windBus, 0);
      windNode = wl.src; windGain = wl.gain;

      /* ── Turbo / supercharger loop ─────────────────────── */
      var turboBus = ac.createGain();
      turboBus.gain.value = vol * 0.18;
      turboBus.connect(_masterGain);
      var tl = _makeLoop('turbo', turboBus, 0);
      turboNode = tl.src; turboGain = tl.gain;

      /* ── Transmission whine loop ───────────────────────── */
      var trBus = ac.createGain();
      trBus.gain.value = vol * 0.07;
      trBus.connect(_masterGain);
      var tr = _makeLoop('trans', trBus, 0);
      transNode = tr.src; transGain = tr.gain;

      /* ── Tyre rolling loop ─────────────────────────────── */
      var rBus = ac.createGain();
      rBus.gain.value = vol * 0.10;
      rBus.connect(_masterGain);
      var rl = _makeLoop('roll', rBus, 0);
      rollNode = rl.src; rollGain = rl.gain;

      _ready = true;
    });
  }

  /* ── Update every render frame ─────────────────────────────── */
  function update(car) {
    if (!_ready) return;
    var ac = _ctx();
    var t  = ac.currentTime;

    /* ── Engine crossfade between RPM layers ─────────────────── */
    var rpm = car.rpm || CFG.CAR.minRPM;

    /* Find the two adjacent layers to blend between */
    var lo = 0;
    for (var i = 0; i < ENG_RPMS.length - 1; i++) {
      if (rpm >= ENG_RPMS[i]) lo = i;
    }
    var hi = Math.min(lo + 1, ENG_RPMS.length - 1);

    var range = ENG_RPMS[hi] - ENG_RPMS[lo];
    var blend = (range > 0)
      ? Math.max(0, Math.min(1, (rpm - ENG_RPMS[lo]) / range))
      : 0;

    /* Volume influenced by throttle + nitro */
    var throttleVol = 0.35 + car.throttleInput * 0.65;
    var nitroAdd    = car.nitroActive ? 0.15 : 0;
    var engAmp      = Math.min(1, throttleVol + nitroAdd);

    for (var j = 0; j < engLayers.length; j++) {
      var layer = engLayers[j];
      var g = 0;
      if (j === lo && lo === hi) g = engAmp;
      else if (j === lo)         g = (1 - blend) * engAmp;
      else if (j === hi)         g = blend * engAmp;

      layer.gainA.gain.setTargetAtTime(g, t, 0.04);
      layer.gainExh.gain.setTargetAtTime(g * 0.65, t, 0.04);

      /* Pitch-shift to match exact RPM (clamped to 0.5–2.0× for audio quality) */
      var rate = rpm / ENG_RPMS[j];
      rate = Math.max(0.5, Math.min(2.0, rate));
      if (layer.srcA)   layer.srcA.playbackRate.setTargetAtTime(rate, t, 0.05);
      if (layer.srcExh)  layer.srcExh.playbackRate.setTargetAtTime(rate, t, 0.05);
    }

    /* ── Tyre skid — amplitude = drift intensity ─────────────── */
    if (skidGain) {
      var skidAmt = car.isDrifting
        ? Math.min(1, (car.driftAngle - CFG.DRIFT.minAngle) / 0.4) * 0.9
        : 0;
      skidGain.gain.setTargetAtTime(skidAmt, t, 0.04);
      if (skidNode) {
        skidNode.playbackRate.setTargetAtTime(
          0.8 + car.speed * 0.015 + skidAmt * 0.15, t, 0.05
        );
      }
    }

    /* ── Wind — proportional to speed ────────────────────────── */
    if (windGain) {
      var windAmt = Math.min(1, Math.max(0, (car.speed - 15) / 50));
      windGain.gain.setTargetAtTime(windAmt * 0.7, t, 0.1);
      if (windNode) {
        windNode.playbackRate.setTargetAtTime(0.7 + windAmt * 0.5, t, 0.1);
      }
    }

    /* ── Turbo whine — RPM × throttle ────────────────────────── */
    if (turboGain) {
      var revNorm  = (rpm - CFG.CAR.minRPM) / (CFG.CAR.maxRPM - CFG.CAR.minRPM);
      var turboAmt = revNorm * car.throttleInput * 0.7
                   + (car.nitroActive ? 0.3 : 0);
      turboGain.gain.setTargetAtTime(Math.min(1, turboAmt), t, 0.08);
      if (turboNode) {
        turboNode.playbackRate.setTargetAtTime(0.5 + revNorm * 1.0, t, 0.1);
      }
    }

    /* ── Transmission whine — speed-based ────────────────────── */
    if (transGain) {
      var spd = Math.min(1, car.speed / 40);
      transGain.gain.setTargetAtTime(spd * 0.4, t, 0.1);
      if (transNode) {
        transNode.playbackRate.setTargetAtTime(0.5 + spd * 1.0, t, 0.1);
      }
    }

    /* ── Tyre rolling — speed-based ──────────────────────────── */
    if (rollGain) {
      var rollAmt = Math.min(1, car.speed / 25) * (car.onTrack ? 1.0 : 0.3);
      rollGain.gain.setTargetAtTime(rollAmt, t, 0.1);
      if (rollNode) {
        rollNode.playbackRate.setTargetAtTime(0.6 + car.speed * 0.015, t, 0.1);
      }
    }
  }

  /* ── One-shot: Gear shift ──────────────────────────────────── */
  function playGearShift() {
    if (!_ready) return;
    var pick = Math.random();
    var key  = pick < 0.33 ? 'shift' : (pick < 0.66 ? 'gearup' : 'geardn');
    _playShot(key, 0.5, 0.9 + Math.random() * 0.2);
  }

  /* ── One-shot: Nitro / supercharger whoosh ─────────────────── */
  function playNitroStart() {
    if (!_ready) return;
    _playShot('supercharger', 0.55, 1.0);
  }

  /* ── One-shot: Wall / body impact ──────────────────────────── */
  function playImpact(velocity) {
    if (!_ready) return;
    var v = Math.min(1, velocity / 15);
    _playShot('bodywork', v * 0.8, 0.8 + Math.random() * 0.4);
    /* Extra backfire on hard hit */
    if (velocity > 8 && Math.random() < 0.5) {
      _playShot(Math.random() > 0.5 ? 'backfire1' : 'backfire3', v * 0.3);
    }
  }

  /* ── Countdown beep (UI sound — synthesised) ───────────────── */
  function playBeep(freq, duration) {
    if (!_started) return;
    var ac  = _ctx();
    var osc = ac.createOscillator();
    var g   = ac.createGain();
    osc.frequency.value = freq || 660;
    osc.type            = 'sine';
    g.gain.setValueAtTime(vol * 0.4, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (duration || 0.15));
    osc.connect(g); g.connect(_masterGain || ac.destination);
    osc.start(); osc.stop(ac.currentTime + (duration || 0.15));
  }

  function setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
  }

  return { start, update, playImpact, playBeep, playGearShift, playNitroStart, setVolume };
})();
