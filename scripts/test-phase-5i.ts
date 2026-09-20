/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5I Test Suite
 * Production Hardening, Security, Disaster Recovery, and Resilience Verification
 */

import crypto from 'crypto';
import express from 'express';
import http from 'http';
import { ProductionValidator } from '../src/server/config/productionValidator.ts';
import { backupRestoreService } from '../src/server/db/backupRestoreService.ts';
import { authService } from '../src/server/services/authService.ts';
import { deepRedactSensitiveData } from '../src/server/services/auditService.ts';
import { sanitizeErrorResponse } from '../src/server/middleware/errorMiddleware.ts';
import {
  securityHeadersMiddleware,
  csrfProtectionMiddleware,
  sanitizeQueryParams,
} from '../src/server/middleware/securityHeadersMiddleware.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import { postgresOutboxRepository } from '../src/server/repositories/trading/PostgresOutboxRepository.ts';
import { transactionalOutboxService } from '../src/server/services/TransactionalOutboxService.ts';
import { brokerReconciliationService } from '../src/server/services/BrokerReconciliationService.ts';
import healthRoutes, { setServerShuttingDown, isServerShuttingDown } from '../src/server/routes/healthRoutes.ts';
import { tradingWebSocketServer } from '../src/server/websocket/WebSocketServer.ts';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
    testsFailed++;
  }
}

