import * as THREE from 'three';
import { MiiAvatar } from '../graphics/miiAvatar.js';

/**
 * Wii Sports Resort Plaza Menu
 * Matches the exact 12-sport channel grid from the game!
 */
export class MenuHub {
  constructor(scene, camera, soundManager, motionEngine, onSelectGame) {
    this.scene = scene;
    this.camera = camera;
    this.soundManager = soundManager;
    this.motionEngine = motionEngine;
    this.onSelectGame = onSelectGame;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.initMiiShowcase();
    this.createDomMenu();
    this.bindControls();
  }

  initMiiShowcase() {
    this.mii = new MiiAvatar({ color: 0x0084ff });
    this.mii.group.position.set(0, 0, 0);
    this.group.add(this.mii.group);
  }

  createDomMenu() {
    this.menuRoot = document.getElementById('wii-plaza-menu');
    if (!this.menuRoot) {
      this.menuRoot = document.createElement('div');
      this.menuRoot.id = 'wii-plaza-menu';
      this.menuRoot.className = 'wii-menu-overlay';
      document.body.appendChild(this.menuRoot);
    }

    this.menuRoot.innerHTML = `
      <div class="resort-plaza-container">
        <!-- Passing Airplane Contrail in Sky -->
        <div class="sky-airplane-track">
          <span class="airplane-icon">✈️</span>
          <div class="contrail-line"></div>
        </div>

        <!-- 12-Sport Channel Grid (3 rows x 4 cols) -->
        <div class="resort-grid-12">
          <!-- Row 1 -->
          <div class="resort-card" data-game="sword">
            <div class="card-thumb" style="background: linear-gradient(135deg, #74b9ff, #0984e3);">⚔️</div>
            <span class="card-name">Sabre (Kılıç)</span>
          </div>

          <div class="resort-card" data-game="tennis">
            <div class="card-thumb" style="background: linear-gradient(135deg, #55efc4, #00b894);">🎾</div>
            <span class="card-name">Tennis (1v1)</span>
          </div>

          <div class="resort-card" data-game="frisbee">
            <div class="card-thumb" style="background: linear-gradient(135deg, #81ecec, #00cec9);">🥏</div>
            <span class="card-name">Frisbee</span>
          </div>

          <div class="resort-card" data-game="archery">
            <div class="card-thumb" style="background: linear-gradient(135deg, #a8e6cf, #1dd1a1);">🎯</div>
            <span class="card-name">Tir à l'arc</span>
          </div>

          <!-- Row 2 -->
          <div class="resort-card" data-game="basketball">
            <div class="card-thumb" style="background: linear-gradient(135deg, #fab1a0, #e17055);">🏀</div>
            <span class="card-name">Basket (3 Sayı)</span>
          </div>

          <div class="resort-card" data-game="tennis">
            <div class="card-thumb" style="background: linear-gradient(135deg, #ffeaa7, #fdcb6e);">🏓</div>
            <span class="card-name">Tennis de table</span>
          </div>

          <div class="resort-card" data-game="golf">
            <div class="card-thumb" style="background: linear-gradient(135deg, #55efc4, #2ed573);">⛳</div>
            <span class="card-name">Golf</span>
          </div>

          <div class="resort-card popular" data-game="bowling">
            <div class="card-badge-pop">POPÜLER</div>
            <div class="card-thumb" style="background: linear-gradient(135deg, #ff7675, #d63031);">🎳</div>
            <span class="card-name">Bowling (10 Labut)</span>
          </div>

          <!-- Row 3 -->
          <div class="resort-card" data-game="wakeboard">
            <div class="card-thumb" style="background: linear-gradient(135deg, #74b9ff, #0984e3);">🌊</div>
            <span class="card-name">Wakeboard</span>
          </div>

          <div class="resort-card" data-game="canoe">
            <div class="card-thumb" style="background: linear-gradient(135deg, #81ecec, #00cec9);">🛶</div>
            <span class="card-name">Canoë-kayak</span>
          </div>

          <div class="resort-card" data-game="cycling">
            <div class="card-thumb" style="background: linear-gradient(135deg, #ffeaa7, #e67e22);">🚲</div>
            <span class="card-name">Cyclisme</span>
          </div>

          <div class="resort-card" data-game="lab">
            <div class="card-thumb" style="background: linear-gradient(135deg, #fd79a8, #e84393);">🕹️</div>
            <span class="card-name">Kumanda Lab</span>
          </div>
        </div>

        <!-- Bottom Wii Sports Resort Bar -->
        <div class="resort-bottom-bar">
          <div class="resort-pill-logo">
            <span class="logo-sub">WiiSports</span>
            <span class="logo-main">Resort</span>
          </div>
          <div class="resort-btn-params" id="btn-resort-params">
            <span>🔧</span>
            <span>Ayarlar</span>
          </div>
        </div>
      </div>
    `;

    // Click listeners on cards
    const cards = this.menuRoot.querySelectorAll('.resort-card');
    cards.forEach((card) => {
      card.addEventListener('mouseenter', () => {
        this.soundManager.playMenuHover();
      });

      card.addEventListener('click', () => {
        const game = card.getAttribute('data-game');
        this.soundManager.playMenuSelect();
        if (this.onSelectGame) {
          this.onSelectGame(game);
        }
      });
    });

    this.cards = Array.from(cards);
    this.selectedCardIndex = 7; // Default on Bowling
    this.updateCardHighlight();
  }

  updateCardHighlight() {
    this.cards.forEach((c, idx) => {
      if (idx === this.selectedCardIndex) {
        c.classList.add('selected');
      } else {
        c.classList.remove('selected');
      }
    });
  }

  bindControls() {
    this.motionEngine.onButtonChange = (btn, pressed) => {
      if (!pressed) return;

      const cols = 4;
      if (btn === 'right') {
        this.selectedCardIndex = (this.selectedCardIndex + 1) % this.cards.length;
        this.soundManager.playMenuHover();
        this.updateCardHighlight();
      } else if (btn === 'left') {
        this.selectedCardIndex = (this.selectedCardIndex - 1 + this.cards.length) % this.cards.length;
        this.soundManager.playMenuHover();
        this.updateCardHighlight();
      } else if (btn === 'down') {
        this.selectedCardIndex = (this.selectedCardIndex + cols) % this.cards.length;
        this.soundManager.playMenuHover();
        this.updateCardHighlight();
      } else if (btn === 'up') {
        this.selectedCardIndex = (this.selectedCardIndex - cols + this.cards.length) % this.cards.length;
        this.soundManager.playMenuHover();
        this.updateCardHighlight();
      } else if (btn === 'A') {
        const selCard = this.cards[this.selectedCardIndex];
        if (selCard) {
          const game = selCard.getAttribute('data-game');
          this.soundManager.playMenuSelect();
          if (this.onSelectGame) {
            this.onSelectGame(game);
          }
        }
      }
    };
  }

  update(delta, time) {
    if (this.mii) {
      this.mii.update(time);
    }
    this.camera.position.set(0, 1.8, 4.5);
    this.camera.lookAt(0, 1.3, 0);
  }

  destroy() {
    if (this.menuRoot) {
      this.menuRoot.style.display = 'none';
    }
    this.scene.remove(this.group);
  }
}
