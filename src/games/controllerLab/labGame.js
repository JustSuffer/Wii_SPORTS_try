import * as THREE from 'three';

/**
 * 3D Virtual Wiimote Visualizer & Sensor Calibration Lab
 */
export class ControllerLab {
  constructor(scene, camera, soundManager, motionEngine) {
    this.scene = scene;
    this.camera = camera;
    this.soundManager = soundManager;
    this.motionEngine = motionEngine;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.buttonMeshes = {};
    this.lastSwingText = 'Henüz vuruş yapılmadı. Telefonunuzu savurun!';

    this.buildWiimoteModel();
    this.buildPedestal();
    this.bindControls();
  }

  buildWiimoteModel() {
    this.wiimoteGroup = new THREE.Group();

    // 1. White Plastic Body
    const bodyGeo = new THREE.BoxGeometry(0.55, 2.4, 0.35);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.15,
      metalness: 0.05,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    this.wiimoteGroup.add(body);

    // 2. IR Sensor Window (Top dark acrylic)
    const irGeo = new THREE.BoxGeometry(0.45, 0.08, 0.28);
    const irMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    const ir = new THREE.Mesh(irGeo, irMat);
    ir.position.set(0, 1.22, 0);
    this.wiimoteGroup.add(ir);

    // 3. D-Pad (Cross)
    const dpadGeo = new THREE.BoxGeometry(0.24, 0.24, 0.06);
    const dpadMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });
    this.dpadMesh = new THREE.Mesh(dpadGeo, dpadMat);
    this.dpadMesh.position.set(0, 0.65, 0.18);
    this.wiimoteGroup.add(this.dpadMesh);

    // 4. A Button (Cyan translucent disc)
    const aGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 24);
    const aMat = new THREE.MeshStandardMaterial({
      color: 0x00a8ff,
      roughness: 0.2,
      emissive: 0x005588,
    });
    this.buttonMeshes.A = new THREE.Mesh(aGeo, aMat);
    this.buttonMeshes.A.rotation.x = Math.PI / 2;
    this.buttonMeshes.A.position.set(0, 0.22, 0.18);
    this.wiimoteGroup.add(this.buttonMeshes.A);

    // 5. Minus, Home, Plus
    const smallBtnGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16);
    const smallMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc });

    const btnMinus = new THREE.Mesh(smallBtnGeo, smallMat);
    btnMinus.rotation.x = Math.PI / 2;
    btnMinus.position.set(-0.14, -0.12, 0.18);
    this.wiimoteGroup.add(btnMinus);
    this.buttonMeshes.minus = btnMinus;

    const homeMat = new THREE.MeshStandardMaterial({ color: 0x0099ff });
    const btnHome = new THREE.Mesh(smallBtnGeo, homeMat);
    btnHome.rotation.x = Math.PI / 2;
    btnHome.position.set(0, -0.12, 0.18);
    this.wiimoteGroup.add(btnHome);
    this.buttonMeshes.home = btnHome;

    const btnPlus = new THREE.Mesh(smallBtnGeo, smallMat);
    btnPlus.rotation.x = Math.PI / 2;
    btnPlus.position.set(0.14, -0.12, 0.18);
    this.wiimoteGroup.add(btnPlus);
    this.buttonMeshes.plus = btnPlus;

    // 6. 1 & 2 Buttons
    const btn1 = new THREE.Mesh(smallBtnGeo, smallMat);
    btn1.rotation.x = Math.PI / 2;
    btn1.position.set(0, -0.45, 0.18);
    this.wiimoteGroup.add(btn1);
    this.buttonMeshes.one = btn1;

    const btn2 = new THREE.Mesh(smallBtnGeo, smallMat);
    btn2.rotation.x = Math.PI / 2;
    btn2.position.set(0, -0.68, 0.18);
    this.wiimoteGroup.add(btn2);
    this.buttonMeshes.two = btn2;

    // 7. Blue LEDs (Bottom)
    const ledGeo = new THREE.BoxGeometry(0.04, 0.04, 0.02);
    for (let i = 0; i < 4; i++) {
      const ledMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x00d2ff : 0x475569,
      });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(-0.15 + i * 0.1, -0.92, 0.18);
      this.wiimoteGroup.add(led);
    }

    // 8. B Trigger (On the back)
    const bGeo = new THREE.BoxGeometry(0.3, 0.35, 0.12);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    this.buttonMeshes.B = new THREE.Mesh(bGeo, bMat);
    this.buttonMeshes.B.position.set(0, 0.28, -0.22);
    this.wiimoteGroup.add(this.buttonMeshes.B);

    this.wiimoteGroup.position.set(0, 1.4, 0);
    this.group.add(this.wiimoteGroup);
  }

  buildPedestal() {
    // Elegant circular showcase stage
    const baseGeo = new THREE.CylinderGeometry(1.8, 2.0, 0.3, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.4,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.15;
    base.receiveShadow = true;
    this.group.add(base);

    // Glowing cyan accent ring
    const ringGeo = new THREE.TorusGeometry(1.82, 0.03, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.group.add(ring);
  }

  bindControls() {
    this.motionEngine.onSwing = (s) => {
      this.lastSwingText = `⚡ ${s.speedKmh} KM/S | ${s.type.toUpperCase()} | ${s.spin.toUpperCase()}`;
      this.soundManager.playTennisHit(s.power);
      this.updateLabHUD();
    };

    this.motionEngine.onButtonChange = (btn, pressed) => {
      if (this.buttonMeshes[btn]) {
        if (pressed) {
          this.buttonMeshes[btn].scale.set(0.9, 0.9, 0.5);
          if (this.buttonMeshes[btn].material.emissive) {
            this.buttonMeshes[btn].material.emissive.setHex(0x00ffff);
          }
        } else {
          this.buttonMeshes[btn].scale.set(1.0, 1.0, 1.0);
          if (this.buttonMeshes[btn].material.emissive) {
            this.buttonMeshes[btn].material.emissive.setHex(0x005588);
          }
        }
      }
    };
  }

  updateLabHUD() {
    let hud = document.getElementById('lab-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'lab-hud';
      hud.className = 'lab-hud-overlay';
      document.body.appendChild(hud);
    }
    hud.innerHTML = `
      <div class="lab-card">
        <h3>🎯 Hareket Test & Kalibrasyon Laboratuvarı</h3>
        <p class="swing-result">${this.lastSwingText}</p>
        <div class="tip">💡 Telefonunuzu elinizde tutarak istediğiniz yöne çevirin veya vuruş yapın. 3D Wiimote anlık olarak takip eder.</div>
      </div>
    `;
  }

  update(delta, time) {
    // Smoothly apply physical iPhone orientation quaternion to 3D Wiimote
    this.wiimoteGroup.quaternion.slerp(this.motionEngine.currentQuaternion, 0.35);

    // Camera view
    this.camera.position.set(0, 1.6, 3.8);
    this.camera.lookAt(0, 1.4, 0);
  }

  destroy() {
    const hud = document.getElementById('lab-hud');
    if (hud) hud.remove();
    this.scene.remove(this.group);
  }
}
