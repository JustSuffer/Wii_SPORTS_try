const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');

const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const HTTP_PORT = process.env.HTTP_PORT || 8080;

// Helper: Get local network IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Ensure SSL certificates exist for local HTTPS (Required by iOS Safari for motion sensors)
async function getOrGenerateCertificates(ip) {
  const certDir = path.join(__dirname, '.cert');
  const certFile = path.join(certDir, 'cert.pem');
  const keyFile = path.join(certDir, 'key.pem');

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    return {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    };
  }

  console.log('Generating local SSL certificate for HTTPS...');
  fs.mkdirSync(certDir, { recursive: true });

  const attrs = [
    { name: 'commonName', value: ip },
    { name: 'organizationName', value: 'Wii Sports Web' },
    { shortName: 'OU', value: 'Controller' },
  ];

  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: ip },
        ],
      },
    ],
  });

  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(keyFile, pems.private);
  return { cert: pems.cert, key: pems.private };
}

async function startServer() {
  const localIp = getLocalIpAddress();
  const credentials = await getOrGenerateCertificates(localIp);

  const app = express();

  // API endpoint to get connection details and QR code
  app.get('/api/connection-info', async (req, res) => {
    const controllerUrl = `https://${localIp}:${HTTPS_PORT}/controller.html`;
    try {
      const qrDataUrl = await QRCode.toDataURL(controllerUrl, {
        margin: 2,
        width: 320,
        color: {
          dark: '#0e529a',
          light: '#ffffff',
        },
      });
      res.json({
        ip: localIp,
        port: HTTPS_PORT,
        controllerUrl,
        qrDataUrl,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dynamically import Vite for middleware mode (HMR + modern ES modules)
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  // Create HTTPS server
  const httpsServer = https.createServer(credentials, app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpsServer });

  // Store active rooms and peers
  // Structure: { roomId: { screen: ws, controllers: Map<id, ws> } }
  const rooms = new Map();

  function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        screen: null,
        controllers: new Map(),
      });
    }
    return rooms.get(roomId);
  }

  wss.on('connection', (ws, req) => {
    let clientRole = null;
    let clientRoom = 'default';
    let clientId = Math.random().toString(36).substring(2, 9);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Handshake & registration
        if (msg.type === 'register') {
          clientRole = msg.role; // 'screen' or 'controller'
          clientRoom = msg.room || 'default';
          const room = getOrCreateRoom(clientRoom);

          if (clientRole === 'screen') {
            room.screen = ws;
            console.log(`[Room: ${clientRoom}] PC Screen registered.`);
            ws.send(JSON.stringify({ type: 'registered', role: 'screen', clientId }));
            // Notify if controllers already connected
            if (room.controllers.size > 0) {
              ws.send(
                JSON.stringify({
                  type: 'controller_status',
                  connected: true,
                  count: room.controllers.size,
                })
              );
            }
          } else if (clientRole === 'controller') {
            room.controllers.set(clientId, ws);
            const playerIndex = room.controllers.size; // Player 1, 2...
            console.log(
              `[Room: ${clientRoom}] iPhone Controller #${playerIndex} connected (ID: ${clientId}).`
            );
            ws.send(
              JSON.stringify({
                type: 'registered',
                role: 'controller',
                clientId,
                playerNumber: playerIndex,
              })
            );

            // Notify PC Screen that controller joined
            if (room.screen && room.screen.readyState === ws.OPEN) {
              room.screen.send(
                JSON.stringify({
                  type: 'controller_joined',
                  clientId,
                  playerNumber: playerIndex,
                })
              );
            }
          }
          return;
        }

        // Motion stream from Controller -> Screen
        if (clientRole === 'controller') {
          const room = rooms.get(clientRoom);
          if (room && room.screen && room.screen.readyState === ws.OPEN) {
            msg.clientId = clientId;
            room.screen.send(JSON.stringify(msg));
          }
          return;
        }

        // Events from Screen -> Controller (e.g. rumble, audio trigger)
        if (clientRole === 'screen') {
          const room = rooms.get(clientRoom);
          if (room) {
            if (msg.targetId && room.controllers.has(msg.targetId)) {
              room.controllers.get(msg.targetId).send(JSON.stringify(msg));
            } else {
              // Broadcast to all controllers in room
              for (const ctrlWs of room.controllers.values()) {
                if (ctrlWs.readyState === ws.OPEN) {
                  ctrlWs.send(JSON.stringify(msg));
                }
              }
            }
          }
          return;
        }
      } catch (err) {
        console.error('WS Message parsing error:', err.message);
      }
    });

    ws.on('close', () => {
      const room = rooms.get(clientRoom);
      if (room) {
        if (clientRole === 'screen' && room.screen === ws) {
          room.screen = null;
          console.log(`[Room: ${clientRoom}] PC Screen disconnected.`);
        } else if (clientRole === 'controller') {
          room.controllers.delete(clientId);
          console.log(`[Room: ${clientRoom}] iPhone Controller disconnected.`);
          if (room.screen && room.screen.readyState === ws.OPEN) {
            room.screen.send(
              JSON.stringify({
                type: 'controller_left',
                clientId,
                count: room.controllers.size,
              })
            );
          }
        }
      }
    });
  });

  // Start HTTP redirect server
  http
    .createServer((req, res) => {
      const host = req.headers.host ? req.headers.host.split(':')[0] : localIp;
      res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url}` });
      res.end();
    })
    .listen(HTTP_PORT);

  // Start HTTPS server
  httpsServer.listen(HTTPS_PORT, () => {
    const pcUrl = `https://localhost:${HTTPS_PORT}`;
    const controllerUrl = `https://${localIp}:${HTTPS_PORT}/controller.html`;

    console.log('\n======================================================');
    console.log('🎮 WII SPORTS WEB - VIRTUAL WIIMOTE SUITE');
    console.log('======================================================');
    console.log(`🖥️  PC EKRANI (OYUN):      ${pcUrl}`);
    console.log(`📱 iPHONE KUMANDA LINKI:  ${controllerUrl}`);
    console.log('======================================================\n');

    QRCode.toString(controllerUrl, { type: 'terminal', small: true }, (err, qrTerminal) => {
      if (!err) {
        console.log('📱 iPhone kameranla okutmak için terminal QR kodu:\n');
        console.log(qrTerminal);
        console.log('======================================================\n');
      }
    });
  });
}

startServer().catch((err) => {
  console.error('Server başlatma hatası:', err);
});
