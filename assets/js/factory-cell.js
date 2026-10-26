/**
 * Factory cell for the 3D backdrop: inbound truck -> conveyor -> UR-style palletizing arm stacking onto a
 * pallet in a MOBILE RACK (open U-frame on four legs) -> the MAG lifter drives under the rack and moves it to a
 * hand-off spot -> the forklift swaps the pallet (loaded out to the outbound zone, empty in) -> the lifter
 * brings the rack back to the arm.
 *
 * window.buildFactoryCell(THREE) returns:
 *   group             add to the scene
 *   update(dt)        advance truck, conveyor, arm; keeps the pallet seated on the rack
 *   station           { x, z } rack position at the arm
 *   handoff / emptyStation  { x, z } rack positions at the forklift and at the waiting spot for the spare rack
 *   racks             two mobile racks { group, at: 'S'|'H'|'E'|'moving', slot }: slot = { x, z, y, pallet, lock } is where a pallet sits
 *   rackAt(name)      the rack standing at 'S' (arm), 'H' (hand-off) or 'E' (spare), or null
 *   setRackPose(rack,x,z,yaw,y)  move a rack (yaw = rotation.y; y = lift off the floor); keeps its slot in step
 *   palletReady       true when the rack at the arm holds a full pallet and the arm is idle
 *   out               { loaded[], empty[] }: floor slots { x, z, y, pallet, lock }
 *   makePallet()      a new empty pallet group
 *   place(slot, g)    set pallet group g down on a slot (updates its transform)
 *   take(slot)        remove and return the slot's pallet
 * Units are scan metres; +Y is up. A pallet's long axis (0.8 m) is its group's local X.
 */
