/**
 * Botsync MAG1500 tugger (simplified visual model, dimensions rounded): base, rider cab,
 * LiDAR pole and housings, tow hitch with auto-latch, and three trolleys.
 *
 * window.buildBotsyncTugger(THREE) returns:
 *   root      the tugger. Origin = centre of the drive axle, on the floor,
 *             +X toward the 3D LiDAR end (travel direction), +Y up, Z lateral.
 *   trolleys  three groups, each with its origin at its own tow pin and extending toward -X.
 *             The caller places them behind the tugger so the train follows the route.
 *   hitchX    distance behind the tugger origin to the first tow pin (m).
 *   pitch     pin-to-pin distance between consecutive trolleys (m).
 *   beams     rotating 3D LiDAR scan rays, already positioned at the top 3D LiDAR.
 */
(function () {
  'use strict';
  window.buildBotsyncTugger = function (THREE) {
const P={underH:0.04,bodyL:1.33,bodyW:1.05,bodyH:0.42,wheelW:0.06,wheelR:0.11,wheelY:0.37,wheelZ:0.10,
 casterR:0.04,casterX:0.36,casterY:0.23,casterZ:0.06,barX:0.18,barZ:0.0};
const PI=3.14159, hl=P.bodyL/2, hw=P.bodyW/2;
const SENSORS=[
 {id:'top',xyz:[0.61,0.01,1.67],rpy:[0,0,0]},
 {id:'l1',xyz:[0.52,0.44,0.18],rpy:[3.14,0,0.79]},
 {id:'l2',xyz:[-0.52,-0.44,0.18],rpy:[3.14,0,3.94]},
 {id:'l3',xyz:[0.67,0,0.26],rpy:[3.14,0,0]},
];
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const V=(X,Y,Z)=>new THREE.Vector3(X,Z,-Y); const vv=a=>V(a[0],a[1],a[2]);
function axes(rpy){const m=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rpy[0],rpy[1],rpy[2],'ZYX'));const e=m.elements;return [V(e[0],e[1],e[2]),V(e[4],e[5],e[6]),V(e[8],e[9],e[10])];}
const M=(c,r=0.55,m=0.15,x={})=>{const mm=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:r,metalness:m},x));return mm;};
const mat={base:M(0x3a3e43,0.55,0.25),base2:M(0x2b2e32,0.6,0.25),gap:M(0x141618,0.8,0.1),yellow:M(0xb87400,0.5,0.05),
 black:M(0x141516,0.4,0.3),glass:M(0x0d1b2a,0.08,0.6),steel:M(0x8d949c,0.35,0.7),rubber:M(0x17191b,0.9,0),
 green:M(0x3fb6ff,0.3,0,{emissive:0x1e9bff,emissiveIntensity:1.8}),red:M(0xd7261e,0.35,0.05),screen:M(0x8fb3d9,0.15,0.1,{emissive:0x3a5f8a,emissiveIntensity:0.6}),
 lidarBody:M(0xf3c300,0.45,0.05),blue:M(0x2a7bd6,0.4,0.2),white:M(0xeef0f2,0.4,0.05)};
const robot=new THREE.Group();
function add(geo,m,pos,rot){const o=new THREE.Mesh(geo,m);o.castShadow=o.receiveShadow=true;if(pos)o.position.copy(pos);if(rot)o.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);robot.add(o);return o;}
function box(X0,X1,Y0,Y1,Z0,Z1,m){return add(new THREE.BoxGeometry(X1-X0,Z1-Z0,Y1-Y0),m,V((X0+X1)/2,(Y0+Y1)/2,(Z0+Z1)/2));}
function cylAxis(c,dir,r,h,m,seg=40){const o=add(new THREE.CylinderGeometry(r,r,h,seg),m,c.clone());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());return o;}
const UP=V(0,0,1);
// plan-view shape (x=X, y=Y) extruded along Z
function planShape(hx,hy,ch,r=0.02){const s=new THREE.Shape();const p=[[hx-ch,-hy],[hx,-hy+ch],[hx,hy-ch],[hx-ch,hy],[-hx+ch,hy],[-hx,hy-ch],[-hx,-hy+ch],[-hx+ch,-hy]];
  s.moveTo(...p[0]);p.slice(1).forEach(q=>s.lineTo(...q));s.lineTo(...p[0]);return s;}
function slab(shape,Z0,Z1,m,bev=0.01){const b=Math.min(bev,(Z1-Z0)/3);const g=new THREE.ExtrudeGeometry(shape,{depth:Z1-Z0-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:3,curveSegments:8});
  const o=add(g,m);o.rotation.x=-Math.PI/2;o.position.y=Z0+b; // shape y -> three -z = robot +Y
  return o;}
