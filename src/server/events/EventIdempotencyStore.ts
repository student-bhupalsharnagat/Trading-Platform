/**
 * Central Admin Event Idempotency Store
 *
 * Ensures that duplicate delivery of events (e.g. on network retries)
 * does not result in duplicated downstream processing.
 */

export interface ProcessedEventRecord {
  eventId: string;
  eventType: string;
  tenantId: string;
  processedAt: string;
}

export class EventIdempotencyStore {
  private processedEvents = new Map<string, ProcessedEventRecord>();
  private readonly maxRecords: number;

  constructor(maxRecords = 10000) {
    this.maxRecords = maxRecords;
  }

  public has(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  public get(eventId: string): ProcessedEventRecord | undefined {
    return this.processedEvents.get(eventId);
  }

  public record(eventId: string, eventType: string, tenantId: string): void {
    if (this.processedEvents.size >= this.maxRecords) {
      // Evict oldest entry
      const firstKey = this.processedEvents.keys().next().value;
      if (firstKey) {
        this.processedEvents.delete(firstKey);
      }
    }

    this.processedEvents.set(eventId, {
      eventId,
      eventType,
      tenantId,
      processedAt: new Date().toISOString(),
    });
  }

  public clear(): void {
    this.processedEvents.clear();
  }

  public size(): number {
    return this.processedEvents.size;
  }
}

export const eventIdempotencyStore = new EventIdempotencyStore();
