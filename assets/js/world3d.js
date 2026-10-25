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
  let mission = null;             // forklift pallet mission (leaves the loop, moves one pallet, rejoins)
  let uDepart = 0;                // route parameter where the forklift leaves the loop for the cell
  let prevU = 0;
  let liftY = 0;                  // current fork height (smoothed)
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
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      console.warn('3D backdrop disabled (WebGL unavailable):', e);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
    const stride = small ? 2 : 1;
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
      size: small ? 2.6 : 2.4, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 1
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
    uDepart = nearestU(13.0, 2.35);
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

  function placeAmr(dt) {
    if (mission) runMission(dt);
    else {
      if (!reduceMotion) u = (u - dt * 0.011 + 1) % 1;
      const p = spline.getPointAt(u);
      const t = spline.getTangentAt(u);
      setForklift(p.x, p.z, Math.atan2(t.z, t.x));                // forks point along the tangent; the forklift drives the other way
      // Leave the loop for the factory cell when a pallet is waiting
      if (cell && !reduceMotion && cell.palletReady) {
        const before = (prevU - uDepart + 1) % 1, after = (u - uDepart + 1) % 1;
        if (before < 0.02 && after > 0.9) startMission(p);
      }
    }
    prevU = u;
    if (lidar && !reduceMotion) lidar.rotation.y += dt * 4;
    // Fork height: the lift cycles on the loop; missions set it explicitly
    const want = mission ? mission.lift : (reduceMotion ? 0.3 : 0.43 * (1 - Math.cos(performance.now() / 1000 * 0.45)));
    liftY += (want - liftY) * (1 - Math.exp(-4 * dt));
    if (lifter) lifter.position.y = liftY;
  }

  /* ---------------- forklift pallet mission ---------------- */
  const FWD = 1.5, REV = 0.9, CARRY = 1.0;
  function pathStep(pts, speed, reverse) {
    const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.5);
    return { type: 'path', curve: c, len: c.getLength(), s: 0, speed, reverse };
  }
  function startMission(wheel) {
    if (cell.outboundCount >= cell.zone.slotsX.length) cell.clearOutboundIfFull();
    const slot = cell.outboundCount, xs = cell.zone.slotsX[slot], zz = cell.zone.z;
    const pk = cell.pickup, px = wheel.x;
    const Wpick = [pk.x - 0.3 - 0.55, pk.z], Wdrop = [xs - 0.85, zz];
    const join = [xs + 2.2, 2.35];
    mission = {
      lift: 0, slot, join, carried: null, i: 0, timer: 0,
      steps: [
        pathStep([[px, 2.35], [px + 3, 2.35], [px + 5.6, 1.5], [px + 6.6, -0.2], [px + 5.9, -1.9], [px + 4.2, -2.9], [px + 2.5, -3.0], [px + 1.5, -3.0]], FWD, false),
        pathStep([[px + 1.5, zz], Wpick], REV, true),
        { type: 'lift', to: 0.3, dur: 1.4 },
        pathStep([Wpick, Wdrop], CARRY, false),
        { type: 'lower', to: 0, dur: 1.4 },
        { type: 'clear', radius: 14 },
        pathStep([Wdrop, [xs - 1.5, -2.2], [xs - 1.65, -0.6], [xs - 0.9, 1.2], [xs + 0.5, 2.15], join], FWD, false)
      ]
    };
  }
  const _o = new THREE.Vector3();
  function trainTooClose(x, z, r) {
    if (!tug) return false;
    const r2 = r * r;
    const near = (p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < r2;
    return near(tug.root.position) || tug.trolleys.some((t) => near(t.position));
  }
  function carriedFollow(phi) {
    const g = mission.carried;
    if (!g) return;
    g.position.set(amr.position.x + 0.3 * Math.cos(phi), liftY, amr.position.z + 0.3 * Math.sin(phi));
    g.rotation.y = -phi;
  }
  function runMission(dt) {
    const m = mission, s = m.steps[m.i];
    if (!s) { endMission(); return; }
    if (s.type === 'path') {
      // yield to the tugger train if it comes close
      if (trainTooClose(amr.position.x, amr.position.z, 3.2)) return;
      const rem = s.len - s.s;
      s.s = Math.min(s.len, s.s + s.speed * dt * clamp(Math.min(s.s, rem) / 1.0 + 0.25, 0.25, 1));
      const k = clamp(s.s / s.len, 0, 1);
      const p = s.curve.getPointAt(k), t = s.curve.getTangentAt(k);
      const phi = s.reverse ? Math.atan2(t.z, t.x) : Math.atan2(-t.z, -t.x);   // forks lead when reversing, trail when driving forward
      setForklift(p.x, p.z, phi);
      carriedFollow(phi);
      if (s.len - s.s < 0.02) m.i++;
    } else if (s.type === 'lift' || s.type === 'lower') {
      m.lift = s.to;
      s.t = (s.t || 0) + dt;
      carriedFollow(heading);
      if (s.t >= s.dur && Math.abs(liftY - s.to) < 0.02) {
        if (s.type === 'lift') m.carried = cell.takePallet();
        else {
          cell.placePallet(m.carried, m.slot);
          m.carried = null;
          cell.respawnPallet();                                  // a fresh pallet for the arm
        }
        m.i++;
      }
    } else if (s.type === 'clear') {
      if (!trainTooClose(m.join[0], m.join[1], s.radius)) m.i++;   // wait off the lane until the tugger train has passed
    }
  }
  function endMission() {
    const j = mission.join;
    mission = null;
    u = nearestU(j[0], j[1]);
    prevU = u;
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
    const hold = !mission && ahead < SAFE_GAP + 2.5;              // forklift too close in front: wait (off-loop missions yield by position instead)
    const rate = !mission && behind < SAFE_GAP ? 1.5 : 1;       // forklift closing from behind: move off
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
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!ready || document.hidden || paused) return;

    if (cell && !reduceMotion) cell.update(dt);
    placeAmr(dt);
    placeTugger(dt);
    const speed = desiredPose(now / 1000);
    const k = 1 - Math.exp(-speed * dt);
    camPos.lerp(pose.p, k);
    camTarget.lerp(pose.t, k);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }

  /* ---------------- start ---------------- */
  readScroll();
  // Let the text paint first; build the 3D scene when the main thread is idle.
  const whenIdle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 60));
  if (window.PortfolioWorld) whenIdle(() => build(window.PortfolioWorld));
  else window.addEventListener('portfolio:world', () => whenIdle(() => build(window.PortfolioWorld)), { once: true });
})();
