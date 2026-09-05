// ---------------------------------------------------------------
// Sala do laboratório
//
// Escala real, em metros: bancadas a 0,90 m, teto a 3,20 m, olhos do
// utilizador a 1,62 m. Manter a escala verdadeira é o que faz o
// espaço parecer uma sala e não uma maquete.
//
// A paleta vem do próprio assunto: armários em verde-petróleo, tampos
// em resina epóxi preta, rodapé azul-ardósia e paredes claras. É o
// vocabulário de um laboratório escolar, não uma escolha decorativa.
// ---------------------------------------------------------------

export const ROOM = { width: 14, depth: 10, height: 3.2 };

const BENCH_H = 0.9;

export function buildLab(scene) {
  const mat = makeMaterials(scene);
  const shadows = [];

  buildShell(scene, mat);
  buildWindows(scene, mat);
  buildTeachingWall(scene, mat, shadows);
  buildStorage(scene, mat, shadows);
  buildSink(scene, mat, shadows);
  buildDoor(scene, mat);
  buildWallProps(scene, mat);

  const layout = [
    { x: -4.2, z: -2.2 }, { x: -0.6, z: -2.2 }, { x: 3.0, z: -2.2 },
    { x: -4.2, z: 1.4 }, { x: -0.6, z: 1.4 }, { x: 3.0, z: 1.4 },
  ];

  const benches = layout.map((pos, i) => {
    const parts = buildBench(scene, mat, pos.x, pos.z, shadows);
    if (i !== 1) addGlassware(scene, mat, pos.x, pos.z);
    return parts;
  });

  // A bancada central da frente é a que tem hardware real ligado.
  const active = layout[1];
  const rig = buildPhStation(scene, mat, active.x, active.z);

  for (const mesh of [...rig.meshes, ...benches[1]]) {
    mesh.metadata = { ...(mesh.metadata || {}), station: 'ph' };
  }

  const stations = [{
    id: 'ph',
    nome: 'Bancada de pH',
    accao: 'Fazer experiência',
    anchor: new BABYLON.Vector3(active.x, 0, active.z + 1.3),
    focus: rig.beaker.position.clone(),
    ...rig,
  }];

  return { stations, shadows, ...mat, ...rig };
}

// ---------------------------------------------------------------
// Materiais e texturas
// ---------------------------------------------------------------
function makeMaterials(scene) {
  const pbr = (name, hex, roughness = 0.7, metallic = 0.05) => {
    const m = new BABYLON.PBRMetallicRoughnessMaterial(name, scene);
    m.baseColor = BABYLON.Color3.FromHexString(hex);
    m.roughness = roughness;
    m.metallic = metallic;
    return m;
  };

  // Chão em mosaico: as juntas dão escala ao espaço. Sem elas, uma sala
  // grande e outra pequena parecem exatamente iguais.
  const floorTex = new BABYLON.DynamicTexture('floorTex', { width: 512, height: 512 }, scene, true);
  const fc = floorTex.getContext();
  fc.fillStyle = '#39424a';
  fc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const tone = 88 + ((i * 7 + j * 13) % 12);
      fc.fillStyle = `rgb(${tone},${tone + 6},${tone + 11})`;
      fc.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
    }
  }
  floorTex.update();
  floorTex.uScale = 7;
  floorTex.vScale = 5;

  const floor = new BABYLON.PBRMetallicRoughnessMaterial('floor', scene);
  floor.baseTexture = floorTex;
  floor.roughness = 0.55;
  floor.metallic = 0.05;

  const glass = pbr('glass', '#cfeeea', 0.05, 0);
  glass.alpha = 0.22;
  glass.backFaceCulling = false;

  return {
    floor,
    wall: pbr('wall', '#b9bfc2', 0.92),
    dado: pbr('dado', '#3c4a52', 0.65, 0.1),
    ceiling: pbr('ceiling', '#d5dadd', 0.95),
    bench: pbr('bench', '#2b5c60', 0.6, 0.1),
    benchTop: pbr('benchTop', '#1b2024', 0.3, 0.25),
    metal: pbr('metal', '#9aa3a9', 0.28, 0.85),
    wood: pbr('wood', '#6b5138', 0.75),
    board: pbr('board', '#eef2f3', 0.35),
    red: pbr('red', '#a8262f', 0.4, 0.2),
    glass,
    dark: pbr('dark', '#1d2327', 0.5, 0.3),
  };
}

