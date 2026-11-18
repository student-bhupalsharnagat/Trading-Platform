import { pgDb, DbClient } from '../db/postgres.ts';
import {
  postgresManualDepositRepository,
  ManualDepositRecord,
  PaymentSettingsRecord,
} from '../repositories/trading/PostgresManualDepositRepository.ts';
import { postgresWalletRepository } from '../repositories/trading/PostgresWalletRepository.ts';
import { postgresLedgerRepository } from '../repositories/trading/PostgresLedgerRepository.ts';
import { db } from '../db/database.ts';
import { auditService } from './auditService.ts';
import { transactionalOutboxService } from './TransactionalOutboxService.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { internalEventDispatcher } from '../events/InternalEventDispatcher.ts';
import { getTenantWallet, getTenantNotifications } from '../trading/tradingStore.ts';

export class ManualDepositService {
  /**
   * Fetch configured Bank / QR details for user deposit page
   */
  public async getPaymentDetails(tenantId = 'vertex-default'): Promise<PaymentSettingsRecord> {
    return postgresManualDepositRepository.getPaymentSettings(tenantId);
  }

  /**
   * Update Admin Bank & QR details
   */
  public async updatePaymentSettings(
    tenantId = 'vertex-default',
    adminUser: any,
    settings: Partial<PaymentSettingsRecord>
  ): Promise<PaymentSettingsRecord> {
    const updated = await postgresManualDepositRepository.updatePaymentSettings(tenantId, settings);

    auditService.log({
      actorId: adminUser?.id || adminUser?.userId || 'ADMIN',
      actorName: adminUser?.fullName || adminUser?.full_name || 'Administrator',
      actorRole: adminUser?.role || 'SUPER_ADMIN',
      action: 'UPDATE_PAYMENT_SETTINGS',
      module: 'FUNDS',
      targetId: tenantId,
      targetName: 'Payment Settings',
      newValue: {
        bankName: updated.bank_name,
        accountNumber: updated.account_number,
        ifscCode: updated.ifsc_code,
        upiId: updated.upi_id,
        hasQrCode: Boolean(updated.qr_code_url),
      },
    });

    return updated;
  }