// side-profile shape (x=X, y=Z) extruded along Y
function side(shape,Y0,Y1,m,bev=0.012){const g=new THREE.ExtrudeGeometry(shape,{depth:Y1-Y0-2*bev,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelSegments:3,curveSegments:8});
  const o=add(g,m);o.position.z=-(Y1-bev); return o;} // extrude +z(three) = -Y
// ---------- MAG1500 base (bodyL x bodyW x bodyH) ----------
slab(planShape(hl-0.012,hw-0.012,0.17),P.underH,0.19,mat.base2,0.012);
slab(planShape(hl-0.035,hw-0.035,0.15),0.19,0.205,mat.gap,0.003);
slab(planShape(hl-0.01,hw-0.01,0.14),0.205,P.bodyH,mat.base,0.014);
// status LED strips and side details on both long sides
[1,-1].forEach(s=>{const y=s*(hw+0.006);
  [[0.50,0.62],[-0.62,-0.50]].forEach(([a,b])=>box(a,b,y-0.004*s>y?y:y-0.004,y-0.004*s>y?y+0.004:y,0.355,0.37,mat.green));
  box(0.13,0.40,y-0.004,y+0.004,0.31,0.345,mat.black);[0.20,0.26,0.32].forEach((X,i)=>cylAxis(V(X,s*(hw+0.005),0.328),V(0,s,0),0.011,0.01,[mat.green,mat.blue,mat.white][i],16));
  box(-0.34,-0.14,y-0.004,y+0.004,0.265,0.355,mat.black);box(-0.32,-0.16,s>0?y+0.003:y-0.005,s>0?y+0.005:y-0.003,0.28,0.34,mat.screen);
  cylAxis(V(-0.45,s*(hw+0.01),0.31),V(0,s,0),0.022,0.02,mat.red,24);});
// text decals
function decal(text,w,h,font,color,pos,ry){const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*h/w);const x=c.getContext('2d');
  x.fillStyle=color;x.font=font;x.textAlign='center';x.textBaseline='middle';x.fillText(text,c.width/2,c.height/2+4);
  const t=new THREE.CanvasTexture(c);t.anisotropy=8;const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,transparent:true,roughness:0.5}));
  o.position.copy(pos);o.rotation.y=ry;robot.add(o);return o;}
[1,-1].forEach(s=>{const ry=s>0?Math.PI:0; // +Y face normal = three -z
  decal('MAG1500',0.30,0.07,'700 150px "Barlow Condensed", Arial Narrow, Arial, sans-serif','#b5c94a',V(-0.27,s*(hw+0.003),0.115),ry);
  decal('BOTSYNC',0.12,0.06,'700 120px "Barlow Condensed", Arial, sans-serif','#b5c94a',V(0.43,s*(hw+0.003),0.115),ry);});
// drive wheels and casters
[1,-1].forEach(s=>cylAxis(V(0,s*P.wheelY,P.wheelZ),V(0,1,0),P.wheelR,P.wheelW,mat.rubber,40));
[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a,b])=>add(new THREE.SphereGeometry(P.casterR,24,16),mat.rubber,V(a*P.casterX,b*P.casterY,P.casterZ)));
// ---------- 2D LiDARs (hanging upside-down) ----------
const S=Object.fromEntries(SENSORS.map(s=>[s.id,s]));
function lidar2d(s){const c=vv(s.xyz),A=axes(s.rpy);const g=new THREE.Group();g.position.copy(c);
  const B=new THREE.Matrix4().makeBasis(A[0],A[2],A[1].clone().negate());g.quaternion.setFromRotationMatrix(B);robot.add(g);
  const put=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.castShadow=true;o.position.set(x,y,z);g.add(o);return o;};
  // local: x fwd (scan centre), three-y = sensor z, three-z = -sensor y
  put(new THREE.CylinderGeometry(0.042,0.042,0.05,32),mat.glass,0,0,0);              // optics window around scan plane
  put(new THREE.CylinderGeometry(0.044,0.044,0.012,32),mat.black,0,0.031,0);
  put(new THREE.BoxGeometry(0.1,0.06,0.1),mat.lidarBody,-0.035,-0.055,0);                  // yellow body behind/under optics
  put(new THREE.BoxGeometry(0.004,0.03,0.05),mat.black,0.016,-0.055,0);}
