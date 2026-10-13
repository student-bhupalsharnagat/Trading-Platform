import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';

export interface AdminRealtimeContextType {
  isConnected: boolean;
  eventCount: number;
  lastEvent: { event: string; payload: any; timestamp: string } | null;
  subscribe: (event: string, callback: (payload: any) => void) => () => void;
}

const AdminRealtimeContext = createContext<AdminRealtimeContextType | undefined>(undefined);

export const AdminRealtimeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<{ event: string; payload: any; timestamp: string } | null>(null);

  const listenersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());
  const processedEventsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  const subscribe = (event: string, callback: (payload: any) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);

    return () => {
      listenersRef.current.get(event)?.delete(callback);
    };
  };

  useEffect(() => {
    // Only connect if user is authenticated and has admin privileges
    if (!user || user.role === 'CLIENT') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isMounted = true;
    let reconnectAttempts = 0;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = localStorage.getItem('vertex_auth_token') || '';
        const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${token}` : ''}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          reconnectAttempts = 0;
        };

        ws.onmessage = (e) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(e.data);
            if (!data || !data.event) return;

            // Deduplicate incoming events
            const eventKey = `${data.event}:${data.timestamp || ''}:${JSON.stringify(data.payload?.id || data.payload?.orderId || data.payload?.userId || '')}`;
            if (processedEventsRef.current.has(eventKey)) return;

            if (processedEventsRef.current.size > 200) {
              processedEventsRef.current.clear();
            }
            if (data.event !== 'market.ticks') {
              processedEventsRef.current.add(eventKey);
            }

            setEventCount((prev) => prev + 1);
            setLastEvent({
              event: data.event,
              payload: data.payload,
              timestamp: data.timestamp || new Date().toISOString(),
            });

            // Dispatch to registered event callbacks
            const callbacks = listenersRef.current.get(data.event);
            if (callbacks) {
              callbacks.forEach((cb) => {
                try {
                  cb(data.payload);
                } catch (cbErr) {
                  console.warn(`[Admin WS] Callback error for ${data.event}:`, cbErr);
                }
              });
            }

            // Also dispatch to wildcard '*' listeners
            const wildcardCallbacks = listenersRef.current.get('*');
            if (wildcardCallbacks) {
              wildcardCallbacks.forEach((cb) => {
                try {
                  cb(data);
                } catch {}
              });
            }
          } catch (err) {
            console.warn('[Admin WS] Error parsing message:', err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setIsConnected(false);
          reconnectAttempts++;
          const delay = Math.min(10000, 1000 * Math.pow(1.5, reconnectAttempts));
          reconnectTimer = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // Closed event will trigger reconnect
        };
      } catch (err) {
        console.warn('[Admin WS] Connect error:', err);
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.id, user?.role]);

  return (
    <AdminRealtimeContext.Provider
      value={{
        isConnected,
        eventCount,
        lastEvent,
        subscribe,
      }}
    >
      {children}
    </AdminRealtimeContext.Provider>
  );
};

export const useAdminRealtime = (): AdminRealtimeContextType => {
  const context = useContext(AdminRealtimeContext);
  if (!context) {
    throw new Error('useAdminRealtime must be used within an AdminRealtimeProvider');
  }
  return context;
};
