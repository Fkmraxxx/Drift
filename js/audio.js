/* ============================================================
   DRIFT KING — Audio Engine  (Web Audio API, no file assets)
   Synthesised engine, tyre squeal and impact sounds
   ============================================================ */

const AudioManager = (() => {
  let ctx  = null;
  let vol  = 0.7;

  /* Oscillator nodes for engine drone */
  let engOsc1 = null, engOsc2 = null, engGain = null;
  let squealOsc = null, squealGain = null;
  let _started = false;

  function _ctx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function start(sfxVol) {
    vol = (sfxVol !== undefined) ? sfxVol : vol;
    if (_started) return;
    _started = true;
    const ac = _ctx();

    /* ── Engine oscillators ── */
    const master  = ac.createGain();
    master.gain.value = vol * 0.35;
    master.connect(ac.destination);

    engGain = ac.createGain();
    engGain.gain.value = 0.6;
    engGain.connect(master);

    engOsc1 = ac.createOscillator();
    engOsc1.type      = 'sawtooth';
    engOsc1.frequency.value = 80;
    engOsc1.connect(engGain);

    engOsc2 = ac.createOscillator();
    engOsc2.type      = 'square';
    engOsc2.frequency.value = 160;
    const g2 = ac.createGain(); g2.gain.value = 0.22;
    engOsc2.connect(g2); g2.connect(master);

    /* Low-pass filter for engine grumble */
    const lpf = ac.createBiquadFilter();
    lpf.type            = 'lowpass';
    lpf.frequency.value = 900;
    lpf.Q.value         = 1.5;
    engOsc1.connect(lpf); lpf.connect(master);

    engOsc1.start();
    engOsc2.start();

    /* ── Tyre squeal ── */
    const squealMaster = ac.createGain();
    squealMaster.gain.value = vol * 0.22;
    squealMaster.connect(ac.destination);

    squealGain = ac.createGain();
    squealGain.gain.value = 0;
    squealGain.connect(squealMaster);

    squealOsc = ac.createOscillator();
    squealOsc.type            = 'sawtooth';
    squealOsc.frequency.value = 380;
    squealOsc.connect(squealGain);
    squealOsc.start();
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

    engOsc1.frequency.setTargetAtTime(freq1, t, 0.05);
    engOsc2.frequency.setTargetAtTime(freq2, t, 0.05);

    /* Volume swell with throttle */
    const engVol = 0.5 + car.throttleInput * 0.5;
    engGain.gain.setTargetAtTime(engVol, t, 0.08);

    /* Tyre squeal: amplitude = drift intensity */
    const squealAmt = car.isDrifting
      ? Math.min(1, (car.driftAngle - CFG.DRIFT.minAngle) / 0.4) * 0.9
      : 0;
    squealGain.gain.setTargetAtTime(squealAmt, t, 0.04);
    squealOsc.frequency.setTargetAtTime(
      320 + car.speed * 4 + squealAmt * 120, t, 0.05
    );
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
    src.connect(g); g.connect(ac.destination);
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
    osc.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + (duration || 0.15));
  }

  function setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
  }

  return { start, update, playImpact, playBeep, setVolume };
})();