  /**
   * User submits a new manual deposit request (Bank Transfer / QR Code with UTR)
   */
  public async submitManualRequest(
    tenantId = 'vertex-default',
    user: any,
    data: {
      amount: number | string;
      utr_number: string;
      payment_method?: string;
      proof_image?: string | null;
      proof_image_url?: string | null;
    }
  ): Promise<ManualDepositRecord> {
    // 1. Validate Amount
    const numAmount = Number(data.amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      const err = new Error('Deposit amount must be a positive number greater than 0');
      (err as any).statusCode = 400;
      throw err;
    }

    if (numAmount < 100) {
      const err = new Error('Minimum deposit amount is ₹100');
      (err as any).statusCode = 400;
      throw err;
    }

    // 2. Sanitize & Validate UTR Number
    if (!data.utr_number || typeof data.utr_number !== 'string') {
      const err = new Error('Transaction ID / UTR number is required');
      (err as any).statusCode = 400;
      throw err;
    }

    // Sanitize string (strip HTML/scripts and special unsafe characters)
    const sanitizedUtr = data.utr_number
      .replace(/<[^>]*>?/gm, '')
      .replace(/[^\w\s-]/gi, '')
      .trim();

    if (sanitizedUtr.length < 4 || sanitizedUtr.length > 64) {
      const err = new Error('Transaction ID / UTR must be between 4 and 64 alphanumeric characters');
      (err as any).statusCode = 400;
      throw err;
    }

    // 3. Idempotency Check: Prevent duplicate UTR submissions
    const existingUtr = await postgresManualDepositRepository.getByUtr(sanitizedUtr);
    if (existingUtr) {
      const err = new Error(
        `A deposit request with Transaction ID / UTR "${sanitizedUtr}" has already been submitted (Status: ${existingUtr.status}). Please check your records.`
      );
      (err as any).statusCode = 409;
      (err as any).code = 'DUPLICATE_UTR';
      throw err;
    }

    // 4. Validate Proof Image (PNG, JPG, WEBP only, max 5MB)
    const rawProof = data.proof_image || data.proof_image_url;
    let proofImageUrl: string | null = null;

    if (rawProof && typeof rawProof === 'string') {
      const trimmedProof = rawProof.trim();
      if (trimmedProof.startsWith('data:image/')) {
        // Base64 Data URI validation
        const match = trimmedProof.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
        if (!match) {
          const err = new Error('Invalid image format. Only PNG, JPG, JPEG, and WEBP formats are accepted');
          (err as any).statusCode = 400;
          throw err;
        }

        const base64Data = match[2];
        const approxSizeBytes = (base64Data.length * 3) / 4;
        const maxSizeBytes = 5 * 1024 * 1024; // 5MB

        if (approxSizeBytes > maxSizeBytes) {
          const err = new Error('Proof image exceeds the maximum allowed file size of 5MB');
          (err as any).statusCode = 400;
          throw err;
        }

        proofImageUrl = trimmedProof;
      } else if (trimmedProof.startsWith('http://') || trimmedProof.startsWith('https://')) {
        proofImageUrl = trimmedProof;
      } else {
        const err = new Error('Invalid image proof. Please provide a valid image file or URL');
        (err as any).statusCode = 400;
        throw err;
      }
    }

    // 5. Payment method normalization
    const allowedMethods = ['BANK_TRANSFER', 'QR_CODE', 'IMPS', 'NEFT', 'RTGS', 'UPI'];
    let cleanMethod = (data.payment_method || 'BANK_TRANSFER').toUpperCase().trim();
    if (!allowedMethods.includes(cleanMethod)) {
      cleanMethod = 'BANK_TRANSFER';
    }

    // 6. Create Record
    const userId = user.userId || user.user_id || user.id;
    const userName = user.fullName || user.full_name || userId;
    const userMobile = user.mobile || user.phone || '';

    const newRequest = await postgresManualDepositRepository.create({
      tenant_id: tenantId,
      user_id: userId,
      user_name: userName,
      user_mobile: userMobile,
      amount: numAmount,
      utr_number: sanitizedUtr,
      payment_method: cleanMethod,
      proof_image_url: proofImageUrl,
    });

    const hierarchy = internalEventDispatcher.resolveHierarchyContext({ userId });
    const outboxPayload = {
      id: newRequest.id,
      depositId: newRequest.id,
      transactionId: newRequest.id,
      clientCode: (userId || '').toUpperCase(),
      tenantId,
      masterId: hierarchy.masterId,
      brokerId: hierarchy.brokerId,
      subBrokerId: hierarchy.subBrokerId,
      userId,
      clientId: userId,
      tradingUserId: userId,
      userName,
      amount: numAmount,
      type: 'DEPOSIT' as const,
      status: 'PENDING' as const,
      method: cleanMethod,
      paymentMethod: cleanMethod,
      reference: sanitizedUtr,
      referenceId: sanitizedUtr,
      utr: sanitizedUtr,
      utr_number: sanitizedUtr,
      payment_method: cleanMethod,
      proof_image_url: proofImageUrl,
      createdAt: newRequest.created_at,
      timestamp: new Date().toISOString(),
    };

    // 7. Real-time Notification (/ws + SSE)
    try {
      tradingWebSocketServer.broadcastToTenant(
        tenantId,
        'manual_deposit.created',
        outboxPayload,
        (client) => ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(client.role)
      );
      internalEventDispatcher.broadcastRealtimeEvent(
        'fund.transaction_updated',
        tenantId,
        outboxPayload,
        { targetUserId: userId }
      );
    } catch {}

    // 8. Outbound S2S Transactional Outbox Event (deposit.created / manual_deposit.created)
    try {
      await transactionalOutboxService.enqueue({
        eventId: `evt-deposit-${newRequest.id}`,
        eventType: 'deposit.created',
        tenantId,
        payload: outboxPayload,
      });

      await transactionalOutboxService.enqueue({
        eventId: `evt-manual-dep-${newRequest.id}`,
        eventType: 'manual_deposit.created',
        tenantId,
        payload: outboxPayload,
      }).catch(() => {});
    } catch (outboxErr) {
      console.warn('[ManualDeposit] Outbox enqueue notice:', outboxErr);
    }

    return newRequest;
  }

  /**
   * Fetch authenticated user's manual deposit requests
   */
  public async getUserRequests(tenantId: string, userId: string): Promise<ManualDepositRecord[]> {
    return postgresManualDepositRepository.getByUser(tenantId, userId);
  }