lidar2d(S.l1);lidar2d(S.l2);lidar2d(S.l3);
// recessed window in the upper tier
box(hl-0.012,hl-0.004,-0.12,0.12,0.225,0.295,mat.gap);
// bar under the chassis
box(P.barX-0.03,P.barX+0.03,-0.13,0.13,-P.barZ+0.004,P.underH,mat.black);
// ---------- rider cab: open on the -Y side ----------
const CX0=-0.59,CX1=hl,CZ0=P.bodyH,CZ1=1.18,NX=-0.37,NZ=0.71,CW=0.50;
function cabBlock(X0,X1,Y0,Y1,Z0,Z1,notch){const sh=new THREE.Shape();
  if(notch){sh.moveTo(X1,Z0);sh.lineTo(X1,Z1);sh.lineTo(X0,Z1);sh.lineTo(X0,NZ);sh.lineTo(NX,NZ);sh.lineTo(NX,Z0);sh.lineTo(X1,Z0);}
  else{sh.moveTo(X0,Z0);sh.lineTo(X1,Z0);sh.lineTo(X1,Z1);sh.lineTo(X0,Z1);sh.lineTo(X0,Z0);}
  const b=0.012,g=new THREE.ExtrudeGeometry(sh,{depth:Y1-Y0-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:3});
  const o=add(g,mat.yellow);o.position.z=-(Y1-b);return o;}
cabBlock(CX0,0.0,-CW,CW,CZ0,CZ1,true);            // seat-back housing (full width, notch for hitch)
cabBlock(0.0,CX1-0.09,CW-0.05,CW,CZ0,CZ1,false);   // closed +Y side wall
cabBlock(CX1-0.09,CX1,-CW,CW,CZ0,CZ1,false);        // front wall (dash)
cabBlock(0.0,0.28,-0.44,CW-0.05,CZ0,0.76,false);    // seat pedestal
box(0.28,CX1-0.09,-CW,CW-0.05,CZ0,CZ0+0.015,mat.base2); // footwell floor
// seat
const seat=M(0x1b1c1e,0.75,0.05);
(function(){const cu=new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.23,0),new THREE.Vector2(0.23,0),new THREE.Vector2(0.21,0.09),new THREE.Vector2(-0.21,0.09)]),{depth:0.30,bevelEnabled:true,bevelThickness:0.025,bevelSize:0.025,bevelSegments:4});
  const o=add(cu,seat);o.rotation.y=Math.PI/2;o.position.copy(V(-0.02,0.03,0.765));
  const bk=new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.22,0),new THREE.Vector2(0.22,0),new THREE.Vector2(0.20,0.48),new THREE.Vector2(0.14,0.53),new THREE.Vector2(-0.14,0.53),new THREE.Vector2(-0.20,0.48)]),{depth:0.06,bevelEnabled:true,bevelThickness:0.025,bevelSize:0.025,bevelSegments:4});
  const k=add(bk,seat);k.rotation.y=Math.PI/2;k.rotation.z=-0.12;k.position.copy(V(-0.06,0.03,0.86));})();
// pole + 3D LiDAR on the dash
const T=S.top.xyz;
box(T[0]-0.035,T[0]+0.035,T[1]-0.035,T[1]+0.035,CZ1,T[2]-0.05,mat.black);
box(T[0]-0.06,T[0]+0.06,T[1]-0.06,T[1]+0.06,T[2]-0.055,T[2]-0.045,mat.black);
cylAxis(V(T[0],T[1],T[2]-0.02),UP,0.052,0.05,mat.black);cylAxis(V(T[0],T[1],T[2]+0.005),UP,0.053,0.03,mat.glass);cylAxis(V(T[0],T[1],T[2]+0.03),UP,0.052,0.025,mat.black);
// display on the pole, facing the rider (-X)
box(T[0]-0.10,T[0]-0.035,T[1]-0.02,T[1]+0.02,1.31,1.33,mat.black);
(function(){const o=add(new THREE.BoxGeometry(0.025,0.17,0.26),mat.black,V(T[0]-0.115,T[1],1.36));o.rotation.z=0.35; // top tilts toward +X, screen faces rider and up
  const sc=new THREE.Mesh(new THREE.PlaneGeometry(0.22,0.14),mat.screen);sc.rotation.y=-Math.PI/2;sc.position.set(-0.0135,0,0);o.add(sc);})();
