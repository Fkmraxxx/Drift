/* ============================================================
   DRIFT KING — Three.js 3D Renderer
   Drop-in replacement for renderer.js with same interface:
     new Renderer3D(canvas)
     .render(track, car, camera, tireMarks, particles)
   ============================================================ */

class Renderer3D {
  constructor(canvas) {
    const R3 = CFG.RENDER3D;

    /* ── WebGL Renderer ────────────────────────────────────── */
    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias:       false,
      powerPreference: 'low-power',
      alpha:           false,
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, R3.maxPixelRatio));
    this._renderer.setSize(canvas.clientWidth || window.innerWidth,
                           canvas.clientHeight || window.innerHeight);
    this._renderer.shadowMap.enabled = false;
    this._renderer.setClearColor(0x1a1a2e);

    /* ── Scene ─────────────────────────────────────────────── */
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1a2e);

    /* ── Perspective Camera ────────────────────────────────── */
    const w = this._renderer.domElement.clientWidth  || window.innerWidth;
    const h = this._renderer.domElement.clientHeight || window.innerHeight;
    this._cam = new THREE.PerspectiveCamera(60, w / h, 0.5, 2000);
    this._camPos  = new THREE.Vector3();   // smoothed camera position
    this._camInit = false;

    /* ── Lighting ──────────────────────────────────────────── */
    this._ambientLight = new THREE.AmbientLight(0x888888, 1.0);
    this._scene.add(this._ambientLight);
    this._dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this._dirLight.position.set(50, 100, 50);
    this._scene.add(this._dirLight);

    /* ── Ground plane ──────────────────────────────────────── */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(R3.groundSize, R3.groundSize),
      new THREE.MeshLambertMaterial({ color: 0x1e2d14 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this._scene.add(ground);

    /* ── Car group & state ─────────────────────────────────── */
    this._carGroup   = new THREE.Group();
    this._scene.add(this._carGroup);
    this._glbLoaded  = false;
    this._wheelFL    = null;
    this._wheelFR    = null;
    this._wheelRL    = null;
    this._wheelRR    = null;
    this._wheelSpinX = 0;   // accumulated spin angle (all wheels)

    /* ── Track mesh ────────────────────────────────────────── */
    this._trackMesh   = null;
    this._trackEdgesL = null;
    this._trackEdgesR = null;
    this._trackBuilt  = false;

    /* ── Tire marks ─────────────────────────────────────────── */
    this._tireMarkGeo  = null;
    this._tireMarkMesh = null;
    this._tmPositions  = null;
    this._tmAlphas     = null;
    this._tmMaxSegs    = CFG.VFX.maxTireMarks;
    this._initTireMarks();

    /* ── Particles ──────────────────────────────────────────── */
    this._particleGeo  = null;
    this._particleMesh = null;
    this._particleMax  = CFG.VFX.maxParticles;
    this._initParticles();

    /* ── Resize handler ─────────────────────────────────────── */
    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);

    /* ── Load GLB ───────────────────────────────────────────── */
    this._loadCarModel();

    /* ── Build fallback box car immediately (shown until GLB loads) ── */
    this._buildFallbackCar();
  }

  /* ── GLB Loading ─────────────────────────────────────────── */
  _loadCarModel() {
    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('Renderer3D: GLTFLoader not available, using fallback box car');
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      'dodge_charger.glb',
      (gltf) => this._onGLBLoaded(gltf),
      undefined,
      (err) => console.warn('Renderer3D: GLB load failed, using fallback:', err)
    );
  }

  _onGLBLoaded(gltf) {
    /* Remove fallback box car */
    while (this._carGroup.children.length) {
      this._carGroup.remove(this._carGroup.children[0]);
    }
    this._wheelFL = this._wheelFR = this._wheelRL = this._wheelRR = null;

    const model = gltf.scene;

    /* ── Scale model to CFG.CAR.length ─────────────────────── */
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    /* Assume longest axis is length of car */
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = CFG.CAR.length / maxDim;
    model.scale.setScalar(scale);

    /* Re-compute bounding box after scale to center properly */
    box.setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);    // center the model on its bounding box origin

    this._carGroup.add(model);

    /* ── Detect wheel meshes ───────────────────────────────── */
    const wheels = [];
    const wheelKeywords = /wheel|rim|tire|tyre|FL|FR|RL|RR/i;
    model.traverse((obj) => {
      if (obj.isMesh && wheelKeywords.test(obj.name)) {
        wheels.push(obj);
      }
    });

    if (wheels.length >= 4) {
      /* Sort by position to assign FL/FR/RL/RR */
      /* We need the world position for each */
      const withPos = wheels.map(w => {
        const wp = new THREE.Vector3();
        w.getWorldPosition(wp);
        return { mesh: w, wx: wp.x, wz: wp.z };
      });
      /* Sort wheels by Z-axis (world space): higher Z = front of car in Three.js
         coordinate mapping (2D Y → 3D Z, car faces +Z direction by default) */
      withPos.sort((a, b) => b.wz - a.wz);
      const half   = Math.floor(withPos.length / 2);
      const front  = withPos.slice(0, half);
      const rear   = withPos.slice(half);
      /* Sort each half by X for left/right */
      front.sort((a, b) => a.wx - b.wx);
      rear.sort((a, b)  => a.wx - b.wx);

      this._wheelFL = front[0] ? front[0].mesh : null;
      this._wheelFR = front[front.length - 1] ? front[front.length - 1].mesh : null;
      this._wheelRL = rear[0]  ? rear[0].mesh  : null;
      this._wheelRR = rear[rear.length - 1] ? rear[rear.length - 1].mesh : null;
      console.log('Renderer3D: detected wheel meshes:', wheels.map(w => w.name));
    } else {
      console.warn('Renderer3D: could not find 4 wheel meshes by name, found:', wheels.length,
        wheels.map(w => w.name));
    }

    this._glbLoaded = true;
    console.log('Renderer3D: GLB loaded OK');
  }

  /* ── Fallback low-poly box car ───────────────────────────── */
  _buildFallbackCar() {
    const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
    const roofMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(CFG.CAR.width, 0.55, CFG.CAR.length), bodyMat);
    body.position.y = 0.38;
    this._carGroup.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(CFG.CAR.width * 0.8, 0.38, CFG.CAR.length * 0.48), roofMat);
    roof.position.set(0, 0.87, -0.25);
    this._carGroup.add(roof);

    const wr = CFG.CAR.wheelRadius;
    const tw = CFG.CAR.tireWidth;
    const wGeo = new THREE.CylinderGeometry(wr, wr, tw, 10);

    const wheelOffsets = [
      { name: 'FL', x: -(CFG.CAR.width / 2 + tw * 0.5), y: wr * 0.9, z:  CFG.CAR.cgToFront * 0.8 },
      { name: 'FR', x:  (CFG.CAR.width / 2 + tw * 0.5), y: wr * 0.9, z:  CFG.CAR.cgToFront * 0.8 },
      { name: 'RL', x: -(CFG.CAR.width / 2 + tw * 0.5), y: wr * 0.9, z: -CFG.CAR.cgToRear  * 0.8 },
      { name: 'RR', x:  (CFG.CAR.width / 2 + tw * 0.5), y: wr * 0.9, z: -CFG.CAR.cgToRear  * 0.8 },
    ];
    wheelOffsets.forEach(wo => {
      const pivot = new THREE.Group();
      pivot.position.set(wo.x, wo.y, wo.z);
      pivot.name = wo.name + '_pivot';
      const w = new THREE.Mesh(wGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.name = wo.name;
      pivot.add(w);
      this._carGroup.add(pivot);
      if (wo.name === 'FL') this._wheelFL = pivot;
      if (wo.name === 'FR') this._wheelFR = pivot;
      if (wo.name === 'RL') this._wheelRL = pivot;
      if (wo.name === 'RR') this._wheelRR = pivot;
    });
  }

  /* ── Track mesh build (called once per track) ─────────────── */
  _buildTrack(track) {
    if (this._trackMesh)  { this._scene.remove(this._trackMesh);  this._trackMesh.geometry.dispose(); }
    if (this._trackEdgesL){ this._scene.remove(this._trackEdgesL); this._trackEdgesL.geometry.dispose(); }
    if (this._trackEdgesR){ this._scene.remove(this._trackEdgesR); this._trackEdgesR.geometry.dispose(); }

    const left  = track.geo.left;
    const right = track.geo.right;
    const n     = left.length;
    if (n < 2) return;

    /* Build road ribbon from triangle pairs */
    const positions = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const li = i * 6;
      positions[li + 0] = left[i][0];  positions[li + 1] = 0; positions[li + 2] = left[i][1];
      positions[li + 3] = right[i][0]; positions[li + 4] = 0; positions[li + 5] = right[i][1];
    }

    const indices = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, b, c,  b, d, c);
    }
    /* Close the loop */
    const a = (n - 1) * 2, b = (n - 1) * 2 + 1;
    indices.push(a, b, 0,  b, 1, 0);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const roadColor = track.roadColor ? parseInt(track.roadColor.replace('#',''), 16) : 0x333344;
    const mat = new THREE.MeshLambertMaterial({ color: roadColor });
    this._trackMesh = new THREE.Mesh(geo, mat);
    this._trackMesh.position.y = 0.001;
    this._scene.add(this._trackMesh);

    /* Edge lines */
    const edgeColor = track.accentColor ? parseInt(track.accentColor.replace('#',''), 16) : 0xffffff;
    this._trackEdgesL = this._buildEdgeLine(left, edgeColor);
    this._trackEdgesR = this._buildEdgeLine(right, edgeColor);
    this._scene.add(this._trackEdgesL);
    this._scene.add(this._trackEdgesR);

    this._trackBuilt = true;
    this._builtTrackRef = track;
  }

  _buildEdgeLine(pts, color) {
    const pos = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      pos[i * 3] = pts[i][0]; pos[i * 3 + 1] = 0.015; pos[i * 3 + 2] = pts[i][1];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color });
    const line = new THREE.LineLoop(geo, mat);
    return line;
  }

  /* ── Tire mark system ──────────────────────────────────────── */
  _initTireMarks() {
    const max = this._tmMaxSegs;
    this._tmPositions = new Float32Array(max * 6);  // 2 pts × 3 coords per seg
    this._tmAlphas    = new Float32Array(max * 2);

    this._tireMarkGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this._tmPositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this._tireMarkGeo.setAttribute('position', posAttr);

    const mat = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 });
    this._tireMarkMesh = new THREE.LineSegments(this._tireMarkGeo, mat);
    this._tireMarkMesh.position.y = 0.012;
    this._tireMarkMesh.frustumCulled = false;
    this._scene.add(this._tireMarkMesh);
  }

  _updateTireMarks(tireMarks) {
    const segs = tireMarks ? tireMarks.segs : [];
    const now  = performance.now() / 1000;
    const fade = CFG.VFX.tireMarkFade;
    const max  = this._tmMaxSegs;
    const pos  = this._tmPositions;
    const n    = Math.min(segs.length, max);

    for (let i = 0; i < n; i++) {
      const s = segs[segs.length - n + i];
      const age   = now - s.born;
      const alpha = Math.max(0, 1 - age / fade) * s.a;
      const base  = i * 6;
      pos[base + 0] = s.x0; pos[base + 1] = 0.012; pos[base + 2] = s.y0;
      pos[base + 3] = s.x1; pos[base + 4] = 0.012; pos[base + 5] = s.y1;
    }
    /* Zero out unused slots */
    for (let i = n; i < max; i++) {
      pos.fill(0, i * 6, i * 6 + 6);
    }

    this._tireMarkGeo.setAttribute('position',
      new THREE.BufferAttribute(pos, 3));
    this._tireMarkGeo.attributes.position.needsUpdate = true;
    this._tireMarkGeo.setDrawRange(0, n * 2);
  }

  /* ── Particle system ──────────────────────────────────────── */
  _initParticles() {
    const max = this._particleMax;
    this._particlePositions = new Float32Array(max * 3);
    this._particleColors    = new Float32Array(max * 3);

    this._particleGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this._particlePositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(this._particleColors, 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    this._particleGeo.setAttribute('position', posAttr);
    this._particleGeo.setAttribute('color', colAttr);

    const mat = new THREE.PointsMaterial({
      size:         0.8,
      vertexColors: true,
      transparent:  true,
      opacity:      0.75,
      sizeAttenuation: true,
    });
    this._particleMesh = new THREE.Points(this._particleGeo, mat);
    this._particleMesh.frustumCulled = false;
    this._scene.add(this._particleMesh);
  }

  _updateParticles(particles) {
    const pool = particles ? particles.pool : [];
    const pos  = this._particlePositions;
    const col  = this._particleColors;
    let count  = 0;

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      const lifeRatio = p.life / p.maxLife;
      const idx = count * 3;
      pos[idx]     = p.x;
      pos[idx + 1] = p.r * 2;
      pos[idx + 2] = p.y;
      /* Parse color string rgb(r,g,b) or fallback */
      const c = this._parseColor(p.color);
      col[idx]     = c[0] * lifeRatio;
      col[idx + 1] = c[1] * lifeRatio;
      col[idx + 2] = c[2] * lifeRatio;
      count++;
      if (count >= this._particleMax) break;
    }

    this._particleGeo.attributes.position.needsUpdate = true;
    this._particleGeo.attributes.color.needsUpdate    = true;
    this._particleGeo.setDrawRange(0, count);
  }

  _parseColor(str) {
    if (!str) return [1, 1, 1];
    const m = str.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255];
    return [1, 1, 1];
  }

  /* ── Wheel animation ─────────────────────────────────────── */
  _animateWheels(car, dt) {
    const R3 = CFG.RENDER3D;

    /* Spin speed from forward velocity */
    const spinSpeed = (car.localVx / CFG.CAR.wheelRadius) * R3.wheelSpinFactor;

    /* Rear wheels RWD — extra spin if throttle/handbrake */
    let rearSpinMult = 1;
    if (car.throttleInput > 0.1) rearSpinMult += car.throttleInput * 0.6;
    if (car.handbrakeIn)          rearSpinMult  = 2.5;
    if (car.isDrifting)           rearSpinMult += 0.8;

    this._wheelSpinX += spinSpeed * dt;

    /* Steer angle for front wheels */
    const steerSpeedFactor = 1 - Math.min(
      Math.abs(car.speed) * CFG.CAR.steerSpeedFactor, 0.55
    );
    const steerAngle = car.steerInput * CFG.CAR.maxSteerAngle * steerSpeedFactor;

    const applyWheel = (wheel, spinMult, steer) => {
      if (!wheel) return;
      /* Spin around X axis (axle) */
      wheel.rotation.x = this._wheelSpinX * spinMult;
      /* Steering around Y for front wheels */
      if (steer !== undefined) wheel.rotation.y = steer;
    };

    /* For GLB wheels, we only set rotation.x for spin and .y for steer
       The GLB model orient can vary — we try .x first as specified */
    applyWheel(this._wheelFL, 1,            steerAngle);
    applyWheel(this._wheelFR, 1,           -steerAngle);
    applyWheel(this._wheelRL, rearSpinMult);
    applyWheel(this._wheelRR, rearSpinMult);
  }

  /* ── Camera update ────────────────────────────────────────── */
  _updateCamera(car, camera, dt) {
    const R3     = CFG.RENDER3D;
    const angle  = car.angle;
    const cosA   = Math.cos(angle);
    const sinA   = Math.sin(angle);

    /* Dynamic back-offset based on speed */
    const backOff = R3.chaseCamBack + car.speed * 0.08;
    const upOff   = R3.chaseCamUp;

    const targetX = car.x - cosA * backOff + (camera ? camera.shakeX * 0.05 : 0);
    const targetY = upOff  + (camera ? Math.abs(camera.tilt) * 0.5 : 0);
    const targetZ = car.y - sinA * backOff + (camera ? camera.shakeY * 0.05 : 0);

    if (!this._camInit) {
      this._camPos.set(targetX, targetY, targetZ);
      this._camInit = true;
    }

    const lerp = R3.chaseCamLerp;
    this._camPos.x += (targetX - this._camPos.x) * lerp;
    this._camPos.y += (targetY - this._camPos.y) * lerp;
    this._camPos.z += (targetZ - this._camPos.z) * lerp;

    this._cam.position.copy(this._camPos);

    /* LookAt target: ahead of car */
    const lookX = car.x + cosA * R3.chaseCamLookAhead;
    const lookZ = car.y + sinA * R3.chaseCamLookAhead;
    this._cam.lookAt(lookX, 0.5, lookZ);
  }

  /* ── Car body positioning ────────────────────────────────── */
  _updateCarBody(car, dt) {
    const R3 = CFG.RENDER3D;

    this._carGroup.position.set(car.x, 0, car.y);
    this._carGroup.rotation.y = -car.angle;

    /* Body roll (lateral G) */
    this._carGroup.rotation.z = -car.lateralG * R3.bodyRollFactor;

    /* Body pitch (longitudinal G from vehicle physics) */
    this._carGroup.rotation.x = -car.longG * R3.bodyPitchFactor;
  }

  /* ── Lighting by time-of-day ─────────────────────────────── */
  _updateLighting() {
    const tod = CFG.ENV.timeOfDay;
    if (tod === 'night') {
      this._ambientLight.intensity = 0.3;
      this._dirLight.intensity     = 0.2;
      this._scene.background.set(0x05101e);
    } else if (tod === 'dusk') {
      this._ambientLight.intensity = 0.7;
      this._dirLight.intensity     = 0.6;
      this._dirLight.color.set(0xff8833);
      this._scene.background.set(0x331a0a);
    } else {
      this._ambientLight.intensity = 1.0;
      this._dirLight.intensity     = 0.9;
      this._dirLight.color.set(0xffffff);
      this._scene.background.set(0x5a9bd5);
    }
  }

  /* ── Resize ──────────────────────────────────────────────── */
  _handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._cam.aspect = w / h;
    this._cam.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }

  /* ── Main render call (same signature as Renderer) ─────────── */
  render(track, car, camera, tireMarks, particles) {
    /* Build/rebuild track mesh when track changes */
    if (track && (!this._trackBuilt || this._builtTrackRef !== track)) {
      this._buildTrack(track);
    }

    const now = performance.now() / 1000;
    const dt  = Math.min(now - (this._lastRenderTime || now), 0.1);
    this._lastRenderTime = now;

    if (car) {
      this._updateCarBody(car, dt);
      this._animateWheels(car, dt);
    }

    this._updateCamera(car || { x: 0, y: 0, angle: 0, speed: 0, lateralG: 0 }, camera, dt);
    this._updateLighting();
    this._updateTireMarks(tireMarks);
    this._updateParticles(particles);

    this._renderer.render(this._scene, this._cam);
  }
}