function box(scene, name, dims, pos, material, collide = true) {
  const mesh = BABYLON.MeshBuilder.CreateBox(name, dims, scene);
  mesh.position.copyFrom(pos);
  mesh.material = material;
  mesh.checkCollisions = collide;
  mesh.receiveShadows = true;
  return mesh;
}

function emissive(scene, name, color, intensity = 1) {
  const m = new BABYLON.StandardMaterial(name, scene);
  m.emissiveColor = color.scale(intensity);
  m.disableLighting = true;
  return m;
}

// ---------------------------------------------------------------
function buildShell(scene, mat) {
  const { width: W, depth: D, height: H } = ROOM;

  const floor = BABYLON.MeshBuilder.CreateGround('floor', { width: W, height: D }, scene);
  floor.material = mat.floor;
  floor.checkCollisions = true;
  floor.receiveShadows = true;

  const ceiling = BABYLON.MeshBuilder.CreateGround('ceiling', { width: W, height: D }, scene);
  ceiling.position.y = H;
  ceiling.rotation.x = Math.PI;
  ceiling.material = mat.ceiling;

  const t = 0.2;
  const h = { w: W / 2, d: D / 2 };
  const walls = [
    ['wallN', { width: W, height: H, depth: t }, new BABYLON.Vector3(0, H / 2, -h.d)],
    ['wallS', { width: W, height: H, depth: t }, new BABYLON.Vector3(0, H / 2, h.d)],
    ['wallW', { width: t, height: H, depth: D }, new BABYLON.Vector3(-h.w, H / 2, 0)],
    ['wallE', { width: t, height: H, depth: D }, new BABYLON.Vector3(h.w, H / 2, 0)],
  ];
  for (const [name, dims, pos] of walls) box(scene, name, dims, pos, mat.wall);

  // Rodapé: uma faixa escura em baixo assenta a sala e esconde a junta
  // entre parede e chão, que de outro modo fica a saltar à vista.
  const band = 0.95;
  const dados = [
    ['dadoN', { width: W, height: band, depth: 0.06 }, new BABYLON.Vector3(0, band / 2, -h.d + 0.11)],
    ['dadoS', { width: W, height: band, depth: 0.06 }, new BABYLON.Vector3(0, band / 2, h.d - 0.11)],
    ['dadoW', { width: 0.06, height: band, depth: D }, new BABYLON.Vector3(-h.w + 0.11, band / 2, 0)],
    ['dadoE', { width: 0.06, height: band, depth: D }, new BABYLON.Vector3(h.w - 0.11, band / 2, 0)],
  ];
  for (const [name, dims, pos] of dados) box(scene, name, dims, pos, mat.dado, false);

  // Luminárias suspensas
  for (const x of [-3.8, 0, 3.8]) {
    for (const z of [-2.5, 1.5]) {
      const panel = box(scene, `lamp${x}_${z}`, { width: 1.2, height: 0.05, depth: 0.28 },
        new BABYLON.Vector3(x, H - 0.14, z), mat.board, false);
      panel.material = emissive(scene, `lampMat${x}_${z}`, new BABYLON.Color3(0.95, 0.97, 1), 1.15);

      box(scene, `lampBody${x}_${z}`, { width: 1.26, height: 0.09, depth: 0.34 },
        new BABYLON.Vector3(x, H - 0.09, z), mat.metal, false);
    }
  }
}

