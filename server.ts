
/**
 * Spike Legends Online
 * Servidor Full-Stack: Express + Socket.IO + Vite
 *
 * Recursos:
 * - Multiplayer em tempo real
 * - WebSocket com baixa latência
 * - Compatibilidade com Express 4 e Express 5
 * - Vite em desenvolvimento
 * - Arquivos estáticos em produção
 * - Configuração de CORS por variável de ambiente
 * - Tratamento de erros
 * - Encerramento seguro do servidor
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

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Limite do corpo JSON.
// Ajuste conforme o tamanho real dos dados enviados pela aplicação.
const JSON_LIMIT = process.env.JSON_LIMIT || '10mb';

// Origens permitidas, separadas por vírgula.
// Exemplo: https://meujogo.com,https://www.meujogo.com
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

let io: SocketIOServer | undefined;
let viteClose: (() => Promise<void>) | undefined;
let httpServer: http.Server | undefined;

let isShuttingDown = false;

/**
 * Verifica se uma origem pode acessar o servidor.
 *
 * Em desenvolvimento, permite conexões sem origem
 * e origens locais.
 *
 * Em produção, recomenda-se configurar CORS_ORIGINS.
 */
function isOriginAllowed(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  if (!IS_PRODUCTION) {
    return true;
  }

  if (ALLOWED_ORIGINS.includes('*')) {
    return true;
  }

  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Inicialização principal.
 */
async function bootstrapServer(): Promise<void> {
  const app = express();

  httpServer = http.createServer(app);

  /**
   * Otimização TCP:
   * envia pacotes pequenos sem aguardar o agrupamento Nagle.
   */
  httpServer.on('connection', (socket) => {
    socket.setNoDelay(true);
  });

  /**
   * Configuração do Socket.IO.
   */
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Origem não autorizada pelo CORS.'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },

    transports: ['websocket', 'polling'],

    // Evita o custo de compressão em pacotes pequenos do jogo.
    perMessageDeflate: false,
    httpCompression: false,

    // Mantém conexões mais tolerantes a oscilações de rede.
    pingInterval: 10000,
    pingTimeout: 20000,

    // Limite de pacote recebido pelo Socket.IO.
    maxHttpBufferSize: 1e6,
  });

  /**
   * Middlewares HTTP.
   */
  app.disable('x-powered-by');

  app.use(
    express.json({
      limit: JSON_LIMIT,
    }),
  );

  app.use(
    express.urlencoded({
      extended: true,
      limit: JSON_LIMIT,
    }),
  );

  /**
   * Health check.
   * Pode ser utilizado para monitorar o servidor.
   */
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      game: 'Spike Legends Online',
      environment: IS_PRODUCTION ? 'production' : 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Rotas de armazenamento de áudio.
   */
  registerAudioStorageRoutes(app);

  /**
   * Gerenciador das salas multiplayer.
   */
  const roomManager = new RoomManager(io);

  io.on('connection', (socket) => {
    if (isShuttingDown) {
      socket.disconnect(true);
      return;
    }

    console.log(`[Socket.IO] Jogador conectado: ${socket.id}`);

    try {
      roomManager.handleConnection(socket);
    } catch (error) {
      console.error(
        `[Socket.IO] Erro ao inicializar jogador ${socket.id}:`,
        error,
      );

      socket.disconnect(true);
    }

    socket.on('disconnect', (reason) => {
      console.log(
        `[Socket.IO] Jogador desconectado: ${socket.id} | Motivo: ${reason}`,
      );
    });

    socket.on('error', (error) => {
      console.error(`[Socket.IO] Erro no socket ${socket.id}:`, error);
    });
  });

  /**
   * Configuração de arquivos e frontend.
   */
  if (IS_PRODUCTION) {
    const distDir = path.resolve(__dirname, 'dist');

    app.use(
      express.static(distDir, {
        index: false,
        fallthrough: true,
        maxAge: '1d',
      }),
    );

    /**
     * Fallback SPA compatível com Express 4 e 5.
     * Não intercepta requisições de API ou Socket.IO.
     */
    app.use((req, res, next) => {
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/socket.io/')
      ) {
        return next();
      }

      res.sendFile(
        path.join(distDir, 'index.html'),
        (error) => {
          if (error) {
            next(error);
          }
        },
      );
    });
  } else {
    /**
     * Vite em modo middleware durante o desenvolvimento.
     */
    const { createServer: createViteServer } = await import('vite');

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });

    viteClose = () => vite.close();

    app.use(vite.middlewares);
  }

  /**
   * Rota não encontrada.
   */
  app.use((_req, res) => {
    res.status(404).json({
      error: 'Rota não encontrada.',
    });
  });

  /**
   * Tratamento centralizado de erros HTTP.
   */
  app.use(
    (
      error: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[Express] Erro:', error);

      if (res.headersSent) {
        return;
      }

      const statusCode =
        typeof error.status === 'number' &&
        error.status >= 400 &&
        error.status < 600
          ? error.status
          : 500;

      res.status(statusCode).json({
        error:
          IS_PRODUCTION && statusCode === 500
            ? 'Erro interno do servidor.'
            : error.message,
      });
    },
  );

  /**
   * Inicialização HTTP.
   */
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };

    httpServer!.once('error', onError);

    httpServer!.listen(PORT, HOST, () => {
      httpServer!.off('error', onError);
      resolve();
    });
  });

  console.log('');
  console.log('========================================');
  console.log('  SPIKE LEGENDS ONLINE');
  console.log('========================================');
  console.log(`  Servidor: http://${HOST}:${PORT}`);
  console.log(`  Ambiente: ${IS_PRODUCTION ? 'Produção' : 'Desenvolvimento'}`);
  console.log('  Multiplayer: Socket.IO ativo');
  console.log('  Transporte: WebSocket / Polling');
  console.log('  Compressão de pacotes: desativada');
  console.log('========================================');
  console.log('');
}

/**
 * Encerramento seguro.
 */
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`\n[Servidor] Sinal ${signal} recebido. Encerrando...`);

  try {
    // Fecha o Vite, se estiver em desenvolvimento.
    if (viteClose) {
      await viteClose();
      console.log('[Servidor] Vite encerrado.');
    }

    // io.close também encerra o servidor HTTP associado.
    if (io) {
      await new Promise<void>((resolve) => {
        io!.close(() => resolve());
      });

      console.log('[Servidor] Socket.IO encerrado.');
    } else if (httpServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    console.log('[Servidor] Encerramento concluído.');
    process.exit(0);
  } catch (error) {
    console.error('[Servidor] Erro durante encerramento:', error);
    process.exit(1);
  }
}

/**
 * Sinais do sistema operacional.
 */
process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

/**
 * Inicialização e tratamento de falhas.
 */
bootstrapServer().catch(async (error) => {
  console.error('[Servidor] Falha na inicialização:', error);

  if (viteClose) {
    try {
      await viteClose();
    } catch (closeError) {
      console.error('[Servidor] Erro ao fechar Vite:', closeError);
    }
  }

  if (io) {
    try {
      await new Promise<void>((resolve) => {
        io!.close(() => resolve());
      });
    } catch (closeError) {
      console.error('[Servidor] Erro ao fechar Socket.IO:', closeError);
    }
  }

  process.exit(1);
});
