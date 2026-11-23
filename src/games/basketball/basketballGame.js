import * as THREE from 'three';
import { MiiAvatar } from '../../graphics/miiAvatar.js';

/**
 * Wii Sports Resort - Basketball 3-Point Contest
 * Full 3D Physics with authentic Backboard Bank-shots & Rim-bounce Dynamics
 */
export class BasketballGame {
  constructor(scene, camera, soundManager, motionEngine) {
    this.scene = scene;
    this.camera = camera;
    this.soundManager = soundManager;
    this.motionEngine = motionEngine;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.score = 0;
    this.ballsLeft = 15;
    this.state = 'aiming'; // 'aiming', 'shooting', 'scored', 'missed'
    this.ballInAir = false;

    // Fluid Shooting Animation State
    this.shotAnim = {
      active: false,
      startTime: 0,
      power: 0.82,
      released: false,
    };

    // Physical dimensions & positions
    this.hoopPos = new THREE.Vector3(0, 3.05, -6.38);
    this.rimRadius = 0.225; // 45 cm standard FIBA/NBA rim diameter
    this.tubeRadius = 0.018; // Iron tube thickness
    this.ballRadius = 0.125; // Standard basketball diameter ~ 25cm
    this.backboardZ = -6.75; // Front face of backboard

    this.ballPos = new THREE.Vector3(0, 1.4, 0.8);
    this.ballVel = new THREE.Vector3(0, 0, 0);

    // Shot evaluation flags
    this.hitBackboard = false;
    this.hitRim = false;
    this.rimHitCount = 0;
    this.hasScored = false;
    this.missReported = false;

    // Aiming state
    this.aimX = 0; // Lateral offset
    this.testPower = 0.82; // 0.70 to 1.05

    this.buildCourt();
    this.initMii();
    this.initBall();
    this.initHUD();
    this.bindControls();
  }

