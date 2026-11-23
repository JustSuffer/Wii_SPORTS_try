import * as THREE from 'three';
import { MiiAvatar } from '../../graphics/miiAvatar.js';

/**
 * Wii Sports Resort - Swordplay / Sabre Duel
 */
export class SwordGame {
  constructor(scene, camera, soundManager, motionEngine) {
    this.scene = scene;
    this.camera = camera;
    this.soundManager = soundManager;
    this.motionEngine = motionEngine;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.score = 0;
    this.targetCut = false;

    this.buildArena();
    this.initMiiAndSword();
    this.initTargetDummy();
    this.initHUD();
    this.bindControls();
  }

  buildArena() {
    // 1. Circular Arena Platform over the Ocean
    const platformGeo = new THREE.CylinderGeometry(4.5, 5.0, 0.8, 32);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0xecf0f1,
      roughness: 0.3,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.4;
    platform.receiveShadow = true;
    this.group.add(platform);

    // Blue Ring border
    const ringGeo = new THREE.TorusGeometry(4.4, 0.08, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x0984e3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.group.add(ring);
  }

  initMiiAndSword() {
    // FIRST-PERSON POV SWORD RIG:
    // Floating player hand holding the sword, positioned directly in front of the camera!
    this.swordRig = new THREE.Group();
    this.group.add(this.swordRig);

    // Iconic spherical Mii hand (peach skin)
    const handGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const handMat = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.45,
    });
    this.hand = new THREE.Mesh(handGeo, handMat);
    this.hand.castShadow = true;
    this.swordRig.add(this.hand);

    // 3D Foam / Bamboo Sword
    this.swordMeshGroup = new THREE.Group();

