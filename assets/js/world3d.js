/**
 * Persistent 3D backdrop for the whole page.
 *
 * One fixed WebGL canvas shows the real warehouse scan with the AMR driving its route.
 * Every chapter (an element with data-cam) owns a camera pose; as the reader scrolls the
 * camera glides between them. The hero is scroll-linked (aerial -> chase -> orbit -> pull-back).
 *
 * The scan, AMR model, route and stations come from slam-viewer.js via window.PortfolioWorld,
 * so the 789k-point scan is parsed once.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('world-canvas');
  const hero = document.getElementById('top');
  if (!canvas || !hero || typeof THREE === 'undefined') return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = window.innerWidth < 760;
  const BG = 0x07090d;

  let renderer, scene, camera, amr, lidar, lifter, spline;
  let tug = null;                 // tugger train (tugger + 3 trolleys), see tugger-model.js
  let uT = 0.32;                  // tugger position along the route (same direction of travel as the forklift)
  let routeLen = 1;
  let tugHeading = 0;
  const TUG_START = 0.32;         // initial lead, as a fraction of the loop
  const SAFE_GAP = 9;             // m: tugger yields when the forklift is closer than this ahead of it
  let cell = null;                // factory cell: truck, conveyor, palletizing arm (factory-cell.js)
  let uDepart = 0;                // route parameter where the forklift leaves the loop for the cell
  let prevU = 0;
  let ready = false;
  let heroP = 0;                  // hero scroll progress 0..1
  let chapter = null;             // active chapter element
  let chapterP = 0;               // progress inside the active chapter 0..1
  let paused = false;             // true while the interactive driving stage is on screen
  let u = 0.03;                   // position along the route
  let heading = 0;
  let last = performance.now();

  const camPos = new THREE.Vector3(0, 70, 60);
  const camTarget = new THREE.Vector3(0, 0, 4);
  const pose = { p: new THREE.Vector3(), t: new THREE.Vector3() };
  const V = Array.from({ length: 8 }, () => new THREE.Vector3());

  /* The backdrop scan has a dividing wall at x = -2.5 with a door open between z = 1.1 and z = 7.3.
     The loop runs two lanes through that door (z = 2.35 one way, z = 6.05 back) and flares at the
     ends for the U-turns; waypoints were checked against the scan for clearance. Units: scan metres. */
  const ROUTE = [
    [23.4, 1.68], [16.2, 2.35], [8.1, 2.35], [1.8, 2.35], [-2.5, 2.35], [-8.1, 2.35], [-16.2, 2.35], [-22.5, 1.9],
    [-26.6, 2.69], [-28.3, 4.2], [-26.6, 5.71],
    [-22.5, 6.5], [-16.2, 6.05], [-8.1, 6.05], [-2.5, 6.05], [1.8, 6.05], [8.1, 6.05], [16.2, 6.05], [23.4, 6.61],
    [26.1, 5.82], [26.9, 4.2], [26.1, 2.58]
  ];
  // Career stations sit on the lanes, clear of racks and the wall (order matches slam-viewer's list)
  const STATION_XZ = [[22.9, 2.35], [8.1, 2.35], [-8.1, 2.35], [-19.8, 2.35], [-16.2, 6.05], [0, 6.05], [16.2, 6.05]];
  const DOCK_XZ = { x: 12.6, z: 4.2 };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  /* ---------------- scroll bookkeeping ---------------- */
  const chapters = Array.from(document.querySelectorAll('[data-cam]'));
  const stage = document.getElementById('fig-sim');
  const caps = Array.from(document.querySelectorAll('.hero-cap'));
  const heroCopy = document.getElementById('hero-copy');
  const cue = document.getElementById('hero-cue');

  function readScroll() {
    const vh = window.innerHeight;

    // Hero progress + overlay fades
    const hr = hero.getBoundingClientRect();
    heroP = clamp(-hr.top / Math.max(1, hero.offsetHeight - vh), 0, 1);
    document.body.classList.toggle('on-hero', hr.bottom > 80);
    if (heroCopy) {
      const o = 1 - smooth((heroP - 0.03) / 0.12);
      heroCopy.style.opacity = String(o);
      heroCopy.style.transform = 'translateY(' + (-heroP * 80).toFixed(1) + 'px)';
      heroCopy.style.pointerEvents = o < 0.2 ? 'none' : 'auto';
    }
    if (cue) cue.style.opacity = String(1 - smooth(heroP / 0.04));
    caps.forEach((el) => {
      const [a, b] = el.dataset.range.split(',').map(Number);
      const f = 0.04;
      const o = smooth((heroP - a) / f) * (1 - smooth((heroP - (b - f)) / f));
      el.style.opacity = String(o);
      el.style.transform = 'translateY(' + ((1 - o) * 16).toFixed(1) + 'px)';
    });

    // Active chapter = the one crossing the viewport's middle
    let best = null, bestD = Infinity;
    chapters.forEach((el) => {
      const r = el.getBoundingClientRect();
      const mid = vh * 0.5;
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = el; }
    });
    chapter = best;
    if (best) {
      const r = best.getBoundingClientRect();
      chapterP = clamp((vh * 0.5 - r.top) / Math.max(1, r.height), 0, 1);
    }

    // Pause the backdrop while the interactive driving stage is mostly on screen
    if (stage) {
      const sr = stage.getBoundingClientRect();
      const visible = Math.max(0, Math.min(sr.bottom, vh) - Math.max(sr.top, 0));
      paused = visible > vh * 0.55 || document.body.classList.contains('game-open');
    }
    canvas.style.opacity = paused ? '0.25' : '';
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll);

  /* ---------------- scene ---------------- */
  function build(world) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch (e) {
      console.warn('3D backdrop disabled (WebGL unavailable):', e);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 140, 420);
    camera = new THREE.PerspectiveCamera(50, 1, 0.3, 700);

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 50, 30);
    scene.add(sun);
    // Cool rim lights from behind and the side so the dark chassis keeps its edges against the backdrop
    const rimA = new THREE.DirectionalLight(0x9db8ff, 0.9); rimA.position.set(-30, 25, -20); scene.add(rimA);
    const rimB = new THREE.DirectionalLight(0xfff2d8, 0.55); rimB.position.set(25, 12, -30); scene.add(rimB);

    // Sampled copy of the processed scan (position + colour)
    const g = world.geometry;
    const srcP = g.attributes.position.array;
    const srcC = g.attributes.color ? g.attributes.color.array : null;
    const targetPoints = small ? 90000 : 150000;
    const stride = Math.max(1, Math.round((srcP.length / 3) / targetPoints));
    const n = Math.floor(srcP.length / 3 / stride);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = i * stride;
      pos[3 * i] = srcP[3 * s]; pos[3 * i + 1] = srcP[3 * s + 1]; pos[3 * i + 2] = srcP[3 * s + 2];
      if (srcC) { col[3 * i] = Math.min(1, srcC[3 * s] * 1.35); col[3 * i + 1] = Math.min(1, srcC[3 * s + 1] * 1.35); col[3 * i + 2] = Math.min(1, srcC[3 * s + 2] * 1.35); }
      else { col[3 * i] = 0.4; col[3 * i + 1] = 0.6; col[3 * i + 2] = 0.9; }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(pg, new THREE.PointsMaterial({
      size: small ? 2.6 : 2.4, vertexColors: true, sizeAttenuation: false, transparent: false, depthWrite: true
    })));

    const grid = new THREE.GridHelper(240, 80, 0x1f2a44, 0x11161f);
    grid.position.y = -0.02;
    scene.add(grid);

    // Route + AMR clone (geometry and materials are shared with the figure)
    spline = new THREE.CatmullRomCurve3(
      ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal', 0.25);
    amr = world.amr.clone(true);
    amr.visible = true;
    amr.traverse((o) => { if (o.isLineSegments) lidar = o; if (o.name === 'lifter') lifter = o; });
    scene.add(amr);

    // Factory cell: inbound truck -> conveyor -> palletizing arm -> forklift -> outbound zone
    if (window.buildFactoryCell) {
      cell = window.buildFactoryCell(THREE);
      scene.add(cell.group);
    }
    if (window.buildBotsyncLifter && cell) {
      lifterBot = window.buildBotsyncLifter(THREE);
      scene.add(lifterBot.root);
      L.x = LP[0]; L.z = LP[1]; L.phi = 0;                          // parked next to the arm, front east
      lifterBot.root.position.set(L.x, 0, L.z);
      lifterBot.root.rotation.y = -L.phi;
    }
    uDepart = nearestU(3.0, 2.35);
    prevU = u;

    // Second robot: MAG1500 tugger towing three trolleys around the same 3D map
    if (window.buildBotsyncTugger) {
      tug = window.buildBotsyncTugger(THREE);
      scene.add(tug.root);
      tug.trolleys.forEach((t) => scene.add(t));
      routeLen = spline.getLength();
      uT = (u + TUG_START) % 1;
    }

    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(spline.getPoints(200).map((p) => new THREE.Vector3(p.x, 0.04, p.z))),
      new THREE.LineBasicMaterial({ color: 0x6f8fe8, transparent: true, opacity: 0.3 })));

    // Station markers: glowing floor ring + slim beacon in each employer's colour
    (world.stations || []).forEach((st0, i) => {
      const st = Object.assign({}, st0, { x: STATION_XZ[i] ? STATION_XZ[i][0] : st0.x, z: STATION_XZ[i] ? STATION_XZ[i][1] : st0.z });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.5, 1.66, 40),
        new THREE.MeshBasicMaterial({ color: st.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(st.x, 0.03, st.z);
      scene.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 5, 8),
        new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.55 }));
      beam.position.set(st.x, 2.5, st.z);
      scene.add(beam);
    });

    // Loading dock outline
    if (world.dock) {
      const w = 3.2, d = 2.0;
      const pts = [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]].map(([x, z]) => new THREE.Vector3(DOCK_XZ.x + x, 0.05, DOCK_XZ.z + z));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf2c200 })));
    }

    resize();
    placeAmr(0);
    ready = true;
    document.body.classList.add('world-ready');
    readScroll();
    requestAnimationFrame(frame);
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  /* ---------------- AMR along the route (housing first, forks trailing) ---------------- */
  function nearestU(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 1600; i++) {
      const q = spline.getPointAt(i / 1600);
      const d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
      if (d < bd) { bd = d; best = i / 1600; }
    }
    return best;
  }

  /* Forklift pose from its steered drive wheel (wx, wz) and the direction its forks point (phi).
     The model origin sits 0.55 m ahead of the wheel along the fork direction. */
  function setForklift(wx, wz, phi) {
    amr.position.set(wx + 0.55 * Math.cos(phi), 0, wz + 0.55 * Math.sin(phi));
    amr.rotation.y = -phi;
    heading = phi;
  }

  /* ---------------- shared step runner for the forklift (F) and the lifter (L) ---------------- */
  const F = { busy: false, carried: null, steps: [], i: 0, lift: 0, liftY: 0, bx: 0, bz: 0 };
  const L = { steps: [], i: 0, rack: null, lift: 0, liftY: 0, x: 0, z: 0, phi: 0, busy: false };
  let lifterBot = null;          // MAG lifter (lifter-model.js)
  const FWD = 1.5, REV = 0.9;
  function pathStep(pts, speed, reverse) {
    const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.5);
    return { type: 'path', curve: c, len: c.getLength(), s: 0, speed, reverse };
  }
  /* Returns false when the step list is finished. `blocked()` pauses path steps (yielding). */
  function runSteps(a, dt, pose, blocked) {
    const s = a.steps[a.i];
    if (!s) return false;
    if (s.type === 'path') {
      if (blocked && blocked()) return true;
      const rem = s.len - s.s;
      s.s = Math.min(s.len, s.s + s.speed * dt * clamp(Math.min(s.s, rem) / 1.0 + 0.25, 0.25, 1));
      const k = clamp(s.s / s.len, 0, 1);
      pose(s.curve.getPointAt(k), s.curve.getTangentAt(k), s.reverse);
      if (s.len - s.s < 0.02) a.i++;
    } else if (s.type === 'lift') {
      const target = typeof s.to === 'function' ? s.to() : s.to;
      a.lift = target;
      if (s.when && !s.fired && s.when(a.liftY)) { s.fired = true; s.fn(); }
      if (Math.abs(a.liftY - target) < 0.012) { if (s.when && !s.fired) { s.fired = true; s.fn(); } a.i++; }
    } else if (s.type === 'wait') {
      if (s.cond()) a.i++;
    } else if (s.type === 'call') {
      s.fn(); a.i++;
    }
    return true;
  }

  /* ---------------- forklift ---------------- */
  function poseF(p, t, rev) {
    const phi = rev ? Math.atan2(t.z, t.x) : Math.atan2(-t.z, -t.x);   // forks lead when reversing, trail when driving forward
    setForklift(p.x, p.z, phi);
  }
  function carryF() {
    const g = F.carried;
    if (!g) return;
    g.position.set(amr.position.x + 0.3 * Math.cos(heading), F.liftY, amr.position.z + 0.3 * Math.sin(heading));
    g.rotation.y = -heading;
  }
  function trainTooClose(x, z, r) {
    if (!tug) return false;
    const r2 = r * r;
    const near = (p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < r2;
    return near(tug.root.position) || tug.trolleys.some((t) => near(t.position));
  }
  const _tp = new THREE.Vector3();
  function trainNear(x, z, r) {
    if (!tug) return false;
    const r2 = r * r, hit = (o, xs) => xs.some((lx) => { o.updateMatrixWorld(true); _tp.set(lx, 0, 0); o.localToWorld(_tp); return (_tp.x - x) * (_tp.x - x) + (_tp.z - z) * (_tp.z - z) < r2; });
    return hit(tug.root, [-0.6, 0, 0.6]) || tug.trolleys.some((t) => hit(t, [0, -0.5, -1.0, -1.6]));
  }
  const blockedF = () => (amr.position.z < 1.3 && trainNear(amr.position.x, amr.position.z, 2.6)) ||
    (lifterBot && Math.hypot(lifterBot.root.position.x - amr.position.x, lifterBot.root.position.z - amr.position.z) < 2.8);

  /* What the forklift should do next. It works the single pallet slot of whichever mobile rack stands at the hand-off. */
  function nextFTask() {
    const rk = cell.rackAt('H'), o = cell.out, sl = rk && rk.slot;
    if (F.carried) {
      if (F.carried.userData.loaded) { const s = o.loaded.find((x) => !x.pallet && !x.lock); return s && { mode: 'drop', slot: s, rack: false }; }
      return (sl && !sl.pallet && !sl.lock) ? { mode: 'drop', slot: sl, rack: true } : null;        // bring an empty pallet into the rack
    }
    if (sl && sl.pallet && sl.pallet.userData.full && !sl.lock) return { mode: 'pick', slot: sl, rack: true };   // loaded pallet out of the rack
    if (sl && !sl.pallet && !sl.lock) { const e = o.empty.find((x) => x.pallet && !x.lock); if (e) return { mode: 'pick', slot: e, rack: false }; }
    return null;
  }
  /* One dock: reverse forks-first into the slot from the band north of the rack, lift or lower, drive out forward. */
  function dockSteps(task, cx, cz) {
    const st = task.slot, x = st.x, z0 = st.z + 0.85, steps = [];
    let sx = cx, sz = cz;
    if (cx > x - 2.8) { steps.push(pathStep([[cx, cz], [(cx + x - 3.0) / 2, 0.82], [x - 3.0, 0.85]], FWD, false)); sx = x - 3.0; sz = 0.85; }
    const pick = task.mode === 'pick';
    const hIns = task.rack ? (pick ? 0.78 : 0.86) : (pick ? 0.0 : 0.25);   // rack: fork bottom stays >= 3 cm above the beams (top 0.80)
    steps.push({ type: 'lift', to: hIns });
    steps.push(pathStep([[sx, sz], [x - 1.9, 0.8], [x - 0.8, 0.76], [x - 0.12, z0 + 0.4], [x, z0 + 0.25], [x, z0]], REV, true));
    if (task.rack && pick) steps.push({ type: 'lift', to: 0.86, when: (y) => y >= 0.805, fn: () => { F.carried = cell.take(st); } });
    else if (task.rack) steps.push({ type: 'lift', to: 0.78, when: (y) => y <= 0.81, fn: () => { cell.place(st, F.carried); F.carried = null; } });
    else if (pick) steps.push({ type: 'lift', to: 0.25, when: (y) => y >= 0.03, fn: () => { F.carried = cell.take(st); } });
    else steps.push({ type: 'lift', to: 0.0, when: (y) => y <= 0.02, fn: () => { cell.place(st, F.carried); F.carried = null; } });
    steps.push(pathStep([[x, z0], [x, z0 + 0.9], [x - 0.35, z0 + 1.2], [x - 1.3, 0.92]], FWD, false));
    steps.push({ type: 'lift', to: () => (F.carried ? 0.25 : 0.1) });
    F.bx = x - 1.3; F.bz = 0.92;
    steps.push({ type: 'call', fn: planNextF });
    return steps;
  }
  function planNextF() {
    const task = nextFTask();
    if (task) {
      task.slot.lock = 'F';
      F.steps.push(...dockSteps(task, F.bx, F.bz));
      return;
    }
    // nothing left to do: loop back onto the lane (wait until the tugger train is clear)
    const cx = F.bx, jx = cx + 1.6;
    F.steps.push({ type: 'wait', cond: () => !trainTooClose(jx, 2.35, 22) });
    F.steps.push(pathStep([[cx, F.bz], [cx - 1.0, 0.9], [cx - 1.8, 1.4], [cx - 1.9, 1.95], [cx - 1.2, 2.3], [cx, 2.35], [jx, 2.35]], FWD, false));
    F.steps.push({ type: 'call', fn: () => { F.busy = false; u = nearestU(jx, 2.35); prevU = u; } });
  }
  function startF(wheel) {
    F.busy = true; F.steps = []; F.i = 0;
    const px = wheel.x;
    F.steps.push(pathStep([[px, 2.35], [px + 2.5, 2.35], [px + 3.7, 1.95], [px + 4.25, 1.55], [px + 3.7, 1.0], [px + 2.0, 0.82]], FWD, false));
    F.bx = px + 2.0; F.bz = 0.82;
    F.steps.push({ type: 'call', fn: planNextF });
  }

  function placeAmr(dt) {
    if (F.busy) runSteps(F, dt, poseF, blockedF);
    else {
      if (!reduceMotion) u = (u - dt * 0.011 + 1) % 1;
      const p = spline.getPointAt(u);
      const t = spline.getTangentAt(u);
      setForklift(p.x, p.z, Math.atan2(t.z, t.x));                // forks point along the tangent; the forklift drives the other way
      // Leave the loop for the rack / outbound band when there is work to do
      if (cell && !reduceMotion && nextFTask()) {
        const before = (prevU - uDepart + 1) % 1, after = (u - uDepart + 1) % 1;
        if (before < 0.02 && after > 0.9) startF(p);
      }
    }
    prevU = u;
    if (lidar && !reduceMotion) lidar.rotation.y += dt * 4;
    // Fork height: cycles on the loop while empty; held at carry height with a pallet; tasks set it explicitly
    const want = F.busy ? F.lift : (F.carried ? 0.25 : (reduceMotion ? 0.3 : 0.43 * (1 - Math.cos(performance.now() / 1000 * 0.45))));
    F.liftY += (want - F.liftY) * (1 - Math.exp(-4 * dt));
    if (lifter) lifter.position.y = F.liftY;
    carryF();
  }

  /* ---------------- MAG lifter: drives under a mobile rack and moves it between the arm (S), the hand-off (H) and the spare spot (E) ----------------
     Racks and lifter always point east (the lifter drives in along the rack's X axis), so every move is a straight or gently curved
     drive, forward or in reverse, never a turn on the spot. */
  const LP = [20.9, -3.0];     // parking spot, front east
  function poseL(p, t, rev) {
    const fx = rev ? -t.x : t.x, fz = rev ? -t.z : t.z;
    L.x = p.x; L.z = p.z; L.phi = Math.atan2(fz, fx);
    lifterBot.root.position.set(p.x, 0, p.z);
    lifterBot.root.rotation.y = -L.phi;
  }
  const rackLift = () => Math.max(0, lifterBot.deckY + L.liftY - 0.66);      // the rack rises once the deck touches its lift pad
  function planL() {
    const SX = cell.station.x, SZ = cell.station.z, H = cell.handoff, E = cell.emptyStation;
    const rS = cell.rackAt('S'), rH = cell.rackAt('H'), rE = cell.rackAt('E');
    const ready = (r) => r && r.slot.pallet && !r.slot.pallet.userData.full && !r.slot.lock;
    const fNear = Math.hypot(amr.position.x - H.x, amr.position.z - H.z) < 5.5;
    // curve between the hand-off and the row z = -3 at x = 18.8 (all points are on the way, nothing else stands there)
    // straight and centred on the rack until the lifter's whole body is clear of the legs (x >= H + 2.6), then curve down to the row
    const hCurve = [[H.x, H.z], [H.x + 1.0, H.z], [H.x + 2.0, H.z], [H.x + 2.6, H.z], [H.x + 3.4, H.z - 0.3], [18.0, -2.2], [18.9, -2.85], [19.8, -3.0]];
    // the spare rack sits on z = E.z: come in straight along it for the last 2.6 m
    const eIn = [[19.8, -3.0], [19.0, -3.0], [18.1, -3.3], [E.x + 2.6, E.z], [E.x + 1.0, E.z], [E.x, E.z]];
    const pick = (r) => ({ type: 'lift', to: 0.24, when: () => rackLift() > 0.001, fn: () => { r.at = 'moving'; L.rack = r; } });
    const put = (r, name, pos) => ({ type: 'lift', to: 0, when: () => rackLift() <= 0.001, fn: () => { cell.setRackPose(r, pos.x, pos.z, 0, 0); r.at = name; L.rack = null; } });
    const done = { type: 'call', fn: () => { L.busy = false; } };
    let steps = null;
    if (rS && cell.palletReady && !rH) {                                // A: full rack at the arm -> hand-off
      steps = [
        pathStep([[LP[0], LP[1]], [SX, SZ]], 1.2, false), pick(rS),
        pathStep([[SX, SZ], [20.5, -3.0]].concat(hCurve.slice().reverse().slice(1)), 1.0, true), put(rS, 'H', H),
        pathStep(hCurve.slice(0, -1).concat([[LP[0], LP[1]]]), 1.3, false), done];
    } else if (!rS && rE && ready(rE)) {                                // B: spare rack (with its pallet) -> arm
      steps = [
        pathStep([[LP[0], LP[1]]].concat(eIn.slice(1)), 1.2, true), pick(rE),
        pathStep(eIn.slice().reverse().concat([[LP[0], LP[1]], [SX, SZ]]), 1.2, false), put(rE, 'S', cell.station),
        pathStep([[SX, SZ], [LP[0], LP[1]]], 1.0, true), done];
    } else if (rH && ready(rH) && !rE && !F.carried && !(F.busy && fNear)) {   // C: serviced rack at the hand-off -> spare spot
      steps = [
        pathStep([[LP[0], LP[1]], [20.5, -3.0]].concat(hCurve.slice().reverse().slice(1)), 1.1, true), pick(rH),
        pathStep(hCurve, 1.2, false), pathStep(eIn, 1.0, true), put(rH, 'E', E),
        pathStep(eIn.slice().reverse().concat([[LP[0], LP[1]]]), 1.3, false), done];
    }
    if (!steps) return;
    L.steps = steps; L.i = 0; L.busy = true;
  }
  function updateL(dt) {
    if (!lifterBot) return;
    if (L.busy) runSteps(L, dt, poseL, null); else planL();
    L.liftY += (L.lift - L.liftY) * (1 - Math.exp(-3 * dt));
    lifterBot.lift.position.y = L.liftY;
    lifterBot.beams.rotation.y += reduceMotion ? 0 : dt * 5;
    if (L.rack) cell.setRackPose(L.rack, L.x, L.z, -L.phi, rackLift());   // the rack rides on the deck, yawing with the lifter
  }

  /* ---------------- tugger train: follows the same route, never closes on the forklift ---------------- */
  const tp = new THREE.Vector3(), tq = new THREE.Vector3();
  function placeTugger(dt) {
    if (!tug) return;
    // Both robots travel toward decreasing u at the same speed, so the gap is constant. The guard
    // is a backstop: if the forklift is ever less than SAFE_GAP ahead of the tugger, hold the tugger.
    const ahead = ((uT - u + 1) % 1) * routeLen;                 // arc length from tugger to forklift, along travel
    const tailLen = tug.hitchX + tug.pitch * (tug.trolleys.length - 1) + 1.7;
    const behind = ((u - (uT + tailLen / routeLen) + 2) % 1) * routeLen;   // forklift approaching the train tail
    const vx = amr.position.x - tug.root.position.x, vz = amr.position.z - tug.root.position.z;
    const fx = Math.cos(tugHeading), fz = Math.sin(tugHeading), along = vx * fx + vz * fz, lat = Math.abs(-vx * fz + vz * fx);
    const forkliftAhead = F.busy && along > -1.5 && along < 6.0 && lat < 1.0;   // forklift on / crossing the lane right in front
    const hold = forkliftAhead || (!F.busy && ahead < SAFE_GAP + 2.5);              // forklift too close in front: wait (off-loop missions yield by position instead)
    const rate = !F.busy && behind < SAFE_GAP ? 1.5 : 1;       // forklift closing from behind: move off
    if (!reduceMotion && !hold) uT = (uT - dt * 0.011 * rate + 1) % 1;

    const t = spline.getTangentAt(uT);
    spline.getPointAt(uT, tp);
    tug.root.position.set(tp.x, 0, tp.z);
    tugHeading = Math.atan2(-t.z, -t.x);                         // +X (3D LiDAR end) leads, against the spline tangent
    tug.root.rotation.y = -tugHeading;
    tug.beams.rotation.y += reduceMotion ? 0 : dt * 5;
    tug.latchHalo.material.opacity = 0.55 + 0.4 * Math.sin(performance.now() / 1000 * 3);   // latched indicator pulse

    tug.trolleys.forEach((tr, i) => {
      const uPin = (uT + (tug.hitchX + tug.pitch * i) / routeLen) % 1;
      spline.getPointAt(uPin, tp);
      spline.getPointAt((uPin + 0.9 / routeLen) % 1, tq);        // a point inside the trolley, behind its pin
      tr.position.set(tp.x, 0, tp.z);
      tr.rotation.y = -Math.atan2(tp.z - tq.z, tp.x - tq.x);
    });
  }

  /* ---------------- camera poses ---------------- */
  // pose.p / pose.t are written in place. `time` is seconds; p is progress inside the chapter.
  const POSES = {
    intro(time) {
      const a = 0.35 + (reduceMotion ? 0 : time * 0.03);
      pose.p.set(Math.sin(a) * 62, 58, Math.cos(a) * 62 + 6);
      pose.t.set(0, 0, 3);
    },
    results(time, p) {
      const th = heading + 2.2 + (reduceMotion ? 0 : time * 0.1) + p * 0.8;
      pose.p.set(amr.position.x + 6.5 * Math.cos(th), 3.0, amr.position.z + 6.5 * Math.sin(th));
      pose.t.set(amr.position.x, 1.0, amr.position.z);
    },
    experience(time, p) {
      pose.p.set(-50 + p * 26, 12 - p * 2, 2.85 + (p - 0.5) * 8);
      pose.t.set(16 + p * 14, 2.2, 2.85);
    },
    work(time, p) {
      if (!tug) { pose.p.set(10 - p * 12, 7.5, 13); pose.t.set(0, 1, 2.5); return; }
      const fx = Math.cos(tugHeading), fz = Math.sin(tugHeading);       // tugger forward (+X local)
      const mid = tug.trolleys[1].position;
      // Shot 1 (first half of the chapter): close on the auto-latch hitch between tugger and trolley 1
      const hx = tug.root.position.x - 1.10 * fx, hz = tug.root.position.z - 1.10 * fz;
      const th1 = tugHeading + Math.PI / 2 + 0.5;
      // Shot 2: side-on along the whole train
      const th2 = tugHeading + Math.PI / 2 + (p - 0.5) * 0.9;
      const k = smooth((p - 0.35) / 0.3);
      V[0].set(hx + 2.1 * Math.cos(th1), 1.5, hz + 2.1 * Math.sin(th1));
      V[1].set(hx, 0.4, hz);
      V[2].set(mid.x + 8.5 * Math.cos(th2), 3.2, mid.z + 8.5 * Math.sin(th2));
      V[3].set(mid.x + 1.6 * fx, 0.8, mid.z + 1.6 * fz);
      pose.p.lerpVectors(V[0], V[2], k);
      pose.t.lerpVectors(V[1], V[3], k);
    },
    opensource(time, p) {
      pose.p.set(-34 + p * 28, 18, 13);
      pose.t.set(-12, 3, -3);
    },
    factory(time, p) {
      // Overview of the cell, then in on the arm and pallet
      V[0].set(12 + p * 6, 10 - p * 4, 11 - p * 3); V[1].set(27, 0.6, -2.2);
      V[2].set(25 + Math.sin(time * 0.15) * 2, 4.6, 3.2); V[3].set(24.2, 1.1, -2.8);
      const k = smooth((p - 0.35) / 0.4);
      pose.p.lerpVectors(V[0], V[2], k); pose.t.lerpVectors(V[1], V[3], k);
    },
    skills(time) {
      const th = heading - 0.7 - (reduceMotion ? 0 : time * 0.07);
      pose.p.set(amr.position.x + 3.8 * Math.cos(th), 1.5, amr.position.z + 3.8 * Math.sin(th));
      pose.t.set(amr.position.x, 1.0, amr.position.z);
    },
    contact() {
      pose.p.set(amr.position.x + 30, 40, amr.position.z + 52);
      pose.t.set(amr.position.x, 0, amr.position.z);
    }
  };

  function heroPose(p, time) {
    const ax = amr.position.x, az = amr.position.z;
    const ch = Math.cos(heading), sh = Math.sin(heading);
    const [A, B, C, D, E, F, G, H] = V;

    // aerial -> chase (behind = toward the trailing forks)
    POSES.intro(time);
    A.copy(pose.p); B.copy(pose.t);
    C.set(ax + 10 * ch, 5.5, az + 10 * sh);
    D.set(ax - 2 * ch, 0.9, az - 2 * sh);

    // low orbit: behind -> side -> front
    const s = clamp((p - 0.3) / 0.4, 0, 1);
    const th = heading - s * Math.PI * 1.05;
    const r = 7 - 3.4 * smooth(s);
    const hgt = 3.4 - 2.2 * smooth(s);
    E.set(ax + r * Math.cos(th), hgt, az + r * Math.sin(th));
    F.set(ax + 0.1 * ch, 1.0, az + 0.1 * sh);

    if (p < 0.22) {
      const k = smooth((p - 0.03) / 0.19);
      pose.p.lerpVectors(A, C, k); pose.t.lerpVectors(B, D, k);
    } else if (p < 0.34) {
      const k = smooth((p - 0.22) / 0.12);
      pose.p.lerpVectors(C, E, k); pose.t.lerpVectors(D, F, k);
    } else if (p < 0.8) {
      pose.p.copy(E); pose.t.copy(F);
    } else {
      // hand over to the first chapter's pose
      const k = smooth((p - 0.8) / 0.2);
      G.copy(E); H.copy(F);
      POSES.intro(time);
      pose.p.copy(G).lerp(pose.p, k);
      pose.t.copy(H).lerp(pose.t, k);
    }
  }

  function desiredPose(time) {
    if (heroP < 1 && document.body.classList.contains('on-hero')) {
      heroPose(heroP, time);
      return 5;
    }
    const name = chapter && chapter.dataset.cam;
    (POSES[name] || POSES.intro)(time, chapterP);
    return 2.6;
  }

  /* ---------------- loop ---------------- */
  let lastFrameTime = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!ready || document.hidden || paused) return;

    if (now && now - lastFrameTime < 15.5) return; // 60 FPS cap (prevents overheating on 120Hz/144Hz displays)
    lastFrameTime = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (cell && !reduceMotion) { cell.update(dt); updateL(dt); }
    placeAmr(dt);
    placeTugger(dt);
    /*DBG*/ if (window.__dbg && window.__dbg.locked) { const Lk = window.__dbg.locked; camera.position.set(Lk[0], Lk[1], Lk[2]); camera.lookAt(Lk[3], Lk[4], Lk[5]); renderer.render(scene, camera); return; }
    const speed = desiredPose(now / 1000);
    const k = 1 - Math.exp(-speed * dt);
    camPos.lerp(pose.p, k);
    camTarget.lerp(pose.t, k);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }





  /*DBG*/ window.__dbg = { cnt: { F: 0, L: 0, Lc: 0 }, at: {}, steps: 0,
  /*DBG*/   verts(o) { o.updateMatrixWorld(true); const r = []; o.traverse((m) => { if (m.isMesh && !m.isLineSegments) { const g = m.geometry, p = g.attributes.position; const step = Math.max(1, Math.floor(p.count / 400)); for (let i = 0; i < p.count; i += step) r.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)); } }); return r; },
  /*DBG*/   hit(rack, V, tol) { rack.group.updateMatrixWorld(true); const inv = rack.group.matrixWorld.clone().invert(); const boxes = []; rack.group.children.forEach((m) => { if (!m.isMesh) return; if (m.geometry.parameters && m.geometry.parameters.width === 0.7) return; const q = m.geometry.parameters; boxes.push([m.position.x - q.width / 2 - tol, m.position.x + q.width / 2 + tol, m.position.y - q.height / 2 - tol, m.position.y + q.height / 2 + tol, m.position.z - q.depth / 2 - tol, m.position.z + q.depth / 2 + tol]); }); let n = 0, first = null; V.forEach((v) => { const l = v.clone().applyMatrix4(inv); for (const b of boxes) if (l.x > b[0] && l.x < b[1] && l.y > b[2] && l.y < b[3] && l.z > b[4] && l.z < b[5]) { n++; if (!first) first = [+l.x.toFixed(2), +l.y.toFixed(2), +l.z.toFixed(2)]; break; } }); return { n, first }; },
  /*DBG*/   step(sec) { for (let t = 0; t < sec; t += 0.05) { if (cell) { cell.update(0.05); updateL(0.05); } placeAmr(0.05); placeTugger(0.05); this.steps++; this.gaps();
  /*DBG*/     cell.racks.forEach((r) => { const dF = Math.hypot(amr.position.x - r.x, amr.position.z - r.z), dL = Math.hypot(L.x - r.x, L.z - r.z);
  /*DBG*/       if (dF < 3.6) { const o = this.hit(r, this.verts(amr), 0.01); if (o.n) { this.cnt.F++; this.at.F = this.at.F || [o.first, amr.position.x.toFixed(1), amr.position.z.toFixed(1), r.at, F.i, this.steps]; } }
  /*DBG*/       if (dL < 2.6 && !(L.rack === r)) { const o = this.hit(r, this.verts(lifterBot.root), 0.01); if (o.n) { this.cnt.L++; this.at.L = this.at.L || [o.first, L.x.toFixed(1), L.z.toFixed(1), r.at, L.i, L.liftY.toFixed(2)]; } }
  /*DBG*/       if (dL < 2.6 && L.rack === r) { const o = this.hit(r, this.verts(lifterBot.root), 0.01); if (o.n) { this.cnt.Lc++; this.at.Lc = this.at.Lc || [o.first, L.x.toFixed(1), L.z.toFixed(1), r.at, L.i, L.liftY.toFixed(2)]; } } }); } },
  /*DBG*/   cam() { this.locked = Array.from(arguments); },
  /*DBG*/   mn: { FL: 1e9, FT: 1e9, LT: 1e9, TR: 1e9 }, cyc: { pick: 0, drop: 0, move: 0, lastRack: '' },
  /*DBG*/   pts(o, xs, zs) { o.updateMatrixWorld(true); const r = []; xs.forEach((x) => zs.forEach((z) => r.push(o.localToWorld(new THREE.Vector3(x, 0, z))))); return r; },
  /*DBG*/   dist(A, B) { let m = 1e9; A.forEach((a) => B.forEach((b) => { m = Math.min(m, Math.hypot(a.x - b.x, a.z - b.z)); })); return m; },
  /*DBG*/   gaps() { const Fp = this.pts(amr, [-1.15, -0.6, 0, 0.4, 0.85], [-0.55, 0, 0.55]), Lp = this.pts(lifterBot.root, [-0.67, 0, 0.67], [-0.53, 0, 0.53]); const Tp = this.pts(tug.root, [-0.67, 0, 0.67], [-0.53, 0, 0.53]); tug.trolleys.forEach((tr) => Tp.push(...this.pts(tr, [0, -0.4, -0.8, -1.2, -1.6], [-0.43, 0, 0.43]))); const Rp = []; cell.racks.forEach((r) => Rp.push(...this.pts(r.group, [-1.05, -0.5, 0, 0.5, 1.05], [-0.66, 0, 0.66]))); const d = { FL: this.dist(Fp, Lp), FT: this.dist(Fp, Tp), LT: this.dist(Lp, Tp), TR: this.dist(Tp, Rp) }; Object.keys(d).forEach((k) => { if (d[k] < this.mn[k]) this.mn[k] = d[k]; }); },
  /*DBG*/   state() { return JSON.stringify({ racks: cell.racks.map((r) => r.at + ':' + (r.slot.pallet ? (r.slot.pallet.userData.full ? 'full' : 'p' + (r.slot.pallet.userData.boxes || []).length) : 'none')).join(' '), out: cell.out.loaded.concat(cell.out.empty).map((b) => (b.pallet ? (b.pallet.userData.loaded ? 'L' : 'e') : '.')).join(''), F: F.busy ? 'task' : 'route', L: L.busy ? 'trip' : 'idle', gaps: Object.fromEntries(Object.entries(this.mn).map(([k, v]) => [k, +v.toFixed(2)])) }); },
  /*DBG*/   stats() { return JSON.stringify({ stepsWithContact: this.cnt, firstAt: this.at, steps: this.steps }); }
  /*DBG*/ };

  /* ---------------- start ---------------- */
  readScroll();
  // Let the text paint first; build the 3D scene when the main thread is idle.
  const whenIdle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 60));
  if (window.PortfolioWorld) whenIdle(() => build(window.PortfolioWorld));
  else window.addEventListener('portfolio:world', () => whenIdle(() => build(window.PortfolioWorld)), { once: true });
})();