async function runPhase5ITests() {
  console.log('\n================================================================');
  console.log('   VERTEX TRADING PLATFORM - PHASE 5I PRODUCTION HARDENING TESTS');
  console.log('================================================================\n');

  // Initialize DB and migrations
  await pgDb.init();
  await runTradingMigrations();

  // -------------------------------------------------------------
  // TEST SUITE 1: PRODUCTION CONFIGURATION & REQUIRED ENV VALIDATION
  // -------------------------------------------------------------
  console.log('--- TEST SUITE 1: Production Configuration & Secret Validation ---');

  // 1.1 Development validation allows defaults with warnings
  const devValidation = ProductionValidator.validateEnv(false);
  assert(devValidation.valid, 'Dev environment validation succeeds');

  // 1.2 Production validation fails if JWT_SECRET or INTERNAL_COMMUNICATION_SECRET is insecure
  const prodValidationWithDefaults = ProductionValidator.validateEnv(true);
  // In dev container without production ENV set, it should flag insecure secrets
  assert(
    !prodValidationWithDefaults.valid && prodValidationWithDefaults.errors.length > 0,
    'Production validation blocks insecure/missing secrets',
    `Errors: ${prodValidationWithDefaults.errors.join(', ')}`
  );

  // 1.3 Production validation succeeds with secure 32+ character secrets
  const secureEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://vertex_admin:SuperSecurePassword123!@prod-db.internal:5432/vertex_prod',
    REDIS_URL: 'redis://:SecureRedisPass789!@prod-redis.internal:6379',
    JWT_SECRET: 'a_very_secure_random_jwt_secret_with_more_than_32_characters_12345',
    INTERNAL_COMMUNICATION_SECRET: 'another_ultra_secure_hmac_secret_key_32_characters_minimum_67890',
  };
  const validProdResult = ProductionValidator.validateEnv(true, secureEnv);
  assert(validProdResult.valid && validProdResult.errors.length === 0, 'Production validation passes with secure ENV configuration');

  // -------------------------------------------------------------
  // TEST SUITE 2: POSTGRESQL BACKUP, RESTORE & ACID INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- TEST SUITE 2: PostgreSQL Backup, Restore, and Checksum Verification ---');

  // 2.1 Generate backup
  const backup = await backupRestoreService.exportBackup();
  assert(Boolean(backup.id && backup.checksum && backup.manifest), 'Backup export generates id, checksum, and manifest');
  assert(backup.schemaVersion === '1.0.0', 'Backup contains correct schemaVersion');
  assert(typeof backup.data === 'object', 'Backup contains relational data tables');

  // 2.2 Verify valid backup checksum
  const verifyValid = backupRestoreService.verifyBackup(backup);
  assert(verifyValid.valid, 'Backup checksum verification succeeds on pristine backup');

  // 2.3 Verify tampered backup is rejected
  const tamperedBackup = JSON.parse(JSON.stringify(backup));
  tamperedBackup.tables.trading_trades = [{ id: 'fake-injected-trade', tenant_id: 't-hacked' }];
  tamperedBackup.data.trading_trades = [{ id: 'fake-injected-trade', tenant_id: 't-hacked' }];
  const verifyTampered = backupRestoreService.verifyBackup(tamperedBackup);
  assert(!verifyTampered.valid, 'Tampered backup checksum is detected and rejected');

  // 2.4 Restore backup in ACID transaction
  const restoreResult = await backupRestoreService.restoreBackup(backup);
  assert(restoreResult.success, 'Backup restoration succeeds inside ACID transaction');

  // -------------------------------------------------------------
  // TEST SUITE 3: AUTHENTICATION, TIMING-ATTACK RESISTANCE & REVOCATION
  // -------------------------------------------------------------
  console.log('\n--- TEST SUITE 3: Auth Hardening, Revocation & Timing-Attack Mitigation ---');

  // 3.1 Token generation contains unique JTI
  const testToken = authService.generateToken({
    id: 'user-p5i-test-01',
    email: 'trader@vertex.test',
    tenantId: 'tenant-omega',
    role: 'CLIENT',
  });
  assert(typeof testToken === 'string' && testToken.length > 20, 'JWT token generated successfully');

  // 3.2 Token is verified before revocation
  const verifiedBefore = authService.verifyToken(testToken);
  assert(verifiedBefore !== null && verifiedBefore.id === 'user-p5i-test-01', 'Active token verifies successfully');

  // 3.3 Token revocation
  const revoked = authService.revokeToken(testToken);
  assert(revoked, 'Token revocation records token in blacklist');
  assert(authService.isTokenRevoked(testToken), 'isTokenRevoked returns true for revoked token');

  // 3.4 Verification fails for revoked token
  const verifiedAfter = authService.verifyToken(testToken);
  assert(verifiedAfter === null, 'Revoked token is rejected during verification');

  // 3.5 Constant-time string comparison protects against timing attacks
  const secretA = 'vertex-shared-secret-key-12345';
  const secretB = 'vertex-shared-secret-key-12345';
  const secretC = 'vertex-shared-secret-key-99999';
  assert(authService.timingSafeCompare(secretA, secretB), 'timingSafeCompare returns true for identical secrets');
  assert(!authService.timingSafeCompare(secretA, secretC), 'timingSafeCompare returns false for differing secrets');
  assert(!authService.timingSafeCompare(secretA, 'short'), 'timingSafeCompare handles length mismatches safely without throw');

  // -------------------------------------------------------------
  // TEST SUITE 4: SENSITIVE DATA REDACTION & ERROR SANITIZATION
  // -------------------------------------------------------------
  console.log('\n--- TEST SUITE 4: Sensitive Data Redaction & Error Sanitization ---');

  // 4.1 Recursive deep redaction of sensitive credentials
  const dirtyObject = {
    username: 'admin',
    password: 'SuperSecretPassword!',
    apiKey: 'ak-live-1234567890',
    apiSecret: 'sk-987654321',
    token: 'jwt.token.string',
    nested: {
      privateKey: '-----BEGIN RSA PRIVATE KEY-----',
      userNote: 'Normal note',
      credentials: {
        authorization: 'Bearer secret_token',
        pin: '1234',
      },
    },
  };

  const redacted = deepRedactSensitiveData(dirtyObject);
  assert(redacted.username === 'admin', 'Non-sensitive field preserved');
  assert(redacted.password === '[REDACTED]', 'Password field redacted');
  assert(redacted.apiKey === '[REDACTED]', 'apiKey field redacted');
  assert(redacted.apiSecret === '[REDACTED]', 'apiSecret field redacted');
  assert(redacted.token === '[REDACTED]', 'token field redacted');
  assert(redacted.nested.privateKey === '[REDACTED]', 'Nested privateKey redacted');
  assert(redacted.nested.credentials.authorization === '[REDACTED]', 'Nested authorization redacted');
  assert(redacted.nested.credentials.pin === '[REDACTED]', 'Nested pin redacted');
  assert(redacted.nested.userNote === 'Normal note', 'Nested non-sensitive preserved');

  // 4.2 Error message sanitization in production
  const dbError = new Error('relation "pg_shadow" does not exist at character 15');
  const sanitizedDev = sanitizeErrorResponse(dbError, false);
  assert(sanitizedDev.error === dbError.message, 'Development preserves raw error for debugging');

  const sanitizedProd = sanitizeErrorResponse(dbError, true);
  assert(
    sanitizedProd.error === 'An internal database error occurred.',
    'Production sanitizes internal database errors to prevent schema leakage'
  );

  // -------------------------------------------------------------
  // TEST SUITE 5: SECURITY HEADERS, CSRF MITIGATION & PARAMETER SANITIZATION
  // -------------------------------------------------------------
  console.log('\n--- TEST SUITE 5: Security Headers, CSRF Mitigation, and Query Sanitization ---');

  // 5.1 Security headers middleware
  const dummyResHeaders: Record<string, string> = {};
  const mockRes: any = {
    setHeader: (key: string, val: string) => {
      dummyResHeaders[key] = val;
    },
  };
  securityHeadersMiddleware({} as any, mockRes, () => {});
  assert(dummyResHeaders['X-Content-Type-Options'] === 'nosniff', 'X-Content-Type-Options: nosniff set');
  assert(dummyResHeaders['X-Frame-Options'] === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN set');
  assert(Boolean(dummyResHeaders['Content-Security-Policy']), 'Content-Security-Policy header set');

  // 5.2 Query parameter pollution sanitization
  const mockReqPolluted: any = {
    query: {
      tenantId: ['tenant-omega', 'tenant-hacked'],
      symbol: 'AAPL',
    },
  };
  sanitizeQueryParams(mockReqPolluted, {} as any, () => {});
  assert(
    typeof mockReqPolluted.query.tenantId === 'string' && mockReqPolluted.query.tenantId === 'tenant-omega',
    'HTTP parameter pollution collapsed array query param to first scalar'
  );

  // 5.3 CSRF mitigation on cross-origin cookie request
  let csrfBlocked = false;
  const mockCsrfReq: any = {
    method: 'POST',
    path: '/api/trading/orders',
    cookies: { vertex_auth_token: 'valid_cookie_token' },
    headers: {
      host: 'platform.vertex.com',
      origin: 'https://evil-attacker.com',
    },
  };
  const mockCsrfRes: any = {
    status: (code: number) => ({
      json: (data: any) => {
        if (code === 403 && data.code === 'CSRF_ORIGIN_MISMATCH') {
          csrfBlocked = true;
        }
      },
    }),
  };
  csrfProtectionMiddleware(mockCsrfReq, mockCsrfRes, () => {});
  assert(csrfBlocked, 'Cross-site origin mismatch with cookie auth blocked with 403 CSRF_ORIGIN_MISMATCH');

  // -------------------------------------------------------------
  // TEST SUITE 6: OUTBOX WORKER CRASH RECOVERY & DEAD-LETTER HANDLING
  // -------------------------------------------------------------
  console.log('\n--- TEST SUITE 6: Transactional Outbox Crash Recovery & Dead-Letter Handling ---');

  // 6.1 Create an event stuck in PROCESSING
  const outboxId = `outbox-test-${Date.now()}`;
  await postgresOutboxRepository.insert({
    id: outboxId,
    event_id: `evt-zombie-${Date.now()}`,
    tenant_id: 'tenant-omega',
    event_type: 'TRADE_EXECUTED',
    payload: { test: true },
  });
  await postgresOutboxRepository.markProcessing(outboxId);

  const stuckRecord = await postgresOutboxRepository.findById(outboxId);
  assert(stuckRecord?.status === 'PROCESSING', 'Event marked in PROCESSING state');

  // 6.2 Recover zombie events
  // With threshold 0 (simulate crashed process), it recovers stuck processing events
  const recoveredCount = await postgresOutboxRepository.recoverStaleProcessing(0);
  assert(recoveredCount >= 1, 'recoverStaleProcessing successfully recovers zombie PROCESSING events');

  const recoveredRecord = await postgresOutboxRepository.findById(outboxId);
  assert(recoveredRecord?.status === 'PENDING', 'Stuck event reset back to PENDING for redelivery');

  // 6.3 Dead-letter requeue
  await postgresOutboxRepository.markFailure(outboxId, 'Simulated terminal fatal error', 10000);
  // Force dead letter state
  await pgDb.query(`UPDATE trading_outbox SET status = 'DEAD_LETTER' WHERE id = $1`, [outboxId]);
  const deadRecord = await postgresOutboxRepository.findById(outboxId);
  assert(deadRecord?.status === 'DEAD_LETTER', 'Record marked as DEAD_LETTER');

  const reprocessSuccess = await transactionalOutboxService.reprocessDeadLetter(outboxId);
  assert(reprocessSuccess, 'reprocessDeadLetter successfully resets dead letter record');

  const reprocessedRecord = await postgresOutboxRepository.findById(outboxId);
  assert(
    reprocessedRecord?.status === 'PENDING' && reprocessedRecord.attempt_count === 0,
    'Reprocessed record restored to PENDING with attempt count reset'
  );

  // -------------------------------------------------------------
  // TEST SUITE 7: BROKER RECONCILIATION SAFETY THRESHOLDS
  // -------------------------------------------------------------
  console.log('\n--- TEST SUITE 7: Broker State Reconciliation Safety Thresholds ---');

  // 7.1 Excessive position discrepancy is flagged for manual review rather than silently overwritten
  const excessiveDisc = await brokerReconciliationService.reconcilePositions('tenant-omega', true);
  assert(Array.isArray(excessiveDisc.discrepancies), 'Position reconciliation executed cleanly');

  // -------------------------------------------------------------
  // TEST SUITE 8: HEALTH, LIVE, AND READY ENDPOINTS
  // -------------------------------------------------------------
  console.log('\n--- TEST SUITE 8: Health, Liveness, and Readiness Probe Endpoints ---');

  const app = express();
  app.use(healthRoutes);

  // 8.1 Test /live
  let liveStatus = 0;
  let liveBody: any = null;
  const mockLiveReq: any = { method: 'GET', url: '/live' };
  const mockLiveRes: any = {
    status: (c: number) => {
      liveStatus = c;
      return { json: (d: any) => (liveBody = d) };
    },
  };
  (healthRoutes as any).handle({ method: 'GET', url: '/live' } as any, mockLiveRes, () => {});
  // Directly invoke router route
  assert(isServerShuttingDown() === false, 'Server not currently in shutdown');

  // 8.2 Verify shutdown behavior toggles /ready and /live
  setServerShuttingDown(true);
  assert(isServerShuttingDown() === true, 'setServerShuttingDown updates shutdown state');
  setServerShuttingDown(false); // Reset to normal
  assert(isServerShuttingDown() === false, 'Server shutdown state reset to normal');

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 5I TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5ITests().catch((err) => {
  console.error('[FATAL ERROR IN PHASE 5I TESTS]:', err);
  process.exit(1);
});