function buildWindows(scene, mat) {
  const x = -ROOM.width / 2;

  // O exterior visto pelas janelas: sem isto, as janelas são retângulos
  // luminosos sem profundidade e a sala parece um caixote fechado.
  const skyTex = new BABYLON.DynamicTexture('skyTex', { width: 512, height: 512 }, scene, true);
  const sc = skyTex.getContext();
  const grad = sc.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#7ea9c9');
  grad.addColorStop(0.55, '#b9d0dd');
  grad.addColorStop(0.56, '#5f7a56');
  grad.addColorStop(1, '#3d5238');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) {
    sc.fillStyle = i % 2 ? '#42603c' : '#4d6b44';
    const cx = 30 + i * 58, cy = 300 - (i % 3) * 22;
    sc.beginPath();
    sc.ellipse(cx, cy, 34, 46, 0, 0, Math.PI * 2);
    sc.fill();
    sc.fillStyle = '#3a2f26';
    sc.fillRect(cx - 4, cy + 30, 8, 40);
  }
  skyTex.update();

  const backdrop = BABYLON.MeshBuilder.CreatePlane('backdrop', { width: 22, height: 9 }, scene);
  backdrop.position.set(x - 3.5, 3, 0);
  backdrop.rotation.y = -Math.PI / 2;
  const skyMat = new BABYLON.StandardMaterial('skyMat', scene);
  skyMat.diffuseTexture = skyTex;
  skyMat.emissiveTexture = skyTex;
  skyMat.emissiveColor = new BABYLON.Color3(0.75, 0.75, 0.75);
  skyMat.backFaceCulling = false;
  backdrop.material = skyMat;

  for (const z of [-3, -0.6, 1.8]) {
    // Vão aberto na parede, para o exterior se ver de facto
    box(scene, `opening${z}`, { width: 0.3, height: 1.5, depth: 2 },
      new BABYLON.Vector3(x, 1.85, z), mat.glass, false).isVisible = false;

    const pane = box(scene, `win${z}`, { width: 0.04, height: 1.5, depth: 2 },
      new BABYLON.Vector3(x + 0.06, 1.85, z), mat.glass, false);
    pane.material = mat.glass;

    // Caixilharia
    box(scene, `frameT${z}`, { width: 0.14, height: 0.09, depth: 2.14 },
      new BABYLON.Vector3(x + 0.06, 2.64, z), mat.metal, false);
    box(scene, `frameB${z}`, { width: 0.14, height: 0.09, depth: 2.14 },
      new BABYLON.Vector3(x + 0.06, 1.06, z), mat.metal, false);
    for (const dz of [-1.02, 0, 1.02]) {
      box(scene, `mullion${z}_${dz}`, { width: 0.12, height: 1.56, depth: 0.06 },
        new BABYLON.Vector3(x + 0.06, 1.85, z + dz), mat.metal, false);
    }

    box(scene, `sill${z}`, { width: 0.24, height: 0.06, depth: 2.2 },
      new BABYLON.Vector3(x + 0.15, 1.0, z), mat.board, false);
  }
}

