/* ============================================================
   DRIFT KING — Audio Engine  (Web Audio API, no file assets)
   Synthesised engine, tyre squeal, gear shifts, wind,
   nitro boost, and impact sounds
   ============================================================ */

const AudioManager = (() => {
  let ctx  = null;
  let vol  = 0.7;

  /* Oscillator nodes for engine drone */
  let engOsc1 = null, engOsc2 = null, engOsc3 = null, engGain = null;
  let squealOsc = null, squealGain = null;
  let windGain = null, windOsc = null;
  let _started = false;
  let _masterGain = null;

  function _ctx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function start(sfxVol) {
    vol = (sfxVol !== undefined) ? sfxVol : vol;
    if (_started) return;
    _started = true;
    const ac = _ctx();

    /* ── Master gain ── */
    _masterGain = ac.createGain();
    _masterGain.gain.value = 1;
    _masterGain.connect(ac.destination);

    /* ── Engine oscillators (3 harmonics for richer sound) ── */
    const engMaster = ac.createGain();
    engMaster.gain.value = vol * 0.35;
    engMaster.connect(_masterGain);

    engGain = ac.createGain();
    engGain.gain.value = 0.6;
    engGain.connect(engMaster);

    engOsc1 = ac.createOscillator();
    engOsc1.type      = 'sawtooth';
    engOsc1.frequency.value = 80;

    engOsc2 = ac.createOscillator();
    engOsc2.type      = 'square';
    engOsc2.frequency.value = 160;
    const g2 = ac.createGain(); g2.gain.value = 0.22;
    engOsc2.connect(g2); g2.connect(engMaster);

    /* Third harmonic for fuller sound — triangle wave is soft enough to skip filtering */
    engOsc3 = ac.createOscillator();
    engOsc3.type      = 'triangle';
    engOsc3.frequency.value = 240;
    const g3 = ac.createGain(); g3.gain.value = 0.12;
    engOsc3.connect(g3); g3.connect(engMaster);

    /* Low-pass filter for engine grumble */
    const lpf = ac.createBiquadFilter();
    lpf.type            = 'lowpass';
    lpf.frequency.value = 900;
    lpf.Q.value         = 1.5;
    engOsc1.connect(lpf); lpf.connect(engMaster);

    engOsc1.start();
    engOsc2.start();
    engOsc3.start();

    /* ── Tyre squeal ── */
    const squealMaster = ac.createGain();
    squealMaster.gain.value = vol * 0.22;
    squealMaster.connect(_masterGain);

    squealGain = ac.createGain();
    squealGain.gain.value = 0;
    squealGain.connect(squealMaster);

    squealOsc = ac.createOscillator();
    squealOsc.type            = 'sawtooth';
    squealOsc.frequency.value = 380;
    squealOsc.connect(squealGain);
    squealOsc.start();

    /* ── Wind noise (filtered noise via oscillator) ── */
    const windMaster = ac.createGain();
    windMaster.gain.value = vol * 0.12;
    windMaster.connect(_masterGain);

    windGain = ac.createGain();
    windGain.gain.value = 0;
    windGain.connect(windMaster);

    /* Use a buffer of noise for wind */
    const windBufSize = ac.sampleRate * 2;
    const windBuf = ac.createBuffer(1, windBufSize, ac.sampleRate);
    const windData = windBuf.getChannelData(0);
    for (let i = 0; i < windBufSize; i++) {
      windData[i] = Math.random() * 2 - 1;
    }
    windOsc = ac.createBufferSource();
    windOsc.buffer = windBuf;
    windOsc.loop = true;

    const windFilter = ac.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.5;
    windOsc.connect(windFilter);
    windFilter.connect(windGain);
    windOsc.start();
  }

  /* Update every render frame */
  function update(car) {
    if (!_started || !engOsc1) return;
    const ac = _ctx();
    const t  = ac.currentTime;

    /* Engine pitch: idle 60 Hz → redline 350 Hz */
    const revNorm = (car.rpm - CFG.CAR.minRPM) / (CFG.CAR.maxRPM - CFG.CAR.minRPM);
    const freq1   = 60  + revNorm * 280 + (car.throttleInput * 40);
    const freq2   = 120 + revNorm * 560;
    const freq3   = 180 + revNorm * 420;

    engOsc1.frequency.setTargetAtTime(freq1, t, 0.05);
    engOsc2.frequency.setTargetAtTime(freq2, t, 0.05);
    engOsc3.frequency.setTargetAtTime(freq3, t, 0.05);

    /* Volume swell with throttle + nitro boost */
    const nitroBoost = car.nitroActive ? 0.15 : 0;
    const engVol = 0.5 + car.throttleInput * 0.5 + nitroBoost;
    engGain.gain.setTargetAtTime(Math.min(1, engVol), t, 0.08);

    /* Tyre squeal: amplitude = drift intensity */
    const squealAmt = car.isDrifting
      ? Math.min(1, (car.driftAngle - CFG.DRIFT.minAngle) / 0.4) * 0.9
      : 0;
    squealGain.gain.setTargetAtTime(squealAmt, t, 0.04);
    squealOsc.frequency.setTargetAtTime(
      320 + car.speed * 4 + squealAmt * 120, t, 0.05
    );

    /* Wind noise proportional to speed */
    if (windGain) {
      const windAmt = Math.min(1, Math.max(0, (car.speed - 15) / 50));
      windGain.gain.setTargetAtTime(windAmt * 0.7, t, 0.1);
    }
  }

  /* Gear shift sound — short blip */
  function playGearShift() {
    if (!_started) return;
    const ac  = _ctx();
    const osc = ac.createOscillator();
    const g   = ac.createGain();
    osc.frequency.value = 220;
    osc.type            = 'square';
    g.gain.setValueAtTime(vol * 0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
    osc.connect(g); g.connect(_masterGain || ac.destination);
    osc.start(); osc.stop(ac.currentTime + 0.06);
  }

  /* Nitro whoosh sound */
  function playNitroStart() {
    if (!_started) return;
    const ac  = _ctx();
    const buf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ac.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.8;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol * 0.4;
    const hpf = ac.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 800;
    src.connect(hpf); hpf.connect(g); g.connect(_masterGain || ac.destination);
    src.start();
  }

  /* One-shot impact burst */
  function playImpact(velocity) {
    if (!_started) return;
    const ac  = _ctx();
    const buf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.05));
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = Math.min(1, velocity / 15) * vol * 0.7;
    src.connect(g); g.connect(_masterGain || ac.destination);
    src.start();
  }

  /* Countdown beep */
  function playBeep(freq, duration) {
    if (!_started) return;
    const ac  = _ctx();
    const osc = ac.createOscillator();
    const g   = ac.createGain();
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
