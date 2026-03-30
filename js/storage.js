/* ============================================================
   DRIFT KING — LocalStorage persistence
   ============================================================ */

const Storage = (() => {
  const KEY = 'driftking_v1';

  function defaults() {
    return {
      bestLaps:   {},   // { trackId: milliseconds }
      bestScores: {},   // { trackId: points }
      settings: {
        power:    5,    // 1–10
        grip:     5,
        steering: 5,
        sfxVol:   0.7,
      },
    };
  }

  let _data = defaults();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _data = Object.assign(defaults(), parsed);
        _data.settings = Object.assign(defaults().settings, parsed.settings || {});
      }
    } catch (_) { _data = defaults(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(_data)); } catch (_) {}
  }

  function getBestLap(id)   { return _data.bestLaps[id]   || null; }
  function getBestScore(id) { return _data.bestScores[id] || 0;    }

  function submitLap(id, ms) {
    const prev = _data.bestLaps[id];
    if (!prev || ms < prev) { _data.bestLaps[id] = ms; save(); return true; }
    return false;
  }

  function submitScore(id, score) {
    const prev = _data.bestScores[id] || 0;
    if (score > prev) { _data.bestScores[id] = score; save(); return true; }
    return false;
  }

  function getSetting(k)    { return _data.settings[k]; }
  function setSetting(k, v) { _data.settings[k] = v; save(); }

  load(); // run on import

  return { getBestLap, getBestScore, submitLap, submitScore, getSetting, setSetting };
})();