  /**
   * Admin: List all manual deposit requests with filtering, pagination, and search
   */
  public async getAdminRequests(
    tenantId: string,
    filters: {
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ requests: ManualDepositRecord[]; total: number; pendingCount: number }> {
    return postgresManualDepositRepository.getAll(tenantId, filters);
  }

  /**
   * Admin: Atomically approve a deposit request with SQL transaction & row locks
   */
  public async approveRequest(
    tenantId = 'vertex-default',
    requestId: string,
    adminUser: any
  ): Promise<ManualDepositRecord> {
    // Normalize parameters if transposed: approveRequest(txId, adminUser, tenantId)
    let actualTenant = tenantId;
    let actualReqId = requestId;
    let actualAdmin = adminUser;
    if (typeof requestId === 'object' || (!actualAdmin && typeof requestId === 'string')) {
      actualReqId = tenantId;
      actualAdmin = requestId;
      actualTenant = typeof adminUser === 'string' ? adminUser : 'vertex-default';
    }

    const adminId = actualAdmin?.userId || actualAdmin?.id || (typeof actualAdmin === 'string' ? actualAdmin : 'ADMIN');
    const adminName = actualAdmin?.fullName || actualAdmin?.full_name || 'Administrator';
    const adminRole = actualAdmin?.role || 'SUPER_ADMIN';
    let balanceBefore = 0;
    let balanceAfter = 0;

    // Atomic execution inside database transaction
    const approvedRequest = await pgDb.transaction(async (client: DbClient) => {
      // 1. Lock the request row FOR UPDATE to prevent race condition or double approval
      const request = await postgresManualDepositRepository.lockByIdForUpdate(actualReqId, client);
      if (!request) {
        const err = new Error(`Deposit request with ID "${actualReqId}" not found`);
        (err as any).statusCode = 404;
        throw err;
      }

      if (request.status !== 'PENDING') {
        const err = new Error(
          `Deposit request "${actualReqId}" has already been processed with status "${request.status}" by ${request.approved_by || 'system'}`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      const depositAmount = Number(request.amount);
      const reqTenant = request.tenant_id || actualTenant;

      // 2. Lock the user's trading wallet row FOR UPDATE
      const wallet = await postgresWalletRepository.lockWalletForUpdate(reqTenant, request.user_id, client);
      balanceBefore = Number(wallet.available_balance || 0);
      balanceAfter = Number((balanceBefore + depositAmount).toFixed(4));

      // 3. Atomically credit the wallet balance
      await postgresWalletRepository.updateWallet(
        reqTenant,
        request.user_id,
        {
          available_balance: balanceAfter,
        },
        client
      );

      // 4. Update users table in PostgreSQL
      await client.query(
        `UPDATE users 
         SET demo_balance = COALESCE(demo_balance, 0) + $1, updated_at = NOW() 
         WHERE user_id = $2 OR id::text = $2;`,
        [depositAmount, request.user_id]
      );

      // 5. Insert audit ledger entry
      await postgresLedgerRepository.createEntry(
        {
          tenant_id: reqTenant,
          user_id: request.user_id,
          transaction_id: request.id,
          type: 'CREDIT',
          category: 'DEPOSIT',
          amount: depositAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `Manual Deposit Approved - UTR: ${request.utr_number} (${request.payment_method})`,
          created_by: adminId,
        },
        client
      );

      // 6. Update manual_deposit_requests status to APPROVED
      const updated = await postgresManualDepositRepository.updateStatus(
        requestId,
        'APPROVED',
        adminId,
        null,
        client
      );

      return updated;
    });

    // Post-transaction synchronization & notifications
    try {
      // Sync in-memory user record
      const inMemUser = db.findUserByUserId(approvedRequest.user_id) || db.findUserById(approvedRequest.user_id);
      if (inMemUser) {
        inMemUser.demo_balance = (inMemUser.demo_balance || 0) + Number(approvedRequest.amount);
        db.updateUser(inMemUser.id, { demo_balance: inMemUser.demo_balance });
      }

      // Sync in-memory tenant wallet
      const inMemWallet = getTenantWallet(approvedRequest.tenant_id || tenantId);
      if (inMemWallet) {
        inMemWallet.availableBalance += Number(approvedRequest.amount);
        inMemWallet.deposited += Number(approvedRequest.amount);
      }

      // Add user notification
      const notifs = getTenantNotifications(approvedRequest.tenant_id || tenantId);
      notifs.unshift({
        id: `NOTIF-${Date.now()}`,
        title: 'Deposit Approved & Credited',
        message: `₹${Number(approvedRequest.amount).toLocaleString('en-IN')} has been verified and credited to your trading balance (UTR: ${approvedRequest.utr_number}).`,
        type: 'SYSTEM',
        time: 'Just now',
        read: false,
      });

      // Audit log entry
      auditService.log({
        actorId: adminId,
        actorName: adminName,
        actorRole: adminRole,
        action: 'APPROVE_MANUAL_DEPOSIT',
        module: 'FUNDS',
        targetId: approvedRequest.user_id,
        targetName: approvedRequest.user_name || approvedRequest.user_id,
        oldValue: { status: 'PENDING' },
        newValue: {
          status: 'APPROVED',
          amount: approvedRequest.amount,
          utr: approvedRequest.utr_number,
          depositId: approvedRequest.id,
        },
      });

      // Real-time WebSocket & SSE broadcasts
      const effectiveTenant = approvedRequest.tenant_id || actualTenant;
      const hierarchy = internalEventDispatcher.resolveHierarchyContext({ userId: approvedRequest.user_id });
      const nowIso = new Date().toISOString();
      const payload = {
        id: approvedRequest.id,
        depositId: approvedRequest.id,
        transactionId: approvedRequest.id,
        tenantId: effectiveTenant,
        masterId: hierarchy.masterId,
        brokerId: hierarchy.brokerId,
        subBrokerId: hierarchy.subBrokerId,
        userId: approvedRequest.user_id,
        clientId: approvedRequest.user_id,
        tradingUserId: approvedRequest.user_id,
        userName: approvedRequest.user_name,
        amount: Number(approvedRequest.amount),
        type: 'DEPOSIT' as const,
        method: approvedRequest.payment_method,
        paymentMethod: approvedRequest.payment_method,
        reference: approvedRequest.utr_number,
        utr: approvedRequest.utr_number,
        status: 'APPROVED' as const,
        balanceBefore,
        balanceAfter,
        approvedBy: adminId,
        createdAt: approvedRequest.created_at,
        timestamp: nowIso,
      };

      tradingWebSocketServer.broadcastToTenant(
        effectiveTenant,
        'manual_deposit.approved',
        payload,
        (client) =>
          client.userId === approvedRequest.user_id ||
          ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(client.role)
      );

      tradingWebSocketServer.broadcastToTenant(
        effectiveTenant,
        'wallet.updated',
        {
          tenantId: effectiveTenant,
          masterId: hierarchy.masterId,
          brokerId: hierarchy.brokerId,
          subBrokerId: hierarchy.subBrokerId,
          userId: approvedRequest.user_id,
          availableBalance: balanceAfter,
          available_balance: balanceAfter,
          amountCredited: Number(approvedRequest.amount),
          timestamp: nowIso,
        },
        (client) =>
          client.userId === approvedRequest.user_id ||
          ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(client.role)
      );

      // Emit fund.transaction_updated + ledger.updated over /ws, SSE, and Outbox
      internalEventDispatcher.dispatchFundTransaction('deposit.approved', payload).catch((e) =>
        console.warn('[ManualDeposit] fund.transaction_updated dispatch warning:', e)
      );

      internalEventDispatcher.dispatchLedgerUpdated({
        tenantId: effectiveTenant,
        entryId: `ledger-${approvedRequest.id}`,
        transactionId: approvedRequest.id,
        userId: approvedRequest.user_id,
        clientId: approvedRequest.user_id,
        type: 'CREDIT',
        category: 'DEPOSIT',
        amount: Number(approvedRequest.amount),
        balanceBefore,
        balanceAfter,
        reference: `Manual Deposit Approved - UTR: ${approvedRequest.utr_number}`,
        createdBy: adminId,
        masterId: hierarchy.masterId,
        brokerId: hierarchy.brokerId,
        subBrokerId: hierarchy.subBrokerId,
        updatedAt: nowIso,
      }).catch((e) => console.warn('[ManualDeposit] ledger.updated dispatch warning:', e));
    } catch (postSyncErr) {
      console.warn('[ManualDeposit] Notice during post-approval notification:', postSyncErr);
    }

    return approvedRequest;
  }

  /**
   * Admin: Reject a deposit request with reason (no wallet balance changes)
   */
  public async rejectRequest(
    tenantId = 'vertex-default',
    requestId: string,
    adminUser: any,
    reason?: string
  ): Promise<ManualDepositRecord> {
    // Normalize parameters if transposed: rejectRequest(txId, adminUser, reason)
    let actualTenant = tenantId;
    let actualReqId = requestId;
    let actualAdmin = adminUser;
    let actualReason = reason;
    if (typeof requestId === 'object' || (!actualAdmin && typeof requestId === 'string')) {
      actualReqId = tenantId;
      actualAdmin = requestId;
      actualReason = typeof adminUser === 'string' ? adminUser : reason;
      actualTenant = 'vertex-default';
    }

    const adminId = actualAdmin?.userId || actualAdmin?.id || (typeof actualAdmin === 'string' ? actualAdmin : 'ADMIN');
    const adminName = actualAdmin?.fullName || actualAdmin?.full_name || 'Administrator';
    const adminRole = actualAdmin?.role || 'SUPER_ADMIN';

    const rejectedRequest = await pgDb.transaction(async (client: DbClient) => {
      // 1. Lock the request row FOR UPDATE
      const request = await postgresManualDepositRepository.lockByIdForUpdate(actualReqId, client);
      if (!request) {
        const err = new Error(`Deposit request with ID "${actualReqId}" not found`);
        (err as any).statusCode = 404;
        throw err;
      }

      if (request.status !== 'PENDING') {
        const err = new Error(
          `Deposit request "${actualReqId}" has already been processed with status "${request.status}"`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      // 2. Update status to REJECTED with rejection reason (wallet remains unchanged)
      const cleanReason = (actualReason || 'Transaction could not be verified on bank records').trim();
      const updated = await postgresManualDepositRepository.updateStatus(
        actualReqId,
        'REJECTED',
        adminId,
        cleanReason,
        client
      );

      return updated;
    });

    // Post-transaction notifications & audit
    try {
      const notifs = getTenantNotifications(rejectedRequest.tenant_id || actualTenant);
      notifs.unshift({
        id: `NOTIF-${Date.now()}`,
        title: 'Deposit Request Rejected',
        message: `Your deposit request for ₹${Number(rejectedRequest.amount).toLocaleString('en-IN')} (UTR: ${rejectedRequest.utr_number}) was rejected: ${rejectedRequest.rejection_reason}`,
        type: 'SYSTEM',
        time: 'Just now',
        read: false,
      });

      auditService.log({
        actorId: adminId,
        actorName: adminName,
        actorRole: adminRole,
        action: 'REJECT_MANUAL_DEPOSIT',
        module: 'FUNDS',
        targetId: rejectedRequest.user_id,
        targetName: rejectedRequest.user_name || rejectedRequest.user_id,
        oldValue: { status: 'PENDING' },
        newValue: {
          status: 'REJECTED',
          reason: rejectedRequest.rejection_reason,
          utr: rejectedRequest.utr_number,
          depositId: rejectedRequest.id,
        },
      });

      const effectiveTenant = rejectedRequest.tenant_id || actualTenant;
      const hierarchy = internalEventDispatcher.resolveHierarchyContext({ userId: rejectedRequest.user_id });
      const nowIso = new Date().toISOString();
      const payload = {
        id: rejectedRequest.id,
        depositId: rejectedRequest.id,
        transactionId: rejectedRequest.id,
        tenantId: effectiveTenant,
        masterId: hierarchy.masterId,
        brokerId: hierarchy.brokerId,
        subBrokerId: hierarchy.subBrokerId,
        userId: rejectedRequest.user_id,
        clientId: rejectedRequest.user_id,
        tradingUserId: rejectedRequest.user_id,
        userName: rejectedRequest.user_name,
        amount: Number(rejectedRequest.amount),
        type: 'DEPOSIT' as const,
        method: rejectedRequest.payment_method,
        paymentMethod: rejectedRequest.payment_method,
        reference: rejectedRequest.utr_number,
        utr: rejectedRequest.utr_number,
        status: 'REJECTED' as const,
        reason: rejectedRequest.rejection_reason || undefined,
        rejectedBy: adminId,
        createdAt: rejectedRequest.created_at,
        timestamp: nowIso,
      };

      tradingWebSocketServer.broadcastToTenant(
        effectiveTenant,
        'manual_deposit.rejected',
        payload,
        (client) =>
          client.userId === rejectedRequest.user_id ||
          ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(client.role)
      );

      internalEventDispatcher.dispatchFundTransaction('deposit.rejected', payload).catch((e) =>
        console.warn('[ManualDeposit] fund.transaction_updated rejection dispatch warning:', e)
      );
    } catch (notifErr) {
      console.warn('[ManualDeposit] Notice during post-rejection notification:', notifErr);
    }

    return rejectedRequest;
  }
}

export const manualDepositService = new ManualDepositService();
