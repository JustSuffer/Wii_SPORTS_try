import * as THREE from 'three';
import { BowlingPhysics } from './bowlingPhysics.js';
import { MiiAvatar } from '../../graphics/miiAvatar.js';

export class BowlingGame {
  constructor(scene, camera, soundManager, motionEngine) {
    this.scene = scene;
    this.camera = camera;
    this.soundManager = soundManager;
    this.motionEngine = motionEngine;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.physics = new BowlingPhysics(soundManager);

    // Game state
    this.currentFrame = 1;
    this.currentRoll = 1; // 1 or 2
    this.frameScores = Array.from({ length: 10 }, () => ({ r1: null, r2: null, total: null }));
    this.state = 'aiming'; // 'aiming', 'rolling', 'impact', 'scoring'
    this.aimX = 0; // -0.35 to 0.35
    this.aimAngle = 0; // -5 to +5 deg
    this.isZoomed = false;

    this.pinMeshes = [];
    this.pinMeshMap = new Map();
    this.fallenPinIds = new Set();
    this.ballMesh = null;
    this.activeRollSound = null;

    this.buildBowlingAlleyHall();
    this.initFirstPersonHands();
    this.initHUD();
    this.resetRack();
    this.bindControls();
  }

  buildBowlingAlleyHall() {
    const laneLength = 24.0;
    const laneWidth = 1.05;

    // 1. Room Enclosure (Walls & Ceiling - True Indoor Bowling Alley)
    const hallWidth = 14.0;
    const hallHeight = 6.5;
    const hallLength = 36.0;

    // Ceiling with acoustic paneling & light strips
    const ceilingGeo = new THREE.PlaneGeometry(hallWidth, hallLength);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x1e272e,
      roughness: 0.85,
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, hallHeight, 0);
    this.group.add(ceiling);

