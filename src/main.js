import * as THREE from 'three';
import { SkyAndIsland } from './graphics/skyAndIsland.js';
import { SoundManager } from './audio/soundManager.js';
import { MotionEngine } from './input/motionEngine.js';
import { ClientSync } from './network/clientSync.js';
import { MenuHub } from './games/menuHub.js';
import { BowlingGame } from './games/bowling/bowlingGame.js';
import { TennisGame } from './games/tennis/tennisGame.js';
import { ControllerLab } from './games/controllerLab/labGame.js';
import { BasketballGame } from './games/basketball/basketballGame.js';
import { SwordGame } from './games/swordplay/swordGame.js';

class WiiSportsApp {
  constructor() {
    this.container = document.getElementById('app-container');

    // 1. Core Three.js Setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 2. Audio & Input Engines
    this.soundManager = new SoundManager();
    this.motionEngine = new MotionEngine();

    // 3. Environment (Wii Resort Skies & Islands)
    this.environment = new SkyAndIsland(this.scene);

    // 4. Game Modes
    this.currentMode = null;
    this.modeInstance = null;

    // 5. Network Sync
    this.serverClient = new ClientSync(this.motionEngine, (connected, count) => {
      this.updateConnectionStatus(connected, count);
    });
    window.serverClient = this.serverClient;

    // 6. UI & Pointer
    this.initUI();
    this.initPointer();

    // 7. Start in Menu
    this.switchMode('menu');

    // 8. Event Listeners
    window.addEventListener('resize', () => this.onWindowResize());

    // Clock
    this.clock = new THREE.Clock();
    this.animate();
  }

  initUI() {
    this.statusPill = document.getElementById('status-pill');
    this.statusText = document.getElementById('status-text');
    this.btnQr = document.getElementById('btn-show-qr');
    this.qrModal = document.getElementById('qr-modal');
    this.btnHome = document.getElementById('btn-plaza-home');
    this.btnSensitivity = document.getElementById('btn-sensitivity');
    this.sensitivityModes = ['high', 'ultra', 'normal'];
    this.currentSensIdx = 0;

    if (this.btnSensitivity) {
      this.btnSensitivity.addEventListener('click', () => {
        this.currentSensIdx = (this.currentSensIdx + 1) % this.sensitivityModes.length;
        const mode = this.sensitivityModes[this.currentSensIdx];
        this.motionEngine.setSensitivity(mode);

        const labels = {
          high: '⚡ DPI: Yüksek (Wii)',
          ultra: '🚀 DPI: Ultra Hızlı',
          normal: '🎯 DPI: Normal',
        };
        this.btnSensitivity.innerText = labels[mode];
        this.soundManager.playMenuHover();
      });
    }

    this.btnQr.addEventListener('click', () => {
      this.soundManager.playMenuHover();
      this.qrModal.classList.toggle('active');
    });

    document.getElementById('btn-close-qr').addEventListener('click', () => {
      this.qrModal.classList.remove('active');
    });

    this.homeModal = document.getElementById('wii-home-modal');
    this.isHomeOpen = false;
    this.isPaused = false;

    // Home confirmation modal button clicks
    const btnConfirmYes = document.getElementById('btn-home-confirm-yes');
    const btnConfirmNo = document.getElementById('btn-home-confirm-no');

    if (btnConfirmYes) {
      btnConfirmYes.addEventListener('click', () => {
        this.soundManager.playMenuSelect();
        this.closeHomeModal();
        this.switchMode('menu');
      });
    }

    if (btnConfirmNo) {
      btnConfirmNo.addEventListener('click', () => {
        this.soundManager.playMenuHover();
        this.closeHomeModal();
      });
    }

    // Top-left "Ana Menü" button opens the confirmation modal & pauses game
    this.btnHome.addEventListener('click', () => {
      this.soundManager.playMenuHover();
      this.openHomeModal();
    });

    // Handle Phone Buttons (Home & Pointer Click via A)
    this.motionEngine.onButtonChange = (btn, pressed) => {
      if (!pressed) return;

      if (btn === 'home') {
        if (this.currentMode !== 'menu') {
          this.toggleHomeModal();
        }
      } else if (btn === 'A') {
        this.handlePointerClick();
      }
    };
  }

  toggleHomeModal() {
    if (this.isHomeOpen) {
      this.closeHomeModal();
    } else {
      this.openHomeModal();
    }
  }

  openHomeModal() {
    this.isHomeOpen = true;
    this.isPaused = true;
    if (this.homeModal) {
      this.homeModal.classList.add('active');
    }
    this.soundManager.playMenuSelect();
  }

  closeHomeModal() {
    this.isHomeOpen = false;
    this.isPaused = false;
    if (this.homeModal) {
      this.homeModal.classList.remove('active');
    }
  }

