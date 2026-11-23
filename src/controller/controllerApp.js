// iPhone Virtual Wii Remote Client Logic
import PeerModule from 'peerjs';

const Peer = PeerModule.Peer || PeerModule.default || PeerModule;

class WiiRemoteController {
  constructor() {
    this.ws = null;
    this.peer = null;
    this.peerConn = null;
    this.connected = false;
    this.playerNumber = 1;
    this.wakeLock = null;

    // Room code from URL query string
    const urlParams = new URLSearchParams(window.location.search);
    this.roomCode = (urlParams.get('room') || '').trim();

    // Calibration offsets
    this.calibratedYaw = 0;
    this.currentYaw = 0;

    // Gravity estimation filter for iOS (when e.acceleration is null)
    this.gravityEstimate = { x: 0, y: 0, z: 9.8 };

    // Active button states
    this.buttons = {
      A: false,
      B: false,
      up: false,
      down: false,
      left: false,
      right: false,
      minus: false,
      home: false,
      plus: false,
      one: false,
      two: false,
    };

    // Latest sensor values
    this.motionData = {
      acc: { x: 0, y: 0, z: 0 },
      linAcc: { x: 0, y: 0, z: 0 },
      gyro: { alpha: 0, beta: 0, gamma: 0 },
      orient: { alpha: 0, beta: 0, gamma: 0 },
    };

    this.audioCtx = null;
    this.initDOM();
  }

  initDOM() {
    this.splashScreen = document.getElementById('permission-screen');
    this.btnStart = document.getElementById('btn-start-sensors');
    this.errorMsg = document.getElementById('permission-error');
    this.connPill = document.getElementById('conn-pill');
    this.connText = document.getElementById('conn-text');
    this.btnRecenter = document.getElementById('btn-recenter');
    this.playerTag = document.getElementById('player-tag');

    const roomInput = document.getElementById('room-code-input');
    if (roomInput) {
      if (this.roomCode) {
        roomInput.value = this.roomCode;
      }
      roomInput.addEventListener('input', (e) => {
        this.roomCode = e.target.value.trim().toUpperCase();
      });
    }

    this.btnStart.addEventListener('click', () => this.handleActivation());
    this.btnRecenter.addEventListener('click', () => this.recenterOrientation());

    // Guide Modal Toggle
    const btnToggleGuide = document.getElementById('btn-toggle-guide');
    const guideModal = document.getElementById('guide-modal');
    const btnCloseGuide = document.getElementById('btn-close-guide');

    if (btnToggleGuide && guideModal) {
      btnToggleGuide.addEventListener('click', () => {
        guideModal.style.display = 'flex';
      });
    }
    if (btnCloseGuide && guideModal) {
      btnCloseGuide.addEventListener('click', () => {
        guideModal.style.display = 'none';
      });
    }

    this.setupButtonListeners();
  }

  async handleActivation() {
    try {
      this.errorMsg.style.display = 'none';

      const roomInput = document.getElementById('room-code-input');
      if (roomInput && roomInput.value.trim()) {
        this.roomCode = roomInput.value.trim().toUpperCase();
      }

      // 1. CRITICAL FOR iOS SAFARI: Request motion permission FIRST
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function'
      ) {
        const response = await DeviceMotionEvent.requestPermission();
        if (response !== 'granted') {
          this.errorMsg.innerText = 'Hareket izni verilmedi. Lütfen sayfayı yenileyip "İzin Ver"e dokunun.';
          this.errorMsg.style.display = 'block';
          return;
        }
      } else if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        try {
          await DeviceOrientationEvent.requestPermission();
        } catch (e) {}
      }