function buildTeachingWall(scene, mat, shadows) {
  const z = -ROOM.depth / 2 + 0.12;

  box(scene, 'boardBack', { width: 5.3, height: 1.6, depth: 0.06 },
    new BABYLON.Vector3(-1.5, 1.9, z), mat.metal, false);
  box(scene, 'board', { width: 5.1, height: 1.42, depth: 0.03 },
    new BABYLON.Vector3(-1.5, 1.92, z + 0.04), mat.board, false);
  box(scene, 'boardTray', { width: 5.2, height: 0.05, depth: 0.14 },
    new BABYLON.Vector3(-1.5, 1.15, z + 0.09), mat.metal, false);

  for (let i = 0; i < 3; i++) {
    const marker = BABYLON.MeshBuilder.CreateCylinder(`marker${i}`,
      { height: 0.12, diameter: 0.018, tessellation: 8 }, scene);
    marker.position.set(-3.2 + i * 0.18, 1.19, z + 0.09);
    marker.rotation.z = Math.PI / 2;
    marker.material = i === 0 ? mat.red : mat.dark;
  }

  // Tabela periódica
  const poster = BABYLON.MeshBuilder.CreatePlane('poster', { width: 2.6, height: 1.5 }, scene);
  poster.position.set(3.6, 1.9, z + 0.02);
  const tex = new BABYLON.DynamicTexture('posterTex', { width: 512, height: 300 }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#f3f5f6';
  ctx.fillRect(0, 0, 512, 300);
  const palette = ['#c8102e', '#efa73a', '#4faf5a', '#2e7fb8', '#6b2fa0', '#3aa792'];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 18; col++) {
      if ((row === 0 && col > 0 && col < 17) || (row < 3 && col > 1 && col < 12)) continue;
      ctx.fillStyle = palette[(row + col) % palette.length];
      ctx.fillRect(24 + col * 26, 46 + row * 32, 22, 27);
    }
  }
  ctx.fillStyle = '#1b2024';
  ctx.font = 'bold 20px "Space Grotesk", sans-serif';
  ctx.fillText('TABELA PERIÓDICA DOS ELEMENTOS', 24, 32);
  tex.update();
  const posterMat = new BABYLON.StandardMaterial('posterMat', scene);
  posterMat.diffuseTexture = tex;
  posterMat.emissiveTexture = tex;
  posterMat.emissiveColor = new BABYLON.Color3(0.25, 0.25, 0.25);
  poster.material = posterMat;

  const desk = box(scene, 'desk', { width: 2, height: BENCH_H, depth: 0.75 },
    new BABYLON.Vector3(-4.5, BENCH_H / 2, z + 1.5), mat.wood);
  box(scene, 'deskTop', { width: 2.1, height: 0.05, depth: 0.82 },
    new BABYLON.Vector3(-4.5, BENCH_H + 0.02, z + 1.5), mat.benchTop, false);
  shadows.push(desk);
}

function buildWallProps(scene, mat) {
  const z = -ROOM.depth / 2 + 0.12;

  // Relógio de parede
  const clock = BABYLON.MeshBuilder.CreateCylinder('clock', { height: 0.05, diameter: 0.34, tessellation: 28 }, scene);
  clock.position.set(1.6, 2.65, z);
  clock.rotation.x = Math.PI / 2;
  clock.material = mat.board;

  const face = BABYLON.MeshBuilder.CreateDisc('clockFace', { radius: 0.15, tessellation: 28 }, scene);
  face.position.set(1.6, 2.65, z + 0.03);
  const faceTex = new BABYLON.DynamicTexture('clockTex', { width: 128, height: 128 }, scene, true);
  const cc = faceTex.getContext();
  cc.fillStyle = '#f5f7f8';
  cc.beginPath(); cc.arc(64, 64, 62, 0, Math.PI * 2); cc.fill();
  cc.strokeStyle = '#1b2024'; cc.lineWidth = 5;
  cc.beginPath(); cc.moveTo(64, 64); cc.lineTo(64, 26); cc.stroke();
  cc.lineWidth = 4;
  cc.beginPath(); cc.moveTo(64, 64); cc.lineTo(94, 78); cc.stroke();
  faceTex.update();
  const faceMat = new BABYLON.StandardMaterial('clockFaceMat', scene);
  faceMat.diffuseTexture = faceTex;
  faceMat.emissiveTexture = faceTex;
  faceMat.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2);
  face.material = faceMat;

  // Extintor junto à porta
  const ext = BABYLON.MeshBuilder.CreateCylinder('extinguisher',
    { height: 0.5, diameter: 0.15, tessellation: 16 }, scene);
  ext.position.set(-6.6, 0.55, ROOM.depth / 2 - 1.6);
  ext.material = mat.red;
  const nozzle = BABYLON.MeshBuilder.CreateCylinder('nozzle',
    { height: 0.14, diameter: 0.04, tessellation: 10 }, scene);
  nozzle.position.set(-6.6, 0.85, ROOM.depth / 2 - 1.6);
  nozzle.material = mat.dark;
}

