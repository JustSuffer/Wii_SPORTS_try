/**
 * PC Screen Network Client (WebRTC PeerJS + WebSocket Relay)
 * Connects PC game to the mobile controller over WebRTC (for Netlify/Vercel/Cloud)
 * or local WebSocket (for offline/localhost)
 */
import QRCode from 'qrcode';
import PeerModule from 'peerjs';

const Peer = PeerModule.Peer || PeerModule.default || PeerModule;

export class ClientSync {
  constructor(motionEngine, onConnectionChange) {
    this.motionEngine = motionEngine;
    this.onConnectionChange = onConnectionChange;

    this.ws = null;
    this.peer = null;
    this.activePeerConns = [];

    this.connected = false;
    this.controllerConnected = false;
    this.controllerCount = 0;
    this.connectionInfo = null;

    // Persistent room code in session storage so refresh keeps same room
    this.roomCode = sessionStorage.getItem('wii_room_code');
    if (!this.roomCode) {
      this.roomCode = Math.floor(1000 + Math.random() * 9000).toString();
      sessionStorage.setItem('wii_room_code', this.roomCode);
    }
    this.peerId = `wii-sports-${this.roomCode}`;

    this.init();
  }

  async init() {
    // 1. Generate QR Code and render immediately (Zero-lag, works on Netlify & Localhost)
    await this.generateConnectionInfo();

    // 2. Start WebRTC PeerJS receiver for cloud / Netlify support
    this.initPeer();

    // 3. If running locally or on server with WebSocket, connect local WS as well
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.port === '8443'
    ) {
      this.connectWebSocket();
    }
  }

  async generateConnectionInfo() {
    try {
      // Build dynamic URL pointing to current host / domain
      const baseUrl = window.location.origin;
      const controllerUrl = `${baseUrl}/controller.html?room=${this.roomCode}`;

      const qrDataUrl = await QRCode.toDataURL(controllerUrl, {
        margin: 2,
        width: 320,
        color: {
          dark: '#0e529a',
          light: '#ffffff',
        },
      });

      this.connectionInfo = {
        controllerUrl,
        qrDataUrl,
        roomCode: this.roomCode,
      };

      this.renderQRCodeModal();
    } catch (err) {
      console.warn('Could not generate client-side connection info:', err);
    }
  }

  renderQRCodeModal() {
    if (!this.connectionInfo) return;

    let qrContainer = document.getElementById('qr-modal-content');
    if (qrContainer) {
      // Check if running on a real domain with trusted HTTPS (Netlify / Vercel / etc.)
      const isTrustedHttps =
        window.location.protocol === 'https:' &&
        !window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/);

      qrContainer.innerHTML = `
        <div class="qr-box">
          <div class="qr-img-wrapper" style="text-align: center; flex-shrink: 0;">
            <img src="${this.connectionInfo.qrDataUrl}" alt="Wii Controller QR Kod" class="qr-image" />
            <div style="margin-top: 8px; font-weight: 800; color: #0077b6; font-size: 15px; letter-spacing: 2px;">
              ODA KODU: #${this.roomCode}
            </div>
          </div>
          <div class="qr-text-info">
            <h4 style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
              📱 iPhone Wii Kumandası
              ${
                isTrustedHttps
                  ? '<span style="background: #e6fcf5; color: #0ca678; font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 700;">🔒 Güvenli SSL Aktif</span>'
                  : ''
              }
            </h4>
            <p><strong>1.</strong> iPhone kameranla QR kodu tara ve Safari'de aç.</p>
            ${
              isTrustedHttps
                ? `<p><strong>2.</strong> Açılan sayfada <em>"Kumandayı Etkinleştir"</em> butonuna dokunup çıkan sistem uyarısında <strong>"İzin Ver"</strong> seçeneğini seçin.</p>`
                : `<p><strong>2.</strong> Yerel ağda ilk açılışta <em>"Ayrıntılar -> Web Sitesini Ziyaret Et"</em> diyerek devam edin. (Netlify'a yüklediğinizde bu uyarı tamamen kalkar!)</p>`
            }
            <p><strong>3.</strong> Telefonunuzu ekrana doğrultarak gerçek bir Wii Remote gibi kullanın!</p>
            <div class="direct-link" style="margin-top: 10px;">
              <span>Doğrudan Link:</span>
              <a href="${this.connectionInfo.controllerUrl}" target="_blank">${this.connectionInfo.controllerUrl}</a>
            </div>
          </div>
        </div>
      `;
    }
  }

  initPeer() {
    try {
      this.peer = new Peer(this.peerId, {
        debug: 1,
      });

      this.peer.on('open', (id) => {
        console.log('✅ PeerJS Ready on PC screen. Room ID:', id);
      });

      this.peer.on('connection', (conn) => {
        console.log('📱 Phone Controller connected via WebRTC DataChannel:', conn.peer);

        conn.on('open', () => {
          this.activePeerConns.push(conn);
          this.controllerConnected = true;
          this.controllerCount = Math.max(this.controllerCount, this.activePeerConns.length);
          if (this.onConnectionChange) {
            this.onConnectionChange(true, this.controllerCount);
          }

          // Send welcome packet with player number
          conn.send({
            type: 'registered',
            playerNumber: this.activePeerConns.length,
          });
        });

        conn.on('data', (data) => {
          try {
            const msg = typeof data === 'string' ? JSON.parse(data) : data;
            this.handleMessage(msg);
          } catch (e) {
            console.error('Peer message error:', e);
          }
        });

        conn.on('close', () => {
          this.activePeerConns = this.activePeerConns.filter((c) => c !== conn);
          this.controllerCount = this.activePeerConns.length;
          this.controllerConnected = this.controllerCount > 0;
          if (this.onConnectionChange) {
            this.onConnectionChange(this.controllerConnected, this.controllerCount);
          }
        });

        conn.on('error', (err) => {
          console.warn('Peer connection error:', err);
        });
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS error:', err);
        if (err.type === 'unavailable-id') {
          // Room ID clash, regenerate room code
          this.roomCode = Math.floor(1000 + Math.random() * 9000).toString();
          sessionStorage.setItem('wii_room_code', this.roomCode);
          this.peerId = `wii-sports-${this.roomCode}`;
          this.generateConnectionInfo();
          setTimeout(() => this.initPeer(), 500);
        }
      });
    } catch (err) {
      console.error('Failed to initialize PeerJS on PC:', err);
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.ws.send(
          JSON.stringify({
            type: 'register',
            role: 'screen',
            room: this.roomCode,
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('WS Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        // Don't mark controller disconnected if WebRTC peer connection is still active
        if (this.activePeerConns.length === 0) {
          this.controllerConnected = false;
          if (this.onConnectionChange) {
            this.onConnectionChange(false, 0);
          }
        }
        setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (e) {
      console.log('Local WebSocket not available (running in static / cloud mode).');
    }
  }

  handleMessage(msg) {
    if (msg.type === 'controller_joined') {
      this.controllerConnected = true;
      this.controllerCount = msg.playerNumber || 1;
      if (this.onConnectionChange) {
        this.onConnectionChange(true, this.controllerCount);
      }
    } else if (msg.type === 'controller_left') {
      this.controllerCount = msg.count || 0;
      this.controllerConnected = this.controllerCount > 0 || this.activePeerConns.length > 0;
      if (this.onConnectionChange) {
        this.onConnectionChange(this.controllerConnected, this.controllerCount);
      }
    } else if (msg.type === 'controller_status') {
      this.controllerConnected = msg.connected || this.activePeerConns.length > 0;
      this.controllerCount = Math.max(msg.count, this.activePeerConns.length);
      if (this.onConnectionChange) {
        this.onConnectionChange(this.controllerConnected, this.controllerCount);
      }
    } else if (msg.type === 'motion') {
      // Stream directly into motion engine
      this.motionEngine.processPacket(msg);
    } else if (msg.type === 'button') {
      this.motionEngine.buttons[msg.button] = msg.pressed;
      if (this.motionEngine.onButtonChange) {
        this.motionEngine.onButtonChange(msg.button, msg.pressed);
      }
    } else if (msg.type === 'recenter') {
      this.motionEngine.recenter(msg.pitch, msg.yaw);
    }
  }

  sendToController(payload) {
    // Send over WebSocket if available
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
    // Send over WebRTC DataChannel peers
    for (const conn of this.activePeerConns) {
      if (conn && conn.open) {
        conn.send(payload);
      }
    }
  }
}
