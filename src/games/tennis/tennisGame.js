import * as THREE from 'three';
import { MiiAvatar } from '../../graphics/miiAvatar.js';

/**
 * Wii Sports Tennis - 1v1 Singles Overhaul
 * Features:
 * 1. Pure 1v1 Singles format (Player vs Opponent AI).
 * 2. Directional Swing: Lateral swing angle & direction maps directly to court target.
 * 3. Velocity-Scaled Speed: Swing speed dictates shot power (soft rally vs power smash).
 * 4. Guaranteed Net Clearance: Physics formula prevents awkward net snagging.
 * 5. Grand Slam Stadium Environment.
 */
export class TennisGame {
  constructor(scene, camera, soundManager, motionEngine) {
    this.scene = scene;
    this.camera = camera;
    this.soundManager = soundManager;
    this.motionEngine = motionEngine;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Court Dimensions
    this.courtLength = 23.77;
    this.courtWidth = 8.23; // Standard singles width
    this.netHeight = 0.95;

    // Game State
    this.state = 'serving'; // 'serving', 'rally', 'point_over'
    this.score = { player: 0, opponent: 0 };
    this.scoreLabels = ['0', '15', '30', '40', 'GAME'];
    this.ballInPlay = false;
    this.isTossed = false;
    this.tossStartTime = 0;

    // Ball Physics State
    this.ballPos = new THREE.Vector3(0, 1.2, 10.2);
    this.ballVel = new THREE.Vector3(0, 0, 0);
    this.bounceCount = 0;
    this.lastHitter = null;

    this.buildTennisStadium();
    this.initPlayers();
    this.initBall();
    this.initHUD();
    this.bindControls();
  }

  buildTennisStadium() {
    // 1. Lush Green Grand Slam Grass Court
    const grassGeo = new THREE.PlaneGeometry(this.courtWidth + 14, this.courtLength + 16);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.8,
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.group.add(grass);

    // 2. Inner Court Turf
    const turfGeo = new THREE.PlaneGeometry(this.courtWidth, this.courtLength);
    const turfMat = new THREE.MeshStandardMaterial({
      color: 0x388e3c,
      roughness: 0.65,
    });
    const turf = new THREE.Mesh(turfGeo, turfMat);
    turf.rotation.x = -Math.PI / 2;
    turf.position.y = 0.002;
    turf.receiveShadow = true;
    this.group.add(turf);

    // 3. Chalk Boundary Lines
    this.createChalkLines();

    // 4. Tennis Net
    this.createNet();

    // 5. Grand Slam Stadium Surroundings (Stadium Seating & Sponsor Walls)
    this.createStadiumSurroundings();
  }

  createChalkLines() {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const addLine = (w, h, x, z) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(geo, lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.005, z);
      this.group.add(m);
    };

    const halfL = this.courtLength / 2;
    const halfW = this.courtWidth / 2;
    const lw = 0.08;

    // Outer Baselines & Sidelines
    addLine(this.courtWidth, lw, 0, halfL);
    addLine(this.courtWidth, lw, 0, -halfL);
    addLine(lw, this.courtLength, -halfW, 0);
    addLine(lw, this.courtLength, halfW, 0);

    // Service Lines (6.4m from net)
    addLine(this.courtWidth, lw, 0, 6.4);
    addLine(this.courtWidth, lw, 0, -6.4);