  handlePointerClick() {
    if (!this.pointerPixelX || !this.pointerPixelY) return;

    // Temporarily hide cursor element so elementFromPoint sees the underlying UI button
    if (this.cursorEl) this.cursorEl.style.display = 'none';
    const target = document.elementFromPoint(this.pointerPixelX, this.pointerPixelY);
    if (this.cursorEl) this.cursorEl.style.display = 'block';

    if (target) {
      const clickable = target.closest('button, .sport-card, a, [data-action]');
      if (clickable) {
        this.soundManager.playMenuSelect();
        clickable.click();
      }
    }
  }

  initPointer() {
    this.cursorEl = document.getElementById('wii-cursor');
    this.pointerPixelX = window.innerWidth / 2;
    this.pointerPixelY = window.innerHeight / 2;

    this.motionEngine.onPointerMove = (x, y) => {
      this.pointerPixelX = x * window.innerWidth;
      this.pointerPixelY = y * window.innerHeight;

      if (this.cursorEl) {
        this.cursorEl.style.left = `${this.pointerPixelX}px`;
        this.cursorEl.style.top = `${this.pointerPixelY}px`;
      }

      // If home confirmation modal is open, highlight button under pointer
      if (this.isHomeOpen) {
        const yesBtn = document.getElementById('btn-home-confirm-yes');
        const noBtn = document.getElementById('btn-home-confirm-no');
        [yesBtn, noBtn].forEach((btn) => {
          if (!btn) return;
          const rect = btn.getBoundingClientRect();
          const isOver =
            this.pointerPixelX >= rect.left &&
            this.pointerPixelX <= rect.right &&
            this.pointerPixelY >= rect.top &&
            this.pointerPixelY <= rect.bottom;
          if (isOver && !btn.classList.contains('active-hover')) {
            btn.classList.add('active-hover');
            this.soundManager.playMenuHover();
          } else if (!isOver && btn.classList.contains('active-hover')) {
            btn.classList.remove('active-hover');
          }
        });
      }
    };
  }

  updateConnectionStatus(connected, count) {
    if (connected) {
      this.statusPill.className = 'status-pill connected';
      this.statusText.innerText = `🟢 iPhone Bağlandı (Wiimote P${count})`;
      this.soundManager.playMenuSelect();
      if (this.qrModal) {
        this.qrModal.classList.remove('active');
      }
    } else {
      this.statusPill.className = 'status-pill waiting';
      this.statusText.innerText = `🟡 iPhone Bekleniyor... (QR Kodu Tara)`;
    }
  }

  switchMode(mode, forceRestart = false) {
    if (this.currentMode === mode && this.modeInstance && !forceRestart) return;

    // Destroy active mode
    if (this.modeInstance) {
      this.modeInstance.destroy();
      this.modeInstance = null;
    }

    this.currentMode = mode;

    if (mode === 'menu') {
      this.environment.setVisible(true);
      this.btnHome.style.display = 'none';
      const menuEl = document.getElementById('wii-plaza-menu');
      if (menuEl) menuEl.style.display = 'flex';

      this.modeInstance = new MenuHub(
        this.scene,
        this.camera,
        this.soundManager,
        this.motionEngine,
        (selectedGame) => this.switchMode(selectedGame)
      );
    } else {
      this.btnHome.style.display = 'flex';
      const menuEl = document.getElementById('wii-plaza-menu');
      if (menuEl) menuEl.style.display = 'none';

      if (mode === 'bowling') {
        // Enclose in indoor bowling hall: hide outdoor ocean & island!
        this.environment.setVisible(false);
        this.modeInstance = new BowlingGame(
          this.scene,
          this.camera,
          this.soundManager,
          this.motionEngine
        );
      } else if (mode === 'tennis') {
        this.environment.setVisible(true);
        this.modeInstance = new TennisGame(
          this.scene,
          this.camera,
          this.soundManager,
          this.motionEngine
        );
      } else if (mode === 'lab') {
        this.environment.setVisible(true);
        this.modeInstance = new ControllerLab(
          this.scene,
          this.camera,
          this.soundManager,
          this.motionEngine
        );
      } else if (mode === 'basketball') {
        this.environment.setVisible(true);
        this.modeInstance = new BasketballGame(
          this.scene,
          this.camera,
          this.soundManager,
          this.motionEngine
        );
      } else if (mode === 'sword') {
        this.environment.setVisible(true);
        this.modeInstance = new SwordGame(
          this.scene,
          this.camera,
          this.soundManager,
          this.motionEngine
        );
      } else {
        // Fallback for demo sports
        this.environment.setVisible(true);
        this.modeInstance = new TennisGame(
          this.scene,
          this.camera,
          this.soundManager,
          this.motionEngine
        );
      }
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // If game is paused (Home Modal open), freeze game logic, physics, and world!
    if (!this.isPaused) {
      // Update environmental animations (clouds, sea)
      this.environment.update(delta);

      // Update active game
      if (this.modeInstance) {
        this.modeInstance.update(delta, elapsedTime);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new WiiSportsApp();
});
