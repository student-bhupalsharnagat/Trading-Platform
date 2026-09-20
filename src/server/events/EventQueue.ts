/**
 * Local Event Queue Abstraction & In-Memory Implementation
 *
 * Responsibilities:
 * - Buffer outbound events for asynchronous delivery to Central Admin.
 * - Manage retry state with bounded exponential backoff.
 * - Transition unrecoverable events to DEAD_LETTER after max retries.
 * - Provide stats for internal health metrics.
 */

import { InternalEvent } from './types.ts';

export type EventQueueStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'DEAD_LETTER';

export interface QueuedEvent<T = any> {
  eventId: string;
  tenantId: string;
  eventType: string;
  payload: T;
  version: number;
  timestamp: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  createdAt: string;
  lastError?: string;
  status: EventQueueStatus;
}

export interface IEventQueue {
  enqueue<T = any>(event: InternalEvent<T>, maxAttempts?: number): QueuedEvent<T>;
  getPending(now?: number): QueuedEvent[];
  getDeadLetter(): QueuedEvent[];
  getEvent(eventId: string): QueuedEvent | undefined;
  markSuccess(eventId: string): void;
  markFailure(eventId: string, error: string, customDelayMs?: number): { deadLetter: boolean; event: QueuedEvent };
  size(): number;
  clear(): void;
  getStats(): {
    queueSize: number;
    pendingEvents: number;
    failedEvents: number;
    deadLetterEvents: number;
  };
}

export interface EventQueueOptions {
  defaultMaxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class MemoryEventQueue implements IEventQueue {
  private queue = new Map<string, QueuedEvent>();
  private defaultMaxAttempts: number;
  private baseDelayMs: number;
  private maxDelayMs: number;

  constructor(options: EventQueueOptions = {}) {
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
  }

  public enqueue<T = any>(event: InternalEvent<T>, maxAttempts?: number): QueuedEvent<T> {
    const existing = this.queue.get(event.eventId);
    if (existing) {
      return existing as QueuedEvent<T>;
    }

    const queued: QueuedEvent<T> = {
      eventId: event.eventId,
      tenantId: event.tenantId,
      eventType: event.eventType,
      payload: event.payload,
      version: event.version,
      timestamp: event.timestamp,
      attempts: 0,
      maxAttempts: maxAttempts ?? this.defaultMaxAttempts,
      nextAttemptAt: Date.now(), // ready immediately
      createdAt: new Date().toISOString(),
      status: 'PENDING',
    };

    this.queue.set(event.eventId, queued);
    return queued;
  }

  public getPending(now = Date.now()): QueuedEvent[] {
    const pending: QueuedEvent[] = [];
    for (const item of this.queue.values()) {
      if (item.status === 'PENDING' && item.nextAttemptAt <= now) {
        pending.push(item);
      }
    }
    return pending;
  }

  public getDeadLetter(): QueuedEvent[] {
    const deadLetters: QueuedEvent[] = [];
    for (const item of this.queue.values()) {
      if (item.status === 'DEAD_LETTER') {
        deadLetters.push(item);
      }
    }
    return deadLetters;
  }

  public getEvent(eventId: string): QueuedEvent | undefined {
    return this.queue.get(eventId);
  }

  public markSuccess(eventId: string): void {
    const item = this.queue.get(eventId);
    if (item) {
      item.status = 'COMPLETED';
      // We can remove completed events or keep for a short duration
      this.queue.delete(eventId);
    }
  }

  public markFailure(
    eventId: string,
    error: string,
    customDelayMs?: number
  ): { deadLetter: boolean; event: QueuedEvent } {
    const item = this.queue.get(eventId);
    if (!item) {
      throw new Error(`Event '${eventId}' not found in queue.`);
    }

    item.attempts += 1;
    item.lastError = error;

    if (item.attempts >= item.maxAttempts) {
      item.status = 'DEAD_LETTER';
      return { deadLetter: true, event: item };
    }

    // Bounded exponential backoff: delay = baseDelay * 2^(attempts - 1)
    const delay =
      customDelayMs !== undefined
        ? customDelayMs
        : Math.min(
            this.maxDelayMs,
            this.baseDelayMs * Math.pow(2, item.attempts - 1)
          );

    item.status = 'PENDING';
    item.nextAttemptAt = Date.now() + delay;
    return { deadLetter: false, event: item };
  }

  public size(): number {
    return this.queue.size;
  }

  public clear(): void {
    this.queue.clear();
  }

  public getStats(): {
    queueSize: number;
    pendingEvents: number;
    failedEvents: number;
    deadLetterEvents: number;
  } {
    let pending = 0;
    let failed = 0;
    let deadLetter = 0;

    for (const item of this.queue.values()) {
      if (item.status === 'PENDING') {
        pending += 1;
        if (item.attempts > 0) failed += 1;
      } else if (item.status === 'DEAD_LETTER') {
        deadLetter += 1;
        failed += 1;
      }
    }

    return {
      queueSize: this.queue.size,
      pendingEvents: pending,
      failedEvents: failed,
      deadLetterEvents: deadLetter,
    };
  }
}

export const eventQueue: IEventQueue = new MemoryEventQueue();