    // Hilt / Handle (held inside hand)
    const handleGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.35, 12);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.8 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = 0.05;
    this.swordMeshGroup.add(handle);

    // Crossguard
    const guardGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.035, 16);
    const guardMat = new THREE.MeshStandardMaterial({ color: 0xd63031, roughness: 0.3 });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.y = 0.22;
    this.swordMeshGroup.add(guard);

    // Glowing Azure Sword Blade
    const bladeGeo = new THREE.CylinderGeometry(0.038, 0.025, 1.45, 14);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x00d2d3,
      emissive: 0x01a3a4,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.3,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.95;
    blade.castShadow = true;
    this.swordMeshGroup.add(blade);

    this.swordRig.add(this.swordMeshGroup);

    // Default first-person sword position in front of eyes
    this.swordBasePos = new THREE.Vector3(0.28, 1.15, -0.4);
    this.swordRig.position.copy(this.swordBasePos);

    this.isSlashing = false;
    this.slashProgress = 0;
  }

  initTargetDummy() {
    this.targetGroup = new THREE.Group();

    // Wooden slicing post / training block
    const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.8, 16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8c7b64, roughness: 0.7 });
    this.targetMesh = new THREE.Mesh(postGeo, postMat);
    this.targetMesh.position.y = 0.9;
    this.targetGroup.add(this.targetMesh);

    // Slice Line Guide (Orange ring)
    const lineGeo = new THREE.TorusGeometry(0.36, 0.02, 8, 24);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe67e22 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = Math.PI / 2;
    line.position.y = 0.9;
    this.targetGroup.add(line);

    this.targetGroup.position.set(0, 0, -1.5);
    this.group.add(this.targetGroup);
  }

  initHUD() {
    this.hudContainer = document.createElement('div');
    this.hudContainer.id = 'sword-hud';
    this.hudContainer.className = 'bowling-hud-container';
    document.body.appendChild(this.hudContainer);

    this.hudContainer.innerHTML = `
      <div class="bowling-scorecard" style="top: 76px; right: 24px;">
        <div class="score-header">WII KILIÇ DÜELLOSU</div>
        <div class="score-total" id="hud-sword-score" style="font-size: 26px; color: #38bdf8;">KESİLEN HEDEF: 0</div>
      </div>

      <div class="bowling-controls-banner">
        <div class="control-tip primary">
          <span class="ctrl-icon">⚔️ KILIÇ SAVURMA:</span>
          <span>Telefonunu Kılıç Gibi Tut ➔ Yatay veya Dikey Hızlıca Savur!</span>
        </div>
        <div class="control-tip secondary">
          <span class="ctrl-sub">🗡️ 1:1 HAREKET: Kılıcın açısı telefonunu anlık takip eder</span>
          <span class="ctrl-sub">⌨️ PC Test: <strong>SPACE</strong> Tuşu</span>
        </div>
      </div>
    `;
  }

  bindControls() {
    this.motionEngine.onSwing = (swingData) => {
      this.executeSlash(swingData);
    };

    this.keyHandler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.executeSlash({ power: 0.9, type: 'forehand' });
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  executeSlash(swingData) {
    this.isSlashing = true;
    this.slashStartTime = performance.now();
    this.slashDuration = 280; // ms
    this.slashType = swingData.type || 'forehand';

    this.soundManager.playTennisHit(1.2); // Crisp slash sound

    if (window.serverClient) {
      window.serverClient.sendToController({ type: 'sound', name: 'tennis_hit' });
      window.serverClient.sendToController({ type: 'rumble', duration: [40, 30, 70] });
    }

    // Cut target block
    this.score++;
    const scoreEl = document.getElementById('hud-sword-score');
    if (scoreEl) scoreEl.innerText = `KESİLEN HEDEF: ${this.score}`;

    // Target tumble animation
    this.targetMesh.rotation.z = (this.slashType === 'forehand' ? 1 : -1) * 0.65;
    this.showCelebrationBanner('KESİLDİ! ⚔️', '#38bdf8');

    setTimeout(() => {
      this.targetMesh.rotation.z = 0;
    }, 1200);
  }

  showCelebrationBanner(text, color) {
    let banner = document.getElementById('sword-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'sword-banner';
      banner.className = 'wii-celebration-banner';
      document.body.appendChild(banner);
    }
    banner.innerText = text;
    banner.style.color = color;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 1600);
  }

  update(delta, time) {
    // 1-to-1 Sword angle follows physical iPhone orientation!
    if (this.swordMeshGroup && this.motionEngine) {
      this.swordMeshGroup.quaternion.slerp(this.motionEngine.currentQuaternion, 0.4);
    }

    // FIRST-PERSON POV CAMERA:
    // Placed at player eye level looking straight forward at the target dummy!
    this.camera.position.set(0, 1.55, 0.6);
    this.camera.lookAt(0, 1.15, -1.8);

    // First-person hand and sword positioning:
    const breathe = Math.sin(time * 3) * 0.015;

    if (this.isSlashing) {
      const elapsed = performance.now() - this.slashStartTime;
      const t = elapsed / this.slashDuration;

      if (t < 1.0) {
        // Dynamic slash arc across the screen
        const slashArc = Math.sin(t * Math.PI);
        const dir = this.slashType === 'forehand' ? -1 : 1;
        this.swordRig.position.set(
          this.swordBasePos.x + dir * slashArc * 0.8,
          this.swordBasePos.y - slashArc * 0.35,
          this.swordBasePos.z - slashArc * 0.4
        );
        this.swordRig.rotation.z = dir * slashArc * 1.2;
      } else {
        this.isSlashing = false;
        this.swordRig.position.copy(this.swordBasePos);
        this.swordRig.rotation.set(0, 0, 0);
      }
    } else {
      this.swordRig.position.set(
        this.swordBasePos.x,
        this.swordBasePos.y + breathe,
        this.swordBasePos.z
      );
      this.swordRig.rotation.set(0, 0, 0);
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.hudContainer) this.hudContainer.remove();
    const banner = document.getElementById('sword-banner');
    if (banner) banner.remove();
    if (this.swordRig) this.group.remove(this.swordRig);
    this.scene.remove(this.group);
  }
}