      // 2. Initialize Web Audio Context
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
          if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
          }
        }
      } catch (e) {}

      // 3. Screen Wake Lock
      if ('wakeLock' in navigator) {
        try {
          this.wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {}
      }

      // 4. Start Sensors & Streaming
      this.startSensors();

      // 5. Connect to PC (WebRTC PeerJS on Cloud/Netlify or WebSocket on Local)
      this.connect();

      // 6. Play startup chime & vibration
      this.playSpeakerSound('connect');
      this.triggerHaptic([30, 40, 60]);

      // 7. Hide splash screen
      this.splashScreen.style.display = 'none';
    } catch (err) {
      console.error('Activation error:', err);
      this.errorMsg.innerText = 'Hata oluştu: ' + (err.message || err);
      this.errorMsg.style.display = 'block';
    }
  }

  connect() {
    if (this.roomCode) {
      this.connectPeer();
    } else if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.port === '8443'
    ) {
      this.connectWebSocket();
    } else {
      this.connectPeer();
    }
  }

  connectPeer() {
    const targetRoom = this.roomCode || 'default';
    this.connText.innerText = `Odaya bağlanıyor (#${targetRoom})...`;
    this.connPill.classList.remove('connected');

    try {
      this.peer = new Peer({
        debug: 1,
      });

      this.peer.on('open', (id) => {
        const targetPeerId = `wii-sports-${targetRoom}`;
        console.log('Peer ready. Connecting to PC host:', targetPeerId);

        this.peerConn = this.peer.connect(targetPeerId, {
          reliable: false, // Low latency UDP-style transmission for 60 FPS motion
        });

        this.peerConn.on('open', () => {
          this.connected = true;
          this.connText.innerText = '🟢 Bağlandı';
          this.connPill.classList.add('connected');
          this.triggerHaptic([20, 30]);
          this.playSpeakerSound('connect');

          this.peerConn.send({
            type: 'register',
            role: 'controller',
            room: targetRoom,
          });
        });

        this.peerConn.on('data', (data) => {
          const msg = typeof data === 'string' ? JSON.parse(data) : data;
          this.handleServerMessage(msg);
        });

        this.peerConn.on('close', () => {
          this.connected = false;
          this.connText.innerText = '🔴 Bağlantı kesildi, tekrar deneniyor...';
          this.connPill.classList.remove('connected');
          setTimeout(() => this.connectPeer(), 2500);
        });

        this.peerConn.on('error', (err) => {
          console.warn('Peer connection error:', err);
        });
      });

      this.peer.on('error', (err) => {
        console.warn('Peer client error:', err);
        if (!this.connected) {
          this.connText.innerText = '⚠️ Oda bulunamadı veya bağlantı hatası';
          if (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
          ) {
            this.connectWebSocket();
          } else {
            setTimeout(() => this.connectPeer(), 3000);
          }
        }
      });
    } catch (err) {
      console.error('Failed to start PeerJS on controller:', err);
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.connText.innerText = 'Bağlanıyor...';
    this.connPill.classList.remove('connected');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.connText.innerText = '🟢 Bağlandı (Yerel)';
        this.connPill.classList.add('connected');

        this.ws.send(
          JSON.stringify({
            type: 'register',
            role: 'controller',
            room: this.roomCode || 'default',
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('WS Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        if (!this.peerConn || !this.peerConn.open) {
          this.connected = false;
          this.connText.innerText = '🔴 Yeniden bağlanıyor...';
          this.connPill.classList.remove('connected');
        }
        setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (e) {
      console.log('Local WS failed, switching to PeerJS');
      this.connectPeer();
    }
  }

  sendPacket(data) {
    if (this.peerConn && this.peerConn.open) {
      this.peerConn.send(data);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  startSensors() {
    window.addEventListener(
      'devicemotion',
      (e) => {
        let ax = 0,
          ay = 0,
          az = 0;
        let lx = 0,
          ly = 0,
          lz = 0;

        if (e.accelerationIncludingGravity) {
          ax = Number(e.accelerationIncludingGravity.x || 0);
          ay = Number(e.accelerationIncludingGravity.y || 0);
          az = Number(e.accelerationIncludingGravity.z || 0);
          this.motionData.acc = { x: ax, y: ay, z: az };
        }

        // CRITICAL iOS FIX: If e.acceleration is null or empty, use high-pass filter on accelerationIncludingGravity
        if (
          e.acceleration &&
          (e.acceleration.x !== null || e.acceleration.y !== null || e.acceleration.z !== null)
        ) {
          lx = Number(e.acceleration.x || 0);
          ly = Number(e.acceleration.y || 0);
          lz = Number(e.acceleration.z || 0);
        } else {
          // Low-pass filter for gravity tracking (alpha = 0.8)
          const alpha = 0.8;
          this.gravityEstimate.x = alpha * this.gravityEstimate.x + (1 - alpha) * ax;
          this.gravityEstimate.y = alpha * this.gravityEstimate.y + (1 - alpha) * ay;
          this.gravityEstimate.z = alpha * this.gravityEstimate.z + (1 - alpha) * az;

          // High-pass linear acceleration = total - gravity
          lx = ax - this.gravityEstimate.x;
          ly = ay - this.gravityEstimate.y;
          lz = az - this.gravityEstimate.z;
        }

        this.motionData.linAcc = { x: lx, y: ly, z: lz };

        if (e.rotationRate) {
          this.motionData.gyro = {
            alpha: Number(e.rotationRate.alpha || 0),
            beta: Number(e.rotationRate.beta || 0),
            gamma: Number(e.rotationRate.gamma || 0),
          };
        }

        this.sendMotionPacket();
      },
      true
    );

    window.addEventListener(
      'deviceorientation',
      (e) => {
        this.currentYaw = Number(e.alpha || 0);

        let adjustedAlpha = this.currentYaw - this.calibratedYaw;
        if (adjustedAlpha > 180) adjustedAlpha -= 360;
        if (adjustedAlpha < -180) adjustedAlpha += 360;

        this.motionData.orient = {
          alpha: adjustedAlpha,
          beta: Number(e.beta || 0),
          gamma: Number(e.gamma || 0),
        };
      },
      true
    );
  }

  recenterOrientation() {
    this.calibratedYaw = this.currentYaw;
    this.triggerHaptic([20, 20]);
    this.playSpeakerSound('click');

    this.sendPacket({
      type: 'recenter',
      pitch: this.motionData.orient.beta,
      yaw: this.motionData.orient.alpha,
    });
  }

  setupButtonListeners() {
    const bindTouch = (el, btnKey) => {
      if (!el) return;

      const setButton = (pressed) => {
        if (this.buttons[btnKey] !== pressed) {
          this.buttons[btnKey] = pressed;
          if (pressed) {
            el.classList.add('pressed');
            this.triggerHaptic(20);
            this.playSpeakerSound('click');
          } else {
            el.classList.remove('pressed');
          }
          this.sendButtonState(btnKey, pressed);
        }
      };

      el.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          setButton(true);
        },
        { passive: false }
      );

      el.addEventListener(
        'touchend',
        (e) => {
          e.preventDefault();
          setButton(false);
        },
        { passive: false }
      );

      el.addEventListener(
        'touchcancel',
        (e) => {
          e.preventDefault();
          setButton(false);
        },
        { passive: false }
      );

      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        setButton(true);
      });
      el.addEventListener('mouseup', (e) => {
        e.preventDefault();
        setButton(false);
      });
    };

    bindTouch(document.getElementById('btn-a'), 'A');
    bindTouch(document.getElementById('btn-b'), 'B');
    bindTouch(document.getElementById('btn-dpad-up'), 'up');
    bindTouch(document.getElementById('btn-dpad-down'), 'down');
    bindTouch(document.getElementById('btn-dpad-left'), 'left');
    bindTouch(document.getElementById('btn-dpad-right'), 'right');
    bindTouch(document.getElementById('btn-minus'), 'minus');
    bindTouch(document.getElementById('btn-home'), 'home');
    bindTouch(document.getElementById('btn-plus'), 'plus');
    bindTouch(document.getElementById('btn-1'), 'one');
    bindTouch(document.getElementById('btn-2'), 'two');

    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => {
        this.sendPacket({ type: 'button', button: 'home', pressed: true });
      });
    }
  }

  handleServerMessage(msg) {
    if (msg.type === 'registered') {
      this.playerNumber = msg.playerNumber || 1;
      this.updatePlayerUI();
    } else if (msg.type === 'rumble') {
      this.triggerHaptic(msg.duration || [30, 40, 50]);
    } else if (msg.type === 'sound') {
      this.playSpeakerSound(msg.name);
    }
  }

  updatePlayerUI() {
    this.playerTag.innerText = `P${this.playerNumber}`;
    for (let i = 1; i <= 4; i++) {
      const led = document.getElementById(`led-${i}`);
      if (led) {
        if (i === this.playerNumber) {
          led.classList.add('active');
        } else {
          led.classList.remove('active');
        }
      }
    }
  }

  sendMotionPacket() {
    if (!this.connected) return;

    const packet = {
      type: 'motion',
      acc: this.motionData.acc,
      linAcc: this.motionData.linAcc,
      gyro: this.motionData.gyro,
      orient: this.motionData.orient,
      buttons: this.buttons,
    };

    this.sendPacket(packet);
  }

  sendButtonState(btn, pressed) {
    if (!this.connected) return;
    this.sendPacket({
      type: 'button',
      button: btn,
      pressed: pressed,
    });
  }

  triggerHaptic(pattern) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  playSpeakerSound(type) {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    if (type === 'click') {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.04);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'tennis_hit') {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
      this.triggerHaptic([40, 20, 80]);
    } else if (type === 'bowling_release') {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(90, now + 0.2);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
      this.triggerHaptic([30, 20, 40]);
    } else if (type === 'connect') {
      const playTone = (freq, time, dur) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(time);
        osc.stop(time + dur);
      };
      playTone(739.99, now, 0.12);
      playTone(987.77, now + 0.14, 0.25);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.controller = new WiiRemoteController();
});