(function () {
  'use strict';

  window.buildFactoryCell = function (THREE) {
    const V3 = THREE.Vector3;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    /* ---------------- layout ---------------- */
    const BELT_Y = 0.8, BELT_Z = -2.0, BELT_X0 = 25.0, BELT_X1 = 36.2, PICK_X = 25.25;
    const BOX = { x: 0.4, y: 0.25, z: 0.3 };
    const PAL = { x: 0.8, z: 0.8, h: 0.14 };    // 0.8 m wide: outer stringers at +/-0.36, well outside the fork lanes (forks sit at +/-0.10..0.28)
    const BASE = new V3(24.5, 0, -3.0);                     // arm pedestal
    const STATION = { x: 22.95, z: -3.0 };                   // mobile rack stands here under the arm
    const HANDOFF = { x: 14.0, z: -1.4 };                   // ... here for the forklift
    const EMPTYST = { x: 14.0, z: -3.4 };                   // ... and the spare rack (with a pallet) waits here
    const RAIL_Y = 0.80;                                    // pallet support rails (top)
    const OUT_Z = -0.6;
    const PED = 0.9;                                        // arm pedestal height (pallet rides on the lifter deck)
    const TRUCK_DOCK_X = 34.8;                              // trailer rear at the dock
    const TRUCK_Z = BELT_Z;
    const LAYERS = 3, PER_LAYER = 4, PALLET_BOXES = LAYERS * PER_LAYER;

    const group = new THREE.Group();

    /* ---------------- materials ---------------- */
    const M = (c, r = 0.6, m = 0.1, x = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, x));
    const mat = {
      steel: M(0x8a9199, 0.4, 0.7), dark: M(0x24272b, 0.6, 0.3), frame: M(0x2f3a4a, 0.55, 0.4),
      belt: null, box: [M(0xa8845a, 0.85, 0), M(0xb89365, 0.85, 0), M(0x9a7850, 0.85, 0)], tape: M(0xe8d9a8, 0.7, 0),
      pallet: M(0x7a5c3a, 0.9, 0), urLight: M(0xd6dbe0, 0.35, 0.3), urBlue: M(0x1b6fd8, 0.35, 0.3, { emissive: 0x0a2a66, emissiveIntensity: 0.35 }),
      urDark: M(0x2b2f35, 0.4, 0.5), cabin: M(0xe6e9ec, 0.45, 0.2), stripe: M(0x2a7bd6, 0.5, 0.1), tyre: M(0x141517, 0.9, 0),
      glass: M(0x13202e, 0.1, 0.6), trailer: M(0xdfe3e7, 0.5, 0.15), wallGlass: M(0x9fb4c8, 0.2, 0, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
      yellow: M(0xe3b500, 0.5, 0.05), red: M(0xc9231b, 0.5, 0.05), floorMark: new THREE.MeshBasicMaterial({ color: 0xe3b500, transparent: true, opacity: 0.85 })
    };

    function mesh(geo, m, x, y, z, parent) {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      (parent || group).add(o);
      return o;
    }
    const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const BOX_GEO = boxGeo(BOX.x, BOX.y, BOX.z);
    const TAPE_GEO = boxGeo(BOX.x + 0.004, 0.012, 0.05);

    function makeCarton(i) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(BOX_GEO, mat.box[i % 3]));
      const t = new THREE.Mesh(TAPE_GEO, mat.tape);
      t.position.y = BOX.y / 2 + 0.002;
      g.add(t);
      return g;
    }

    /* ---------------- floor markings + labels ---------------- */
    function label(text, w, h, x, y, z, rotY, color) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = Math.round(512 * h / w);
      const g = c.getContext('2d');
      g.fillStyle = color || '#e3b500';
      g.font = '700 ' + Math.round(c.height * 0.62) + 'px "Barlow Condensed", Arial Narrow, Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, c.height / 2 + 4);
      const t = new THREE.CanvasTexture(c);
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      o.rotation.set(-Math.PI / 2, 0, rotY || 0);
      o.position.set(x, y, z);
      group.add(o);
    }
    function floorRect(x0, x1, z0, z1, m) {
      const y = 0.03, w = 0.07;
      [[x0, x1, z0, z0 + w], [x0, x1, z1 - w, z1], [x0, x0 + w, z0, z1], [x1 - w, x1, z0, z1]].forEach(([a, b, c, d]) =>
        mesh(boxGeo(b - a, 0.01, d - c), m || mat.floorMark, (a + b) / 2, y, (c + d) / 2));
    }
    floorRect(STATION.x - 1.25, STATION.x + 1.25, STATION.z - 0.8, STATION.z + 0.8);
    floorRect(HANDOFF.x - 1.25, HANDOFF.x + 1.25, HANDOFF.z - 0.8, HANDOFF.z + 0.8);
    floorRect(EMPTYST.x - 1.25, EMPTYST.x + 1.25, EMPTYST.z - 0.8, EMPTYST.z + 0.8);
    label('PALLETIZING', 2.0, 0.3, STATION.x - 0.2, 0.035, STATION.z - 1.15, 0);
    label('HAND-OFF', 1.6, 0.3, HANDOFF.x, 0.035, HANDOFF.z + 0.95, 0, '#7fc8ff');
    label('SPARE RACK', 1.9, 0.3, EMPTYST.x, 0.035, EMPTYST.z - 1.1, 0, '#7fc8ff');
    label('INBOUND', 2.2, 0.4, 29.8, 0.035, BELT_Z + 1.2, 0);

    /* ---------------- conveyor ---------------- */
    const beltTex = (function () {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#1b1d20'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#2c3036'; g.fillRect(0, 0, 64, 6); g.fillRect(0, 32, 64, 6);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set((BELT_X1 - BELT_X0) / 0.5, 1);
      return t;
    })();
    mat.belt = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.8, metalness: 0.1 });
    const beltLen = BELT_X1 - BELT_X0, beltCx = (BELT_X0 + BELT_X1) / 2;
    mesh(boxGeo(beltLen, 0.05, 0.56), mat.belt, beltCx, BELT_Y - 0.025, BELT_Z);
    [-1, 1].forEach((s) => {
      mesh(boxGeo(beltLen, 0.12, 0.04), mat.steel, beltCx, BELT_Y - 0.06, BELT_Z + s * 0.31);
      mesh(boxGeo(beltLen, 0.04, 0.03), mat.steel, beltCx, BELT_Y + 0.05, BELT_Z + s * 0.31);
    });
    for (let x = BELT_X0 + 0.3; x < BELT_X1; x += 1.4) {
      [-1, 1].forEach((s) => mesh(boxGeo(0.06, BELT_Y - 0.12, 0.06), mat.frame, x, (BELT_Y - 0.12) / 2, BELT_Z + s * 0.31));
      mesh(boxGeo(0.05, 0.05, 0.62), mat.frame, x, 0.3, BELT_Z);
    }
    mesh(boxGeo(0.08, 0.28, 0.6), mat.yellow, BELT_X0 - 0.02, BELT_Y + 0.1, BELT_Z);   // end stop

    /* ---------------- truck ---------------- */
    const truck = new THREE.Group();
    group.add(truck);
    const TL = 8.6, TW = 2.5, TH = 2.5;
    (function buildTruck() {
      // bed + walls (open-top cutaway so the cargo is visible)
      mesh(boxGeo(TL, 0.12, TW), mat.trailer, TL / 2, BELT_Y - 0.06, 0, truck);
      mesh(boxGeo(0.1, TH, TW), mat.trailer, TL, BELT_Y + TH / 2, 0, truck);                       // front bulkhead
      [-1, 1].forEach((s) => {
        mesh(boxGeo(TL, TH, 0.03), mat.wallGlass, TL / 2, BELT_Y + TH / 2, s * TW / 2, truck);       // translucent side
        mesh(boxGeo(TL, 0.08, 0.1), mat.trailer, TL / 2, BELT_Y + TH, s * TW / 2, truck);            // top rail
        mesh(boxGeo(TL, 0.1, 0.1), mat.stripe, TL / 2, BELT_Y + 0.35, s * (TW / 2 + 0.03), truck);    // blue stripe
        [0, TL].forEach((x) => mesh(boxGeo(0.1, TH, 0.1), mat.trailer, x, BELT_Y + TH / 2, s * TW / 2, truck));
      });
      mesh(boxGeo(0.1, 0.1, TW), mat.trailer, 0, BELT_Y + TH, 0, truck);                             // rear header
      // chassis + wheels
      mesh(boxGeo(TL + 2.8, 0.18, 1.3), mat.dark, (TL + 2.8) / 2 - 0.1, BELT_Y - 0.21, 0, truck);
      const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24); wheelGeo.rotateX(Math.PI / 2);
      [[5.9, 1.12], [5.9, -1.12], [7.1, 1.12], [7.1, -1.12], [9.6, 1.12], [9.6, -1.12], [10.8, 1.12], [10.8, -1.12]].forEach(([x, z]) => {
        mesh(wheelGeo, mat.tyre, x, 0.42, z, truck);
        const hub = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 16), mat.steel, x, 0.42, z, truck); hub.rotation.x = Math.PI / 2;
      });
      // cab
      mesh(boxGeo(2.2, 1.9, 2.4), mat.cabin, TL + 2.1, BELT_Y + 0.55, 0, truck);
      mesh(boxGeo(1.0, 0.9, 2.4), mat.cabin, TL + 3.55, BELT_Y - 0.05, 0, truck);                     // bonnet
      mesh(boxGeo(0.06, 0.75, 2.0), mat.glass, TL + 3.12, BELT_Y + 1.0, 0, truck).rotation.z = -0.3;  // windscreen
      mesh(boxGeo(0.05, 0.12, 2.3), mat.stripe, TL + 4.08, BELT_Y + 0.05, 0, truck);                  // bumper stripe
      [-1, 1].forEach((s) => {
        mesh(boxGeo(0.04, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff4d0 }), TL + 4.07, BELT_Y + 0.2, s * 0.85, truck);
        mesh(boxGeo(1.0, 0.5, 0.04), mat.glass, TL + 2.2, BELT_Y + 1.0, s * 1.21, truck);              // side window
      });
    })();

    /* ---------------- boxes ---------------- */
    let boxes = [];            // every carton currently alive
    let nextBoxId = 0;
    const slotsInTruck = [];   // { x, y, z } local to the truck, in unloading order
    (function () {
      const rows = 3, cols = 6;
      const list = [];
      for (let r = 0; r < rows; r++) for (let l = LAYERS - 1; l >= 0; l--) for (let c = 0; c < cols; c++) {
        if (l > 1) continue;    // trailer holds 2 layers, the pallet takes 3
        list.push({ x: 0.5 + r * 0.45, y: BELT_Y + 0.125 + l * BOX.y, z: (c - (cols - 1) / 2) * 0.34 });
      }
      list.forEach((s) => slotsInTruck.push(s));
    })();                      // 3 rows x 2 layers x 6 columns = 36 cartons

    function loadTruck() {
      slotsInTruck.forEach((s, i) => {
        const g = makeCarton(nextBoxId++);
        truck.add(g);
        g.position.set(s.x, s.y, s.z);
        boxes.push({ g, state: 'truck', slot: i, t: 0, from: null, onTruck: true });
      });
    }

    /* ---------------- truck cycle ---------------- */
    const T = { state: 'arriving', x: TRUCK_DOCK_X + 55, speed: 0, unloaded: 0, feedTimer: 0, wait: 0 };
    truck.position.set(T.x, 0, TRUCK_Z);
    loadTruck();

    /* ---------------- pallets ---------------- */
    function makePallet() {
      const g = new THREE.Group();
      const deck = new THREE.Group();
      mesh(boxGeo(PAL.x, 0.03, PAL.z), mat.pallet, 0, PAL.h - 0.015, 0, deck);
      [[-0.36, 0.06], [0, 0.07], [0.36, 0.06]].forEach(([z, w]) => mesh(boxGeo(PAL.x, 0.09, w), mat.pallet, 0, 0.05, z, deck));   // stringers run along the fork direction
      g.add(deck);
      group.add(g);
      return g;
    }
    let pallet = null;           // pallet currently docked under the arm (on the lifter deck)
    let palletBoxes = [];
    let palletFull = false;
    function slotPos(n) {         // n-th carton on the docked pallet -> centre in world coordinates
      const layer = Math.floor(n / PER_LAYER), i = n % PER_LAYER;
      pallet.updateMatrixWorld(true);
      return pallet.localToWorld(new V3(i % 2 ? 0.2 : -0.2, PAL.h + BOX.y / 2 + layer * BOX.y, i < 2 ? -0.15 : 0.15));
    }

    /* ---------------- UR-style arm (2-link IK, tool pointing down) ---------------- */
    const S = 2.8;                                   // visual scale of the arm (reach covers a pallet on the rack)
    const L1 = 0.425 * S, L2 = 0.392 * S, TOOL = 0.34 * S, SH_Y = PED + 0.09 * S;
    const arm = new THREE.Group(); arm.position.copy(BASE); group.add(arm);
    mesh(new THREE.CylinderGeometry(0.32, 0.38, PED, 28), mat.frame, 0, PED / 2, 0, arm);          // pedestal
    mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 28), mat.steel, 0, 0.02, 0, arm);          // floor plate
    const yaw = new THREE.Group(); yaw.position.y = PED; arm.add(yaw);
    mesh(new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 0.09 * S, 24), mat.urLight, 0, 0.045 * S, 0, yaw);
    mesh(new THREE.CylinderGeometry(0.1 * S, 0.1 * S, 0.02, 24), mat.urBlue, 0, 0.09 * S, 0, yaw);
    const shoulder = new THREE.Group(); shoulder.position.set(0, 0.09 * S, 0); yaw.add(shoulder);
    const capGeo = (r, h) => { const g = new THREE.CylinderGeometry(r, r, h, 24); g.rotateX(Math.PI / 2); return g; };
    mesh(capGeo(0.075 * S, 0.17 * S), mat.urLight, 0, 0, 0, shoulder);
    [-1, 1].forEach((s) => mesh(capGeo(0.06 * S, 0.02 * S), mat.urBlue, 0, 0, s * 0.095 * S, shoulder));
    mesh(boxGeo(L1, 0.1 * S, 0.12 * S), mat.urLight, L1 / 2, 0, 0.0, shoulder);
    const elbow = new THREE.Group(); elbow.position.set(L1, 0, 0); shoulder.add(elbow);
    mesh(capGeo(0.065 * S, 0.15 * S), mat.urLight, 0, 0, 0, elbow);
    [-1, 1].forEach((s) => mesh(capGeo(0.05 * S, 0.02 * S), mat.urBlue, 0, 0, s * 0.085 * S, elbow));
    mesh(boxGeo(L2, 0.085 * S, 0.1 * S), mat.urLight, L2 / 2, 0, 0, elbow);
    const wrist = new THREE.Group(); wrist.position.set(L2, 0, 0); elbow.add(wrist);
    mesh(capGeo(0.05 * S, 0.12 * S), mat.urLight, 0, 0, 0, wrist);
    [-1, 1].forEach((s) => mesh(capGeo(0.04 * S, 0.02 * S), mat.urBlue, 0, 0, s * 0.07 * S, wrist));
    mesh(new THREE.CylinderGeometry(0.04 * S, 0.04 * S, TOOL * 0.55, 20), mat.urDark, 0, -TOOL * 0.3, 0, wrist);
    mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24), mat.urDark, 0, -TOOL + 0.015, 0, wrist);   // vacuum plate
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24), mat.red, 0, -TOOL - 0.002, 0, wrist);     // suction face
    const armTip = new V3(STATION.x, 1.9, STATION.z);       // current tool-tip target (world)

    function solveArm(tip) {
      const wx = tip.x - BASE.x, wz = tip.z - BASE.z, wy = tip.y + TOOL - (BASE.y + SH_Y);
      const r = Math.hypot(wx, wz);
      const d = clamp(Math.hypot(r, wy), 0.3, L1 + L2 - 0.02);
      const a = Math.atan2(wy, r);
      const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
      const th1 = a + Math.acos(cosA);                                   // elbow up
      const cosG = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
      const th2 = th1 - (Math.PI - Math.acos(cosG));                     // forearm direction
      yaw.rotation.y = -Math.atan2(wz, wx);
      shoulder.rotation.z = th1;
      elbow.rotation.z = th2 - th1;
      wrist.rotation.z = -th2;
    }
    solveArm(armTip);

    /* ---------------- arm work cycle ---------------- */
    const ARM = { state: 'idle', legs: null, leg: 0, t: 0, box: null, slot: 0, from: new V3(), to: new V3() };
    const HOVER = 0.55;

    function planCycle(box, n) {
      const pk = new V3(PICK_X, BELT_Y + BOX.y + 0.002, BELT_Z);
      const sp = slotPos(n); sp.y += BOX.y / 2 + 0.002;                  // tool-tip height = top of the carton once placed
      const hp = pk.clone(); hp.y += HOVER;
      const hs = sp.clone(); hs.y += HOVER;
      return [
        { to: hp, dur: 0.9 },
        { to: pk, dur: 0.5 },
        { to: pk, dur: 0.25, act: 'grip' },
        { to: hp, dur: 0.5 },
        { to: hs, dur: 1.0 },
        { to: sp, dur: 0.5 },
        { to: sp, dur: 0.25, act: 'release' },
        { to: hs, dur: 0.45 }
      ];
    }
    function armUpdate(dt) {
      if (ARM.state === 'idle') {
        const front = boxes.find((b) => b.state === 'belt' && b.atStop);
        if (front && pallet && !palletFull && palletBoxes.length < PALLET_BOXES) {
          ARM.box = front; front.state = 'claimed';
          ARM.legs = planCycle(front, palletBoxes.length);
          ARM.leg = 0; ARM.t = 0; ARM.from.copy(armTip); ARM.to.copy(ARM.legs[0].to);
          ARM.state = 'work';
        }
        return;
      }
      const leg = ARM.legs[ARM.leg];
      ARM.t += dt * 1.3;
      const k = ease(clamp(ARM.t / leg.dur, 0, 1));
      armTip.lerpVectors(ARM.from, ARM.to, k);
      solveArm(armTip);
      if (ARM.box && ARM.box.state === 'carried') {
        ARM.box.g.position.set(armTip.x, armTip.y - BOX.y / 2 - 0.004, armTip.z);
        ARM.box.g.rotation.y = ARM.leg >= 5 ? pallet.rotation.y : (ARM.leg === 4 ? pallet.rotation.y * k : 0);   // turn the carton to the pallet's axis while carrying
      }
      if (ARM.t >= leg.dur) {
        if (leg.act === 'grip') { ARM.box.state = 'carried'; ARM.box.atStop = false; }
        if (leg.act === 'release') {
          const n = palletBoxes.length, p = slotPos(n);
          ARM.box.state = 'placed';
          palletBoxes.push(ARM.box);
          const local = pallet.worldToLocal(p.clone());
          pallet.add(ARM.box.g);
          ARM.box.g.position.copy(local);
          ARM.box.g.rotation.y = 0;                                        // aligned with the pallet
          if (palletBoxes.length >= PALLET_BOXES) { palletFull = true; pallet.userData.full = true; pallet.userData.loaded = true; }
        }
        ARM.leg++; ARM.t = 0;
        if (ARM.leg >= ARM.legs.length) { ARM.state = 'idle'; ARM.box = null; return; }
        ARM.from.copy(armTip); ARM.to.copy(ARM.legs[ARM.leg].to);
      }
    }

    /* ---------------- belt + unloading ---------------- */
    const BELT_SPEED = 0.95, BOX_GAP = 0.46;
    function beltUpdate(dt) {
      beltTex.offset.x = (beltTex.offset.x + dt * BELT_SPEED / 0.5) % 1;
      const onBelt = boxes.filter((b) => b.state === 'belt' || b.state === 'feeding');
      // feed one carton at a time from the trailer
      T.feedTimer -= dt;
      if (T.state === 'unloading' && T.feedTimer <= 0) {
        const entryBusy = boxes.some((b) => (b.state === 'belt' && b.g.position.x > BELT_X1 - 1.3) || b.state === 'feeding');
        const queued = boxes.filter((b) => b.state === 'belt' || b.state === 'feeding').length;
        const next = boxes.find((b) => b.state === 'truck');
        if (next && !entryBusy && queued < 4) {
          // move it from its trailer slot to the belt entry
          truck.updateMatrixWorld(true);
          const wp = new V3(); next.g.getWorldPosition(wp);
          truck.remove(next.g); group.add(next.g); next.g.position.copy(wp);
          next.state = 'feeding'; next.t = 0; next.from = wp.clone();
          T.feedTimer = 0.9;
        }
      }
      onBelt.forEach((b) => {
        if (b.state === 'feeding') {
          b.t += dt / 0.8;
          const k = ease(clamp(b.t, 0, 1));
          const tx = BELT_X1 - 0.5, tz = BELT_Z, ty = BELT_Y + BOX.y / 2;
          const lift = Math.sin(k * Math.PI) * 0.12;
          b.g.position.set(b.from.x + (tx - b.from.x) * k, b.from.y + (ty - b.from.y) * k + lift, b.from.z + (tz - b.from.z) * k);
          if (b.t >= 1) { b.state = 'belt'; b.atStop = false; }
        }
      });
      // belt motion with queueing
      const ordered = boxes.filter((b) => b.state === 'belt').sort((a, b) => a.g.position.x - b.g.position.x);
      let limit = PICK_X + (boxes.some((b) => b.state === 'claimed') ? BOX_GAP : 0);
      ordered.forEach((b) => {
        const target = Math.max(limit, b.g.position.x - BELT_SPEED * dt);
        b.g.position.x = target; b.g.position.y = BELT_Y + BOX.y / 2; b.g.position.z = BELT_Z;
        b.atStop = target <= limit + 0.002;
        limit = target + BOX_GAP;
      });
    }

    function truckUpdate(dt) {
      const dock = TRUCK_DOCK_X;
      if (T.state === 'arriving') {
        const dist = T.x - dock;
        T.speed = clamp(dist * 0.55, 0.5, 6.5);
        T.x = Math.max(dock, T.x - T.speed * dt);
        if (T.x <= dock + 0.001) { T.state = 'unloading'; T.feedTimer = 1.2; }
      } else if (T.state === 'unloading') {
        if (!boxes.some((b) => b.state === 'truck')) { T.state = 'emptyWait'; T.wait = 3.0; }
      } else if (T.state === 'emptyWait') {
        T.wait -= dt;
        if (T.wait <= 0) T.state = 'leaving';
      } else if (T.state === 'leaving') {
        T.speed = Math.min(6.5, T.speed + 2.2 * dt);
        T.x += Math.max(0.4, T.speed) * dt;
        if (T.x > dock + 60) {
          // next loaded truck
          T.x = dock + 55; T.state = 'arriving'; T.speed = 6.5;
          loadTruck();
        }
      }
      truck.position.x = T.x;
    }

    /* ---------------- mobile racks: low four-leg tables with an open middle ---------------- */
    // Local frame: +X = the lifter's travel direction (it drives in along X), rails run along Z under the pallet's
    // outer stringers (x = +/-0.36). The lifter's column and deck stay above 0.645 m / inside |x| < 0.25 at rail height.
    function makeRack(at, pos) {
      const rack = { group: new THREE.Group(), at, slot: { x: pos.x, z: pos.z, y: RAIL_Y, pallet: null, lock: null }, x: pos.x, z: pos.z, yaw: 0, lift: 0 };
      group.add(rack.group);
      const upM = M(0x2b6fb8, 0.5, 0.3), beamM = M(0xd9792b, 0.5, 0.3), padM = M(0x39424d, 0.6, 0.3), g = rack.group;
      // Low four-leg table: the legs and side beams stop at rail height (top 0.80), there is no upper frame, so nothing
      // stands up beside the forklift's mast and housing. Rails (x = +/-0.36) carry the pallet's outer stringers;
      // the lifter drives in along X through the open middle.
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => mesh(boxGeo(0.07, RAIL_Y - 0.1, 0.07), upM, sx * 1.05, (RAIL_Y - 0.1) / 2, sz * 0.66, g));   // legs
      [-1, 1].forEach((sx) => {
        mesh(boxGeo(0.07, 0.1, 1.39), beamM, sx * 1.05, RAIL_Y - 0.05, 0, g);                  // side beams (leg to leg, top at 0.80)
        mesh(boxGeo(0.06, 0.1, 1.0), beamM, sx * 0.36, RAIL_Y - 0.05, 0, g);                   // pallet rails
        mesh(boxGeo(0.66, 0.1, 0.07), beamM, sx * 0.705, RAIL_Y - 0.05, 0, g);                 // rail brackets to the side beams
      });
      mesh(boxGeo(0.66, 0.1, 0.07), beamM, 0, RAIL_Y - 0.05, 0, g);                            // centre bar between the rails
      mesh(boxGeo(0.7, 0.04, 0.5), padM, 0, 0.68, 0, g);                                       // lift pad the deck rises into (bottom 0.66)
      rack.setPose = function (x, z, yaw, y) {
        rack.x = x; rack.z = z; rack.yaw = yaw; rack.lift = y || 0;
        g.position.set(x, rack.lift, z); g.rotation.y = yaw;
        rack.slot.x = x; rack.slot.z = z; rack.slot.y = RAIL_Y + rack.lift;
      };
      rack.setPose(pos.x, pos.z, 0, 0);
      return rack;
    }
    const rackA = makeRack('S', STATION), rackB = makeRack('E', EMPTYST);
    const racks = [rackA, rackB];
    const rackAt = (name) => racks.find((r) => r.at === name) || null;
    function setRackPose(rack, x, z, yaw, y) { rack.setPose(x, z, yaw, y); }
    function followPallets() {
      racks.forEach((rack) => {
        const p = rack.slot.pallet;
        if (!p) return;
        p.position.set(rack.x, rack.lift + RAIL_Y, rack.z);
        p.rotation.y = rack.yaw + Math.PI / 2;         // pallet long axis along the rails
      });
    }
    function syncPallet() {                            // the arm works on the pallet in the rack standing at the arm
      const r = rackAt('S');
      const p = (r && r.slot.pallet && !r.slot.pallet.userData.full) ? r.slot.pallet : null;
      if (p === pallet) return;
      pallet = p;
      if (p) { palletBoxes = p.userData.boxes = p.userData.boxes || []; palletFull = palletBoxes.length >= PALLET_BOXES; }
      else { palletBoxes = []; palletFull = false; }
    }

    /* ---------------- outbound + empty-pallet floor slots ---------------- */
    const out = { loaded: [], empty: [] };
    [4.6, 6.1].forEach((x) => out.loaded.push({ x, z: OUT_Z, y: 0, pallet: null, lock: null, ship: 0 }));
    [7.6, 9.1].forEach((x) => out.empty.push({ x, z: OUT_Z, y: 0, pallet: null, lock: null, refill: 0 }));
    out.loaded.concat(out.empty).forEach((sl) => floorRect(sl.x - 0.7, sl.x + 0.7, sl.z - 0.55, sl.z + 0.55));
    label('OUTBOUND', 1.5, 0.3, 5.35, 0.035, OUT_Z - 0.95, 0);
    label('EMPTIES', 1.4, 0.3, 8.35, 0.035, OUT_Z - 0.95, 0, '#7fc8ff');

    function place(slot, g) {
      g.position.set(slot.x, slot.y, slot.z); g.rotation.y = Math.PI / 2;
      slot.pallet = g; slot.lock = null;
    }
    function take(slot) { const g = slot.pallet; slot.pallet = null; slot.lock = null; return g; }
    // both racks start with an empty pallet on them: one at the arm, the spare waiting
    racks.forEach((r) => { const g = makePallet(); g.userData.loaded = false; r.slot.pallet = g; });
    followPallets();
    out.empty.forEach((sl) => { const g = makePallet(); g.userData.loaded = false; place(sl, g); });

    function dropBoxes(p) { const gone = new Set(p.userData.boxes || []); boxes = boxes.filter((b) => !gone.has(b)); }
    function housekeeping(dt) {
      // loaded pallets in the outbound zone are "shipped" after a while; empties come back after a while
      out.loaded.forEach((sl) => {
        if (sl.pallet && !sl.lock) { sl.ship += dt; if (sl.ship > 35) { group.remove(sl.pallet); dropBoxes(sl.pallet); sl.pallet = null; sl.ship = 0; } } else sl.ship = 0;
      });
      out.empty.forEach((sl) => {
        if (!sl.pallet && !sl.lock) { sl.refill += dt; if (sl.refill > 6) { const g = makePallet(); g.userData.loaded = false; place(sl, g); sl.refill = 0; } } else sl.refill = 0;
      });
    }

    /* ---------------- public API ---------------- */
    const api = {
      group, station: STATION, handoff: HANDOFF, emptyStation: EMPTYST, pallet: PAL, boxSize: BOX, truckDockX: TRUCK_DOCK_X, racks, rackAt, out, makePallet, place, take, setRackPose,
      get palletReady() { const r = rackAt('S'), p = r && r.slot.pallet; return !!(p && p.userData.full && ARM.state === 'idle'); },
      get armBusy() { return ARM.state !== 'idle'; },
      update(dt) { truckUpdate(dt); syncPallet(); beltUpdate(dt); armUpdate(dt); housekeeping(dt); followPallets(); }
    };
    return api;
  };
})();