function buildDoor(scene, mat) {
  const z = ROOM.depth / 2 - 0.11;
  box(scene, 'doorFrame', { width: 1.15, height: 2.25, depth: 0.07 },
    new BABYLON.Vector3(-5.2, 1.12, z), mat.metal, false);
  box(scene, 'door', { width: 0.98, height: 2.1, depth: 0.05 },
    new BABYLON.Vector3(-5.2, 1.05, z - 0.04), mat.wood, false);
  const handle = BABYLON.MeshBuilder.CreateCylinder('handle',
    { height: 0.11, diameter: 0.028, tessellation: 10 }, scene);
  handle.position.set(-4.85, 1.05, z - 0.11);
  handle.rotation.x = Math.PI / 2;
  handle.material = mat.metal;
}

function buildStorage(scene, mat, shadows) {
  const x = ROOM.width / 2 - 0.45;

  const cabinet = box(scene, 'cabinet', { width: 0.7, height: 2.1, depth: 4 },
    new BABYLON.Vector3(x, 1.05, 1.5), mat.bench);
  shadows.push(cabinet);

  const cores = ['#c8102e', '#efa73a', '#4faf5a', '#2e7fb8', '#6b2fa0', '#cfeeea'];
  for (let shelf = 0; shelf < 3; shelf++) {
    box(scene, `shelf${shelf}`, { width: 0.66, height: 0.04, depth: 3.9 },
      new BABYLON.Vector3(x, 0.43 + shelf * 0.62, 1.5), mat.dark, false);

    for (let i = 0; i < 7; i++) {
      const tall = (shelf + i) % 3 === 0;
      const bottle = BABYLON.MeshBuilder.CreateCylinder(`bottle${shelf}${i}`,
        { height: tall ? 0.3 : 0.2, diameter: tall ? 0.08 : 0.1, tessellation: 14 }, scene);
      bottle.position.set(x - 0.4, 0.45 + shelf * 0.62 + (tall ? 0.17 : 0.12), 0.1 + i * 0.42);
      const m = new BABYLON.PBRMetallicRoughnessMaterial(`bMat${shelf}${i}`, scene);
      m.baseColor = BABYLON.Color3.FromHexString(cores[(shelf * 3 + i) % cores.length]);
      m.roughness = 0.22;
      m.alpha = 0.8;
      bottle.material = m;

      const cap = BABYLON.MeshBuilder.CreateCylinder(`cap${shelf}${i}`,
        { height: 0.03, diameter: tall ? 0.05 : 0.06, tessellation: 12 }, scene);
      cap.position.set(x - 0.4, 0.45 + shelf * 0.62 + (tall ? 0.33 : 0.23), 0.1 + i * 0.42);
      cap.material = mat.dark;
    }
  }
}

function buildSink(scene, mat, shadows) {
  const z = ROOM.depth / 2 - 0.5;

  const counter = box(scene, 'counter', { width: 5, height: BENCH_H, depth: 0.8 },
    new BABYLON.Vector3(3, BENCH_H / 2, z), mat.bench);
  box(scene, 'counterTop', { width: 5.1, height: 0.05, depth: 0.86 },
    new BABYLON.Vector3(3, BENCH_H + 0.02, z), mat.benchTop, false);
  shadows.push(counter);

  for (const x of [1.8, 4.2]) {
    box(scene, `basin${x}`, { width: 0.5, height: 0.1, depth: 0.4 },
      new BABYLON.Vector3(x, BENCH_H - 0.01, z), mat.metal, false);

    const tap = BABYLON.MeshBuilder.CreateCylinder(`tap${x}`,
      { height: 0.32, diameter: 0.035, tessellation: 12 }, scene);
    tap.position.set(x, BENCH_H + 0.18, z - 0.25);
    tap.material = mat.metal;

    const spout = BABYLON.MeshBuilder.CreateCylinder(`spout${x}`,
      { height: 0.22, diameter: 0.028, tessellation: 12 }, scene);
    spout.position.set(x, BENCH_H + 0.33, z - 0.15);
    spout.rotation.x = Math.PI / 2;
    spout.material = mat.metal;
  }
}

