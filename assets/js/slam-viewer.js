/* ==========================================================================
   Interactive 3D SLAM & Point Cloud Viewer
   Production 3D LiDAR SLAM Point Cloud (789k Points) + Rear-Steer Tricycle CB Forklift AMR
   ========================================================================== */

(function () {
  'use strict';

  // The scan is enlarged horizontally so the hall reads clearly next to the 2.5 m forklift.
  const K = 1.5;

  let scene, camera, renderer, controls;
  let pointCloudMesh = null;
  let pointCloudData = null;
  let forkliftGroup = null;
  let rearSteerAssembly = null;
  let lidarBeams = null;
  let trajectoryLine = null;
  let poseNodesGroup = null;
  let loopClosureArc = null;
  let stationsMeshGroup = null;

  // Career Milestone Company Stations along the Warehouse Trajectory (All 7 Organizations)
  const companyStations = [
    {
      id: 'botsync',
      name: 'BOTSYNC',
      shortName: 'BOTSYNC',
      tenure: '2022 – PRESENT',
      loc: 'Bangalore, India 🇮🇳',
      role: 'Technical Lead - Robotics',
      tech: ['Heavy AMRs', 'CB Forklifts', '3D LiDAR SLAM', 'iSAM2 / GTSAM', 'syncOS', 'C++20', 'ROS2'],
      color: 0x7fb800,
      hexStr: '#7FB800',
      x: -17 * K,
      z: -1.0 * K,
      bullets: [
        'Leads AMR autonomy and mapping stack end-to-end for heavy industrial counterbalance forklifts.',
        'Replaced manual offline rosbags with real-time online 3D SLAM, slashing site deployment time from weeks to a few minutes.',
        'Architected comprehensive 2D/3D Map Editor tool supporting multi-map alignment and dynamic obstacle layers.'
      ]
    },
    {
      id: 'lionsbot',
      name: 'LIONSBOT INTERNATIONAL',
      shortName: 'LIONSBOT',
      tenure: '2021 – 2022',
      loc: 'Singapore 🇸🇬',
      role: 'Senior Engineer – Autonomy (1,800+ AMR Fleet)',
      tech: ['Commercial Cleaning Robots', '3D LiDAR SLAM', 'Fleet Deployments', 'Sensor Calibration', 'ROS'],
      color: 0x10b981,
      hexStr: '#10B981',
      x: -6 * K,
      z: -1.0 * K,
      bullets: [
        'Engineered 3D LiDAR SLAM and multi-sensor localization for commercial autonomous cleaning robots deployed worldwide.',
        'Supported enterprise fleet operations of 1,800+ AMRs operating in 30+ countries across airport, hospital, and retail facilities.',
        'Solved localization degradation in glass corridors and high-dynamic pedestrian environments.'
      ]
    },
    {
      id: 'ingeniarius',
      name: 'INGENIARIUS LDA',
      shortName: 'INGENIARIUS',
      tenure: '2015',
      loc: 'Coimbra, Portugal 🇵🇹',
      role: 'Mobile Robotics Intern (Swarm Robotics)',
      tech: ['Swarm Robotics', 'Multi-Agent Localization', 'ROS', 'Distributed Systems'],
      color: 0xec4899,
      hexStr: '#EC4899',
      x: 6 * K,
      z: -1.0 * K,
      bullets: [
        'Researched decentralized multi-robot coordination and swarm robotics localization.',
        'Implemented distributed inter-robot communication protocols in ROS for cooperative fleet tasks.',
        'Collaborated on European research projects bench-testing autonomous multi-agent algorithms.'
      ]
    },
    {
      id: 'ntu',
      name: 'NTU SINGAPORE',
      shortName: 'NTU SINGAPORE',
      tenure: '2019 – 2021',
      loc: 'Singapore 🇸🇬',
      role: 'Research Associate – Robotics & VIO',
      tech: ['Autonomous Vehicles', '3D LiDAR Odometry', 'VIO', 'Sensor Fusion', 'Kalman Filtering'],
      color: 0x06b6d4,
      hexStr: '#06B6D4',
      x: 17 * K,
      z: -1.0 * K,
      bullets: [
        'Researched tightly-coupled Visual-Inertial Odometry (VIO) and LiDAR-inertial state estimation on electric AV platforms.',
        'Developed real-time sensor fusion and extrinsic spatiotemporal calibration routines.',
        'Published experimental robotics benchmarks in prestigious peer-reviewed conferences.'
      ]
    },
    {
      id: 'ignitarium',
      name: 'IGNITARIUM TECHNOLOGIES',
      shortName: 'IGNITARIUM',
      tenure: '2018 – 2019',
      loc: 'Bangalore / Kochi, India 🇮🇳',
      role: 'Senior Engineer – ML & Edge Robotics',
      tech: ['Edge AI', 'NVIDIA Jetson', 'TensorRT', 'Embedded ROS', 'Computer Vision', 'CUDA'],
      color: 0x8b5cf6,
      hexStr: '#8B5CF6',
      x: 12 * K,
      z: 4.8 * K,
      bullets: [
        'Designed real-time deep learning perception pipelines running at low latency on NVIDIA Jetson edge accelerators.',
        'Engineered TensorRT-optimized inference for 3D obstacle detection and robotic arm guidance.',
        'Bridged embedded computer vision outputs with ROS control loops for industrial clients.'
      ]
    },
    {
      id: 'addverb',
      name: 'ADDVERB TECHNOLOGIES',
      shortName: 'ADDVERB',
      tenure: '2016 – 2018',
      loc: 'Noida / Pune, India 🇮🇳',
      role: 'Robotics Engineer – 3D Perception & Manipulation',
      tech: ['Warehouse Automation', 'AGVs', 'Mobile Manipulators', 'Point Clouds / PCL', 'Pallet Detection'],
      color: 0x3b82f6,
      hexStr: '#3B82F6',
      x: 0 * K,
      z: 4.8 * K,
      bullets: [
        'Developed 3D point cloud perception algorithms for automated pallet localization and robotic bin picking.',
        'Programmed industrial AGVs, shuttle systems, and mobile manipulators in high-throughput distribution centers.',
        'Integrated custom safety field systems and optical docking algorithms for warehouse operations.'
      ]
    },
    {
      id: 'ey',
      name: 'ERNST & YOUNG (EY)',
      shortName: 'ERNST & YOUNG',
      tenure: '2016',
      loc: 'Europe / India 🌐',
      role: 'Robotics Consultant & Master Thesis',
      tech: ['Robotics Advisory', 'Automation Strategy', 'RPA', 'Industrial ROI', 'Process Optimization'],
      color: 0xf59e0b,
      hexStr: '#F59E0B',
      x: -12 * K,
      z: 4.8 * K,
      bullets: [
        'Completed Master thesis on evaluating robotic technologies and economic feasibility across modern industries.',
        'Advised global manufacturing and supply chain enterprises on robotic automation roadmaps and ROI modeling.',
        'Synthesized technical benchmark assessments for next-gen warehouse mobile robotics.'
      ]
    }
  ];

  // Animation & Autonomy State
  let isPlaying = true;
  let isLiDARActive = true;
  let currentCameraMode = 'iso'; // 'iso', 'top', 'follow'
  let currentColorMode = 'elevation'; // 'elevation', 'intensity', 'swiss'
  let pointSize = 1.5;
  let isVisibleInViewport = true;
  let isRealDataset = false;
  let targetStationId = 'all';
  let activeStationId = null;
  let dockPauseTimer = 0;
  let isDockedAtStation = false;

  // Warehouse Teleoperation & Game Mode State
  let isGameMode = false;
  let forkAssemblyGroup = null;
  let forkLifter = null;   // lifter group, mirrors forkAssemblyGroup's height
  let palletsMeshGroup = null;
  let deliveryBayGroup = null;
  const deliveryBayZone = { x: 0.0, z: 1.9 * K, radius: 4.4 };
  let carriedPallet = null;
  let deliveredCount = 0;
  let isDossierOpen = false;
  let currentTargetPallet = null;
  let inDeliveryBay = false;
  let forkElevation = 0.0; // 0.0 lowered, 0.35 raised
  let targetForkElevation = 0.0;

  // Manual Keyboard Teleoperation Kinematics
  const keysDown = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    e: false
  };
  let teleopSpeed = 0.0; // m/s
  let teleopSteer = 0.0; // radians
  const MAX_TELEOP_SPEED_FWD = 3.2; // m/s max cruising
  const MAX_TELEOP_SPEED_REV = -1.8; // m/s max reverse
  const TELEOP_ACCEL = 4.2; // m/s^2
  const TELEOP_DECEL = 5.5; // m/s^2
  const TELEOP_STEER_SPEED = 3.2; // rad/s
  const amrPose = { x: -22.0 * K, z: 1.9 * K, heading: 0.0 }; // Game mode pose coordinates

  // Tricycle Kinematics Parameters
  const WHEELBASE = 1.50; // meters (distance between front load axle and rear steer wheel)
  const FRONT_AXLE_OFFSET = 0.95; // meters from chassis center to front fixed axle
  const MAX_STEER_ANGLE = (72.0 * Math.PI) / 180.0; // +/- 72 degrees max rear steer
  let currentSteerAngle = 0.0; // radians
  let pathU = 0.0; // parametric progress along continuous spline [0, 1)
  const baseCruiseSpeedU = 0.00010; // realistic industrial cruising speed

  // Amazon warehouse main aisle closed-loop trajectory (aisles along X-axis)
  let waypoints = [
    [-19, -1.0], [-9, -1.0], [0, -1.0], [9, -1.0], [19, -1.0], [22, 0.4],
    [22, 3.4], [19, 4.8], [9, 4.8], [0, 4.8], [-9, 4.8], [-19, 4.8],
    [-22, 3.4], [-22, 0.4]
  ].map(([x, z]) => ({ x: x * K, z: z * K }));

  let trajectorySpline = null;

  function initViewer() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js not loaded.');
      return;
    }

    const container = document.getElementById('slam-canvas-container');
    // Headless mode: with the interactive stage removed from the page we still build the
    // scene graph (scan, AMR, route, stations) and publish it for the landing-page backdrop.
    const headless = !container;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);

    if (!headless) {
      // 2. Camera Setup
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 520;
      camera = new THREE.PerspectiveCamera(45, width / height, 0.2, 600);
      setCameraPreset('iso');

      // 3. Renderer Setup
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // 4. OrbitControls
      if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 3;
        controls.maxDistance = 220;
        controls.maxPolarAngle = Math.PI / 2 - 0.02;
        controls.target.set(0, 1.5, 0);
      }
    }

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(30, 60, 30);
    scene.add(dirLight);

    const dirLightFill = new THREE.DirectionalLight(0x88bbff, 0.4);
    dirLightFill.position.set(-30, 30, -30);
    scene.add(dirLightFill);

    // Ground Grid
    const gridHelper = new THREE.GridHelper(150, 50, 0x3a4a78, 0x1e2530);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // 6. Build Counterbalance (CB) Forklift AMR (Tricycle Kinematics)
    buildCBForkliftAMR();

    // 7. Build Factor Graph Trajectory & Keyframe Nodes
    buildFactorGraphTrajectory();

    // 7.5. Build 3D Career Milestone Company Stations
    buildCompanyStations();

    // 7.6. Build 3D Organization Cargo Pallets & Delivery Bay
    buildOrganizationPallets();
    buildDeliveryBay();

    // 8. Point cloud: full scan for the interactive stage, a precomputed ~1 MB cloud for the backdrop
    if (headless) loadHeroCloud();
    else loadWarehousePCD();

    // 9. UI Controls & Mission Bindings
    setupViewerControls();
    setupMissionControls();

    if (headless) return;

    // 10. Viewport Visibility Tracking
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          isVisibleInViewport = entry.isIntersecting;
        });
      }, { threshold: 0.1 });
      observer.observe(container);
    }

    // 11. Window Resize
    window.addEventListener('resize', onWindowResize);

    // 12. Theme Change Listener
    const observer = new MutationObserver(() => {
      updateThemeColors();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    updateThemeColors();

    // 13. Start Animation Loop
    animate();
  }

  /* --- Helper: Create Front Status Bezel Screen Texture --- */
  function createFrontDisplayTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 256, 160);

    ctx.fillStyle = '#9be600';
    ctx.fillRect(8, 8, 240, 5);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('syncOS // ACTIVE', 14, 38);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText('3D LiDAR SLAM : ONLINE', 14, 62);
    ctx.fillText('ODOMETRY : TRICYCLE KIN', 14, 82);
    ctx.fillText('MISSION : AUTONOMOUS', 14, 102);

    ctx.fillStyle = '#22c55e';
    ctx.fillRect(14, 122, 60, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('98% BATT', 18, 135);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  /* --- Helper: rear-face logo (light bar, B mark, wordmark) --- */
  function createRearLogoTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 512);

    // White LED light bar with a dot above, as on the real rear panel
    g.fillStyle = '#f4f6f0';
    g.beginPath(); g.arc(128, 40, 11, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(114, 110); g.lineTo(142, 110); g.lineTo(142, 300); g.lineTo(114, 300); g.closePath();
    g.fill();

    // Lime "B" mark
    g.strokeStyle = '#c3e600';
    g.lineWidth = 15;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(98, 340); g.lineTo(98, 420);
    g.arc(122, 358, 22, -Math.PI / 2, Math.PI / 2);
    g.arc(122, 400, 22, -Math.PI / 2, Math.PI / 2);
    g.stroke();

    g.fillStyle = '#c3e600';
    g.font = '600 38px "Space Grotesk", "EB Garamond", sans-serif';
    g.textAlign = 'center';
    g.fillText('BOTSYNC', 128, 478);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  /* --- Botsync AMR pallet stacker, modeled on the real machine ---
     Local frame: +X toward the forks, +Y up, Z lateral.
     Rear housing (lime panels, tablet) | mast | sensor column + 3D LiDAR | two long forks with tip rollers. */
  function buildCBForkliftAMR() {
    forkliftGroup = new THREE.Group();

    // Preferred: the detailed model from amr-model.js (lifter, mast, sensor housings).
    if (window.buildBotsyncAMR) {
      const amr = window.buildBotsyncAMR(THREE);
      forkliftGroup.add(amr.root);
      forkLifter = amr.lifter;
      rearSteerAssembly = amr.steer;
      forkAssemblyGroup = new THREE.Group();            // carries pallets, in the vehicle frame
      forkAssemblyGroup.position.x = -0.47;             // new forks are shorter than the old ones
      forkliftGroup.add(forkAssemblyGroup);
      buildLiDARScanBeams(amr.lidarTop);
      scene.add(forkliftGroup);
      return;
    }

    const M = (color, rough, metal) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const limeMat = M(0xb2d800, 0.35, 0.05);
    limeMat.emissive = new THREE.Color(0x1a2200);
    limeMat.side = THREE.DoubleSide;
    const darkMat = M(0x2b2f33, 0.55, 0.45);       // housing body
    const blackMat = M(0x17191c, 0.5, 0.55);        // mast, forks, carriage
    const steelMat = M(0x3a3e44, 0.35, 0.8);
    const chainMat = M(0x6a6f76, 0.4, 0.85);
    const tireMat = M(0x101012, 0.85, 0.1);
    const rollerMat = M(0xd9a679, 0.6, 0.05);       // tan polyurethane tip rollers
    const redMat = new THREE.MeshBasicMaterial({ color: 0xe5322d });
    const whiteLed = new THREE.MeshBasicMaterial({ color: 0xf4f6f0 });
    const blueLed = new THREE.MeshBasicMaterial({ color: 0x3b7bff });
    const yellowMat = M(0xf2c200, 0.4, 0.2);

    const box = (w, h, d, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      (parent || forkliftGroup).add(m);
      return m;
    };

    // 1. Base plate (rounded footprint under the housing) with LED strip and castors
    const base = box(1.02, 0.1, 0.96, blackMat, -0.62, 0.07, 0);
    box(0.02, 0.025, 0.74, whiteLed, -1.135, 0.14, 0);
    [-0.38, 0.38].forEach((cz) => {
      const gc = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16);
      gc.rotateX(Math.PI / 2);
      const w = new THREE.Mesh(gc, tireMat);
      w.position.set(-1.02, 0.075, cz);
      forkliftGroup.add(w);
      box(0.14, 0.03, 0.12, yellowMat, -1.02, 0.14, cz);
    });

    // 2. Rear housing: dark body, lime face panels, deck
    box(0.82, 1.0, 0.82, darkMat, -0.55, 0.62, 0);
    box(0.84, 0.06, 0.84, blackMat, -0.55, 1.15, 0);

    const panelShape = new THREE.Shape();
    panelShape.moveTo(0.09, 0);
    panelShape.lineTo(0.39, 0);
    panelShape.lineTo(0.39, 0.80);
    panelShape.lineTo(0.30, 0.95);
    panelShape.lineTo(0.17, 0.95);
    panelShape.lineTo(0.09, 0.55);
    panelShape.closePath();
    const panelGeo = new THREE.ExtrudeGeometry(panelShape, { depth: 0.035, bevelEnabled: false });
    [1, -1].forEach((s) => {
      const p = new THREE.Mesh(panelGeo, limeMat);
      p.rotation.y = -Math.PI / 2;
      p.scale.x = s;
      p.position.set(-0.965, 0.2, 0);
      forkliftGroup.add(p);
    });
    // Lime side flashes
    [1, -1].forEach((s) => box(0.5, 0.5, 0.02, limeMat, -0.62, 0.62, s * 0.415));

    // Rear logo plate
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.19, 0.62),
      new THREE.MeshBasicMaterial({ map: createRearLogoTexture(), transparent: true })
    );
    logo.position.set(-0.97, 0.62, 0);
    logo.rotation.y = -Math.PI / 2;
    forkliftGroup.add(logo);

    // Tablet on the deck, tilted toward the operator
    box(0.2, 0.025, 0.28, blackMat, -0.78, 1.2, -0.2).rotation.z = 0.5;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.24),
      new THREE.MeshBasicMaterial({ map: createFrontDisplayTexture() })
    );
    screen.position.set(-0.784, 1.2145, -0.2);
    screen.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-Math.sin(0.5), Math.cos(0.5), 0));
    forkliftGroup.add(screen);

    // Control cluster + e-stop pods on the deck
    [-1, 1].forEach((s) => {
      const gp = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16);
      const e = new THREE.Mesh(gp, redMat);
      e.position.set(-0.93, 1.0, s * 0.38);
      e.rotation.z = Math.PI / 2;
      forkliftGroup.add(e);
    });

    // 3. Mast: wide black channel in front of the housing with rails and chains
    box(0.2, 1.75, 0.8, blackMat, -0.04, 0.975, 0);
    [-0.37, 0.37].forEach((z) => {
      box(0.09, 1.75, 0.06, steelMat, 0.075, 0.975, z);
    });
    [-0.2, 0.2].forEach((z) => {
      box(0.012, 1.55, 0.05, chainMat, 0.08, 0.95, z);
    });
    box(0.22, 0.06, 0.8, steelMat, -0.04, 1.8, 0);

    // 4. Sensor column + LiDAR + camera + blue indicator + e-stop box
    box(0.2, 0.9, 0.24, blackMat, -0.04, 2.25, 0);
    box(0.34, 0.05, 0.62, steelMat, -0.04, 2.7, 0);                 // crossbar under LiDAR
    const lidarBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.07, 20), M(0x0e0f12, 0.2, 0.9));
    lidarBase.position.set(-0.04, 2.76, 0);
    forkliftGroup.add(lidarBase);
    const lidarHead = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.075, 20), M(0x050608, 0.1, 0.95));
    lidarHead.position.set(-0.04, 2.835, 0);
    forkliftGroup.add(lidarHead);
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 14), M(0xe8ecef, 0.3, 0.2));
    cam.position.set(-0.15, 2.5, 0);
    forkliftGroup.add(cam);
    const blue = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), blueLed);
    blue.position.set(-0.15, 2.28, 0);
    forkliftGroup.add(blue);
    box(0.06, 0.24, 0.2, steelMat, -0.15, 1.95, 0);                  // e-stop + ports box
    const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), redMat);
    estop.rotation.z = Math.PI / 2;
    estop.position.set(-0.19, 2.02, 0);
    forkliftGroup.add(estop);

    // 5. Carriage + forks (lifted by forkAssemblyGroup)
    forkAssemblyGroup = new THREE.Group();
    box(0.06, 0.5, 0.78, blackMat, 0.14, 0.34, 0, forkAssemblyGroup);
    box(0.04, 0.12, 0.5, steelMat, 0.11, 0.32, 0, forkAssemblyGroup);   // carriage sensor block
    [-0.28, 0.28].forEach((fz) => {
      box(1.15, 0.07, 0.17, blackMat, 0.72, 0.07, fz, forkAssemblyGroup);
      box(0.1, 0.05, 0.17, blackMat, 1.3, 0.055, fz, forkAssemblyGroup); // tapered tip
      const gr = new THREE.CylinderGeometry(0.036, 0.036, 0.1, 16);
      gr.rotateX(Math.PI / 2);
      const roller = new THREE.Mesh(gr, rollerMat);
      roller.position.set(1.17, 0.045, fz);
      forkAssemblyGroup.add(roller);
      box(0.1, 0.05, 0.1, steelMat, 0.17, 0.12, fz, forkAssemblyGroup);   // fork root bracket
    });
    forkliftGroup.add(forkAssemblyGroup);

    // 6. Steered drive wheel under the housing (pivots about the vertical axis)
    rearSteerAssembly = new THREE.Group();
    rearSteerAssembly.position.set(-0.55, 0.125, 0);
    const driveGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.1, 24);
    driveGeo.rotateX(Math.PI / 2);
    rearSteerAssembly.add(new THREE.Mesh(driveGeo, tireMat));
    forkliftGroup.add(rearSteerAssembly);

    buildLiDARScanBeams();
    scene.add(forkliftGroup);
  }

  /* --- Multi-Beam LiDAR Scan Frustum --- */
  function buildLiDARScanBeams(sensorPos) {
    const beamCount = 36;
    const beamGeo = new THREE.BufferGeometry();
    const beamPositions = [];
    const beamColors = [];

    // Origin matches the apex of the elevated sensor arch LiDAR puck
    // Beams are built around local zero and the object is moved to the sensor, so rotation.y spins them about the LiDAR axis.
    const sensorOrigin = sensorPos ? sensorPos.clone() : new THREE.Vector3(-0.04, 2.84, 0);
    const origin = new THREE.Vector3();
    const maxRange = 14.0;

    for (let i = 0; i < beamCount; i++) {
      const angle = (i / beamCount) * Math.PI * 2;
      const elevation = ((i % 6) - 2.5) * 0.07;
      const target = new THREE.Vector3(
        origin.x + Math.cos(angle) * maxRange,
        origin.y + elevation * maxRange,
        origin.z + Math.sin(angle) * maxRange
      );

      beamPositions.push(origin.x, origin.y, origin.z);
      beamPositions.push(target.x, target.y, target.z);

      beamColors.push(0.61, 0.90, 0.0); // Neon Lime Green
      beamColors.push(0.95, 0.35, 0.2); // Amber accent
    }

    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(beamPositions, 3));
    beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(beamColors, 3));

    const beamMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending
    });

    lidarBeams = new THREE.LineSegments(beamGeo, beamMat);
    lidarBeams.position.copy(sensorOrigin);
    forkliftGroup.add(lidarBeams);
  }

  /* --- Factor Graph Trajectory & Keyframe Nodes --- */
  function buildFactorGraphTrajectory() {
    if (trajectoryLine) scene.remove(trajectoryLine);
    if (poseNodesGroup) scene.remove(poseNodesGroup);
    if (loopClosureArc) scene.remove(loopClosureArc);

    const curvePoints = waypoints.map((wp) => new THREE.Vector3(wp.x, 0.05, wp.z));
    // Closed CatmullRomCurve3 smoothly connects back to curvePoints[0] without duplicate knots
    trajectorySpline = new THREE.CatmullRomCurve3(curvePoints, true, 'centripetal', 0.25);
    const smoothPoints = trajectorySpline.getPoints(180);

    const trajGeo = new THREE.BufferGeometry().setFromPoints(smoothPoints);
    const trajMat = new THREE.LineDashedMaterial({
      color: 0x6f8fe8,
      dashSize: 0.6,
      gapSize: 0.3,
      linewidth: 2
    });
    trajectoryLine = new THREE.Line(trajGeo, trajMat);
    trajectoryLine.computeLineDistances();
    scene.add(trajectoryLine);

    poseNodesGroup = new THREE.Group();
    const nodeSphereGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x6f8fe8 });

    waypoints.forEach((wp) => {
      const node = new THREE.Mesh(nodeSphereGeo, nodeMat);
      node.position.set(wp.x, 0.25, wp.z);
      poseNodesGroup.add(node);
    });
    scene.add(poseNodesGroup);

    // Loop Closure Factor Link
    const arcCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(waypoints[0].x, 0.25, waypoints[0].z),
      new THREE.Vector3(0, 4.0, 1.9 * K),
      new THREE.Vector3(waypoints[waypoints.length - 1].x, 0.25, waypoints[waypoints.length - 1].z)
    );
    const arcPoints = arcCurve.getPoints(30);
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const arcMat = new THREE.LineDashedMaterial({
      color: 0x22c55e,
      dashSize: 0.4,
      gapSize: 0.2
    });
    loopClosureArc = new THREE.Line(arcGeo, arcMat);
    loopClosureArc.computeLineDistances();
    scene.add(loopClosureArc);
  }

  /* --- 3D Career Milestone Company Stations --- */
  function createStationBillboard(station) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    // Translucent Swiss background card
    ctx.fillStyle = 'rgba(12, 12, 16, 0.94)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(0, 0, 512, 200, 16);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, 512, 200);
    }

    // Outer Accent Border
    ctx.strokeStyle = station.hexStr;
    ctx.lineWidth = 6;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(3, 3, 506, 194, 14);
      ctx.stroke();
    } else {
      ctx.strokeRect(3, 3, 506, 194);
    }

    // Top Header Accent Bar
    ctx.fillStyle = station.hexStr;
    ctx.fillRect(0, 0, 512, 16);

    // Company Name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(station.shortName, 256, 80);

    // Tenure Badge
    ctx.fillStyle = station.hexStr;
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.fillText(station.tenure, 256, 142);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(6.6, 2.58, 1.0);
    return sprite;
  }

  function buildCompanyStations() {
    if (stationsMeshGroup) scene.remove(stationsMeshGroup);
    stationsMeshGroup = new THREE.Group();

    companyStations.forEach((station) => {
      const stationGroup = new THREE.Group();
      stationGroup.name = `station_${station.id}`;

      // 1. Floor Docking Pad Ring
      const ringGeo = new THREE.RingGeometry(1.6, 1.72, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: station.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.set(station.x, 0.02, station.z);
      stationGroup.add(ringMesh);

      // Inner Docking Disc
      const discGeo = new THREE.CircleGeometry(1.58, 32);
      const discMat = new THREE.MeshBasicMaterial({
        color: station.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.12
      });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.rotation.x = Math.PI / 2;
      discMesh.position.set(station.x, 0.015, station.z);
      stationGroup.add(discMesh);

      // 2. Holographic Station Pillar (at dock perimeter)
      const pillarZOffset = station.z > 0 ? 1.7 : -1.7;
      const pillarGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.8, 16);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: station.color,
        roughness: 0.2,
        metalness: 0.8,
        emissive: station.color,
        emissiveIntensity: 0.4
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(station.x, 1.9, station.z + pillarZOffset);
      stationGroup.add(pillar);

      // Glowing Beacon Sphere
      const sphereGeo = new THREE.SphereGeometry(0.12, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const beaconSphere = new THREE.Mesh(sphereGeo, sphereMat);
      beaconSphere.position.set(station.x, 3.82, station.z + pillarZOffset);
      stationGroup.add(beaconSphere);

      // Pulsing Holographic Ring on Pillar
      const pulseRingGeo = new THREE.TorusGeometry(0.35, 0.02, 12, 32);
      const pulseRingMat = new THREE.MeshBasicMaterial({
        color: station.color,
        transparent: true,
        opacity: 0.75
      });
      const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
      pulseRing.rotation.x = Math.PI / 2;
      pulseRing.position.set(station.x, 2.2, station.z + pillarZOffset);
      stationGroup.add(pulseRing);

      // 3. Crisp 2D Canvas Billboard Label (Faces camera at all times)
      const billboard = createStationBillboard(station);
      billboard.position.set(station.x, 5.2, station.z);
      stationGroup.add(billboard);

      stationsMeshGroup.add(stationGroup);
    });

    scene.add(stationsMeshGroup);
  }

  /* --- 3D Organization Cargo Pallets & Delivery Bay --- */
  function buildOrganizationPallets() {
    if (palletsMeshGroup) scene.remove(palletsMeshGroup);
    palletsMeshGroup = new THREE.Group();

    companyStations.forEach((station) => {
      const pallet = createSinglePalletMesh(station);
      pallet.position.set(station.x, 0, station.z);
      palletsMeshGroup.add(pallet);

      station.palletMesh = pallet;
      station.isDelivered = false;
    });

    scene.add(palletsMeshGroup);
  }

  function createSinglePalletMesh(station) {
    const group = new THREE.Group();
    group.name = `pallet_${station.id}`;

    // 1. Euro Pallet Wood Material
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x966838,
      roughness: 0.85,
      metalness: 0.1
    });

    // Bottom skids (3 pieces)
    [-0.38, 0, 0.38].forEach((sz) => {
      const skidGeo = new THREE.BoxGeometry(1.2, 0.08, 0.1);
      const skid = new THREE.Mesh(skidGeo, woodMat);
      skid.position.set(0, 0.04, sz);
      group.add(skid);
    });

    // Top deck slats (5 boards)
    [-0.48, -0.24, 0, 0.24, 0.48].forEach((sx) => {
      const deckGeo = new THREE.BoxGeometry(0.18, 0.035, 0.95);
      const deck = new THREE.Mesh(deckGeo, woodMat);
      deck.position.set(sx, 0.095, 0);
      group.add(deck);
    });

    // 2. Organization Cargo Crate Stack (Signature Company Brand Color)
    const crateMat = new THREE.MeshStandardMaterial({
      color: station.color,
      roughness: 0.4,
      metalness: 0.25
    });

    const crateGeo = new THREE.BoxGeometry(0.92, 0.55, 0.76);
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(0, 0.38, 0);
    group.add(crate);

    // Top smaller cargo box
    const topCrateGeo = new THREE.BoxGeometry(0.65, 0.4, 0.55);
    const topCrateMat = new THREE.MeshStandardMaterial({
      color: 0x222228,
      roughness: 0.6
    });
    const topCrate = new THREE.Mesh(topCrateGeo, topCrateMat);
    topCrate.position.set(0.05, 0.82, 0);
    group.add(topCrate);

    // Organization Logo/Badge Band
    const bandGeo = new THREE.BoxGeometry(0.94, 0.14, 0.78);
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(0, 0.38, 0);
    group.add(band);

    // Glowing Station Beacon light on top
    const beaconGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: station.color });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 1.08, 0);
    group.add(beacon);

    return group;
  }

  function buildDeliveryBay() {
    if (deliveryBayGroup) scene.remove(deliveryBayGroup);
    deliveryBayGroup = new THREE.Group();
    deliveryBayGroup.position.set(deliveryBayZone.x, 0, deliveryBayZone.z);

    // Platform Base
    const dockGeo = new THREE.BoxGeometry(6.4, 0.02, 4.0);
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.7 });
    const dock = new THREE.Mesh(dockGeo, dockMat);
    dock.position.set(0, 0.01, 0);
    deliveryBayGroup.add(dock);

    // High-visibility hazard boundary ring
    const hazardRingGeo = new THREE.RingGeometry(3.5, 3.8, 36);
    hazardRingGeo.rotateX(-Math.PI / 2);
    const hazardMat = new THREE.MeshBasicMaterial({
      color: 0xeab308,
      side: THREE.DoubleSide
    });
    const hazardRing = new THREE.Mesh(hazardRingGeo, hazardMat);
    hazardRing.position.set(0, 0.025, 0);
    deliveryBayGroup.add(hazardRing);

    // 4 Corner Safety Bollards with flashing amber lights
    const bollardGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.1, 16);
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    [
      { x: -3.5, z: -2.5 },
      { x: 3.5, z: -2.5 },
      { x: -3.5, z: 2.5 },
      { x: 3.5, z: 2.5 }
    ].forEach((bp) => {
      const b = new THREE.Mesh(bollardGeo, bollardMat);
      b.position.set(bp.x, 0.55, bp.z);
      deliveryBayGroup.add(b);

      const beaconLight = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12), beaconMat);
      beaconLight.position.set(bp.x, 1.15, bp.z);
      deliveryBayGroup.add(beaconLight);
    });

    // Central Dock Sign Billboard
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const ctx = signCanvas.getContext('2d');
    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 122);
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = '#eab308';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ LOADING & DELIVERY DOCK', 256, 48);
    ctx.font = '600 24px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('DELIVER ORGANIZATION PALLETS HERE', 256, 92);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signGeo = new THREE.PlaneGeometry(3.6, 0.9);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 2.5, 0);
    deliveryBayGroup.add(sign);

    scene.add(deliveryBayGroup);
  }

  function setupMissionControls() {
    const pills = document.querySelectorAll('.mission-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const stationId = pill.getAttribute('data-station');
        dispatchToStation(stationId);
      });
    });

    // Make mission card clickable to jump to experience timeline
    const card = document.getElementById('telem-mission-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.title = 'Click to jump to Experience timeline';
      card.addEventListener('click', () => {
        const expSection = document.getElementById('experience');
        if (expSection) {
          expSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // Default to Botsync in HUD
    const defaultStation = companyStations.find((s) => s.id === 'botsync');
    if (defaultStation) {
      updateMissionHUD(defaultStation);
    }
  }

  function dispatchToStation(stationId) {
    targetStationId = stationId;
    isDockedAtStation = false;
    dockPauseTimer = 0;

    const pills = document.querySelectorAll('.mission-pill');
    pills.forEach((p) => {
      p.classList.toggle('active', p.getAttribute('data-station') === stationId);
    });

    if (stationId === 'all') {
      isPlaying = true;
      return;
    }

    const st = companyStations.find((s) => s.id === stationId);
    if (!st) return;

    updateMissionHUD(st);

    isPlaying = true;
    const playBtn = document.getElementById('viewer-btn-play');
    if (playBtn) {
      playBtn.textContent = 'Pause';
    }
  }

  function updateMissionHUD(station) {
    const card = document.getElementById('telem-mission-card');
    const comp = document.getElementById('telem-mission-company');
    const tenure = document.getElementById('telem-mission-tenure');
    const role = document.getElementById('telem-mission-role');
    const tech = document.getElementById('telem-mission-tech');

    if (comp) comp.textContent = station.name;
    if (tenure) tenure.textContent = station.tenure;
    if (role) role.textContent = station.role;
    if (tech) tech.textContent = station.tech;
    if (card) card.style.borderLeftColor = station.hexStr;

    // Highlight corresponding pill
    const pills = document.querySelectorAll('.mission-pill');
    pills.forEach((p) => {
      if (p.getAttribute('data-station') === station.id) {
        p.style.borderColor = station.hexStr;
      } else if (p.getAttribute('data-station') !== 'all') {
        p.style.borderColor = '';
      }
    });
  }

  /* --- Load Real 3D LiDAR SLAM PCD Point Cloud --- */
  function loadWarehousePCD() {
    if (typeof PCDLoader === 'undefined') return;

    const stride = window.innerWidth < 768 ? 2 : 1;

    PCDLoader.load(
      'assets/data/warehouse_amazon.pcd',
      (res) => {
        isRealDataset = res.isBinary;
        applyPointCloudGeometry(res.geometry, res.pointCount);
      },
      (err) => {
        console.info('PCD notice: procedural fallback active.');
      },
      stride
    );
  }

  /* Backdrop cloud: already cropped, de-rotated, roof-cut and scaled offline
     (assets/data/warehouse_hero.bin = uint32 count + int16 xyz at 2 cm). */
  function loadHeroCloud() {
    // file:// pages cannot fetch() local files, so fall back to a base64 script tag there.
    const loadBuf = location.protocol === 'file:'
      ? new Promise((res, rej) => {
          const sc = document.createElement('script');
          sc.src = 'assets/data/warehouse_hero.b64.js';
          sc.onload = () => {
            const bin = atob(window.__HERO_BIN);
            const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            res(u8.buffer);
          };
          sc.onerror = () => rej(new Error('hero cloud script missing'));
          document.head.appendChild(sc);
        })
      : fetch('assets/data/warehouse_hero.bin')
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
    loadBuf
      .then((buf) => {
        const n = new Uint32Array(buf, 0, 1)[0];
        const q = new Int16Array(buf, 4, n * 3);
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < pos.length; i++) pos[i] = q[i] * 0.02;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geometry.computeBoundingBox();
        applyColorMode(geometry, currentColorMode);
        pointCloudData = geometry;
        window.PortfolioWorld = { geometry, amr: forkliftGroup, waypoints, K, stations: companyStations, dock: deliveryBayZone };
        window.dispatchEvent(new Event('portfolio:world'));
      })
      .catch((err) => console.warn('Backdrop cloud failed to load:', err));
  }

  function applyPointCloudGeometry(geometry, count) {
    pointCloudData = geometry;

    transformSLAMCoordinates(geometry);

    if (pointCloudMesh) {
      scene.remove(pointCloudMesh);
      if (pointCloudMesh.geometry) pointCloudMesh.geometry.dispose();
      if (pointCloudMesh.material) pointCloudMesh.material.dispose();
    }

    applyColorMode(geometry, currentColorMode);

    const pointMaterial = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9
    });

    pointCloudMesh = new THREE.Points(geometry, pointMaterial);
    scene.add(pointCloudMesh);

    // Share the processed scan, the AMR model and the route with the landing-page hero
    window.PortfolioWorld = { geometry, amr: forkliftGroup, waypoints, K, stations: companyStations, dock: deliveryBayZone };
    window.dispatchEvent(new Event('portfolio:world'));
  }

  function transformSLAMCoordinates(geometry) {
    // The raw scan contains stray returns far outside the building and the building
    // is rotated ~24 deg in the map frame. Crop to the hall, de-rotate, recentre,
    // then convert from ROS (Z-up) to three.js (Y-up): (x, y, z) -> (x, z, -y).
    const ANGLE = (24 * Math.PI) / 180;
    const cos = Math.cos(ANGLE);
    const sin = Math.sin(ANGLE);
    const CX = 15.76;
    const CY = 0.3429;
    const HALF_X = 25.6;
    const HALF_Y = 9.9;
    const ROOF_CUT = 3.4; // drop roof trusses so the interior is visible from above

    const src = geometry.attributes.position.array;
    const srcI = geometry.attributes.intensity ? geometry.attributes.intensity.array : null;
    const n = src.length / 3;
    const pos = new Float32Array(src.length);
    const inten = srcI ? new Float32Array(n) : null;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const x = src[3 * i];
      const y = src[3 * i + 1];
      const z = src[3 * i + 2];
      if (z < -0.3 || z > 9.0) continue;
      const rx = cos * x - sin * y - CX;
      const ry = sin * x + cos * y - CY;
      if (Math.abs(rx) > HALF_X || Math.abs(ry) > HALF_Y) continue;
      const nearWall = Math.abs(rx) > HALF_X - 1.3 || Math.abs(ry) > HALF_Y - 1.3;
      if (!nearWall && z > ROOF_CUT) continue;
      pos[3 * m] = rx * K;
      pos[3 * m + 1] = z;
      pos[3 * m + 2] = -ry * K;
      if (inten) inten[m] = srcI[i];
      m++;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, 3 * m), 3));
    if (inten) geometry.setAttribute('intensity', new THREE.BufferAttribute(inten.slice(0, m), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    buildFactorGraphTrajectory();
  }

  /* --- Colormap Algorithms --- */
  function applyColorMode(geometry, mode) {
    if (!geometry) return;
    const positions = geometry.attributes.position.array;
    const intensities = geometry.attributes.intensity ? geometry.attributes.intensity.array : null;
    const colors = new Float32Array(positions.length);

    geometry.computeBoundingBox();
    const box = geometry.boundingBox || { min: { y: 0 }, max: { y: 7.5 } };
    const minY = box.min.y;
    const maxY = Math.max(6.0, box.max.y);

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const intensity = intensities ? intensities[i / 3] : 0.0;

      let r = 1, g = 1, b = 1;

      if (mode === 'elevation') {
        const normY = Math.max(0, Math.min(1, (y - minY) / (maxY - minY)));
        // Calm height ramp: deep slate -> blue -> teal -> warm sand
        const stops = [
          [0.00, 0.22, 0.31, 0.52],
          [0.28, 0.25, 0.49, 0.77],
          [0.62, 0.50, 0.82, 0.78],
          [1.00, 0.95, 0.90, 0.69]
        ];
        let k = 0;
        while (k < stops.length - 2 && normY > stops[k + 1][0]) k++;
        const t = (normY - stops[k][0]) / (stops[k + 1][0] - stops[k][0]);
        r = stops[k][1] + (stops[k + 1][1] - stops[k][1]) * t;
        g = stops[k][2] + (stops[k + 1][2] - stops[k][2]) * t;
        b = stops[k][3] + (stops[k + 1][3] - stops[k][3]) * t;
      } else if (mode === 'intensity') {
        const rangeVal = intensity > 0.01 ? intensity : Math.min(1.0, Math.sqrt(x * x + z * z) / 45.0);
        if (rangeVal > 0.7) {
          r = 0.95; g = 0.35 + (rangeVal - 0.7) * 0.6; b = 0.15;
        } else if (rangeVal > 0.35) {
          r = 0.85; g = 0.65; b = 0.25;
        } else {
          r = 0.25; g = 0.45; b = 0.75;
        }
      } else {
        if (y < 0.15) {
          r = 0.32; g = 0.34; b = 0.38;
        } else if (Math.abs(x % 12.0) < 0.4 || Math.abs(z % 10.0) < 0.4) {
          r = 0.75; g = 0.18; b = 0.18;
        } else {
          r = 0.72; g = 0.74; b = 0.78;
        }
      }

      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.attributes.color.needsUpdate = true;
  }

  /* --- Camera Presets --- */
  function setCameraPreset(mode) {
    currentCameraMode = mode;
    if (!camera) return;

    if (mode === 'iso') {
      camera.position.set(32, 42, 52);
      if (controls) controls.target.set(0, 1.5, 0);
    } else if (mode === 'top') {
      camera.position.set(0, 100, 0.01);
      if (controls) controls.target.set(0, 0, 0);
    } else if (mode === 'follow') {
      if (forkliftGroup) {
        const yaw = forkliftGroup.rotation.y;
        camera.position.set(
          forkliftGroup.position.x + 7.5 * Math.cos(yaw),
          forkliftGroup.position.y + 4.2,
          forkliftGroup.position.z - 7.5 * Math.sin(yaw)
        );
        if (controls) controls.target.copy(forkliftGroup.position);
      }
    }
  }

  /* --- UI Controls Setup --- */
  function setupViewerControls() {
    const playBtn = document.getElementById('viewer-btn-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playBtn.textContent = isPlaying ? 'Pause' : 'Play';
      });
    }

    const lidarBtn = document.getElementById('viewer-btn-lidar');
    if (lidarBtn) {
      lidarBtn.addEventListener('click', () => {
        isLiDARActive = !isLiDARActive;
        if (lidarBeams) lidarBeams.visible = isLiDARActive;
        lidarBtn.classList.toggle('active', isLiDARActive);
      });
    }

    const camIsoBtn = document.getElementById('cam-preset-iso');
    const camTopBtn = document.getElementById('cam-preset-top');
    const camFollowBtn = document.getElementById('cam-preset-follow');

    function updateCamButtons(activeId) {
      [camIsoBtn, camTopBtn, camFollowBtn].forEach((b) => {
        if (b) b.classList.remove('active');
      });
      const activeEl = document.getElementById(activeId);
      if (activeEl) activeEl.classList.add('active');
    }

    if (camIsoBtn) {
      camIsoBtn.addEventListener('click', () => {
        setCameraPreset('iso');
        updateCamButtons('cam-preset-iso');
      });
    }
    if (camTopBtn) {
      camTopBtn.addEventListener('click', () => {
        setCameraPreset('top');
        updateCamButtons('cam-preset-top');
      });
    }
    if (camFollowBtn) {
      camFollowBtn.addEventListener('click', () => {
        setCameraPreset('follow');
        updateCamButtons('cam-preset-follow');
      });
    }

    const colorSelect = document.getElementById('viewer-color-select');
    if (colorSelect) {
      colorSelect.addEventListener('change', (e) => {
        currentColorMode = e.target.value;
        if (pointCloudData) {
          applyColorMode(pointCloudData, currentColorMode);
        }
      });
    }

    const sizeSlider = document.getElementById('viewer-size-slider');
    const sizeValDisplay = document.getElementById('viewer-size-val');
    if (sizeSlider) {
      sizeSlider.addEventListener('input', (e) => {
        pointSize = parseFloat(e.target.value);
        if (pointCloudMesh && pointCloudMesh.material) {
          pointCloudMesh.material.size = pointSize;
        }
        if (sizeValDisplay) sizeValDisplay.textContent = pointSize.toFixed(1) + 'px';
      });
    }
    // Game mode launcher & controls
    const byId = (id) => document.getElementById(id);
    const on = (id, evt, fn) => { const n = byId(id); if (n) n.addEventListener(evt, fn); };

    on('viewer-btn-game', 'click', enterGameMode);
    on('stage-play-overlay', 'click', enterGameMode);
    on('game-btn-exit', 'click', exitGameMode);
    on('game-btn-restart', 'click', resetGame);
    on('game-help-dismiss', 'click', dismissGameHelp);
    on('dossier-btn-close', 'click', closeDossierModal);
    on('dossier-btn-profile', 'click', () => { closeDossierModal(); exitGameMode(); });
    on('victory-btn-keep-driving', 'click', () => { byId('game-victory-modal').style.display = 'none'; });
    on('victory-btn-restart', 'click', () => { byId('game-victory-modal').style.display = 'none'; resetGame(); });
    on('victory-btn-exit', 'click', exitGameMode);

    // Touch / pointer controls
    function bindHold(id, key) {
      const n = byId(id);
      if (!n) return;
      const down = (e) => { e.preventDefault(); keysDown[key] = true; dismissGameHelp(); };
      const up = (e) => { e.preventDefault(); keysDown[key] = false; };
      n.addEventListener('pointerdown', down);
      n.addEventListener('pointerup', up);
      n.addEventListener('pointerleave', up);
      n.addEventListener('pointercancel', up);
    }
    bindHold('touch-up', 'w');
    bindHold('touch-down', 's');
    bindHold('touch-left', 'a');
    bindHold('touch-right', 'd');
    on('touch-action', 'pointerdown', (e) => { e.preventDefault(); handleGameAction(); });

    // Keyboard teleoperation (only while game mode is active)
    const KEY_MAP = {
      KeyW: 'w', ArrowUp: 'w',
      KeyS: 's', ArrowDown: 's',
      KeyA: 'a', ArrowLeft: 'a',
      KeyD: 'd', ArrowRight: 'd'
    };

    window.addEventListener('keydown', (e) => {
      if (!isGameMode) return;
      if (KEY_MAP[e.code]) {
        keysDown[KEY_MAP[e.code]] = true;
        dismissGameHelp();
        e.preventDefault();
      } else if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) {
        handleGameAction();
        e.preventDefault();
      } else if (e.code === 'KeyC' && !e.repeat) {
        gameCam = gameCam === 'chase' ? 'top' : 'chase';
        e.preventDefault();
      } else if (e.code === 'KeyR' && !e.repeat) {
        resetGame();
        e.preventDefault();
      } else if (e.code === 'Escape') {
        exitGameMode();
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (KEY_MAP[e.code]) keysDown[KEY_MAP[e.code]] = false;
    });

    window.addEventListener('blur', () => {
      Object.keys(keysDown).forEach((k) => { keysDown[k] = false; });
    });
  }

  /* --- Game Mode: forklift delivery run --- */
  const PICKUP_RADIUS = 3.0;   // m, fork tip to pallet
  const FORK_REACH = 1.7;      // m, forward from chassis origin to fork tip
  const WORLD_LIMIT_X = 35;
  const Z_MIN = -4.2;
  const Z_MAX = 9.4;
  let gameCam = 'chase';       // 'chase' | 'top'
  let lastGameTick = 0;
  let dossierTimer = 0;
  let helpDismissed = false;
  const gameLook = { x: 0, y: 0.8, z: 0 };

  function gid(id) { return document.getElementById(id); }
  function show(id, display) { const n = gid(id); if (n) n.style.display = display || 'flex'; }
  function hide(id) { const n = gid(id); if (n) n.style.display = 'none'; }

  function enterGameMode() {
    isGameMode = true;
    gameCam = 'chase';
    lastGameTick = 0;
    helpDismissed = false;

    const stage = document.querySelector('.sim-stage');
    if (stage) {
      stage.classList.add('is-playing');
      if (stage.requestFullscreen && !document.fullscreenElement) {
        stage.requestFullscreen().catch(() => {});
      }
    }
    document.body.classList.add('game-open');
    show('game-hud');
    show('game-help');
    hide('stage-play-overlay');

    if (controls) controls.enabled = false;
    isPlaying = false;
    setPathOverlay(false);
    if (pointCloudMesh) pointCloudMesh.material.size = Math.max(pointSize, 2.5);

    if (forkliftGroup) {
      // Start in the open middle of the hall, facing down its length
      amrPose.x = -33;
      amrPose.z = 2.85;
      amrPose.heading = 0;
      forkliftGroup.position.set(amrPose.x, 0, amrPose.z);
      forkliftGroup.rotation.y = 0;
      gameLook.x = amrPose.x;
      gameLook.z = amrPose.z;
      camera.position.set(amrPose.x - 8.4, 4.4, amrPose.z);
    }
    teleopSpeed = 0.0;
    teleopSteer = 0.0;
    updateGameCounters();
    setTimeout(onWindowResize, 60);
  }

  function exitGameMode() {
    if (!isGameMode) return;
    isGameMode = false;

    const stage = document.querySelector('.sim-stage');
    if (stage) stage.classList.remove('is-playing');
    document.body.classList.remove('game-open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    ['game-hud', 'game-help', 'game-dossier', 'game-victory-modal', 'game-prompt-container'].forEach(hide);
    show('stage-play-overlay');
    Object.keys(keysDown).forEach((k) => { keysDown[k] = false; });

    if (controls) controls.enabled = true;
    setPathOverlay(true);
    if (pointCloudMesh) pointCloudMesh.material.size = pointSize;
    setCameraPreset('iso');
    ['cam-preset-iso', 'cam-preset-top', 'cam-preset-follow'].forEach((id) => {
      const b = gid(id);
      if (b) b.classList.toggle('active', id === 'cam-preset-iso');
    });

    isPlaying = true;
    const playBtn = gid('viewer-btn-play');
    if (playBtn) playBtn.textContent = 'Pause';
    setTimeout(onWindowResize, 60);
  }

  function setPathOverlay(visible) {
    [trajectoryLine, poseNodesGroup, loopClosureArc].forEach((o) => { if (o) o.visible = visible; });
  }

  function dismissGameHelp() {
    if (helpDismissed) return;
    helpDismissed = true;
    hide('game-help');
  }

  function resetGame() {
    carriedPallet = null;
    currentTargetPallet = null;
    deliveredCount = 0;
    targetForkElevation = 0.0;
    companyStations.forEach((station) => {
      const m = station.palletMesh;
      if (!m) return;
      if (m.parent) m.parent.remove(m);
      palletsMeshGroup.add(m);
      m.position.set(station.x, 0, station.z);
      m.rotation.set(0, 0, 0);
      station.isDelivered = false;
    });
    closeDossierModal();
    hide('game-victory-modal');
    updateGameCounters();
  }

  function updateGameCounters() {
    const count = gid('game-delivered-count');
    const total = gid('game-total');
    const bar = gid('game-progress-bar');
    if (count) count.textContent = deliveredCount;
    if (total) total.textContent = companyStations.length;
    if (bar) bar.style.width = (100 * deliveredCount / companyStations.length) + '%';
  }

  function forkTipPoint() {
    return {
      x: amrPose.x + FORK_REACH * Math.cos(amrPose.heading),
      z: amrPose.z + FORK_REACH * Math.sin(amrPose.heading)
    };
  }

  function handleGameAction() {
    if (!isGameMode) return;
    dismissGameHelp();
    const tip = forkTipPoint();

    if (carriedPallet) {
      const pallet = carriedPallet;
      targetForkElevation = 0.0;
      forkAssemblyGroup.remove(pallet.palletMesh);

      if (inDeliveryBay) {
        deliveryBayGroup.add(pallet.palletMesh);
        const slot = deliveredCount;
        pallet.palletMesh.position.set((slot % 4) * 1.5 - 2.25, 0, Math.floor(slot / 4) * 1.4 - 0.7);
        pallet.palletMesh.rotation.set(0, 0, 0);
        pallet.isDelivered = true;
        deliveredCount++;
        updateGameCounters();
        closeDossierModal();
        if (deliveredCount === companyStations.length) show('game-victory-modal');
      } else {
        scene.add(pallet.palletMesh);
        pallet.palletMesh.position.set(amrPose.x + 1.0 * Math.cos(amrPose.heading), 0, amrPose.z + 1.0 * Math.sin(amrPose.heading));
        pallet.palletMesh.rotation.set(0, -amrPose.heading, 0);
      }
      carriedPallet = null;
      return;
    }

    if (currentTargetPallet && !currentTargetPallet.isDelivered) {
      const st = currentTargetPallet;
      targetForkElevation = 0.35;
      if (st.palletMesh.parent) st.palletMesh.parent.remove(st.palletMesh);
      forkAssemblyGroup.add(st.palletMesh);
      st.palletMesh.position.set(0.8, 0.105, 0);
      st.palletMesh.rotation.set(0, 0, 0);
      carriedPallet = st;
      openDossierModal(st);
    }
  }

  function openDossierModal(station) {
    const card = gid('game-dossier');
    if (!card) return;
    gid('dossier-company').textContent = station.name;
    gid('dossier-role').textContent = station.role;
    gid('dossier-tenure').textContent = station.tenure;
    gid('dossier-bullets').innerHTML = station.bullets.map((b) => `<li>${b}</li>`).join('');
    gid('dossier-tech-wrap').innerHTML = station.tech.map((t) => `<span class="tag">${t}</span>`).join('');
    card.style.setProperty('--station', station.hexStr);
    card.style.display = 'block';
    isDossierOpen = true;
    dossierTimer = 14;
  }

  function closeDossierModal() {
    isDossierOpen = false;
    hide('game-dossier');
  }

  function stationWorldPos(station) {
    const m = station.palletMesh;
    return m ? { x: m.position.x, z: m.position.z } : { x: station.x, z: station.z };
  }

  function updateGameTeleop() {
    const now = performance.now();
    const dt = lastGameTick ? Math.min(0.05, (now - lastGameTick) / 1000) : 0.016;
    lastGameTick = now;

    if (forkAssemblyGroup) {
      forkElevation += (targetForkElevation - forkElevation) * (1 - Math.exp(-8 * dt));
      forkAssemblyGroup.position.y = forkElevation;
      if (forkLifter) forkLifter.position.y = forkElevation;
    }

    // Throttle: W forward, S reverse, coast to a stop
    if (keysDown.w) {
      teleopSpeed = Math.min(MAX_TELEOP_SPEED_FWD, teleopSpeed + TELEOP_ACCEL * dt);
    } else if (keysDown.s) {
      teleopSpeed = Math.max(MAX_TELEOP_SPEED_REV, teleopSpeed - TELEOP_ACCEL * dt);
    } else if (teleopSpeed > 0) {
      teleopSpeed = Math.max(0, teleopSpeed - TELEOP_DECEL * dt);
    } else if (teleopSpeed < 0) {
      teleopSpeed = Math.min(0, teleopSpeed + TELEOP_DECEL * dt);
    }

    // Steering: A turns the vehicle left, D right (heading grows clockwise from above)
    const steerInput = (keysDown.d ? 1 : 0) - (keysDown.a ? 1 : 0);
    teleopSteer += (steerInput * MAX_STEER_ANGLE - teleopSteer) * (1 - Math.exp(-7 * dt));

    // Rear-steer tricycle kinematics
    amrPose.heading += (teleopSpeed / WHEELBASE) * Math.sin(teleopSteer) * dt;
    amrPose.x += teleopSpeed * Math.cos(amrPose.heading) * dt;
    amrPose.z += teleopSpeed * Math.sin(amrPose.heading) * dt;

    if (Math.abs(amrPose.x) > WORLD_LIMIT_X) { amrPose.x = Math.sign(amrPose.x) * WORLD_LIMIT_X; teleopSpeed = 0; }
    if (amrPose.z < Z_MIN || amrPose.z > Z_MAX) { amrPose.z = Math.min(Z_MAX, Math.max(Z_MIN, amrPose.z)); teleopSpeed = 0; }

    forkliftGroup.position.set(amrPose.x, 0, amrPose.z);
    forkliftGroup.rotation.y = -amrPose.heading;
    if (rearSteerAssembly) rearSteerAssembly.rotation.y = -teleopSteer;
    if (lidarBeams && isLiDARActive) lidarBeams.rotation.y += 0.08;

    // Camera: critically-damped chase or top-down follow
    const ch = Math.cos(amrPose.heading);
    const sh = Math.sin(amrPose.heading);
    let dx, dy, dz, lx, ly, lz;
    if (gameCam === 'top') {
      dx = amrPose.x; dy = 36; dz = amrPose.z + 0.01;
      lx = amrPose.x; ly = 0; lz = amrPose.z;
    } else {
      dx = amrPose.x - 8.4 * ch; dy = 4.4; dz = amrPose.z - 8.4 * sh;
      lx = amrPose.x + 2.5 * ch; ly = 0.8; lz = amrPose.z + 2.5 * sh;
    }
    dx = Math.max(-WORLD_LIMIT_X, Math.min(WORLD_LIMIT_X, dx));
    dz = Math.max(Z_MIN - 0.5, Math.min(Z_MAX + 0.5, dz));
    const k = 1 - Math.exp(-5 * dt);
    camera.position.x += (dx - camera.position.x) * k;
    camera.position.y += (dy - camera.position.y) * k;
    camera.position.z += (dz - camera.position.z) * k;
    gameLook.x += (lx - gameLook.x) * k;
    gameLook.y += (ly - gameLook.y) * k;
    gameLook.z += (lz - gameLook.z) * k;
    camera.lookAt(gameLook.x, gameLook.y, gameLook.z);

    if (isDossierOpen) {
      dossierTimer -= dt;
      if (dossierTimer <= 0) closeDossierModal();
    }

    checkGameProximities();
    updateGameGuidance();
    updateGameDashboard();
  }

  function checkGameProximities() {
    const tip = forkTipPoint();
    const prompt = gid('game-prompt-container');
    const promptText = gid('game-prompt-text');
    let msg = '';

    if (carriedPallet) {
      inDeliveryBay = Math.hypot(tip.x - deliveryBayZone.x, tip.z - deliveryBayZone.z) < deliveryBayZone.radius;
      msg = inDeliveryBay
        ? `Deliver ${carriedPallet.shortName} to the loading dock`
        : `Drop ${carriedPallet.shortName} pallet here`;
      currentTargetPallet = null;
    } else {
      inDeliveryBay = false;
      let nearest = null;
      let best = Infinity;
      companyStations.forEach((st) => {
        if (st.isDelivered) return;
        const p = stationWorldPos(st);
        const d = Math.hypot(tip.x - p.x, tip.z - p.z);
        if (d < best) { best = d; nearest = st; }
      });
      if (nearest && best < PICKUP_RADIUS) {
        currentTargetPallet = nearest;
        msg = `Pick up ${nearest.shortName} pallet`;
      } else {
        currentTargetPallet = null;
      }
    }

    if (prompt && promptText) {
      promptText.textContent = msg;
      prompt.style.display = msg ? 'flex' : 'none';
    }
  }

  // Objective text + bearing arrow pointing at the next target
  function updateGameGuidance() {
    const text = gid('game-objective');
    const dist = gid('game-dist');
    const arrow = gid('game-arrow');
    if (!text) return;

    let target = null;
    let label = '';
    if (carriedPallet) {
      target = deliveryBayZone;
      label = `Carry the ${carriedPallet.shortName} pallet to the loading dock`;
    } else if (deliveredCount === companyStations.length) {
      text.textContent = 'All pallets delivered';
      if (dist) dist.textContent = '';
      return;
    } else {
      const tip = forkTipPoint();
      let best = Infinity;
      companyStations.forEach((st) => {
        if (st.isDelivered) return;
        const p = stationWorldPos(st);
        const d = Math.hypot(tip.x - p.x, tip.z - p.z);
        if (d < best) { best = d; target = p; label = `Pick up the ${st.shortName} pallet`; }
      });
    }
    if (!target) return;

    const dx = target.x - amrPose.x;
    const dz = target.z - amrPose.z;
    let bearing = Math.atan2(dz, dx) - amrPose.heading;
    bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    text.textContent = label;
    if (dist) dist.textContent = Math.hypot(dx, dz).toFixed(0) + ' m';
    if (arrow) arrow.style.transform = `rotate(${(bearing * 180 / Math.PI).toFixed(1)}deg)`;
  }

  function updateGameDashboard() {
    const speedEl = gid('game-dash-speed');
    const forksEl = gid('game-dash-forks');
    const bar = gid('game-speed-bar');
    if (speedEl) speedEl.textContent = teleopSpeed.toFixed(1);
    if (bar) bar.style.width = (100 * Math.abs(teleopSpeed) / MAX_TELEOP_SPEED_FWD) + '%';
    if (forksEl) forksEl.textContent = carriedPallet ? 'loaded' : (targetForkElevation > 0.1 ? 'raised' : 'lowered');
  }

  function onWindowResize() {
    const container = document.getElementById('slam-canvas-container');
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function updateThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    if (scene) {
      scene.background = new THREE.Color(0x0f1217);
    }
  }

  /* --- Authentic Forklift Tricycle Autonomy & Kinematics Loop --- */
  function animate() {
    requestAnimationFrame(animate);

    if (!isVisibleInViewport && !isGameMode) return;

    if (isGameMode && forkliftGroup) {
      updateGameTeleop();
    } else if (isPlaying && forkliftGroup && trajectorySpline) {
      // 1. Curvature Calculation via Vector Cross Product (immune to angle wrapping bugs)
      // Travel is housing-first (forks trailing), i.e. against the spline parameter.
      const lookaheadDelta = 0.005;
      const aheadU = (pathU - lookaheadDelta + 1.0) % 1.0;
      const curTangent = trajectorySpline.getTangentAt(pathU);
      const nextTangent = trajectorySpline.getTangentAt(aheadU);

      // 2D cross product in X-Z ground plane
      const cross2D = curTangent.x * nextTangent.z - curTangent.z * nextTangent.x;
      const dot2D = curTangent.x * nextTangent.x + curTangent.z * nextTangent.z;
      const dTheta = Math.atan2(cross2D, dot2D);

      const pCur = trajectorySpline.getPointAt(pathU);
      const pNext = trajectorySpline.getPointAt(aheadU);
      const ds = Math.max(0.01, pCur.distanceTo(pNext));
      const curvature = dTheta / ds; // signed path curvature

      // 2. Curvature-Aware Deceleration (slows down calmly in turns like real forklifts)
      const speedMultiplier = 1.0 / (1.0 + 8.5 * Math.abs(curvature));
      const dynamicStep = baseCruiseSpeedU * speedMultiplier;
      pathU = (pathU - dynamicStep + 1.0) % 1.0;

      // 3. Front Load Axle Position on the Path Spline
      const frontPos = trajectorySpline.getPointAt(pathU);
      const pathTangent = trajectorySpline.getTangentAt(pathU).normalize();

      // 4. Vehicle Heading (Authentic Tricycle Front-Fixed Drive Kinematics)
      // The front fixed drive axle rolls along pathTangent without lateral scrub.
      // In Three.js (+Y up, +X right, +Z towards viewer), vehicle rotation.y is atan2(-pathTangent.z, pathTangent.x):
      const headingAngle = Math.atan2(-pathTangent.z, pathTangent.x);
      forkliftGroup.rotation.y = headingAngle;

      // 5. Rear Wheel Steering Kinematics (tan delta = L * curvature)
      const targetSteerAngle = Math.atan(WHEELBASE * curvature);
      const clampedSteer = Math.max(-MAX_STEER_ANGLE, Math.min(MAX_STEER_ANGLE, targetSteerAngle));

      // Physical steering motor slew limit
      const maxSteerSlew = 0.035;
      const steerDelta = clampedSteer - currentSteerAngle;
      currentSteerAngle += Math.max(-maxSteerSlew, Math.min(maxSteerSlew, steerDelta));

      if (rearSteerAssembly) {
        rearSteerAssembly.rotation.y = -currentSteerAngle;
      }

      // 6. Position Vehicle Body with Authentic Counterweight Tail Swing
      // Front fixed load axle is at +FRONT_AXLE_OFFSET (0.65m) along vehicle forward vector:
      // The steered drive wheel (local x = -0.55) leads and sits on the path
      const curX = frontPos.x + 0.55 * pathTangent.x;
      const curZ = frontPos.z + 0.55 * pathTangent.z;
      forkliftGroup.position.set(curX, 0, curZ);

      // 7. Follow Camera
      if (currentCameraMode === 'follow' && controls) {
        camera.position.set(
          curX + 7.5 * pathTangent.x,
          4.2,
          curZ + 7.5 * pathTangent.z
        );
        controls.target.set(curX, 1.2, curZ);
      }

      // 8. 3D LiDAR Rotation
      if (lidarBeams && isLiDARActive) {
        lidarBeams.rotation.y += 0.08;
      }

      // 9. Proximity Detection to Career Milestone Stations
      let closestStation = null;
      let minStationDist = Infinity;

      for (let s = 0; s < companyStations.length; s++) {
        const st = companyStations[s];
        const dist = Math.hypot(curX - st.x, curZ - st.z);
        if (dist < minStationDist) {
          minStationDist = dist;
          closestStation = st;
        }
      }

      if (closestStation && minStationDist < 4.2) {
        if (activeStationId !== closestStation.id) {
          activeStationId = closestStation.id;
          updateMissionHUD(closestStation);
        }

        // Targeted dispatch arrival & docking
        if (targetStationId === closestStation.id && minStationDist < 1.6 && !isDockedAtStation) {
          isDockedAtStation = true;
          dockPauseTimer = 160; // ~2.5s inspection pause
        }
      }

      // 10. Docking inspection timer
      if (dockPauseTimer > 0) {
        dockPauseTimer--;
      }
    }

    // Pulse 3D station rings
    if (stationsMeshGroup) {
      const pulseTime = Date.now() * 0.003;
      stationsMeshGroup.children.forEach((stGroup, idx) => {
        const pulseRing = stGroup.children[4]; // 4th child is pulseRing
        if (pulseRing) {
          pulseRing.scale.setScalar(1.0 + 0.12 * Math.sin(pulseTime + idx * 1.2));
        }
      });
    }

    if (controls && !isGameMode) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initViewer);
  } else {
    initViewer();
  }
})();