    // Left & Right Wall Panels (Classic turquoise & beige bowling alley)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x152530, roughness: 0.6 });

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(hallLength, hallHeight), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-hallWidth / 2, hallHeight / 2, 0);
    this.group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(hallLength, hallHeight), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(hallWidth / 2, hallHeight / 2, 0);
    this.group.add(rightWall);

    // Back Wall behind Pin Deck
    const backWallMat = new THREE.MeshStandardMaterial({ color: 0x091218, roughness: 0.8 });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(hallWidth, hallHeight), backWallMat);
    backWall.position.set(0, hallHeight / 2, -14.0);
    this.group.add(backWall);

    // Glowing Lane Sign ("WII BOWLING • LANE 4")
    const signGeo = new THREE.PlaneGeometry(4.5, 1.0);
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#0984e3';
    sctx.fillRect(0, 0, 512, 128);
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 44px Arial, sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText('WII BOWLING • LANE 4', 256, 78);
    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMesh = new THREE.Mesh(
      signGeo,
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signMesh.position.set(0, 4.2, -13.8);
    this.group.add(signMesh);

    // 2. Indoor Lights: Warm ambient + Dedicated SpotLight on Pins!
    const indoorAmbient = new THREE.AmbientLight(0xfff5ea, 1.1);
    this.group.add(indoorAmbient);

    // SpotLight directly illuminating all 10 pins!
    const pinSpot = new THREE.SpotLight(0xffffff, 3.8, 30, Math.PI / 3, 0.4, 0.8);
    pinSpot.position.set(0, 6.0, -8.5);
    pinSpot.target.position.set(0, 0.2, -10.2);
    pinSpot.castShadow = true;
    this.group.add(pinSpot);
    this.group.add(pinSpot.target);

    // Fluorescent Ceiling Light Strips (Reflected on the polished lanes)
    const stripGeo = new THREE.BoxGeometry(0.35, 0.1, 26);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-2.2, 0, 2.2].forEach((x) => {
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(x, hallHeight - 0.1, 0);
      this.group.add(strip);
    });

    // 3. Main Center Lane (Player's Lane)
    this.createLane(0, true);

    // 4. Neighboring Lanes Left & Right (Authentic Bowling Alley atmosphere)
    this.createLane(-2.2, false);
    this.createLane(2.2, false);

    // 5. Approach Area
    const approachGeo = new THREE.PlaneGeometry(hallWidth, 8.0);
    const approachMat = new THREE.MeshStandardMaterial({
      color: 0xc89658,
      roughness: 0.35,
    });
    const approach = new THREE.Mesh(approachGeo, approachMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, 0, laneLength / 2 + 3.5);
    approach.receiveShadow = true;
    this.group.add(approach);
  }

  createLane(laneCenterX, isPlayerLane) {
    const laneLength = 24.0;
    const laneWidth = 1.05;

    // Wood Texture Canvas
    const laneCanvas = document.createElement('canvas');
    laneCanvas.width = 512;
    laneCanvas.height = 1024;
    const ctx = laneCanvas.getContext('2d');
    ctx.fillStyle = '#f8cf93';
    ctx.fillRect(0, 0, 512, 1024);

    // Plank lines
    ctx.fillStyle = '#e2ae6e';
    for (let x = 0; x < 512; x += 14) {
      ctx.fillRect(x, 0, 1.5, 1024);
    }
    // Chevron Arrows
    ctx.fillStyle = '#7a3e1d';
    const arrowX = [95, 175, 256, 337, 417];
    arrowX.forEach((ax) => {
      ctx.beginPath();
      ctx.moveTo(ax, 720);
      ctx.lineTo(ax - 14, 755);
      ctx.lineTo(ax + 14, 755);
      ctx.fill();
    });

    const laneTex = new THREE.CanvasTexture(laneCanvas);
    laneTex.wrapS = THREE.RepeatWrapping;
    laneTex.wrapT = THREE.RepeatWrapping;
    laneTex.repeat.set(1, 4);

    const laneGeo = new THREE.PlaneGeometry(laneWidth, laneLength);
    const laneMat = new THREE.MeshStandardMaterial({
      map: laneTex,
      roughness: 0.12,
      metalness: 0.08,
    });
    const laneMesh = new THREE.Mesh(laneGeo, laneMat);
    laneMesh.rotation.x = -Math.PI / 2;
    laneMesh.position.set(laneCenterX, 0, 0);
    laneMesh.receiveShadow = true;
    this.group.add(laneMesh);

    // Foul Line
    const foulGeo = new THREE.PlaneGeometry(laneWidth, 0.08);
    const foulMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const foulMesh = new THREE.Mesh(foulGeo, foulMat);
    foulMesh.rotation.x = -Math.PI / 2;
    foulMesh.position.set(laneCenterX, 0.001, laneLength / 2 - 1.5);
    this.group.add(foulMesh);

    // Gutters
    const gutterMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.5 });
    const gutterGeo = new THREE.CylinderGeometry(0.16, 0.16, laneLength, 16, 1, true, 0, Math.PI);

    const leftGutter = new THREE.Mesh(gutterGeo, gutterMat);
    leftGutter.rotation.x = Math.PI / 2;
    leftGutter.rotation.z = Math.PI;
    leftGutter.position.set(laneCenterX - laneWidth / 2 - 0.16, -0.07, 0);
    this.group.add(leftGutter);

    const rightGutter = new THREE.Mesh(gutterGeo, gutterMat);
    rightGutter.rotation.x = Math.PI / 2;
    rightGutter.rotation.z = Math.PI;
    rightGutter.position.set(laneCenterX + laneWidth / 2 + 0.16, -0.07, 0);
    this.group.add(rightGutter);

    // Ball Return Console between lanes
    const dividerGeo = new THREE.BoxGeometry(0.24, 0.45, laneLength);
    const dividerMat = new THREE.MeshStandardMaterial({ color: 0x0984e3, roughness: 0.3 });
    const divider = new THREE.Mesh(dividerGeo, dividerMat);
    divider.position.set(laneCenterX + laneWidth / 2 + 0.45, 0.15, 0);
    this.group.add(divider);

    // Pin deck cavity
    const pitGeo = new THREE.BoxGeometry(laneWidth + 0.6, 2.4, 3.5);
    const pitMat = new THREE.MeshStandardMaterial({ color: 0x0d141a, roughness: 0.9 });
    const pit = new THREE.Mesh(pitGeo, pitMat);
    pit.position.set(laneCenterX, 1.2, -laneLength / 2 - 1.5);
    this.group.add(pit);
  }

  initFirstPersonHands() {
    this.handsGroup = new THREE.Group();
    this.group.add(this.handsGroup);

    // Iconic spherical Mii hands with authentic peach skin tone
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.45,
    });
    const handGeo = new THREE.SphereGeometry(0.115, 16, 16);

    // Right throwing hand (supporting bottom & grip)
    this.rightHand = new THREE.Mesh(handGeo, skinMat);
    this.rightHand.castShadow = true;
    this.handsGroup.add(this.rightHand);

    // Left guide hand (steadying side of ball)
    this.leftHand = new THREE.Mesh(handGeo, skinMat);
    this.leftHand.castShadow = true;
    this.handsGroup.add(this.leftHand);
  }

  resetRack() {
    // Standard 10-Pin Triangle coordinates solidly centered on the pin deck floor
    const pinDeckZ = -9.6;
    const rowDist = 0.28;
    const colDist = 0.30;

    const positions = [
      // Row 1 (Headpin - Pin 1)
      { id: 1, x: 0, z: pinDeckZ },
      // Row 2 (Pins 2, 3)
      { id: 2, x: -colDist / 2, z: pinDeckZ - rowDist },
      { id: 3, x: colDist / 2, z: pinDeckZ - rowDist },
      // Row 3 (Pins 4, 5, 6)
      { id: 4, x: -colDist, z: pinDeckZ - rowDist * 2 },
      { id: 5, x: 0, z: pinDeckZ - rowDist * 2 },
      { id: 6, x: colDist, z: pinDeckZ - rowDist * 2 },
      // Row 4 (Pins 7, 8, 9, 10)
      { id: 7, x: -colDist * 1.5, z: pinDeckZ - rowDist * 3 },
      { id: 8, x: -colDist * 0.5, z: pinDeckZ - rowDist * 3 },
      { id: 9, x: colDist * 0.5, z: pinDeckZ - rowDist * 3 },
      { id: 10, x: colDist * 1.5, z: pinDeckZ - rowDist * 3 },
    ];

    // Clear old visual pin meshes
    this.pinMeshMap.forEach((mesh) => {
      this.group.remove(mesh);
    });
    this.pinMeshMap.clear();
    this.fallenPinIds.clear();

    // Initialize physical Cannon bodies for ALL 10 PINS
    this.physics.setupPins(positions);

    // Create visual 3D pin meshes for all 10 pins
    positions.forEach((pos) => {
      const pinMesh = this.createPinMesh();
      pinMesh.position.set(pos.x, 0.19, pos.z);
      this.group.add(pinMesh);
      this.pinMeshMap.set(pos.id, pinMesh);
    });

    this.createBallVisual();
    this.updatePinHUD();
  }

  createPinMesh() {
    const pinGroup = new THREE.Group();

    // Lower bulbous belly
    const baseGeo = new THREE.CylinderGeometry(0.045, 0.058, 0.18, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.1,
    });
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = -0.09;
    base.castShadow = true;
    pinGroup.add(base);

    // Tapered neck
    const neckGeo = new THREE.CylinderGeometry(0.032, 0.045, 0.12, 16);
    const neck = new THREE.Mesh(neckGeo, bodyMat);
    neck.position.y = 0.06;
    neck.castShadow = true;
    pinGroup.add(neck);

    // Rounded top head
    const headGeo = new THREE.SphereGeometry(0.038, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 0.15;
    head.castShadow = true;
    pinGroup.add(head);

    // Red Neck Stripes
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xeb2f06 });
    const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.036, 0.018, 16), stripeMat);
    stripe1.position.y = 0.04;
    pinGroup.add(stripe1);

    const stripe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.035, 0.018, 16), stripeMat);
    stripe2.position.y = 0.075;
    pinGroup.add(stripe2);

    return pinGroup;
  }

  createBallVisual() {
    if (this.ballMesh) {
      if (this.ballMesh.parent) this.ballMesh.parent.remove(this.ballMesh);
      this.group.remove(this.ballMesh);
    }

    const ballRadius = 0.108;
    const ballGeo = new THREE.SphereGeometry(ballRadius, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0x0984e3,
      roughness: 0.12,
      metalness: 0.35,
    });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;

    // ATTACH BALL TO FIRST-PERSON HANDS RIG
    this.handsGroup.add(this.ballMesh);
    this.handsGroup.visible = true;

    this.physics.createBall(this.aimX);
  }

  initHUD() {
    this.hudContainer = document.getElementById('bowling-hud');
    if (!this.hudContainer) {
      this.hudContainer = document.createElement('div');
      this.hudContainer.id = 'bowling-hud';
      this.hudContainer.className = 'bowling-hud-container';
      document.body.appendChild(this.hudContainer);
    }

    this.hudContainer.innerHTML = `
      <!-- Top Left: 10-Pin Triangle Display -->
      <div class="pin-diagram-card">
        <div class="pin-diagram-title">10 LABUT</div>
        <div class="pin-row">
          <div class="pin-circle" id="hud-pin-7"><span class="pin-num">7</span></div>
          <div class="pin-circle" id="hud-pin-8"><span class="pin-num">8</span></div>
          <div class="pin-circle" id="hud-pin-9"><span class="pin-num">9</span></div>
          <div class="pin-circle" id="hud-pin-10"><span class="pin-num">10</span></div>
        </div>
        <div class="pin-row">
          <div class="pin-circle" id="hud-pin-4"><span class="pin-num">4</span></div>
          <div class="pin-circle" id="hud-pin-5"><span class="pin-num">5</span></div>
          <div class="pin-circle" id="hud-pin-6"><span class="pin-num">6</span></div>
        </div>
        <div class="pin-row">
          <div class="pin-circle" id="hud-pin-2"><span class="pin-num">2</span></div>
          <div class="pin-circle" id="hud-pin-3"><span class="pin-num">3</span></div>
        </div>
        <div class="pin-row">
          <div class="pin-circle" id="hud-pin-1"><span class="pin-num">1</span></div>
        </div>
      </div>

      <!-- Top Right: Scorecard Table -->
      <div class="bowling-scorecard">
        <div class="score-header">
          <span class="score-title">WII BOWLING</span>
          <span class="score-frame" id="hud-frame-label">FRAME 1/10 (ATIŞ 1)</span>
        </div>
        <div class="score-cells" id="hud-score-cells"></div>
        <div class="score-total" id="hud-total-score">TOPLAM: 0</div>
      </div>

      <!-- Bottom Controls Banner -->
      <div class="bowling-controls-banner">
        <div class="control-tip primary">
          <span class="ctrl-icon">🔴 [B] TETİK:</span>
          <span>Basılı Tut ➔ Kolunu Arkaya Çek ➔ İleri Savur ve B'yi Bırak!</span>
        </div>
        <div class="control-tip secondary">
          <span class="ctrl-sub">🎯 D-PAD: [◀ / ▶] Sağa-Sola Kaydır</span>
          <span class="ctrl-sub">🌀 BİLEK: Falso (Hook Curve)</span>
          <span class="ctrl-sub">⌨️ PC: <strong>SPACE</strong> Tuşu</span>
        </div>
      </div>
    `;

    this.renderScorecard();
  }

  renderScorecard() {
    const container = document.getElementById('hud-score-cells');
    if (!container) return;

    let html = '';
    let runningScore = 0;

    for (let f = 1; f <= 10; f++) {
      const data = this.frameScores[f - 1];
      const isCurrent = f === this.currentFrame;
      const r1Text = data.r1 === 10 ? 'X' : (data.r1 !== null ? data.r1 : '');
      const r2Text = (data.r1 !== null && data.r2 !== null && (data.r1 + data.r2 === 10)) ? '/' : (data.r2 !== null ? data.r2 : '');

      if (data.r1 !== null) runningScore += (data.r1 || 0) + (data.r2 || 0);

      html += `
        <div class="score-col ${isCurrent ? 'active' : ''}">
          <div class="frame-num">${f}</div>
          <div class="frame-rolls">
            <span class="roll-box">${r1Text}</span>
            <span class="roll-box">${r2Text}</span>
          </div>
          <div class="frame-total">${data.r1 !== null ? runningScore : ''}</div>
        </div>
      `;
    }
    container.innerHTML = html;

    const totalEl = document.getElementById('hud-total-score');
    if (totalEl) totalEl.innerText = `TOPLAM: ${runningScore}`;

    const frameLabel = document.getElementById('hud-frame-label');
    if (frameLabel) frameLabel.innerText = `FRAME ${this.currentFrame}/10 (ATIŞ ${this.currentRoll})`;
  }

  updatePinHUD() {
    for (let id = 1; id <= 10; id++) {
      const el = document.getElementById(`hud-pin-${id}`);
      if (!el) continue;
      const isKnocked =
        this.fallenPinIds.has(id) ||
        this.physics.pins.some((p) => p.id === id && p.isKnockedDown);
      if (isKnocked) {
        el.classList.add('fallen');
      } else {
        el.classList.remove('fallen');
      }
    }
  }

  bindControls() {
    this.motionEngine.onBowlingRelease = (throwData) => {
      if (this.state !== 'aiming') return;
      this.executeThrow(throwData);
    };

    this.motionEngine.onButtonChange = (btn, pressed) => {
      if (this.state !== 'aiming' || !pressed) return;

      if (btn === 'left') {
        this.aimX = Math.max(-0.35, this.aimX - 0.07);
        this.updateAimPosition();
      } else if (btn === 'right') {
        this.aimX = Math.min(0.35, this.aimX + 0.07);
        this.updateAimPosition();
      }
    };

    // Keyboard Fallback
    this.keyHandler = (e) => {
      if (this.state !== 'aiming') return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.executeThrow({ speed: 0.75, hookSpin: (Math.random() - 0.5) * 0.4, yawAngle: 0 });
      } else if (e.code === 'ArrowLeft') {
        this.aimX = Math.max(-0.35, this.aimX - 0.07);
        this.updateAimPosition();
      } else if (e.code === 'ArrowRight') {
        this.aimX = Math.min(0.35, this.aimX + 0.07);
        this.updateAimPosition();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  updateAimPosition() {
    if (this.physics.ball) this.physics.ball.position.x = this.aimX;
  }

  executeThrow(throwData) {
    this.state = 'rolling';

    // Detach ball from First-Person Hands rig and add to bowling alley
    this.handsGroup.remove(this.ballMesh);
    this.group.add(this.ballMesh);
    this.ballMesh.position.set(this.aimX, 0.108, 9.0);

    if (this.physics.ball) {
      this.physics.ball.position.set(this.aimX, 0.108, 9.0);
    }

    this.physics.launchBall(throwData.speed, throwData.hookSpin, this.aimAngle);
    this.activeRollSound = this.soundManager.startBowlingRoll();

    // Hide hands as ball rolls down lane
    this.handsGroup.visible = false;

    if (window.serverClient) {
      window.serverClient.sendToController({ type: 'sound', name: 'bowling_release' });
      window.serverClient.sendToController({ type: 'rumble', duration: [30, 20, 50] });
    }

    this.throwStartTime = performance.now();
  }

  update(delta, time) {
    const fallenPins = this.physics.update(delta);
    this.updatePinHUD();

    if (this.state === 'rolling' || this.state === 'impact') {
      if (this.physics.ball && this.ballMesh) {
        this.ballMesh.position.copy(this.physics.ball.position);
        this.ballMesh.quaternion.copy(this.physics.ball.quaternion);

        // Smooth TV chase camera following the ball down the lane
        if (this.state === 'rolling') {
          this.camera.position.x = this.physics.ball.position.x * 0.35;
          this.camera.position.z = Math.min(10.5, this.physics.ball.position.z + 3.2);
          this.camera.position.y = 1.35;
          this.camera.lookAt(this.physics.ball.position.x * 0.2, 0.35, this.physics.ball.position.z - 4);
        }

        if (this.physics.ball.position.z < -8.5 && this.state === 'rolling') {
          this.state = 'impact';
          if (this.activeRollSound) {
            this.activeRollSound.stop();
            this.activeRollSound = null;
          }
        }
      }

      this.physics.pins.forEach((p) => {
        const mesh = this.pinMeshMap.get(p.id);
        if (mesh) {
          mesh.position.copy(p.body.position);
          mesh.quaternion.copy(p.body.quaternion);
        }
      });

      if (this.state === 'impact' && performance.now() - this.throwStartTime > 3800) {
        this.evaluateRoll(fallenPins);
      }
    } else if (this.state === 'aiming') {
      // PURE FIRST-PERSON POV BOWLING:
      // Eye-level view directly down the lane at the pins, holding the ball with both hands!
      this.handsGroup.visible = true;
      const breathe = Math.sin(time * 3) * 0.012;

      this.handsGroup.position.set(this.aimX, 1.48, 9.85);
      if (this.ballMesh) {
        this.ballMesh.position.set(0, -0.32 + breathe, -0.72);
      }
      this.rightHand.position.set(0.10, -0.38 + breathe, -0.68);
      this.leftHand.position.set(-0.13, -0.32 + breathe, -0.72);

      this.camera.position.set(this.aimX, 1.48, 9.85);
      this.camera.lookAt(this.aimX * 0.15, 0.45, -9.8);
    }
  }

  evaluateRoll(fallenCount) {
    this.state = 'scoring';

    const isFirstRoll = this.currentRoll === 1;
    const currentFrameData = this.frameScores[this.currentFrame - 1];

    let rollFallen = fallenCount;
    if (isFirstRoll) {
      currentFrameData.r1 = rollFallen;
    } else {
      currentFrameData.r2 = rollFallen;
    }

    const totalFrameFallen = (currentFrameData.r1 || 0) + (currentFrameData.r2 || 0);
    const isStrike = isFirstRoll && currentFrameData.r1 === 10;
    const isSpare = !isFirstRoll && totalFrameFallen === 10;

    if (isStrike) {
      this.soundManager.playStrikeCrash();
      this.soundManager.playStrikeFanfare();
      this.showCelebrationBanner('STRIKE! 🎳', '#ff4757');
    } else if (isSpare) {
      this.soundManager.playStrikeCrash();
      this.soundManager.playCrowdCheer();
      this.showCelebrationBanner('SPARE! 🎯', '#2ed573');
    } else if (rollFallen === 0) {
      this.showCelebrationBanner('GUTTER BALL! 💨', '#a4b0be');
    } else {
      this.soundManager.playPinHit(1.5);
      const label = isFirstRoll ? `${rollFallen} LABUT!` : `+${rollFallen} LABUT (TOPLAM: ${totalFrameFallen})`;
      this.showCelebrationBanner(label, '#ffa502');
    }

    this.renderScorecard();

    setTimeout(() => {
      this.nextTurn(isStrike);
    }, 2800);
  }

  showCelebrationBanner(text, color) {
    let banner = document.getElementById('bowling-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'bowling-banner';
      banner.className = 'wii-celebration-banner';
      document.body.appendChild(banner);
    }
    banner.innerText = text;
    banner.style.color = color;
    banner.classList.add('show');

    setTimeout(() => {
      banner.classList.remove('show');
    }, 2400);
  }

  nextTurn(wasStrike) {
    if (wasStrike || this.currentRoll === 2) {
      this.currentFrame++;
      this.currentRoll = 1;
      if (this.currentFrame > 10) {
        this.currentFrame = 1;
        this.frameScores = Array.from({ length: 10 }, () => ({ r1: null, r2: null, total: null }));
      }
      this.resetRack();
    } else {
      // 2nd Roll: Clear away all fallen pins, reset remaining standing pins upright!
      this.currentRoll = 2;
      const { standingPins, fallenPinIds } = this.physics.clearFallenPins();
      fallenPinIds.forEach((id) => {
        this.fallenPinIds.add(id);
        const mesh = this.pinMeshMap.get(id);
        if (mesh) {
          this.group.remove(mesh);
          this.pinMeshMap.delete(id);
        }
      });

      standingPins.forEach((p) => {
        const mesh = this.pinMeshMap.get(p.id);
        if (mesh) {
          mesh.position.set(p.initialPos.x, 0.19, p.initialPos.z);
          mesh.quaternion.set(0, 0, 0, 1);
        }
      });

      this.createBallVisual();
      this.updatePinHUD();
      this.showCelebrationBanner('2. VURUŞ - KALAN LABUTLAR', '#38bdf8');
    }

    this.renderScorecard();
    this.state = 'aiming';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.hudContainer) {
      this.hudContainer.remove();
    }
    const banner = document.getElementById('bowling-banner');
    if (banner) banner.remove();
    if (this.handsGroup) this.group.remove(this.handsGroup);
    this.pinMeshMap.forEach((mesh) => this.group.remove(mesh));
    this.pinMeshMap.clear();
    this.scene.remove(this.group);
  }
}