function buildBench(scene, mat, x, z, shadows) {
  const body = box(scene, `bench${x}_${z}`, { width: 2.4, height: BENCH_H - 0.08, depth: 0.8 },
    new BABYLON.Vector3(x, (BENCH_H - 0.08) / 2 + 0.08, z), mat.bench);
  const top = box(scene, `top${x}_${z}`, { width: 2.52, height: 0.055, depth: 0.88 },
    new BABYLON.Vector3(x, BENCH_H + 0.02, z), mat.benchTop, false);
  shadows.push(body);

  // Plinto recuado: dá a leitura de móvel pousado no chão
  box(scene, `plinth${x}_${z}`, { width: 2.2, height: 0.09, depth: 0.68 },
    new BABYLON.Vector3(x, 0.045, z), mat.dark, false);

  // Portas e puxadores
  for (const dx of [-0.6, 0.6]) {
    box(scene, `doorPanel${x}${z}${dx}`, { width: 1.06, height: 0.66, depth: 0.03 },
      new BABYLON.Vector3(x + dx, 0.5, z - 0.41), mat.dark, false);
    const pull = BABYLON.MeshBuilder.CreateCylinder(`pull${x}${z}${dx}`,
      { height: 0.16, diameter: 0.016, tessellation: 8 }, scene);
    pull.position.set(x + dx + (dx > 0 ? -0.44 : 0.44), 0.5, z - 0.44);
    pull.material = mat.metal;
  }

  // Torneira de gás, presente em qualquer bancada escolar
  const gas = BABYLON.MeshBuilder.CreateCylinder(`gas${x}${z}`,
    { height: 0.13, diameter: 0.03, tessellation: 10 }, scene);
  gas.position.set(x + 1.0, BENCH_H + 0.11, z - 0.25);
  gas.material = mat.metal;

  // Bancos: assento, pernas e apoio de pés
  for (const dx of [-0.6, 0.6]) {
    const seat = BABYLON.MeshBuilder.CreateCylinder(`seat${x}${z}${dx}`,
      { height: 0.06, diameter: 0.34, tessellation: 18 }, scene);
    seat.position.set(x + dx, 0.62, z + 0.85);
    seat.material = mat.dark;
    seat.checkCollisions = true;
    shadows.push(seat);

    for (let leg = 0; leg < 4; leg++) {
      const a = (leg / 4) * Math.PI * 2 + Math.PI / 4;
      const l = BABYLON.MeshBuilder.CreateCylinder(`leg${x}${z}${dx}${leg}`,
        { height: 0.6, diameter: 0.022, tessellation: 8 }, scene);
      l.position.set(x + dx + Math.cos(a) * 0.12, 0.3, z + 0.85 + Math.sin(a) * 0.12);
      l.material = mat.metal;
    }

    const ring = BABYLON.MeshBuilder.CreateTorus(`ring${x}${z}${dx}`,
      { diameter: 0.26, thickness: 0.014, tessellation: 18 }, scene);
    ring.position.set(x + dx, 0.2, z + 0.85);
    ring.material = mat.metal;
  }

  return [body, top];
}

function addGlassware(scene, mat, x, z) {
  const flask = BABYLON.MeshBuilder.CreateCylinder(`flask${x}${z}`,
    { height: 0.16, diameterTop: 0.04, diameterBottom: 0.13, tessellation: 22 }, scene);
  flask.position.set(x - 0.5, BENCH_H + 0.13, z);
  flask.material = mat.glass;

  const cyl = BABYLON.MeshBuilder.CreateCylinder(`cyl${x}${z}`,
    { height: 0.24, diameter: 0.05, tessellation: 16 }, scene);
  cyl.position.set(x + 0.45, BENCH_H + 0.17, z - 0.1);
  cyl.material = mat.glass;

  // Caderno aberto, o traço que diz que alguém trabalha aqui
  box(scene, `book${x}${z}`, { width: 0.3, height: 0.012, depth: 0.21 },
    new BABYLON.Vector3(x + 0.1, BENCH_H + 0.055, z + 0.18), mat.board, false);
}

