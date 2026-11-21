/**
 * Spike Legends Online — Servidor Full-Stack Express + Socket.io + Vite (Porta 3000)
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from './server/roomManager.ts';
import { registerAudioStorageRoutes } from './server/audioStorageRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrapServer() {
  const app = express();
  const server = http.createServer(app);

  // Envia pacotes pequenos de jogo imediatamente sem aguardar buffer TCP (Nagle)
  server.on('connection', (tcpSocket) => {
    tcpSocket.setNoDelay(true);
  });

  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    perMessageDeflate: false,
    httpCompression: false,
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', game: 'Spike Legends Online' });
  });

  registerAudioStorageRoutes(app);

  const roomManager = new RoomManager(io);
  io.on('connection', (socket) => {
    roomManager.handleConnection(socket);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Spike Legends Online server running at http://0.0.0.0:${port}`);
  });
}

void bootstrapServer();
