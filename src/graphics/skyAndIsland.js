import * as THREE from 'three';

/**
 * Wii Sports Resort Style Sky & Environment
 */
export class SkyAndIsland {
  constructor(scene) {
    this.scene = scene;
    this.clouds = [];
    this.buildEnvironment();
  }

  buildEnvironment() {
    // 1. Sky Color & Background
    this.scene.background = new THREE.Color(0x76c2ff);
    this.scene.fog = new THREE.FogExp2(0xbbe0ff, 0.008);

    // 2. Sunlight & Ambient
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    sunLight.position.set(40, 60, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    sunLight.shadow.camera.left = -30;
    sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    this.scene.add(sunLight);

    // 3. Ocean / Sea Horizon
    const oceanGeo = new THREE.PlaneGeometry(300, 300);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1a8cff,
      roughness: 0.1,
      metalness: 0.2,
    });
    this.ocean = new THREE.Mesh(oceanGeo, oceanMat);
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.y = -2;
    this.scene.add(this.ocean);

    // 4. Distant Tropical Islands / Hills
    this.createDistantIslands();

    // 5. Fluffy Cumulus Clouds
    this.createPuffyClouds();
  }

  setVisible(visible) {
    if (this.ocean) this.ocean.visible = visible;
    for (const cloud of this.clouds) {
      cloud.visible = visible;
    }
    if (this.islandGroup) this.islandGroup.visible = visible;
  }

  createDistantIslands() {
    this.islandGroup = new THREE.Group();
    this.scene.add(this.islandGroup);

    const islandGeo = new THREE.ConeGeometry(35, 14, 16);
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x48b344,
      roughness: 0.8,
    });

    const positions = [
      { x: -80, z: -100, s: 1.0 },
      { x: 70, z: -110, s: 1.2 },
      { x: -10, z: -130, s: 1.5 },
    ];

    positions.forEach((p) => {
      const island = new THREE.Mesh(islandGeo, islandMat);
      island.position.set(p.x, -2, p.z);
      island.scale.set(p.s, p.s * 0.7, p.s);
      this.islandGroup.add(island);
    });
  }

  createPuffyClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      flatShading: true,
    });

    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      const puffCount = 5 + Math.floor(Math.random() * 4);

      for (let j = 0; j < puffCount; j++) {
        const puffGeo = new THREE.DodecahedronGeometry(3 + Math.random() * 2, 1);
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(
          (j - puffCount / 2) * 3 + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 2
        );
        cloud.add(puff);
      }

      cloud.position.set(
        (Math.random() - 0.5) * 160,
        25 + Math.random() * 15,
        -40 - Math.random() * 90
      );

      cloud.userData = { speed: 0.4 + Math.random() * 0.6 };
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  update(delta) {
    // Slowly drift clouds across sky
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * delta;
      if (cloud.position.x > 90) {
        cloud.position.x = -90;
      }
    }
  }
}
