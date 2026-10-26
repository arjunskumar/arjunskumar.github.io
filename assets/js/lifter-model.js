/**
 * Botsync MAG lifter (simplified visual model): the tugger's low chassis with the rider cab, seat and
 * hitch removed and a telescoping lift column + deck on top.
 *
 * window.buildBotsyncLifter(THREE) returns:
 *   root       origin = centre of the drive axle on the floor, +X = front (travel direction)
 *   lift       group; set lift.position.y in 0..liftMax to raise the deck (pallet rests on top)
 *   deckY      deck top height with the lift fully down (m); deck top = deckY + lift.position.y
 *   liftMax    maximum lift travel (m)
 *   beams      empty group (the lifter has no 3D LiDAR)
 */
(function () {
  'use strict';
  window.buildBotsyncLifter = function (THREE) {
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
  decal('MAG LIFT',0.30,0.07,'700 150px "Barlow Condensed", Arial Narrow, Arial, sans-serif','#b5c94a',V(-0.27,s*(hw+0.003),0.115),ry);
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
// ---------- lift column + deck ----------
const DECK_Y=0.55, LIFT_MAX=0.62;
const lift=new THREE.Group(); robot.add(lift);
function addL(geo,m,pos){const o=new THREE.Mesh(geo,m);if(pos)o.position.copy(pos);lift.add(o);return o;}
// fixed outer sleeve on the chassis
box(-0.23,0.23,-0.23,0.23,P.bodyH,0.64,mat.base2);
box(-0.235,0.235,-0.235,0.235,0.62,0.645,mat.yellow);
// moving inner column (long enough to stay inside the sleeve; its lower part hides inside the chassis)
const col=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.75,0.34),mat.steel);
col.position.copy(V(0,0,0.50-0.375)); lift.add(col);
// deck plate (0.62 long along travel, 0.50 wide so it fits between the rack rails) with rubber pads and a yellow edge
const plate=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.04,0.50),mat.base);
plate.position.copy(V(0,0,DECK_Y-0.02)); lift.add(plate);
[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a,b])=>{const p=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.012,0.08),mat.rubber);p.position.copy(V(a*0.24,b*0.2,DECK_Y+0.006));lift.add(p);});
[1,-1].forEach(s=>{const e=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.03,0.012),mat.yellow);e.position.copy(V(0,s*0.25,DECK_Y-0.02));lift.add(e);});

// ---- compose ----
robot.position.y=0.01;
const root=new THREE.Group(); root.add(robot);
const beams=new THREE.Group();   // the lifter has no 3D LiDAR: kept as an empty group for callers
return { root, lift, deckY: DECK_Y + 0.01, liftMax: LIFT_MAX, beams };
  };
})();
