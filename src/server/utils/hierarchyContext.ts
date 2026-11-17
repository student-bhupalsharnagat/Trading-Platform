import { db } from '../db/database.ts';

export interface HierarchyContext {
  tenantId: string;
  masterId: string | null;
  brokerId: string | null;
  subBrokerId: string | null;
}

/**
 * Resolves authoritative 4-tier hierarchy context (tenantId, masterId, brokerId, subBrokerId)
 * for any event payload so Admin and User panels can filter real-time WS/SSE events cleanly.
 */
export function resolveHierarchyContext(
  tenantId: string,
  entity: Record<string, any> | null | undefined
): HierarchyContext {
  const resolvedTenant =
    tenantId ||
    entity?.tenantId ||
    entity?.tenant_id ||
    'vertex-default';

  if (!entity || typeof entity !== 'object') {
    return {
      tenantId: resolvedTenant,
      masterId: null,
      brokerId: null,
      subBrokerId: null,
    };
  }

  let masterId: string | null =
    entity.masterId ?? entity.master_id ?? entity.cm_master_id ?? null;
  let brokerId: string | null =
    entity.brokerId ?? entity.broker_id ?? entity.cm_broker_id ?? null;
  let subBrokerId: string | null =
    entity.subBrokerId ?? entity.sub_broker_id ?? entity.cm_sub_broker_id ?? null;

  const explicitRole = String(entity.role || '').toUpperCase();
  const explicitType = String(entity.type || '').toLowerCase();

  // Preserve exact hierarchy level for non-client nodes (Master, Broker, Sub-Broker)
  if (explicitRole === 'MASTER' || explicitType === 'master') {
    return {
      tenantId: resolvedTenant,
      masterId: masterId || entity.id || entity.userId || null,
      brokerId,
      subBrokerId,
    };
  }

  if (explicitRole === 'BROKER' || explicitType === 'broker') {
    return {
      tenantId: resolvedTenant,
      masterId: masterId || entity.parentId || entity.parent_id || null,
      brokerId: brokerId || entity.id || entity.userId || null,
      subBrokerId,
    };
  }

  if (explicitRole === 'SUB_BROKER' || explicitType === 'sub_broker' || explicitType === 'subbroker') {
    const resolvedBrokerId = brokerId || entity.parentId || entity.parent_id || null;
    if (!masterId && resolvedBrokerId) {
      const parentBroker = db.findUserById(resolvedBrokerId) || db.findUserByUserId(resolvedBrokerId);
      if (parentBroker?.parent_id) {
        masterId = parentBroker.parent_id;
      }
    }
    return {
      tenantId: resolvedTenant,
      masterId,
      brokerId: resolvedBrokerId,
      subBrokerId: subBrokerId || entity.id || entity.userId || null,
    };
  }

  const uid =
    entity.userId ||
    entity.user_id ||
    entity.tradingUserId ||
    entity.trading_user_id ||
    entity.clientId ||
    entity.client_id;

  const user = uid ? db.findUserByUserId(uid) || db.findUserById(uid) : null;

  if (user) {
    if (!brokerId && user.broker_id) brokerId = user.broker_id;
    if (!subBrokerId && (user as any).sub_broker_id) subBrokerId = (user as any).sub_broker_id;
    if (!masterId && (user as any).master_id) masterId = (user as any).master_id;

    if (user.parent_id && (!masterId || !brokerId || !subBrokerId)) {
      const parent = db.findUserById(user.parent_id) || db.findUserByUserId(user.parent_id);
      if (parent) {
        if (parent.role === 'SUB_BROKER') {
          if (!subBrokerId) subBrokerId = parent.id;
          if (parent.parent_id) {
            const broker = db.findUserById(parent.parent_id) || db.findUserByUserId(parent.parent_id);
            if (broker) {
              if (!brokerId) brokerId = broker.id;
              if (!masterId && broker.parent_id) masterId = broker.parent_id;
            }
          }
        } else if (parent.role === 'BROKER') {
          if (!brokerId) brokerId = parent.id;
          if (!masterId && parent.parent_id) masterId = parent.parent_id;
        } else if (parent.role === 'MASTER') {
          if (!masterId) masterId = parent.id;
        }
      }
    }

    const hierarchyPath = user.hierarchy_path || entity.hierarchy_path || entity.hierarchyPath || '';
    if (hierarchyPath && hierarchyPath.startsWith('root.')) {
      const parts = hierarchyPath.split('.');
      if (!masterId && parts.length >= 2 && parts[1] !== user.user_id) {
        const mNode = db.findUserByUserId(parts[1]) || db.findUserById(parts[1]);
        masterId = mNode?.id || parts[1];
      }
      if (!brokerId && parts.length >= 3 && parts[2] !== user.user_id) {
        const bNode = db.findUserByUserId(parts[2]) || db.findUserById(parts[2]);
        brokerId = bNode?.id || parts[2];
      }
      if (!subBrokerId && parts.length >= 4 && parts[3] !== user.user_id) {
        const sbNode = db.findUserByUserId(parts[3]) || db.findUserById(parts[3]);
        subBrokerId = sbNode?.id || parts[3];
      }
    }
  }

  if (!masterId && !brokerId && !subBrokerId && uid) {
    masterId = 'master-node-0001';
    brokerId = 'BRK-001';
  }

  return {
    tenantId: resolvedTenant,
    masterId,
    brokerId,
    subBrokerId,
  };
}

/**
 * Non-destructively attaches tenantId, masterId, brokerId, and subBrokerId to an event payload.
 */
export function enrichPayloadWithHierarchy<T>(
  tenantId: string,
  payload: T
): T & HierarchyContext {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload as T & HierarchyContext;
  }
  const ctx = resolveHierarchyContext(tenantId, payload as Record<string, any>);
  return {
    ...payload,
    tenantId: (payload as any).tenantId || ctx.tenantId,
    masterId: (payload as any).masterId ?? ctx.masterId,
    brokerId: (payload as any).brokerId ?? ctx.brokerId,
    subBrokerId: (payload as any).subBrokerId ?? ctx.subBrokerId,
  };
}
