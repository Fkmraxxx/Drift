/* ============================================================
   DRIFT KING — Main Game Loop & Orchestration
   ============================================================ */

(function () {
  'use strict';

  /* ── State ─────────────────────────────────────────────────── */
  const STATE = { MENU: 0, COUNTDOWN: 1, RACING: 2, PAUSED: 3, FINISHED: 4 };
  let gameState = STATE.MENU;

  let track      = null;
  let car        = null;
  let camera     = null;
  let input      = null;
  let tireMarks  = null;
  let particles  = null;
  let scoring    = null;
  let lapTracker = null;
  let renderer   = null;

  let _lastTime   = 0;
  let _accumulator = 0;
  let _gameTime   = 0;   // ms, pauses when paused
  let _rafId      = null;
  let _prevNitro  = false;

  /* ── Boot ─────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', () => {
    const canvas  = document.getElementById('game-canvas');

    /* ── 2D / 3D renderer selection ─────────────────────────── */
    const use3D = Storage.getSetting('render3d') !== false; // default to 3D
    if (use3D && typeof Renderer3D !== 'undefined') {
      try {
        renderer = new Renderer3D(canvas);
      } catch (e) {
        console.warn('3D renderer failed, falling back to 2D:', e);
        renderer = new Renderer(canvas);
      }
    } else {
      renderer = new Renderer(canvas);
    }

    input         = new InputManager();
    camera        = new Camera();

    MenuManager.init((action, trackIdx, settings) => {
      switch (action) {
        case 'play':    _startRace(trackIdx, settings); break;
        case 'resume':  _resume();                       break;
        case 'restart': _restartRace();                  break;
        case 'quit':    _quitToMenu();                   break;
      }
    });

    requestAnimationFrame(_loop);
  });

  /* ── Race setup ───────────────────────────────────────────── */
  function _startRace(trackIdx, settings) {
    track      = TRACKS[trackIdx || 0];
    car        = new Vehicle(settings);
    tireMarks  = new TireMarkSystem();
    particles  = new ParticleSystem();
    scoring    = new DriftScoring();
    lapTracker = new LapTracker(track);

    car.spawn(track.startPos[0], track.startPos[1], track.startAngle);
    camera.snapTo(car.x, car.y, car.angle);

    /* Auto headlights */
    CFG.ENV.headlightsOn = (CFG.ENV.timeOfDay === 'night' || CFG.ENV.timeOfDay === 'dusk');

    _gameTime    = 0;
    _accumulator = 0;
    _prevNitro   = false;
    gameState    = STATE.COUNTDOWN;

    /* Show game screen */
    document.getElementById('screen-game').classList.add('active');

    /* Start audio context (requires user gesture — play click counts) */
    const sfxVol = Storage.getSetting('sfxVol');
    AudioManager.start(sfxVol != null ? sfxVol : 0.7);

    HUD.showCountdown(3, () => {
      lapTracker.reset(performance.now());
      gameState = STATE.RACING;
    });
  }

  function _restartRace() {
    MenuManager.hideRaceEnd();
    MenuManager.hidePause();
    if (!track) { _quitToMenu(); return; }
    const settings = {
      power:    Storage.getSetting('power')    || 5,
      grip:     Storage.getSetting('grip')     || 5,
      steering: Storage.getSetting('steering') || 5,
    };
    _startRace(TRACKS.indexOf(track), settings);
  }

  function _quitToMenu() {
    gameState = STATE.MENU;
    MenuManager.hidePause();
    MenuManager.hideRaceEnd();
    document.getElementById('screen-game').classList.remove('active');
    MenuManager.showScreen('menu');
  }

  function _resume() {
    MenuManager.hidePause();
    gameState = STATE.RACING;
  }

  /* ── Main loop ───────────────────────────────────────────────── */
  function _loop(timestamp) {
    _rafId = requestAnimationFrame(_loop);

    const rawDt = Math.min((timestamp - _lastTime) / 1000, 0.1);
    _lastTime   = timestamp;

    input.update();

    if (gameState === STATE.RACING) {
      /* Fixed-step physics */
      _accumulator += rawDt;
      let steps = 0;
      while (_accumulator >= CFG.GAME.physicsDt && steps < CFG.GAME.maxSteps) {
        _physicsStep(CFG.GAME.physicsDt);
        _accumulator -= CFG.GAME.physicsDt;
        steps++;
      }
      _gameTime += rawDt * 1000;
    }

    if (gameState === STATE.RACING || gameState === STATE.PAUSED ||
        gameState === STATE.COUNTDOWN) {
      if (car) {
        camera.update(car, rawDt);
        particles.update(rawDt);
        renderer.render(track, car, camera, tireMarks, particles);
        HUD.update(car, scoring, lapTracker, track, renderer, performance.now());
        AudioManager.update(car);
      }
    }

    /* Pause input */
    if (input.pausePressed) {
      if (gameState === STATE.RACING) {
        gameState = STATE.PAUSED;
        MenuManager.showPause();
      } else if (gameState === STATE.PAUSED) {
        _resume();
      }
    }
  }

  /* ── Physics step ─────────────────────────────────────────── */
  function _physicsStep(dt) {
    if (gameState !== STATE.RACING) return;
    /* Drive the car */
    car.step(dt, input);

    /* Track collision */
    _handleTrackCollision();

    /* Near-miss detection */
    _detectNearMiss();

    /* Wall impact effects — must run BEFORE scoring.update clears wallHit */
    if (car.wallHit) {
      if (car.wallHitVel > 3) {
        camera.shake(Math.min(car.wallHitVel * 0.4, 8));
        particles.emitSparks(car.x, car.y, 0, 0, Math.ceil(car.wallHitVel));
        AudioManager.playImpact(car.wallHitVel);
      }
      /* scoring.update will apply the penalty and clear the flag */
    }

    /* Gear shift audio */
    if (car.gearShifted) {
      AudioManager.playGearShift();
    }

    /* Nitro start audio */
    if (car.nitroActive && !_prevNitro) {
      AudioManager.playNitroStart();
    }
    _prevNitro = car.nitroActive;

    /* Lap tracking */
    const completed = lapTracker.update(car.trackIdx, performance.now());
    if (completed && lapTracker.laps >= CFG.GAME.totalLaps) {
      _finishRace();
    }

    /* Update scoring (clears car.wallHit) */
    scoring.update(car, dt, car.onTrack);

    /* VFX: tire marks & smoke */
    const markIntensity = car.isDrifting
      ? Math.min(1, (car.driftAngle - CFG.DRIFT.minAngle) / 0.35)
      : car.brakeInput > 0.3 ? car.brakeInput * 0.6 : 0;
    tireMarks.addMark(car, markIntensity);
    if (!car.isDrifting && !car.brakeInput) tireMarks.breakLine();

    if (car.isDrifting && car.speed > CFG.DRIFT.minSpeed) {
      particles.emitSmoke(car, Math.ceil(3 * markIntensity));
      /* Drift sparks from tire scraping */
      if (car.driftAngle > 0.3 && Math.random() < 0.4) {
        particles.emitDriftSparks(car, Math.ceil(2 * markIntensity));
      }
    }

    /* Nitro flames */
    if (car.nitroActive) {
      particles.emitNitroFlame(car, 3);
    }

    /* Reset */
    if (input.resetPressed) {
      car.spawn(track.startPos[0], track.startPos[1], track.startAngle);
      tireMarks.breakLine();
      scoring._breakCombo();
    }
  }

  /* ── Near-miss detection ─────────────────────────────────────── */
  function _detectNearMiss() {
    const geo = track.geo;
    const latDist = Math.abs(lateralDist(geo, car.x, car.y, car.trackIdx));
    const halfW = geo.width / 2;
    const margin = halfW - latDist;

    car.nearMiss = car.isDrifting && margin > 0 && margin < CFG.DRIFT.nearMissDist;
    car.nearMissDist = margin;
  }

  /* ── Track collision ────────────────────────────────────────── */
  function _handleTrackCollision() {
    const geo = track.geo;

    /* Update nearest track point (fast windowed search) */
    car.trackIdx = findClosestIdx(geo, car.x, car.y, car.trackIdx, 55);

    const latDist = Math.abs(lateralDist(geo, car.x, car.y, car.trackIdx));
    const halfW   = geo.width / 2 + 0.05;

    car.onTrack = latDist < halfW;

    if (!car.onTrack) {
      /* Push car back inside */
      const n   = geo.normals[car.trackIdx];
      const signed = lateralDist(geo, car.x, car.y, car.trackIdx);
      const penetration = latDist - halfW;

      /* Which side is the car on? */
      const side = signed > 0 ? 1 : -1;
      car.x -= n[0] * side * penetration * 1.05;
      car.y -= n[1] * side * penetration * 1.05;

      /* Bounce velocity off the wall normal */
      const wallN = [-n[0] * side, -n[1] * side];
      car.bounceOffWall(wallN[0], wallN[1]);

      /* Friction on the wall */
      car.vx *= 0.84;
      car.vy *= 0.84;
    }
  }

  /* ── Race finish ─────────────────────────────────────────────── */
  function _finishRace() {
    gameState = STATE.FINISHED;
    MenuManager.showRaceEnd(lapTracker, scoring, track);
  }

})();
