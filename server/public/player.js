// Movimento em primeira pessoa e entrada nas estações.
// Duas câmaras: uma para andar pela sala, outra para observar a bancada
// de perto. Trocar de câmara é o que define o modo da aplicação.

import { REACH, EYE_HEIGHT, WALK_SPEED } from '/config.js';
import { el } from '/dom.js';

export function createPlayer({ scene, canvas, pipeline, station }) {
  const prompt = el('prompt');

  const walk = new BABYLON.UniversalCamera('walk', new BABYLON.Vector3(-5.2, EYE_HEIGHT, 3.9), scene);
  walk.setTarget(new BABYLON.Vector3(-1.5, EYE_HEIGHT - 0.25, -1));
  walk.minZ = 0.05;
  walk.fov = 1.05;
  walk.speed = WALK_SPEED;
  walk.inertia = 0.62;
  walk.angularSensibility = 900;
  walk.applyGravity = true;
  walk.checkCollisions = true;
  // O Babylon já desconta a altura do elipsoide à posição da câmara para
  // encontrar o centro do colisor, por isso metade da altura dos olhos é
  // exatamente o valor certo — qualquer ellipsoidOffset aqui duplica a
  // correção e o utilizador sobe pelo ar.
  walk.ellipsoid = new BABYLON.Vector3(0.35, EYE_HEIGHT / 2, 0.35);

  // WASD, e as setas a funcionar em paralelo
  walk.keysUp = [87, 38];
  walk.keysDown = [83, 40];
  walk.keysLeft = [65, 37];
  walk.keysRight = [68, 39];

  const closeUp = new BABYLON.ArcRotateCamera(
    'closeUp', -Math.PI / 2, Math.PI / 2.7, 0.55, station.focus, scene
  );
  closeUp.lowerRadiusLimit = 0.25;
  closeUp.upperRadiusLimit = 1.4;
  closeUp.wheelPrecision = 300;
  closeUp.minZ = 0.02;

  pipeline.addCamera(walk);
  pipeline.addCamera(closeUp);

  let mode = 'explore';
  scene.activeCamera = walk;
  walk.attachControl(canvas, true);

  // Rato preso ao ecrã, como num jogo em primeira pessoa
  canvas.addEventListener('click', () => {
    if (mode === 'explore' && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    document.body.dataset.locked = String(document.pointerLockElement === canvas);
  });

  // Um raio a partir dos olhos, na direção da mira: a bancada só fica
  // disponível se estiver mesmo sob a mira e ao alcance da mão.
  // Verificado a cada 100 ms, que chega e sobra.
  let nearby = null;
  let lastCheck = 0;

  scene.onBeforeRenderObservable.add(() => {
    if (mode !== 'explore') return;

    const now = performance.now();
    if (now - lastCheck < 100) return;
    lastCheck = now;

    const hit = scene.pickWithRay(walk.getForwardRay(REACH));
    const withinReach = hit?.hit && hit.distance <= REACH;
    const id = withinReach ? hit.pickedMesh?.metadata?.station : null;
    const found = id === station.id ? station : null;

    if (found === nearby) return;

    nearby = found;
    // Estilo inline em vez do atributo hidden: vence qualquer regra de
    // classe, seja qual for a ordem em que a folha de estilos cresça.
    prompt.style.display = nearby ? 'flex' : 'none';
    if (nearby) el('prompt-action').textContent = nearby.accao;
  });

  scene.onKeyboardObservable.add((info) => {
    if (info.type !== BABYLON.KeyboardEventTypes.KEYDOWN) return;
    const k = info.event.code;

    if (k === 'KeyE' && mode === 'explore' && nearby) enter(nearby);
    else if ((k === 'Escape' || k === 'KeyQ') && mode === 'experiment') leave();
  });

  function enter(target) {
    mode = 'experiment';
    document.body.dataset.mode = 'experiment';
    document.exitPointerLock();
    walk.detachControl();

    closeUp.setTarget(target.focus);
    scene.activeCamera = closeUp;
    closeUp.attachControl(canvas, true);

    prompt.style.display = 'none';
  }

  function leave() {
    mode = 'explore';
    document.body.dataset.mode = 'explore';
    closeUp.detachControl();

    scene.activeCamera = walk;
    walk.attachControl(canvas, true);
    nearby = null;   // força a reavaliação da proximidade
  }

  el('leave').addEventListener('click', leave);

  return { enter, leave, walk, closeUp };
}