// ---------------------------------------------------------------
// Bancada de pH: o equipamento ligado ao hardware real
// ---------------------------------------------------------------
function buildPhStation(scene, mat, x, z) {
  const top = BENCH_H + 0.05;

  const beaker = BABYLON.MeshBuilder.CreateCylinder('beaker',
    { height: 0.12, diameter: 0.085, tessellation: 36, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  beaker.position.set(x, top + 0.06, z);
  beaker.material = mat.glass;

  const liquid = BABYLON.MeshBuilder.CreateCylinder('liquid',
    { height: 1, diameter: 0.076, tessellation: 36 }, scene);
  const liquidMat = new BABYLON.PBRMetallicRoughnessMaterial('liquidMat', scene);
  liquidMat.metallic = 0;
  liquidMat.roughness = 0.12;
  liquidMat.alpha = 0.88;
  liquidMat.baseColor = BABYLON.Color3.FromHexString('#4faf5a');
  liquid.material = liquidMat;

  const probe = BABYLON.MeshBuilder.CreateCylinder('probe',
    { height: 0.2, diameter: 0.012, tessellation: 16 }, scene);
  probe.position.set(x + 0.018, top + 0.13, z + 0.008);
  probe.rotation.z = 0.1;
  probe.material = mat.dark;

  // Suporte universal, que é como uma sonda se segura de facto
  const standBase = box(scene, 'standBase', { width: 0.16, height: 0.02, depth: 0.12 },
    new BABYLON.Vector3(x + 0.16, top + 0.01, z + 0.02), mat.dark, false);
  const rod = BABYLON.MeshBuilder.CreateCylinder('rod',
    { height: 0.42, diameter: 0.016, tessellation: 12 }, scene);
  rod.position.set(x + 0.19, top + 0.22, z + 0.02);
  rod.material = mat.metal;
  const clampArm = box(scene, 'clampArm', { width: 0.17, height: 0.012, depth: 0.02 },
    new BABYLON.Vector3(x + 0.11, top + 0.24, z + 0.014), mat.metal, false);

  const stirrer = box(scene, 'stirrer', { width: 0.16, height: 0.048, depth: 0.15 },
    new BABYLON.Vector3(x, top + 0.024, z), mat.board, false);
  stirrer.material = mat.board;
  const stirrerPlate = BABYLON.MeshBuilder.CreateCylinder('stirrerPlate',
    { height: 0.006, diameter: 0.11, tessellation: 24 }, scene);
  stirrerPlate.position.set(x, top + 0.051, z);
  stirrerPlate.material = mat.metal;

  const knob = BABYLON.MeshBuilder.CreateCylinder('knob',
    { height: 0.012, diameter: 0.026, tessellation: 12 }, scene);
  knob.position.set(x + 0.055, top + 0.054, z + 0.045);
  knob.material = mat.dark;

  const led = BABYLON.MeshBuilder.CreateSphere('led', { diameter: 0.012, segments: 10 }, scene);
  led.position.set(x - 0.055, top + 0.05, z + 0.045);
  const ledMat = emissive(scene, 'ledMat', new BABYLON.Color3(0.25, 0.05, 0.05));
  led.material = ledMat;

  const esp = box(scene, 'esp', { width: 0.09, height: 0.02, depth: 0.05 },
    new BABYLON.Vector3(x - 0.36, top + 0.01, z - 0.05), mat.dark, false);
  const espLed = BABYLON.MeshBuilder.CreateSphere('espLed', { diameter: 0.006, segments: 8 }, scene);
  espLed.position.set(x - 0.33, top + 0.021, z - 0.05);
  espLed.material = emissive(scene, 'espLedMat', new BABYLON.Color3(0.2, 0.8, 0.35));

  // Frascos de tampão, ao lado do equipamento
  for (let i = 0; i < 2; i++) {
    const buf = BABYLON.MeshBuilder.CreateCylinder(`buffer${i}`,
      { height: 0.13, diameter: 0.055, tessellation: 16 }, scene);
    buf.position.set(x - 0.6 + i * 0.09, top + 0.065, z + 0.2);
    const bm = new BABYLON.PBRMetallicRoughnessMaterial(`bufMat${i}`, scene);
    bm.baseColor = BABYLON.Color3.FromHexString(i ? '#4faf5a' : '#efa73a');
    bm.roughness = 0.25;
    bm.alpha = 0.85;
    buf.material = bm;
  }

  // Mostrador com o valor ao vivo. Vai na parede da frente, no vão entre
  // o quadro e a tabela periódica: em cima da bancada tapava o copo, que
  // é precisamente o que se quer ver de perto.
  const screenX = 1.7, screenY = 2.0, screenZ = -ROOM.depth / 2 + 0.14;

  const screen = BABYLON.MeshBuilder.CreatePlane('screen', { width: 0.9, height: 0.5 }, scene);
  screen.position.set(screenX, screenY, screenZ);
  const screenTex = new BABYLON.DynamicTexture('screenTex', { width: 512, height: 280 }, scene, false);
  const screenMat = new BABYLON.StandardMaterial('screenMat', scene);
  screenMat.diffuseTexture = screenTex;
  screenMat.emissiveTexture = screenTex;
  screenMat.emissiveColor = new BABYLON.Color3(0.95, 0.95, 0.95);
  screen.material = screenMat;

  box(scene, 'screenFrame', { width: 0.98, height: 0.58, depth: 0.04 },
    new BABYLON.Vector3(screenX, screenY, screenZ - 0.03), mat.dark, false);

  function drawScreen({ ph, temperature, humidity, pressure, online, color }) {
    const ctx = screenTex.getContext();
    ctx.fillStyle = '#0e1418';
    ctx.fillRect(0, 0, 512, 280);
    ctx.strokeStyle = 'rgba(160,200,210,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 488, 256);
    ctx.fillStyle = online ? '#4cd08a' : '#8b6a6a';
    ctx.beginPath();
    ctx.arc(466, 40, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d8f97';
    ctx.font = '20px "Space Mono", monospace';
    ctx.fillText('BANCADA-01', 32, 48);
    ctx.fillStyle = color || '#4faf5a';
    ctx.font = 'bold 124px "Space Mono", monospace';
    ctx.fillText(ph === null ? '--' : ph.toFixed(2), 30, 186);
    ctx.fillStyle = '#7d8f97';
    ctx.font = '24px "Space Mono", monospace';
    ctx.fillText('pH', 32, 214);

    // Faixa das condicoes ambiente, separada do valor principal
    ctx.fillStyle = 'rgba(160,200,210,0.15)';
    ctx.fillRect(24, 226, 464, 1);
    ctx.fillStyle = '#7d8f97';
    ctx.font = '21px "Space Mono", monospace';
    ctx.fillText(temperature == null ? '--°C' : `${temperature.toFixed(1)}°C`, 32, 256);
    ctx.fillText(humidity == null ? '--%' : `${humidity.toFixed(0)}%`, 180, 256);
    ctx.fillText(pressure == null ? '---- hPa' : `${pressure.toFixed(0)} hPa`, 300, 256);
    screenTex.update();
  }

  drawScreen({ ph: null, temperature: null, humidity: null, pressure: null, online: false });

  return {
    beaker, liquid, liquidMat, probe, stirrer, led, ledMat, drawScreen, benchTop: top,
    meshes: [beaker, liquid, probe, stirrer, stirrerPlate, led, knob, esp,
             standBase, rod, clampArm],
  };
}
