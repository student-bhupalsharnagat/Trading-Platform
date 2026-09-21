import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { parse as parseUrl } from 'url';
import { parse as parseCookie } from 'cookie';
import { authService } from '../services/authService.ts';
import { db } from '../db/database.ts';
import { redisService } from '../redis/RedisService.ts';
import { emergencyStateCache } from '../cache/EmergencyStateCache.ts';

export interface AuthenticatedWebSocket extends WebSocket {
  isAlive: boolean;
  userId: string;
  tenantId: string;
  role: string;
  connectedAt: string;
  messageCount: number;
  lastMessageWindow: number;
}

export interface WebSocketEventMessage {
  event: string;
  tenantId: string;
  payload: any;
  timestamp: string;
}

export interface DistributedWsPayload {
  tenantId: string;
  event: string;
  payload: any;
  targetUserId?: string;
  targetRole?: string;
  senderInstanceId: string;
  timestamp: string;
}

export const WS_EVENTS_CHANNEL = 'vertex:ws:events';

export class TradingWebSocketServer {
  private wss: WSServer | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private instanceId = `inst-ws-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  private isSubscribed = false;

  // Observability & Reliability Metrics
  private activeSockets = new Set<AuthenticatedWebSocket>();
  private totalConnectionsOpened = 0;
  private totalMessagesSent = 0;
  private totalMessagesReceived = 0;

  private readonly MAX_MESSAGE_SIZE = 32 * 1024; // 32KB
  private readonly RATE_LIMIT_WINDOW_MS = 10000; // 10s
  private readonly MAX_MESSAGES_PER_WINDOW = 100;

  constructor() {
    this.setupEmergencyListener();
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public initialize(server: HttpServer): void {
    if (this.wss) return;

    this.wss = new WSServer({
      noServer: true,
      maxPayload: this.MAX_MESSAGE_SIZE,
    });

    this.setupDistributedSubscriber();

    server.on('upgrade', (req: IncomingMessage, socket, head) => {
      const { pathname } = parseUrl(req.url || '');

      // Only handle /ws or /api/ws
      if (pathname === '/ws' || pathname === '/api/ws') {
        const auth = this.authenticateRequest(req);
        if (!auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Enforce maximum concurrent connections per user to prevent exhaustion attacks
        const userConnections = Array.from(this.activeSockets).filter(
          (s) => s.userId === auth.userId && s.tenantId === auth.tenantId
        );
        if (userConnections.length >= 10) {
          // Gracefully close oldest connection
          const oldest = userConnections[0];
          oldest.close(4008, 'Max concurrent connections exceeded');
          this.activeSockets.delete(oldest);
        }

        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          const authWs = ws as AuthenticatedWebSocket;
          authWs.isAlive = true;
          authWs.userId = auth.userId;
          authWs.tenantId = auth.tenantId;
          authWs.role = auth.role;
          authWs.connectedAt = new Date().toISOString();
          authWs.messageCount = 0;
          authWs.lastMessageWindow = Date.now();

          this.wss!.emit('connection', authWs, req);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const authWs = ws as AuthenticatedWebSocket;
      this.activeSockets.add(authWs);
      this.totalConnectionsOpened++;

      authWs.isAlive = true;
      authWs.on('pong', () => {
        authWs.isAlive = true;
      });

      // Send initial welcome/connected frame
      this.sendToSocket(authWs, {
        event: 'connection.ready',
        tenantId: authWs.tenantId,
        payload: {
          userId: authWs.userId,
          tenantId: authWs.tenantId,
          role: authWs.role,
          instanceId: this.instanceId,
        },
        timestamp: new Date().toISOString(),
      });
      this.sendToSocket(authWs, {
        event: 'connection.established',
        tenantId: authWs.tenantId,
        payload: {
          userId: authWs.userId,
          tenantId: authWs.tenantId,
          role: authWs.role,
          instanceId: this.instanceId,
        },
        timestamp: new Date().toISOString(),
      });

      authWs.on('message', (data: any) => {
        this.totalMessagesReceived++;

        // Rate limiting check
        const now = Date.now();
        if (now - authWs.lastMessageWindow > this.RATE_LIMIT_WINDOW_MS) {
          authWs.lastMessageWindow = now;
          authWs.messageCount = 0;
        }
        authWs.messageCount++;

        if (authWs.messageCount > this.MAX_MESSAGES_PER_WINDOW) {
          this.sendToSocket(authWs, {
            event: 'error',
            tenantId: authWs.tenantId,
            payload: { message: 'Rate limit exceeded. Too many messages.' },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        try {
          const text = data.toString();
          if (text.length > this.MAX_MESSAGE_SIZE) {
            authWs.close(1009, 'Message too large');
            return;
          }
          const parsed = JSON.parse(text);
          if (parsed.type === 'ping') {
            this.sendToSocket(authWs, {
              event: 'pong',
              tenantId: authWs.tenantId,
              payload: { clientTimestamp: parsed.timestamp, serverTimestamp: Date.now() },
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          // Ignore malformed text
        }
      });

      authWs.on('close', () => {
        this.activeSockets.delete(authWs);
      });

      authWs.on('error', (err) => {
        console.error('[WebSocket] Client error:', err.message);
        this.activeSockets.delete(authWs);
      });
    });

    // Heartbeat ping interval
    this.pingInterval = setInterval(() => {
      this.performHeartbeat();
    }, 30000);

    console.log('[WebSocket] Distributed Real-time Trading WebSocket Server initialized on /ws');
  }

  /**
   * Pings all active sockets; terminates unresponsive clients.
   */
  public performHeartbeat(): void {
    if (!this.wss) return;
    this.wss.clients.forEach((ws: WebSocket) => {
      const authWs = ws as AuthenticatedWebSocket;
      if (!authWs.isAlive) {
        this.activeSockets.delete(authWs);
        authWs.terminate();
        return;
      }
      authWs.isAlive = false;
      try {
        authWs.ping();
      } catch {
        this.activeSockets.delete(authWs);
      }
    });
  }

  private async setupDistributedSubscriber(): Promise<void> {
    if (this.isSubscribed) return;

    try {
      await redisService.subscribe(WS_EVENTS_CHANNEL, (channel, message) => {
        try {
          const distMsg: DistributedWsPayload = JSON.parse(message);
          if (!distMsg || distMsg.senderInstanceId === this.instanceId) {
            return; // Ignore our own broadcast echoes
          }

          // Fan out to local sockets connected to this instance
          this.broadcastToTenant(
            distMsg.tenantId,
            distMsg.event,
            distMsg.payload,
            (client) => {
              if (distMsg.targetUserId && client.userId !== distMsg.targetUserId && client.role !== 'SUPER_ADMIN') {
                return false;
              }
              if (distMsg.targetRole && client.role !== distMsg.targetRole && client.role !== 'SUPER_ADMIN') {
                return false;
              }
              return true;
            },
            true // skipRedisPublish: prevent echo cascade!
          );
        } catch (err: any) {
          console.warn('[WebSocket] Error processing distributed event:', err.message);
        }
      });
      this.isSubscribed = true;
    } catch (err: any) {
      console.warn('[WebSocket] Redis Pub/Sub subscription deferred:', err.message);
    }
  }

  private setupEmergencyListener(): void {
    emergencyStateCache.onEmergencyBroadcast((event) => {
      // If a user or broker is frozen, immediately disconnect their active WebSockets
      if (event.action === 'USER_FREEZE' && event.payload?.userId) {
        const targetUserId = event.payload.userId;
        this.activeSockets.forEach((ws) => {
          if (ws.userId === targetUserId && ws.tenantId === event.tenantId) {
            this.sendToSocket(ws, {
              event: 'security.frozen',
              tenantId: ws.tenantId,
              payload: { reason: event.payload?.reason || 'Account frozen by administrator' },
              timestamp: new Date().toISOString(),
            });
            ws.close(4003, 'Account frozen');
          }
        });
      } else if (event.action === 'TRADING_HALT') {
        this.broadcastToTenant(
          event.tenantId,
          'emergency.trading_halt',
          { reason: event.payload?.reason, halted: true },
          undefined,
          false
        );
      } else if (event.action === 'TRADING_RESUME') {
        this.broadcastToTenant(
          event.tenantId,
          'emergency.trading_resume',
          { reason: event.payload?.reason, halted: false },
          undefined,
          false
        );
      }
    });
  }

  public authenticateRequest(req: IncomingMessage): {
    userId: string;
    tenantId: string;
    role: string;
  } | null {
    try {
      const urlParsed = parseUrl(req.url || '', true);
      let token = (urlParsed.query?.token as string) || (urlParsed.query?.auth_token as string);

      if (!token && req.headers.authorization) {
        token = req.headers.authorization.replace(/^Bearer\s+/i, '');
      }

      if (!token && req.headers.cookie) {
        const cookies = parseCookie(req.headers.cookie);
        token = cookies.vertex_auth_token;
      }

      if (!token) return null;

      if (authService.isTokenRevoked(token)) return null;

      const payload = authService.verifyToken(token);
      if (!payload || !payload.id) return null;

      const user = db.findUserById(payload.id);
      if (!user || user.status === 'suspended' || user.is_frozen === true) return null;

      const tenantId = user.tenant_id || payload.tenantId || 'vertex-default';

      return {
        userId: user.user_id || user.id,
        tenantId,
        role: user.role || 'CLIENT',
      };
    } catch {
      return null;
    }
  }

  /**
   * Broadcasts an event strictly within a tenant's boundary.
   * If recipientFilter is passed, only matching sockets receive the event.
   * Also publishes to Redis Pub/Sub so all other instances in the cluster
   * deliver the event to their connected clients.
   */
  public broadcastToTenant(
    tenantId: string,
    event: string,
    payload: any,
    recipientFilter?: (client: AuthenticatedWebSocket) => boolean,
    skipRedisPublish = false,
    targetFilter?: { targetUserId?: string; targetRole?: string }
  ): number {
    let deliveredCount = 0;
    const message = JSON.stringify({
      event,
      tenantId,
      payload,
      timestamp: new Date().toISOString(),
    });

    // 1. Deliver to local sockets on this instance
    this.activeSockets.forEach((client: AuthenticatedWebSocket) => {
      if (client.readyState === WebSocket.OPEN && client.tenantId === tenantId) {
        if (!recipientFilter || recipientFilter(client)) {
          try {
            client.send(message);
            deliveredCount++;
            this.totalMessagesSent++;
          } catch {
            // Ignore send failure
          }
        }
      }
    });

    // 2. Publish to Redis Pub/Sub for cross-instance fanout
    if (!skipRedisPublish) {
      const distMsg: DistributedWsPayload = {
        tenantId,
        event,
        payload,
        targetUserId: targetFilter?.targetUserId,
        targetRole: targetFilter?.targetRole,
        senderInstanceId: this.instanceId,
        timestamp: new Date().toISOString(),
      };

      redisService.publish(WS_EVENTS_CHANNEL, distMsg).catch((err) => {
        console.warn('[WebSocket] Redis broadcast publish error:', err.message);
      });
    }

    return deliveredCount;
  }

  public sendToSocket(ws: WebSocket, message: WebSocketEventMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        this.totalMessagesSent++;
      } catch {}
    }
  }

  public getConnectedClientsCount(tenantId?: string): number {
    if (!tenantId) return this.activeSockets.size;
    let count = 0;
    this.activeSockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.tenantId === tenantId) {
        count++;
      }
    });
    return count;
  }

  public getMetrics(): {
    activeConnections: number;
    totalConnectionsOpened: number;
    totalMessagesSent: number;
    totalMessagesReceived: number;
    redisPubSubActive: boolean;
  } {
    return {
      activeConnections: this.activeSockets.size,
      totalConnectionsOpened: this.totalConnectionsOpened,
      totalMessagesSent: this.totalMessagesSent,
      totalMessagesReceived: this.totalMessagesReceived,
      redisPubSubActive: redisService.isConnected(),
    };
  }

  public close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.activeSockets.forEach((client) => {
      try {
        client.close(1001, 'Server shutting down');
      } catch {}
    });
    this.activeSockets.clear();
    if (this.wss) {
      try {
        this.wss.close();
      } catch {}
      this.wss = null;
    }
  }
}

export const tradingWebSocketServer = new TradingWebSocketServer();
