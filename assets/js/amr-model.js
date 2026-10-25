/**
 * Botsync AMR pallet stacker (simplified visual model, dimensions rounded): chassis, mast,
 * LiDAR and camera housings, lifter with its forks, drive wheel and fork casters.
 *
 * window.buildBotsyncAMR(THREE) returns { root, lifter, steer, lidarTop }.
 *   root     in the site's vehicle frame: +X toward the forks, +Y up, Z lateral; the steered
 *            drive wheel sits at x = -0.55.
 *   lifter   child of root named "lifter": set position.y in 0..0.86 to raise the forks.
 *   steer    drive-wheel group: rotate about Y to steer.
 *   lidarTop position of the top 3D LiDAR in root coordinates (origin for the scan beams).
 */
(function () {
  'use strict';

  window.buildBotsyncAMR = function (THREE) {
    const P = {
      bodyL: 0.34, bodyW: 0.77, bodyH: 1.3, mastL: 0.19, mastH: 2.0,
      bumperL: 0.43, bumperW: 1.07,
      sForkW: 0.16, sForkT: 0.08, sForkLen: 1.15, sForkGap: 0.19,
      wheelBase: 0.97, wheelOff: -0.06, wheelR: 0.115, casterR: 0.04, casterW: 0.05,
      forkGap: 0.38, liftH: 0.46, liftZ: 0.10,
      forkW: 0.18, forkT: 0.05, forkLen: 1.15,
      lidarA: [0, 0, 2.13], lidarB: [-0.12, 0, 1.49, 0, 1.31, 0],
      lidar2L: [-0.16, 0.39, 0.08], lidar2R: [-0.16, -0.39, 0.08], lidar2RearZ: 0.11, camOff: [0, 0, 0.41]
    };
    const CH = P.wheelBase + P.wheelOff;     // chassis x from the axle midpoint
    const hl = P.bodyL / 2, hw = P.bodyW / 2;
    const LIFTER = [-hl, 0, P.liftZ / 2];
    const WO = 0.09, CAST_H = 0.03;

    // vehicle axes (x fwd, y left, z up) -> three (x, y up, z)
    const V = (X, Y, Z) => new THREE.Vector3(X, Z, -Y);
    const vv = (a) => V(a[0], a[1], a[2]);
    const axisZ = (rpy) => {
      const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rpy[0], rpy[1], rpy[2], 'ZYX')).elements;
      return V(e[8], e[9], e[10]);
    };

    const S = {
      top: { xyz: [-P.lidarA[0], P.lidarA[1], P.lidarA[2]], rpy: [0, 0.01, 0] },
      mid: { xyz: [-P.lidarB[0], P.lidarB[1], P.lidarB[2]], rpy: [0, 1.31, 0] },
      left: { xyz: [-P.lidar2L[0], P.lidar2L[1], P.lidar2L[2]], rpy: [0, 3.14, -2.6] },
      right: { xyz: [-P.lidar2R[0], P.lidar2R[1], P.lidar2R[2]], rpy: [0, 3.12, 2.56] },
      rlid: { xyz: [-hl, 0, P.lidar2RearZ], rpy: [0, 0, 3.14] },
      cam: { xyz: [LIFTER[0] - P.camOff[0], LIFTER[1] - P.camOff[1], LIFTER[2] + P.camOff[2]] }
    };

    // The site renders in linear output, so materials take the authored colours directly.
    const M = (c, r = 0.55, m = 0.15, x = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, x));
    const mat = {
      body: M(0x3b4046, 0.6, 0.2), dark: M(0x26292d, 0.65, 0.2), rubber: M(0x17191b, 0.9, 0),
      lime: M(0x86a800, 0.5, 0.05, { emissive: 0x1a2400, emissiveIntensity: 0.25 }),
      steel: M(0x7d848c, 0.35, 0.7), white: M(0xffffff, 0.3, 0, { emissive: 0xffffff, emissiveIntensity: 0.6 }),
      black: M(0x15171a, 0.35, 0.3), glass: M(0x0d1b2a, 0.08, 0.6), red: M(0xd7261e, 0.35, 0.05),
      roller: M(0xe7b79c, 0.55, 0), blue: M(0x2f6bff, 0.2, 0, { emissive: 0x2f6bff, emissiveIntensity: 2.2 }),
      chain: M(0x24272b, 0.5, 0.6), screen: M(0x8fb3d9, 0.15, 0.1, { emissive: 0x3a5f8a, emissiveIntensity: 0.5 }),
      purple: M(0x9b5cff, 0.3, 0, { emissive: 0x7a3cff, emissiveIntensity: 1.2 }),
      green: M(0x22ff66, 0.3, 0, { emissive: 0x22ff66, emissiveIntensity: 1.5 }),
      fork: M(0x2e3236, 0.6, 0.25), cable: M(0x101112, 0.5, 0.2)
    };

    const robot = new THREE.Group();       // chassis frame (+X toward the mast face)
    const lifter = new THREE.Group();
    lifter.name = 'lifter';
    robot.add(lifter);
    let G = robot;

    function add(geo, m, pos, rot) {
      const o = new THREE.Mesh(geo, m);
      if (pos) o.position.copy(pos);
      if (rot) o.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      G.add(o);
      return o;
    }
    function rr(w, h, r) {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      r = Math.min(r, w / 2, h / 2);
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    function rbox(X0, X1, Y0, Y1, Z0, Z1, m, r = 0.03, bev = 0.012) {
      const w = X1 - X0, d = Y1 - Y0, h = Z1 - Z0, b = Math.min(bev, h / 3);
      const g = new THREE.ExtrudeGeometry(rr(w - 2 * b, d - 2 * b, Math.max(0.001, r - b)),
        { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 8 });
      g.translate(0, 0, -(h - 2 * b) / 2);
      const o = add(g, m);
      o.rotation.x = -Math.PI / 2;
      o.position.copy(V((X0 + X1) / 2, (Y0 + Y1) / 2, (Z0 + Z1) / 2));
      return o;
    }
    function box(X0, X1, Y0, Y1, Z0, Z1, m) {
      return add(new THREE.BoxGeometry(X1 - X0, Z1 - Z0, Y1 - Y0), m, V((X0 + X1) / 2, (Y0 + Y1) / 2, (Z0 + Z1) / 2));
    }
    function cylAxis(c, dir, r, h, m, seg = 40) {
      const o = add(new THREE.CylinderGeometry(r, r, h, seg), m, c.clone());
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return o;
    }
    const UP = V(0, 0, 1);

    /* ---------- chassis ---------- */
    rbox(-hl, -hl + P.bumperL, -P.bumperW / 2, P.bumperW / 2, 0.0, 0.03, mat.rubber, 0.14, 0.01);
    rbox(-hl, 0.09, -0.32, 0.32, 0.03, 0.15, mat.dark, 0.05, 0.01);
    rbox(-hl, hl, -hw, hw, 0.15, P.bodyH - 0.04, mat.body, 0.045, 0.018);
    rbox(-hl - 0.006, hl + 0.006, -hw - 0.006, hw + 0.006, P.bodyH - 0.05, P.bodyH, mat.dark, 0.05, 0.012);
    box(hl, hl + 0.006, -0.30, -0.08, 0.20, 0.215, mat.white);
    box(hl, hl + 0.006, 0.08, 0.30, 0.20, 0.215, mat.white);

    function limePanel(k) {
      const s = new THREE.Shape();
      const Q = (u, v) => [u * k, v];
      s.moveTo(...Q(0.378, 0.24)); s.lineTo(...Q(0.378, 1.10));
      s.quadraticCurveTo(...Q(0.376, 1.16), ...Q(0.33, 1.16)); s.lineTo(...Q(0.275, 1.16));
      s.quadraticCurveTo(...Q(0.24, 1.15), ...Q(0.23, 1.10));
      s.bezierCurveTo(...Q(0.195, 0.80), ...Q(0.10, 0.55), ...Q(0.095, 0.34));
      s.quadraticCurveTo(...Q(0.10, 0.24), ...Q(0.16, 0.24)); s.lineTo(...Q(0.378, 0.24));
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2, curveSegments: 24 });
      const o = add(g, mat.lime);
      o.material.side = THREE.DoubleSide;
      o.rotation.y = Math.PI / 2;
      o.position.copy(V(hl + 0.002, 0, 0));
    }
    limePanel(1); limePanel(-1);
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.30, 16), mat.white, V(hl + 0.004, 0, 0.86));
    add(new THREE.SphereGeometry(0.02, 20, 12), mat.white, V(hl + 0.004, 0, 1.06));

    // BOTSYNC logo plate on the mast face
    (function () {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const x = c.getContext('2d');
      x.strokeStyle = x.fillStyle = '#a8cc10'; x.lineWidth = 18;
      x.beginPath(); x.moveTo(206, 30); x.lineTo(206, 110); x.lineTo(306, 110); x.stroke();
      x.beginPath(); x.arc(276, 80, 30, -Math.PI / 2, Math.PI / 2); x.stroke();
      x.font = '700 64px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center';
      x.fillText('BOTSYNC', 256, 215);
      const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
      const o = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      o.rotation.y = Math.PI / 2;
      o.position.copy(V(hl + 0.006, 0, 0.50));
      robot.add(o);
    })();

    // console: screen, buttons, e-stops
    (function () {
      const o = add(new THREE.BoxGeometry(0.03, 0.15, 0.22), mat.dark, V(0.12, -0.20, P.bodyH + 0.06));
      o.rotation.z = 0.45;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.12), mat.screen);
      s.rotation.y = Math.PI / 2; s.position.set(0.016, 0, 0); o.add(s);
    })();
    [[0.12, 0.13, mat.black], [0.12, 0.19, mat.black], [0.06, 0.15, mat.steel], [0.06, 0.23, mat.black], [0.12, 0.26, M(0x2a7bd6, 0.4, 0.2)]]
      .forEach(([X, Y, m]) => cylAxis(V(X, Y, P.bodyH + 0.015), UP, 0.016, 0.03, m, 20));
    cylAxis(V(0.06, -0.33, P.bodyH + 0.025), UP, 0.026, 0.05, mat.red, 24);
    [[-0.12, 0.30], [-0.12, -0.30]].forEach(([X, Y]) => add(new THREE.TorusGeometry(0.025, 0.007, 10, 24), mat.steel, V(X, Y, P.bodyH + 0.03), [0, Math.PI / 2, 0]));
    [1, -1].forEach((s) => cylAxis(V(0.12, s * (hw + 0.012), 1.08), V(0, s, 0), 0.03, 0.03, mat.red, 24));
    [1, -1].forEach((s) => cylAxis(V(-0.13, s * 0.13, P.bodyH + 0.10), UP, 0.006, 0.20, mat.black, 8));

    /* ---------- mast ---------- */
    const mh = P.mastL / 2;
    rbox(-mh, mh, -mh, mh, P.bodyH, P.mastH, mat.body, 0.02, 0.008);
    rbox(-0.13, 0.13, -0.15, 0.15, P.mastH, P.mastH + 0.04, mat.dark, 0.02, 0.008);
    [[-0.11, 0.13], [-0.11, -0.13], [0.11, 0.13], [0.11, -0.13]]
      .forEach(([X, Y]) => box(X - 0.012, X + 0.012, Y - 0.012, Y + 0.012, P.mastH + 0.04, P.mastH + 0.065, mat.dark));
    rbox(-0.13, 0.13, -0.15, 0.15, P.mastH + 0.065, P.mastH + 0.083, mat.dark, 0.02, 0.006);
    box(mh, mh + 0.025, -0.055, 0.055, 1.62, 1.76, M(0xaab1b8, 0.5, 0.3));
    cylAxis(V(mh + 0.035, 0, 1.72), V(1, 0, 0), 0.022, 0.022, mat.red, 24);
    (function () { const o = add(new THREE.SphereGeometry(0.028, 24, 16), mat.blue, V(mh + 0.01, 0, 1.86)); o.scale.set(0.6, 0.8, 1.2); })();
    [1, -1].forEach((s) => add(new THREE.SphereGeometry(0.026, 20, 14), M(0xe9ecef, 0.3, 0.1), V(0, s * (mh + 0.01), 1.96)));

    // coiled cable from the mast to the console
    (function () {
      class C extends THREE.Curve {
        getPoint(t) {
          const a = V(0.03, mh + 0.01, 1.62), b = V(hl + 0.01, 0.07, 1.0);
          const p = a.clone().lerp(b, t);
          p.x += Math.sin(t * Math.PI) * 0.10;
          const g = t * 34 * Math.PI * 2;
          p.y += Math.cos(g) * 0.016; p.z += Math.sin(g) * 0.016;
          return p;
        }
      }
      robot.add(new THREE.Mesh(new THREE.TubeGeometry(new C(), 500, 0.0045, 6, false), mat.cable));
    })();

    // rear mast channels, chain links and counterweight plate on the chassis rear face
    box(-hl - 0.008, -hl, -0.34, 0.34, 0.15, P.bodyH - 0.05, mat.dark);
    [1, -1].forEach((s) => {
      box(-hl - 0.040, -hl - 0.008, s * 0.27 - 0.03, s * 0.27 + 0.03, 0.15, P.bodyH - 0.05, mat.chain);
      for (let z = 0.2; z < 1.22; z += 0.03) box(-hl - 0.044, -hl - 0.038, s * 0.27 - 0.012, s * 0.27 + 0.012, z, z + 0.012, mat.steel);
    });
    box(-hl - 0.04, -hl - 0.008, -0.18, 0.18, 0.62, 1.18, mat.dark);
    box(-hl - 0.042, -hl - 0.04, -0.01, 0.05, 0.98, 1.06, M(0xc9cdd2, 0.6, 0.1));

    // static base forks + fork-tip caster rollers
    [1, -1].forEach((s) => {
      const y = s * P.sForkGap, X1 = P.wheelOff, X0 = X1 - P.sForkLen;
      rbox(X0, X1, y - P.sForkW / 2, y + P.sForkW / 2, 0.0, P.sForkT, mat.dark, 0.02, 0.006);
      cylAxis(V(-CH, s * P.forkGap / 2, CAST_H), V(0, 1, 0), P.casterR, P.casterW + 0.03, mat.roller, 24);
    });

    // steered drive wheel
    const steer = new THREE.Group();
    steer.position.copy(V(-P.wheelOff, 0, WO));
    G = steer;
    cylAxis(new THREE.Vector3(), V(0, 1, 0), P.wheelR, 0.075, mat.rubber, 40);
    cylAxis(new THREE.Vector3(), V(0, 1, 0), P.wheelR * 0.55, 0.08, mat.steel, 24);
    robot.add(steer);
    G = robot;

    /* ---------- sensors ---------- */
    function lidar2d(s) {
      const c = vv(s.xyz), ax = axisZ(s.rpy);
      cylAxis(c, ax, 0.05, 0.08, mat.black); cylAxis(c, ax, 0.052, 0.04, mat.glass);
      cylAxis(c.clone().add(UP.clone().multiplyScalar(0.045)), UP, 0.055, 0.012, mat.dark);
    }
    function lidar3d(s, r, h) {
      const c = vv(s.xyz), ax = axisZ(s.rpy);
      cylAxis(c, ax, r, h, mat.black); cylAxis(c, ax, r * 1.02, h * 0.4, mat.glass);
      cylAxis(c.clone().add(ax.clone().multiplyScalar(h / 2 + 0.004)), ax, r * 0.85, 0.008, mat.steel);
    }
    lidar3d(S.top, 0.052, 0.072); lidar3d(S.mid, 0.045, 0.065);
    box(mh, S.mid.xyz[0] - 0.02, -0.05, 0.05, S.mid.xyz[2] - 0.05, S.mid.xyz[2] + 0.05, mat.dark);
    lidar2d(S.left); lidar2d(S.right);
    [S.left, S.right].forEach((s) => box(s.xyz[0] - 0.06, s.xyz[0] + 0.02, s.xyz[1] - 0.05, s.xyz[1] + 0.05, 0.13, 0.15, mat.dark));
    (function () {
      const c = vv(S.rlid.xyz);
      box(-hl + 0.002, -hl + 0.04, -0.06, 0.06, 0.04, 0.22, mat.dark);
      cylAxis(c, UP, 0.035, 0.06, mat.glass);
      cylAxis(c.clone().add(UP.clone().multiplyScalar(0.04)), UP, 0.038, 0.02, mat.black);
      cylAxis(c.clone().add(UP.clone().multiplyScalar(-0.04)), UP, 0.038, 0.02, mat.black);
      add(new THREE.SphereGeometry(0.007, 12, 8), mat.green, V(-hl - 0.03, 0.045, 0.17));
    })();

    /* ---------- lifter: carriage plate, forks, camera (rise with the lift) ---------- */
    G = lifter;
    const LX = LIFTER[0], LZ = LIFTER[2], LT = LZ + P.liftH;
    (function () {
      const s = new THREE.Shape();
      s.moveTo(-0.34, LZ); s.lineTo(0.34, LZ); s.lineTo(0.34, LT - 0.06); s.lineTo(0.28, LT);
      s.lineTo(-0.28, LT); s.lineTo(-0.34, LT - 0.06); s.lineTo(-0.34, LZ);
      const h = new THREE.Path();
      h.moveTo(-0.075, LZ + 0.002); h.lineTo(0.075, LZ + 0.002); h.lineTo(0.075, 0.27); h.lineTo(-0.075, 0.27); h.lineTo(-0.075, LZ + 0.002);
      s.holes.push(h);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 });
      const o = add(g, mat.body);
      o.rotation.y = Math.PI / 2;
      o.position.copy(V(LX - 0.045, 0, 0));
    })();
    [1, -1].forEach((s) => {
      const y = s * P.forkGap / 2, X1 = LX, X0 = X1 - P.forkLen;
      const sh = new THREE.Shape();
      sh.moveTo(X1, LZ); sh.lineTo(X0 + 0.07, LZ); sh.quadraticCurveTo(X0, LZ + 0.005, X0, LZ + 0.02);
      sh.lineTo(X0 + 0.08, LZ + P.forkT); sh.lineTo(X1, LZ + P.forkT); sh.lineTo(X1, LZ);
      const g = new THREE.ExtrudeGeometry(sh, { depth: P.forkW, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
      add(g, mat.fork).position.copy(V(0, y + P.forkW / 2, 0));
      box(X1 - 0.075, X1 - 0.045, y - 0.07, y + 0.07, LZ, LZ + 0.22, mat.steel);
    });
    (function () {
      const c = S.cam.xyz, bx = -hl - 0.05;
      box(bx - 0.045, bx, -0.08, 0.08, c[2] - 0.03, c[2] + 0.03, mat.black);
      const wx = bx - 0.045;
      box(wx - 0.003, wx, -0.065, 0.065, c[2] - 0.02, c[2] + 0.02, mat.glass);
      [-0.04, 0, 0.04].forEach((Y) => cylAxis(V(wx - 0.004, Y, c[2]), V(-1, 0, 0), 0.009, 0.004, mat.purple, 16));
    })();
    G = robot;

    /* ---------- compose in the site's vehicle frame ---------- */
    // The model has the mast face at +X and the forks at -X. The site wants forks at +X with the
    // steered wheel at x = -0.55, so turn the model half a revolution about Y and slide it.
    robot.position.copy(V(CH, 0, 0));                       // axle midpoint at the wrapper origin
    const wrap = new THREE.Group();
    wrap.add(robot);
    wrap.rotation.y = Math.PI;
    wrap.position.x = -0.55 + P.wheelBase;
    const root = new THREE.Group();
    root.add(wrap);

    // top 3D LiDAR, expressed in the root frame
    const lidarTop = new THREE.Vector3();
    root.updateMatrixWorld(true);
    lidarTop.copy(vv(S.top.xyz));
    robot.localToWorld(lidarTop);
    root.worldToLocal(lidarTop);

    return { root, lifter, steer, lidarTop };
  };
})();