// tow hitch
[1,-1].forEach(s=>box(-1.03,NX,s*0.16-0.025,s*0.16+0.025,0.56,0.63,mat.black));
for(let x=-0.98;x<NX;x+=0.17)box(x,x+0.04,-0.14,0.14,0.57,0.62,mat.black);
(function(){const s=new THREE.Shape();s.moveTo(-1.03,0.63);s.lineTo(-0.93,0.63);s.lineTo(-0.98,0.40);s.lineTo(-1.03,0.33);s.lineTo(-1.03,0.63);
  [0.13,-0.13].forEach(y=>side(s,y-0.012,y+0.012,mat.black,0.004));})();
box(-1.17,-0.98,-0.13,0.13,0.32,0.35,mat.black);
cylAxis(V(-1.10,0,0.36),UP,0.018,0.09,mat.steel,20);
// ---- auto-latch coupler (tugger side): spring-loaded jaws close over the trolley's tow ring and a
// locking collar drops over the pin; the green LED means "latched". Tugger and trolley stay coupled at a
// fixed pin distance, so the train holds its shape. ----
(function(){const lj=M(0xd0d4d8,0.3,0.8,{});const led=M(0x22ff66,0.3,0,{emissive:0x22ff66,emissiveIntensity:2.2});
  box(-1.14,-1.06,-0.075,0.075,0.395,0.425,mat.black);                                   // latch housing on top of the pin
  [1,-1].forEach(sg=>{box(-1.145,-1.065,sg*0.052-0.014,sg*0.052+0.014,0.335,0.385,lj);   // closed jaws around the ring
    cylAxis(V(-1.06,sg*0.07,0.41),V(0,1,0),0.007,0.03,mat.steel,12);});                  // jaw pivot pins
  cylAxis(V(-1.10,0,0.43),UP,0.026,0.02,mat.steel,20);                                    // locking collar
  add(new THREE.SphereGeometry(0.012,12,10),led,V(-1.165,0,0.41));                        // LATCHED indicator
  box(-1.20,-1.17,-0.03,0.03,0.40,0.42,mat.black);})();
// pulsing halo around the latch so the coupling reads from a distance (animated by the caller)
const latchHalo=add(new THREE.TorusGeometry(0.16,0.012,10,40),M(0x22ff66,0.3,0,{emissive:0x22ff66,emissiveIntensity:2.5,transparent:true,opacity:0.9}),V(-1.10,0,0.40),[Math.PI/2,0,0]);                                   // sensor/LED bracket
box(-1.16,-1.13,-0.02,0.02,0.35,0.84,mat.black);box(-1.20,-1.13,-0.02,0.02,0.80,0.84,mat.black);
box(-0.665,-0.6,-0.12,0.12,0.30,0.36,mat.black);