  buildCourt() {
    // 1. Asphalt Court
    const courtGeo = new THREE.PlaneGeometry(16, 20);
    const courtMat = new THREE.MeshStandardMaterial({
      color: 0x2f3640,
      roughness: 0.75,
    });
    const court = new THREE.Mesh(courtGeo, courtMat);
    court.rotation.x = -Math.PI / 2;
    court.receiveShadow = true;
    this.group.add(court);

    // Key area (Orange/blue key)
    const keyGeo = new THREE.PlaneGeometry(4.8, 6.0);
    const keyMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.6 });
    const key = new THREE.Mesh(keyGeo, keyMat);
    key.rotation.x = -Math.PI / 2;
    key.position.set(0, 0.002, -3.8);
    this.group.add(key);

    // 3-Point Line Arc
    const threePtGeo = new THREE.RingGeometry(6.70, 6.80, 48, 1, 0, Math.PI);
    const threePtMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const threePtLine = new THREE.Mesh(threePtGeo, threePtMat);
    threePtLine.rotation.x = -Math.PI / 2;
    threePtLine.position.set(0, 0.003, -6.38);
    this.group.add(threePtLine);

    // 2. Basketball Hoop, Glass Backboard & Target Box
    this.createHoopStructure();

    // 3. Chain-link fence & Palm trees in background
    this.createCourtEnvironment();
  }

  createHoopStructure() {
    // Main Steel Support Pole
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x0984e3, roughness: 0.35, metalness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 16), poleMat);
    pole.position.set(0, 2.1, -7.5);
    this.group.add(pole);

    // Angled Arm extending forward
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 12), poleMat);
    arm.rotation.x = Math.PI / 3.8;
    arm.position.set(0, 3.25, -7.1);
    this.group.add(arm);

    // Backboard (Tempered Glass 1.8m x 1.05m)
    const bbGeo = new THREE.BoxGeometry(1.8, 1.05, 0.04);
    const bbMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      roughness: 0.1,
    });
    const backboard = new THREE.Mesh(bbGeo, bbMat);
    backboard.position.set(0, 3.25, -6.77);
    this.group.add(backboard);

    // Backboard Outer Border
    const borderMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const borderGeo = new THREE.BoxGeometry(1.82, 0.03, 0.045);
    const topBorder = new THREE.Mesh(borderGeo, borderMat);
    topBorder.position.set(0, 3.775, -6.77);
    this.group.add(topBorder);

    const bottomBorder = new THREE.Mesh(borderGeo, borderMat);
    bottomBorder.position.set(0, 2.725, -6.77);
    this.group.add(bottomBorder);

    // Inner Shooter's Target Box (59cm x 45cm) - Hitting inside this guarantees a bank shot!
    const targetBoxGroup = new THREE.Group();
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xe84118 });
    const boxHorizGeo = new THREE.BoxGeometry(0.59, 0.025, 0.005);
    const boxVertGeo = new THREE.BoxGeometry(0.025, 0.45, 0.005);

    const targetTop = new THREE.Mesh(boxHorizGeo, boxMat);
    targetTop.position.set(0, 0.225, 0);
    targetBoxGroup.add(targetTop);

    const targetBottom = new THREE.Mesh(boxHorizGeo, boxMat);
    targetBottom.position.set(0, -0.225, 0);
    targetBoxGroup.add(targetBottom);

    const targetLeft = new THREE.Mesh(boxVertGeo, boxMat);
    targetLeft.position.set(-0.295, 0, 0);
    targetBoxGroup.add(targetLeft);

    const targetRight = new THREE.Mesh(boxVertGeo, boxMat);
    targetRight.position.set(0.295, 0, 0);
    targetBoxGroup.add(targetRight);

    targetBoxGroup.position.set(0, 3.22, -6.745);
    this.group.add(targetBoxGroup);

    // Metal Mounting Bracket (Connecting backboard to rim)
    const bracketGeo = new THREE.BoxGeometry(0.14, 0.08, 0.28);
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0xe84118, roughness: 0.3 });
    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    bracket.position.set(0, 3.05, -6.55);
    this.group.add(bracket);

    // Solid Iron Red Rim (Torus 45cm inner diameter)
    const rimGeo = new THREE.TorusGeometry(this.rimRadius, this.tubeRadius, 14, 32);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xe84118,
      roughness: 0.25,
      metalness: 0.4,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(this.hoopPos);
    this.group.add(rim);

    // White Mesh Net
    const netGeo = new THREE.CylinderGeometry(this.rimRadius, this.rimRadius * 0.65, 0.45, 14, 2, true);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    this.netMesh = new THREE.Mesh(netGeo, netMat);
    this.netMesh.position.set(this.hoopPos.x, this.hoopPos.y - 0.225, this.hoopPos.z);
    this.group.add(this.netMesh);
  }

  createCourtEnvironment() {
    // Back fence
    const fenceGeo = new THREE.PlaneGeometry(16, 4);
    const fenceMat = new THREE.MeshBasicMaterial({ color: 0x718093, wireframe: true });
    const fence = new THREE.Mesh(fenceGeo, fenceMat);
    fence.position.set(0, 2.0, -9.5);
    this.group.add(fence);
  }

  initMii() {
    this.mii = new MiiAvatar({ color: 0x0084ff });
    this.mii.group.rotation.y = Math.PI;
    this.mii.group.position.set(0, 0, 1.2);
    this.group.add(this.mii.group);
  }

  initBall() {
    const ballGeo = new THREE.SphereGeometry(this.ballRadius, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xdf691a, // Authentic basketball burnt orange
      roughness: 0.45,
      metalness: 0.05,
    });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);

    this.resetBallPosition();
  }

  resetBallPosition() {
    this.state = 'aiming';
    this.ballInAir = false;
    this.hitBackboard = false;
    this.hitRim = false;
    this.rimHitCount = 0;
    this.hasScored = false;
    this.missReported = false;

    this.shotAnim.active = false;
    this.shotAnim.released = false;

    this.ballPos.set(this.aimX, 1.48, 0.75);
    this.ballVel.set(0, 0, 0);

    if (this.mii) {
      this.mii.group.position.set(this.aimX, 0, 1.2);
      this.mii.rightHand.position.set(0.08, 1.34, -0.45);
      this.mii.leftHand.position.set(-0.20, 1.48, -0.42);
    }
  }

  initHUD() {
    this.hudContainer = document.getElementById('basket-hud');
    if (!this.hudContainer) {
      this.hudContainer = document.createElement('div');
      this.hudContainer.id = 'basket-hud';
      this.hudContainer.className = 'bowling-hud-container';
      document.body.appendChild(this.hudContainer);
    }

    this.hudContainer.innerHTML = `
      <div class="bowling-scorecard" style="top: 76px; right: 24px; min-width: 200px;">
        <div class="score-header">WII BASKETBOL 3 SAYI</div>
        <div class="score-total" id="hud-basket-score" style="font-size: 26px; color: #facc15;">PUAN: 0</div>
        <div style="font-size: 13px; color: #38bdf8; margin-top: 4px;" id="hud-balls-left">KALAN TOP: 15</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;" id="hud-shot-feedback">ŞUT: HAZIR</div>
      </div>

      <div class="bowling-controls-banner">
        <div class="control-tip primary">
          <span class="ctrl-icon">🏀 ŞUT ATMA:</span>
          <span><strong>[B] TETİK:</strong> Basılı Tut ➔ Kolunu Yukarı Kaldır ➔ Doğru Hızda B'yi Bırak!</span>
        </div>
        <div class="control-tip secondary">
          <span class="ctrl-sub">🎯 PANYA KULLAN: Panyanın kırmızı karesine çarptırıp da sokabilirsin!</span>
          <span class="ctrl-sub">🌀 ÇEMBER: Sert şut çemberden seker; yumuşak şut çemberden döner ve girer!</span>
          <span class="ctrl-sub">⌨️ PC Test: <strong>SPACE</strong> (Şut) | <strong>◀ / ▶</strong> (Açı) | <strong>▲ / ▼</strong> (Güç)</span>
        </div>
      </div>
    `;
  }

  bindControls() {
    // Release B trigger -> Shoot!
    this.motionEngine.onBowlingRelease = (throwData) => {
      if (this.state !== 'aiming') return;
      this.executeShot(throwData.speed);
    };

    this.motionEngine.onButtonChange = (btn, pressed) => {
      if (this.state !== 'aiming' || !pressed) return;
      if (btn === 'left') {
        this.aimX = Math.max(-0.4, this.aimX - 0.08);
        this.resetBallPosition();
      } else if (btn === 'right') {
        this.aimX = Math.min(0.4, this.aimX + 0.08);
        this.resetBallPosition();
      }
    };

    // Keyboard Fallback for testing
    this.keyHandler = (e) => {
      if (this.state !== 'aiming') return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.executeShot(this.testPower);
      } else if (e.code === 'ArrowLeft') {
        this.aimX = Math.max(-0.4, this.aimX - 0.06);
        this.resetBallPosition();
      } else if (e.code === 'ArrowRight') {
        this.aimX = Math.min(0.4, this.aimX + 0.06);
        this.resetBallPosition();
      } else if (e.code === 'ArrowUp') {
        this.testPower = Math.min(1.15, this.testPower + 0.04);
        this.showShotFeedback(`GÜÇ: %${Math.round(this.testPower * 100)}`);
      } else if (e.code === 'ArrowDown') {
        this.testPower = Math.max(0.60, this.testPower - 0.04);
        this.showShotFeedback(`GÜÇ: %${Math.round(this.testPower * 100)}`);
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  executeShot(power = 0.82) {
    if (this.ballsLeft <= 0) return;
    this.ballsLeft--;

    const leftEl = document.getElementById('hud-balls-left');
    if (leftEl) leftEl.innerText = `KALAN TOP: ${this.ballsLeft}`;

    this.state = 'shooting';
    this.hitBackboard = false;
    this.hitRim = false;
    this.rimHitCount = 0;
    this.hasScored = false;
    this.missReported = false;

    // Start the fluid gather & rise arm animation
    this.ballInAir = false;
    this.shotAnim.active = true;
    this.shotAnim.released = false;
    this.shotAnim.startTime = performance.now();
    this.shotAnim.power = power;
  }

  launchBall(power) {
    this.ballInAir = true;

    // Ballistic Trajectory Calculation
    const targetZ = this.hoopPos.z;
    const targetY = this.hoopPos.y + 0.35; // Apex arc above rim
    const flightTime = 1.15;

    // Base forward and vertical velocities
    const vz = (targetZ - this.ballPos.z) / flightTime * (0.88 + power * 0.15);
    const vy = (targetY - this.ballPos.y + 0.5 * 9.81 * flightTime * flightTime) / flightTime * (0.88 + power * 0.14);

    // Lateral aiming velocity (influenced by pointer if available + aimX)
    let vx = (this.hoopPos.x - this.ballPos.x) / flightTime;
    if (this.motionEngine && this.motionEngine.pointerX) {
      vx += (this.motionEngine.pointerX - 0.5) * 1.6;
    }

    this.ballVel.set(vx, vy, vz);
    this.soundManager.playTennisHit(0.65);

    if (window.serverClient) {
      window.serverClient.sendToController({ type: 'sound', name: 'tennis_hit' });
      window.serverClient.sendToController({ type: 'rumble', duration: [30] });
    }

    this.shotStartTime = performance.now();
  }

  update(delta, time) {
    // 1. FLUID BASKETBALL ARM & HAND ANIMATION
    if (this.shotAnim.active) {
      const elapsed = (performance.now() - this.shotAnim.startTime) / 1000;

      if (elapsed < 0.22) {
        // Stage 1: Gather, Jump & Elevation (0s -> 0.22s)
        const p = Math.min(1.0, elapsed / 0.22);
        const ease = p * p * (3 - 2 * p);

        // Body jumps slightly
        this.mii.group.position.y = ease * 0.35;

        // Arms lift ball together from chest to above forehead
        this.mii.rightHand.position.set(0.06, 1.34 + ease * 0.81, -0.45 + ease * 0.05);
        this.mii.leftHand.position.set(-0.20, 1.48 + ease * 0.70, -0.42 + ease * 0.04);

        // Ball follows hands up to release point
        this.ballPos.set(this.aimX, 1.48 + ease * 0.70 + this.mii.group.position.y, 0.75 - ease * 0.12);
      } else {
        // Stage 2: Apex Release!
        if (!this.shotAnim.released) {
          this.shotAnim.released = true;
          this.launchBall(this.shotAnim.power);
        }

        if (elapsed < 0.48) {
          // Stage 3: Full Extension & Wrist Snap / Swan Neck (0.22s -> 0.48s)
          const p = Math.min(1.0, (elapsed - 0.22) / 0.26);
          const ease = Math.sin(p * Math.PI * 0.5);

          // Right shooting hand drives up and forward, wrist snaps down!
          this.mii.rightHand.position.set(0.06, 2.15 + ease * 0.32, -0.40 - ease * 0.22);
          this.mii.leftHand.position.set(-0.22, 2.18 - ease * 0.10, -0.38);

          // Body descends softly
          this.mii.group.position.y = 0.35 * (1.0 - ease);
        } else if (elapsed < 0.85) {
          // Stage 4: Follow-Through Hold
          this.mii.group.position.y = 0;
          this.mii.rightHand.position.set(0.06, 2.47, -0.62);
          this.mii.leftHand.position.set(-0.22, 2.08, -0.38);
        } else if (elapsed < 1.15) {
          // Stage 5: Smooth Return to Ready Stance
          const p = Math.min(1.0, (elapsed - 0.85) / 0.30);
          this.mii.rightHand.position.lerp(new THREE.Vector3(0.08, 1.34, -0.45), p * 0.2);
          this.mii.leftHand.position.lerp(new THREE.Vector3(-0.20, 1.48, -0.42), p * 0.2);
        } else {
          this.shotAnim.active = false;
        }
      }
    } else if (this.state === 'aiming') {
      // Natural idle breathing while holding ball in ready stance
      const breathe = Math.sin(time * 3) * 0.016;
      this.mii.group.position.y = 0;
      this.mii.group.position.x = this.aimX;

      this.mii.rightHand.position.set(0.08, 1.34 + breathe, -0.45);
      this.mii.leftHand.position.set(-0.20, 1.48 + breathe, -0.42);
      this.ballPos.set(this.aimX, 1.48 + breathe, 0.75);
    }

    if (this.ballInAir) {
      // High-precision substepping (5 sub-steps) to prevent tunneling through backboard/rim
      const subSteps = 5;
      const subDelta = Math.min(delta, 0.033) / subSteps;

      for (let s = 0; s < subSteps; s++) {
        this.stepPhysics(subDelta);
      }

      // Check for shot expiration / reset
      const elapsed = performance.now() - this.shotStartTime;
      if (elapsed > 2700) {
        if (!this.hasScored && !this.missReported && (this.hitRim || this.hitBackboard)) {
          this.missReported = true;
          this.showCelebrationBanner('KAÇTI! ❌', '#94a3b8');
        }
        this.resetBallPosition();
      }
    }

    this.ballMesh.position.copy(this.ballPos);

    // Dynamic TV Camera
    if (this.ballInAir) {
      this.camera.position.set(this.ballPos.x * 0.25, 2.2, 3.8);
      this.camera.lookAt(0, 3.05, -6.38);
    } else {
      this.camera.position.set(this.aimX * 0.3, 2.2, 3.8);
      this.camera.lookAt(0, 3.05, -6.38);
    }
  }

  stepPhysics(dt) {
    // 1. Gravity & Air Resistance
    this.ballVel.y -= 9.81 * dt;
    this.ballVel.multiplyScalar(1.0 - 0.04 * dt); // Subtle air drag

    // Backspin rotation
    this.ballMesh.rotation.x -= 6.0 * dt;

    // Integrate Position
    this.ballPos.addScaledVector(this.ballVel, dt);

    const R = this.ballRadius;

    // 2. BACKBOARD (PANYA) COLLISION
    // Front face is at Z = -6.75, extends from X = -0.90 to 0.90, Y = 2.72 to 3.78
    if (
      this.ballPos.z - R <= this.backboardZ &&
      this.ballPos.z + R >= this.backboardZ - 0.15 &&
      Math.abs(this.ballPos.x) <= 0.90 &&
      this.ballPos.y >= 2.70 &&
      this.ballPos.y <= 3.80 &&
      this.ballVel.z < 0 // Moving towards backboard
    ) {
      // Rebound off backboard!
      const restitution = 0.65;
      this.ballVel.z = Math.abs(this.ballVel.z) * restitution;
      this.ballVel.x *= 0.85;
      this.ballVel.y *= 0.88;
      this.ballPos.z = this.backboardZ + R + 0.005;

      this.hitBackboard = true;
      this.soundManager.playBackboardThud(Math.min(1.5, Math.abs(this.ballVel.z) / 4));

      if (window.serverClient) {
        window.serverClient.sendToController({ type: 'rumble', duration: [30] });
      }
      this.showShotFeedback('PANYA ÇARPIŞMASI!');
    }

    // 3. SOLID IRON RIM (ÇEMBER) TORUS COLLISION
    // Rim center is at (0, 3.05, -6.38), radius = 0.225m, tube thickness = 0.018m
    const hoopX = this.hoopPos.x;
    const hoopY = this.hoopPos.y;
    const hoopZ = this.hoopPos.z;

    const dx = this.ballPos.x - hoopX;
    const dz = this.ballPos.z - hoopZ;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    if (distXZ > 0.0001) {
      // Nearest point on circular iron wire
      const closestIronX = hoopX + (dx / distXZ) * this.rimRadius;
      const closestIronY = hoopY;
      const closestIronZ = hoopZ + (dz / distXZ) * this.rimRadius;

      // Distance from ball center to iron wire
      const vx = this.ballPos.x - closestIronX;
      const vy = this.ballPos.y - closestIronY;
      const vz = this.ballPos.z - closestIronZ;
      const distToIron = Math.sqrt(vx * vx + vy * vy + vz * vz);

      const hitDist = R + this.tubeRadius;

      if (distToIron < hitDist) {
        // Normal pointing from iron center to ball center
        const nx = vx / distToIron;
        const ny = vy / distToIron;
        const nz = vz / distToIron;

        // Velocity along contact normal
        const vDotN = this.ballVel.x * nx + this.ballVel.y * ny + this.ballVel.z * nz;

        if (vDotN < 0) {
          // CLANK! Realistic bounce off iron rim
          const restitution = 0.62;
          this.ballVel.x -= (1 + restitution) * vDotN * nx;
          this.ballVel.y -= (1 + restitution) * vDotN * ny;
          this.ballVel.z -= (1 + restitution) * vDotN * nz;

          // Push ball outside iron volume to prevent sticking
          const overlap = hitDist - distToIron;
          this.ballPos.x += nx * (overlap + 0.003);
          this.ballPos.y += ny * (overlap + 0.003);
          this.ballPos.z += nz * (overlap + 0.003);

          this.hitRim = true;
          this.rimHitCount++;
          this.soundManager.playRimClank(Math.min(1.5, Math.abs(vDotN) / 3));

          if (window.serverClient) {
            window.serverClient.sendToController({ type: 'rumble', duration: [40] });
          }
          this.showShotFeedback('ÇEMBERE ÇARPTI!');
        }
      }
    }

    // 4. BASKET SCORING & NET SWISH DETECTION
    // Ball passes downward through inner rim opening
    if (
      !this.hasScored &&
      distXZ < (this.rimRadius - R * 0.45) &&
      this.ballPos.y <= hoopY + 0.05 &&
      this.ballPos.y >= hoopY - 0.20 &&
      this.ballVel.y < -0.2
    ) {
      this.scoreBasket();
    }

    // Net friction as ball drops through net
    if (this.hasScored && this.ballPos.y < hoopY && this.ballPos.y > hoopY - 0.45) {
      this.ballVel.x *= 0.4;
      this.ballVel.z *= 0.4;
      this.ballVel.y *= 0.7; // Retarded by net mesh
    }

    // 5. IN-AND-OUT MISS DETECTION (Çemberde sekip çıkma)
    if (
      this.hitRim &&
      !this.hasScored &&
      !this.missReported &&
      (distXZ > this.rimRadius + 0.25 || this.ballPos.y < 1.8)
    ) {
      this.missReported = true;
      this.showCelebrationBanner('ÇEMBERDEN DÖNDÜ! ❌', '#ef4444');
    }

    // 6. ASPHALT COURT FLOOR BOUNCE
    if (this.ballPos.y <= R) {
      this.ballPos.y = R;
      this.ballVel.y = Math.abs(this.ballVel.y) * 0.65;
      this.ballVel.x *= 0.85;
      this.ballVel.z *= 0.85;
      this.soundManager.playTennisBounce();
    }
  }

  scoreBasket() {
    this.hasScored = true;
    this.score += 3;

    this.soundManager.playNetSwish();
    this.soundManager.playCrowdCheer();

    const scoreEl = document.getElementById('hud-basket-score');
    if (scoreEl) scoreEl.innerText = `PUAN: ${this.score}`;

    // Context-sensitive celebration banner
    if (this.hitBackboard && this.hitRim) {
      this.showCelebrationBanner('PANYA VE ÇEMBERDEN BASKET! 🏀', '#f59e0b');
    } else if (this.hitBackboard) {
      this.showCelebrationBanner('PANYA BASKET! 🏀', '#38bdf8');
    } else if (this.hitRim) {
      this.showCelebrationBanner('ÇEMBERDEN GİRDİ! 🏀', '#10b981');
    } else {
      this.showCelebrationBanner('MÜKEMMEL SWISH! 🎯 3 SAYI!', '#ec4899');
    }

    if (window.serverClient) {
      window.serverClient.sendToController({ type: 'sound', name: 'strike_fanfare' });
      window.serverClient.sendToController({ type: 'rumble', duration: [50, 40, 80] });
    }
  }

  showShotFeedback(text) {
    const el = document.getElementById('hud-shot-feedback');
    if (el) el.innerText = text;
  }

  showCelebrationBanner(text, color) {
    let banner = document.getElementById('basket-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'basket-banner';
      banner.className = 'wii-celebration-banner';
      document.body.appendChild(banner);
    }
    banner.innerText = text;
    banner.style.color = color;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 2200);
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.hudContainer) this.hudContainer.remove();
    const banner = document.getElementById('basket-banner');
    if (banner) banner.remove();
    this.scene.remove(this.group);
  }
}
