// Montagem da cena: motor, luz, sombras, pós-processamento.
// Devolve também um punhado de funções que traduzem estado do sistema
// em alterações visuais na bancada — é a única porta pela qual o resto
// do código toca nas malhas 3D.

import { buildLab } from '/lab.js';
import { LIQUID_FULL } from '/config.js';

export function createScene(canvas) {
  const engine = new BABYLON.Engine(canvas, true, { stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = BABYLON.Color4.FromHexString('#0e1418ff');
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.15, 0);

  const ambient = new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity = 0.62;
  ambient.diffuse = new BABYLON.Color3(0.92, 0.95, 1);
  ambient.groundColor = new BABYLON.Color3(0.22, 0.24, 0.26);

  // Luz das janelas, na parede oeste. A direção ligeiramente enviesada
  // evita sombras paralelas às paredes, que denunciam luz artificial.
  const daylight = new BABYLON.DirectionalLight('daylight', new BABYLON.Vector3(0.75, -0.62, 0.25), scene);
  daylight.position = new BABYLON.Vector3(-8, 3.4, -2);
  daylight.intensity = 1.35;
  daylight.diffuse = new BABYLON.Color3(1, 0.97, 0.9);

  const lab = buildLab(scene);
  const station = lab.stations[0];

  // Sombras suaves só nos móveis: é o que assenta os objetos no chão.
  const shadowGen = new BABYLON.ShadowGenerator(1024, daylight);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurScale = 2;
  shadowGen.setDarkness(0.35);
  for (const mesh of lab.shadows) shadowGen.addShadowCaster(mesh);

  // Pós-processamento: antialiasing, bloom nas lâmpadas e no mostrador,
  // e correção de tons. É o que separa uma cena de blocos planos de algo
  // que parece iluminado. As câmaras são acrescentadas pelo player.
  const pipeline = new BABYLON.DefaultRenderingPipeline('pipeline', true, scene, []);
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.72;
  pipeline.bloomWeight = 0.32;
  pipeline.bloomKernel = 44;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.contrast = 1.18;
  pipeline.imageProcessing.exposure = 1.1;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 1.4;

  const visuals = {
    setLiquidLevel(fraction) {
      const h = LIQUID_FULL * Math.min(1, Math.max(0.15, fraction));
      lab.liquid.scaling.y = h;
      lab.liquid.position.set(
        station.beaker.position.x,
        station.benchTop + h / 2 + 0.003,
        station.beaker.position.z
      );
    },

    setLiquidColor([r, g, b]) {
      lab.liquidMat.baseColor = new BABYLON.Color3(r / 255, g / 255, b / 255);
    },

    setStirrer(on) {
      lab.ledMat.emissiveColor = on
        ? new BABYLON.Color3(0.2, 0.95, 0.5)
        : new BABYLON.Color3(0.25, 0.05, 0.05);
    },

    drawScreen: station.drawScreen,
  };

  visuals.setLiquidLevel(0.7);

  engine.runRenderLoop(() => scene.render());
  addEventListener('resize', () => engine.resize());

  return { engine, scene, lab, station, pipeline, visuals };
}