// ---------- trolleys (illustration) ----------
const trolleys=[];
(function(){const st=M(0x8d949c,0.35,0.75),deck=M(0x6f767d,0.45,0.6),wheel=M(0x1d1f22,0.8,0.05),hub=M(0x9aa0a6,0.3,0.8),
  wrap=M(0x9aa1a8,0.4,0.3),
  card=M(0x9a7a52,0.8,0),wood=M(0x8f6a3e,0.85,0),pal=M(0x6e5334,0.85,0);
  const L=1.30,Wd=0.86,DZ=0.30,TH=0.04,GAP=0.40,TONGUE=0.32;
  const put=(g,geo,m,X,Y,Z,rot)=>{const o=new THREE.Mesh(geo,m);o.castShadow=o.receiveShadow=true;o.position.copy(V(X,Y,Z));if(rot)o.rotation.set(...rot);g.add(o);return o;};
  const bx=(g,X0,X1,Y0,Y1,Z0,Z1,m)=>put(g,new THREE.BoxGeometry(X1-X0,Z1-Z0,Y1-Y0),m,(X0+X1)/2,(Y0+Y1)/2,(Z0+Z1)/2);
  let front=0; // hitch pin (each trolley is built around its own pin, origin x = 0)
  for(let i=0;i<3;i++){const g=new THREE.Group();trolleys.push(g);
    const X1=front-TONGUE, X0=X1-L;
    // deck + frame
    bx(g,X0,X1,-Wd/2,Wd/2,DZ,DZ+TH,deck);
    [-1,1].forEach(s=>bx(g,X0,X1,s*Wd/2-0.03,s*Wd/2,DZ-0.05,DZ+TH+0.015,st));
    [X0,X1-0.03].forEach(x=>bx(g,x,x+0.03,-Wd/2,Wd/2,DZ-0.05,DZ+TH+0.015,st));
    // corner posts + side rails
    [[X0+0.015,1],[X0+0.015,-1],[X1-0.015,1],[X1-0.015,-1]].forEach(([x,s])=>put(g,new THREE.CylinderGeometry(0.014,0.014,0.42,12),st,x,s*(Wd/2-0.015),DZ+TH+0.21));
    [-1,1].forEach(s=>put(g,new THREE.CylinderGeometry(0.012,0.012,L-0.03,12),st,(X0+X1)/2,s*(Wd/2-0.015),DZ+TH+0.42,[0,0,Math.PI/2]));
    // casters
    [[X0+0.12,1],[X0+0.12,-1],[X1-0.12,1],[X1-0.12,-1]].forEach(([x,s])=>{const y=s*(Wd/2-0.09),wz=-0.01+0.075;
      bx(g,x-0.04,x+0.04,y-0.04,y+0.04,DZ-0.07,DZ-0.05,hub);bx(g,x-0.03,x+0.03,y-0.035,y-0.03,wz,DZ-0.07,hub);bx(g,x-0.03,x+0.03,y+0.03,y+0.035,wz,DZ-0.07,hub);
      put(g,new THREE.CylinderGeometry(0.075,0.075,0.05,28),wheel,x,y,wz,[Math.PI/2,0,0]);put(g,new THREE.CylinderGeometry(0.03,0.03,0.055,16),hub,x,y,wz,[Math.PI/2,0,0]);});
    // tow tongue + handle at the front, pin bracket at the rear
    const tz=0.36;put(g,new THREE.CylinderGeometry(0.018,0.018,TONGUE+0.05,12),st,front-(TONGUE+0.05)/2+0.03,0,tz,[0,0,Math.PI/2]);
    put(g,new THREE.TorusGeometry(0.03,0.008,8,20),st,front,0,tz,[Math.PI/2,0,0]);
    [-0.15,0.15].forEach(y=>put(g,new THREE.CylinderGeometry(0.012,0.012,Math.hypot(TONGUE,y),10),st,front-TONGUE/2,y/2,tz,[0,Math.atan2(y,TONGUE),Math.PI/2]));
    [-0.28,0.28].forEach(y=>put(g,new THREE.CylinderGeometry(0.014,0.014,0.55,12),st,X1-0.015,y,DZ+TH+0.6));
    put(g,new THREE.CylinderGeometry(0.014,0.014,0.56,12),st,X1-0.015,0,DZ+TH+0.875,[Math.PI/2,0,0]);
    bx(g,X0-0.10,X0,-0.10,0.10,0.34,0.37,st);put(g,new THREE.CylinderGeometry(0.014,0.014,0.09,12),st,X0-0.06,0,0.37);
    // rear coupler for the next trolley: latch housing + LATCHED LED
    bx(g,X0-0.12,X0-0.02,-0.06,0.06,0.395,0.42,st);
    put(g,new THREE.SphereGeometry(0.011,12,10),M(0x22ff66,0.3,0,{emissive:0x22ff66,emissiveIntensity:2.2}),X0-0.145,0,0.41);
    // loads
    if(i===0){put(g,new THREE.BoxGeometry(1.0,0.12,0.8),pal,(X0+X1)/2,0,DZ+TH+0.06);put(g,new THREE.CylinderGeometry(0.42,0.42,0.62,40),wrap,(X0+X1)/2,0,DZ+TH+0.12+0.31);}
    if(i===1){[[0,0],[1,0],[0,1],[1,1]].forEach(([a,b])=>bx(g,X0+0.12+a*0.55,X0+0.62+a*0.55,-0.38+b*0.40,-0.02+b*0.40,DZ+TH,DZ+TH+0.38,card));
      bx(g,X0+0.25,X0+0.85,-0.30,0.30,DZ+TH+0.38,DZ+TH+0.70,card);}
    if(i===2){bx(g,X0+0.12,X1-0.12,-0.36,0.36,DZ+TH,DZ+TH+0.55,wood);}
    front=0;
  }})();

    // ---- compose: axle midpoint sits on the floor ----
    robot.position.y = 0.01;
    const root = new THREE.Group();
    root.add(robot);

    // 3D LiDAR scan rays around the top sensor
    const tp = vv(S.top.xyz); tp.y += 0.01;
    const pos = [], col = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, el = ((i % 6) - 2.5) * 0.07, R = 12;
      pos.push(0, 0, 0, Math.cos(a) * R, el * R, Math.sin(a) * R);
      col.push(0.25, 0.75, 1.0, 0.55, 0.45, 1.0);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const beams = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending }));
    beams.position.copy(tp);
    root.add(beams);

    return { root, trolleys, beams, latchHalo, hitchX: 1.10, pitch: 2.04 };
  };
})();