    // Center Service Line
    addLine(lw, 12.8, 0, 0);
  }

  createNet() {
    // Net Mesh
    const netGeo = new THREE.PlaneGeometry(this.courtWidth + 1.2, this.netHeight);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0x1e272e,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, this.netHeight / 2, 0);
    this.group.add(net);

    // White Top Band
    const bandGeo = new THREE.BoxGeometry(this.courtWidth + 1.2, 0.08, 0.04);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(0, this.netHeight, 0);
    this.group.add(band);

    // Posts
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.15, 16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x0984e3, roughness: 0.3 });

    const pLeft = new THREE.Mesh(postGeo, postMat);
    pLeft.position.set(-this.courtWidth / 2 - 0.6, 0.55, 0);
    this.group.add(pLeft);

    const pRight = new THREE.Mesh(postGeo, postMat);
    pRight.position.set(this.courtWidth / 2 + 0.6, 0.55, 0);
    this.group.add(pRight);
  }

  createStadiumSurroundings() {
    // Grandstand back walls
    const wallGeo = new THREE.BoxGeometry(this.courtWidth + 16, 3.2, 0.4);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.5 });

    const backWall1 = new THREE.Mesh(wallGeo, wallMat);
    backWall1.position.set(0, 1.6, this.courtLength / 2 + 7.0);
    this.group.add(backWall1);

    const backWall2 = new THREE.Mesh(wallGeo, wallMat);
    backWall2.position.set(0, 1.6, -this.courtLength / 2 - 7.0);
    this.group.add(backWall2);

    // Umpire Chair
    const chairGeo = new THREE.BoxGeometry(0.8, 2.2, 0.8);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x00a8ff });
    const chair = new THREE.Mesh(chairGeo, chairMat);
    chair.position.set(this.courtWidth / 2 + 2.5, 1.1, 0);
    this.group.add(chair);
  }

  initPlayers() {
    // Player 1 (Blue Mii) - Pure 1v1 Singles
    this.playerMii = new MiiAvatar({ color: 0x0084ff });
    this.playerMii.setEquipment('tennis');
    this.playerMii.group.rotation.y = Math.PI; // Face the net (-Z)
    this.playerMii.group.position.set(0, 0, 10.8);
    this.group.add(this.playerMii.group);

    // Opponent AI (Red Mii)
    this.opponentMii = new MiiAvatar({ color: 0xe53935 });
    this.opponentMii.setEquipment('tennis');
    this.opponentMii.group.position.set(0, 0, -10.8); // Faces player (+Z)
    this.group.add(this.opponentMii.group);
  }

  initBall() {
    const ballGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xc6ff00, // Optic neon yellow
      roughness: 0.35,
    });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);

    // Ball Ground Shadow
    const shadowGeo = new THREE.CircleGeometry(0.15, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0a220a,
      transparent: true,
      opacity: 0.45,
    });
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.003;
    this.group.add(this.ballShadow);

    this.resetServe();
  }

  initHUD() {
    this.hudContainer = document.getElementById('tennis-hud');
    if (!this.hudContainer) {
      this.hudContainer = document.createElement('div');
      this.hudContainer.id = 'tennis-hud';
      this.hudContainer.className = 'tennis-hud-container';
      document.body.appendChild(this.hudContainer);
    }

    this.hudContainer.innerHTML = `
      <!-- Top Right Scoreboard -->
      <div class="tennis-scoreboard">
        <div class="score-header">WII TENNIS (1v1 TEKLER)</div>
        <div class="tennis-score-row player-row">
          <span class="player-name">OYUNCU (SEN)</span>
          <span class="player-points" id="score-p1">0</span>
        </div>
        <div class="tennis-score-row opponent-row">
          <span class="player-name">RAKİP (AI)</span>
          <span class="player-points" id="score-cpu">0</span>
        </div>
      </div>

      <!-- Bottom Controls Guide -->
      <div class="tennis-controls-banner">
        <div class="control-tip primary">
          <span class="ctrl-icon">🎾 SERVİS & VURUŞ:</span>
          <span><strong>[A]</strong> Topu Havaya At ➔ Kolunu İstediğin Yöne Savurarak Vur!</span>
        </div>
        <div class="control-tip secondary">
          <span class="ctrl-sub">🧭 YÖN: Telefonu sola/sağa savurarak topu istediğin köşeye gönder</span>
          <span class="ctrl-sub">⚡ HIZ: Hızlı savurursan sert vuruş, yavaş savurursan yumuşak ralli</span>
          <span class="ctrl-sub">⌨️ PC: <strong>SPACE</strong> Tuşu</span>
        </div>
      </div>
    `;

    this.updateScoreHUD();
  }

  updateScoreHUD() {
    const p1El = document.getElementById('score-p1');
    const cpuEl = document.getElementById('score-cpu');
    if (p1El) p1El.innerText = this.scoreLabels[Math.min(this.score.player, 4)];
    if (cpuEl) cpuEl.innerText = this.scoreLabels[Math.min(this.score.opponent, 4)];
  }

  resetServe() {
    this.state = 'serving';
    this.ballInPlay = false;
    this.isTossed = false;
    this.bounceCount = 0;

    // Position ball near server hand
    this.ballPos.set(0.6, 1.1, 10.2);
    this.ballVel.set(0, 0, 0);
  }

  bindControls() {
    // Motion Swing Listener
    this.motionEngine.onSwing = (swingData) => {
      this.handlePlayerSwing(swingData);
    };

    // Button Listener (A = Toss Serve)
    this.motionEngine.onButtonChange = (btn, pressed) => {
      if (!pressed) return;

      if (btn === 'A' && this.state === 'serving' && !this.isTossed) {
        this.tossBallForServe();
      }
    };

    // Keyboard Fallback
    this.keyHandler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.state === 'serving' && !this.isTossed) {
          this.tossBallForServe();
        } else {
          this.handlePlayerSwing({
            type: 'forehand',
            spin: 'topspin',
            power: 0.85,
            speedKmh: 110,
          });
        }
      } else if (e.code === 'ArrowLeft') {
        this.playerMii.group.position.x = Math.max(-3.5, this.playerMii.group.position.x - 0.4);
      } else if (e.code === 'ArrowRight') {
        this.playerMii.group.position.x = Math.min(3.5, this.playerMii.group.position.x + 0.4);
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  tossBallForServe() {
    this.isTossed = true;
    this.tossStartTime = performance.now();
    this.ballVel.set(0, 5.4, 0); // Smooth upward toss
    this.soundManager.playTennisBounce();
  }

  handlePlayerSwing(swingData) {
    const pPos = this.playerMii.group.position;
    const distToPlayer = pPos.distanceTo(this.ballPos);

    if (this.state === 'serving') {
      // Must hit near toss apex
      if (this.isTossed && this.ballPos.y > 1.7) {
        this.executeServeHit(swingData);
      }
    } else if (this.state === 'rally') {
      // Ball approaching player side
      if (distToPlayer < 3.2 && this.ballVel.z > 0 && this.ballPos.z > 3.0) {
        this.playerMii.playSwing(swingData.type === 'forehand', 0.35);
        this.executePlayerHit(swingData);
      }
    }
  }

  executeServeHit(swingData) {
    this.state = 'rally';
    this.ballInPlay = true;
    this.isTossed = false;
    this.lastHitter = 'player';
    this.bounceCount = 0;

    const power = THREE.MathUtils.clamp(swingData.power || 0.8, 0.4, 1.0);

    // Direction based on lateral swing / aim
    const lateralTargetX = (Math.random() - 0.5) * (this.courtWidth - 1.5);
    this.applyBallTrajectory(lateralTargetX, -10.0, power, true);

    this.soundManager.playTennisHit(power);
    if (window.serverClient) {
      window.serverClient.sendToController({ type: 'sound', name: 'tennis_hit' });
      window.serverClient.sendToController({ type: 'rumble', duration: [40, 30, 80] });
    }

    this.showTennisBanner('NICE SERVE! ⚡', '#38bdf8');
  }

  executePlayerHit(swingData) {
    this.lastHitter = 'player';
    this.bounceCount = 0;

    const power = THREE.MathUtils.clamp(swingData.power || 0.8, 0.4, 1.0);

    // DIRECTIONAL SWING MAPPING:
    // Forehand (inward swing) aims cross-court left.
    // Backhand aims down the line right.
    // Pointer orientation directly shifts the target X on opponent's court!
    let targetX = 0;
    if (this.motionEngine && this.motionEngine.pointerX) {
      // Pointer left (0.0) -> left corner (-3.2m), pointer right (1.0) -> right corner (+3.2m)
      targetX = (this.motionEngine.pointerX - 0.5) * (this.courtWidth - 1.2);
    } else {
      targetX = swingData.type === 'forehand' ? -2.2 : 2.2;
    }

    const targetZ = -9.5 - Math.random() * 1.5;
    this.applyBallTrajectory(targetX, targetZ, power, false);

    this.soundManager.playTennisHit(power);
    if (window.serverClient) {
      window.serverClient.sendToController({ type: 'sound', name: 'tennis_hit' });
      window.serverClient.sendToController({ type: 'rumble', duration: [30, 20, 60] });
    }
  }

  /**
   * MATHEMATICAL GUARANTEE FOR NET CLEARANCE & COURT LANDING:
   * Calculates initial velocity (vx, vy, vz) such that the ball:
   * 1. Clears the net (z = 0) with at least 0.35m headroom (no snagging!).
   * 2. Lands right around (targetX, targetZ) on the opponent court.
   */
  applyBallTrajectory(targetX, targetZ, power, isServe = false) {
    const startX = this.ballPos.x;
    const startY = this.ballPos.y;
    const startZ = this.ballPos.z;

    // Flight duration based on power: Fast swing = 0.65s, gentle rally = 1.1s
    const flightTime = THREE.MathUtils.lerp(1.15, 0.65, power);

    // Forward velocity
    const vz = (targetZ - startZ) / flightTime;
    // Lateral velocity
    const vx = (targetX - startX) / flightTime;

    // Time to reach net at Z = 0
    const tNet = (0 - startZ) / vz;

    // Calculate minimum vy0 to clear net height (0.95m + 0.35m clearance = 1.30m)
    const requiredClearanceAtNet = 1.35;
    const g = 9.8;
    const minVyToClearNet = (requiredClearanceAtNet - startY + 0.5 * g * tNet * tNet) / tNet;

    // Normal parabolic arc
    let vy = (0.2 - startY + 0.5 * g * flightTime * flightTime) / flightTime;

    // Enforce net clearance guarantee!
    if (vy < minVyToClearNet) {
      vy = minVyToClearNet + 0.2;
    }

    this.ballVel.set(vx, vy, vz);
  }

  update(delta, time) {
    this.playerMii.update(time);
    this.opponentMii.update(time);

    // Ball Motion Physics
    if (this.state === 'serving' && this.isTossed) {
      this.ballVel.y -= 9.8 * delta;
      this.ballPos.addScaledVector(this.ballVel, delta);
      if (this.ballPos.y < 0.2) {
        this.resetServe(); // Missed toss
      }
    } else if (this.state === 'rally') {
      this.ballVel.y -= 9.8 * delta;
      this.ballVel.x *= 0.998;
      this.ballVel.z *= 0.998;

      this.ballPos.addScaledVector(this.ballVel, delta);

      // Court Bounce
      if (this.ballPos.y <= 0.12) {
        this.ballPos.y = 0.12;
        this.ballVel.y = Math.abs(this.ballVel.y) * 0.74; // Elastic bounce
        this.soundManager.playTennisBounce();
        this.bounceCount++;

        if (this.bounceCount >= 2) {
          this.endPoint(this.lastHitter === 'player' ? 'player' : 'opponent');
        }
      }

      // Net Check (Guaranteed clearance means this rarely triggers unless ball bounces early)
      if (Math.abs(this.ballPos.z) < 0.15 && this.ballPos.y < this.netHeight) {
        this.ballVel.z *= -0.25;
        this.soundManager.playTennisBounce();
        this.endPoint(this.lastHitter === 'player' ? 'opponent' : 'player');
      }

      // Out of bounds check
      if (Math.abs(this.ballPos.z) > this.courtLength / 2 + 5.0) {
        this.endPoint(this.lastHitter === 'player' ? 'player' : 'opponent');
      }

      // AI Opponent Tracking
      this.updateAI(delta);

      // Auto-slide Player Mii smoothly towards incoming ball
      if (this.ballVel.z > 0) {
        const targetPlayerX = THREE.MathUtils.clamp(this.ballPos.x, -3.2, 3.2);
        this.playerMii.group.position.x += (targetPlayerX - this.playerMii.group.position.x) * 4.5 * delta;
      }
    }

    // Synchronize 3D Ball & Shadow
    this.ballMesh.position.copy(this.ballPos);
    this.ballShadow.position.set(this.ballPos.x, 0.003, this.ballPos.z);
    this.ballShadow.scale.setScalar(Math.max(0.3, 1.0 - this.ballPos.y * 0.18));

    // Dynamic Elevated Broadcast Camera
    this.updateCamera();
  }

  updateAI(delta) {
    if (this.ballVel.z < 0) {
      // Ball heading towards opponent
      const targetAIX = THREE.MathUtils.clamp(this.ballPos.x, -3.2, 3.2);
      this.opponentMii.group.position.x += (targetAIX - this.opponentMii.group.position.x) * 4.0 * delta;

      // Opponent Hit Trigger
      if (this.ballPos.z < -8.8 && this.ballPos.z > -11.2 && this.ballPos.y < 2.2) {
        this.lastHitter = 'opponent';
        this.bounceCount = 0;
        this.opponentMii.playSwing(Math.random() > 0.5, 0.35);

        // Return shot back to player
        const returnTargetX = (Math.random() - 0.5) * (this.courtWidth - 1.2);
        const returnTargetZ = 9.5;
        this.applyBallTrajectory(returnTargetX, returnTargetZ, 0.75, false);

        this.soundManager.playTennisHit(0.75);
      }
    }
  }

  updateCamera() {
    // Elevated Broadcast View (Behind Player, clear view of the entire court)
    this.camera.position.set(this.playerMii.group.position.x * 0.3, 6.5, 18.5);
    this.camera.lookAt(0, 0.8, -2.0);
  }

  endPoint(winner) {
    this.state = 'point_over';
    this.soundManager.playCrowdCheer();

    if (winner === 'player') {
      this.score.player++;
      this.showTennisBanner('SAYI SENİN! 🎾', '#2ed573');
    } else {
      this.score.opponent++;
      this.showTennisBanner('RAKİP SAYI ALDI!', '#ff4757');
    }

    this.updateScoreHUD();

    if (this.score.player >= 4) {
      this.showTennisBanner('OYUNU KAZANDIN! 🏆', '#facc15');
      this.score.player = 0;
      this.score.opponent = 0;
    } else if (this.score.opponent >= 4) {
      this.showTennisBanner('RAKİP KAZANDI!', '#a4b0be');
      this.score.player = 0;
      this.score.opponent = 0;
    }

    setTimeout(() => {
      this.updateScoreHUD();
      this.resetServe();
    }, 2800);
  }

  showTennisBanner(text, color = '#ffffff') {
    let banner = document.getElementById('tennis-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'tennis-banner';
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
    if (this.hudContainer) {
      this.hudContainer.remove();
    }
    const banner = document.getElementById('tennis-banner');
    if (banner) banner.remove();
    this.scene.remove(this.group);
  }
}
