import assert from 'assert';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { authService } from '../src/server/services/authService.ts';
import { postgresClientMappingRepository } from '../src/server/repositories/PostgresClientMappingRepository.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';

async function run() {
  console.log('--- Starting Demo User & Client Mapping Tests ---');

  // 1. Run migrations to ensure 007 is applied
  await runMigrations();
  console.log('✓ Migrations executed successfully');

  // 2. Ensure Super Admin and initial hierarchy
  const superAdmin = await hierarchyService.ensureSuperAdmin();
  assert(superAdmin, 'Super Admin must exist');
  console.log('✓ Super admin hierarchy verified');

  // 3. Test Demo Session Creation & Backend Persistence
  const demoResult = await authService.getDemoSession({
    userId: 'test_demo_trader_01',
    fullName: 'Test Demo Trader',
    mobile: '9898989801',
    tenantId: 'vertex-default',
  });

  assert(demoResult.token, 'Token must be returned');
  assert(demoResult.user, 'User object must be returned');
  assert.strictEqual(demoResult.user.userId, 'test_demo_trader_01');
  assert.strictEqual(demoResult.user.account_type, 'demo');
  assert.strictEqual(demoResult.user.isVerified, true);
  console.log('✓ Demo session generated with token and user object');

  // 4. Verify PostgreSQL persistence in users table
  const pgUserRes = await pgDb.query(
    "SELECT * FROM users WHERE user_id = $1",
    ['test_demo_trader_01']
  );
  assert(pgUserRes.rows.length > 0, 'Demo user must be persisted in PostgreSQL users table');
  const pgUser = pgUserRes.rows[0];
  assert.strictEqual(pgUser.account_type, 'demo', 'account_type in users table must be demo');
  assert.strictEqual(pgUser.status, 'active', 'status in users table must be active');
  assert.strictEqual(pgUser.is_verified, true, 'is_verified in users table must be true');
  console.log('✓ Verified user in PostgreSQL: role=' + pgUser.role + ', account_type=' + pgUser.account_type + ', is_verified=' + pgUser.is_verified);

  // 5. Verify PostgreSQL persistence in client_mappings table
  const pgMappingRes = await pgDb.query(
    "SELECT * FROM client_mappings WHERE user_id = $1",
    ['test_demo_trader_01']
  );
  assert(pgMappingRes.rows.length > 0, 'Demo user must have client_mapping record');
  const pgMapping = pgMappingRes.rows[0];
  assert.strictEqual(pgMapping.account_type, 'demo', 'client_mapping account_type must be demo');
  assert(pgMapping.hierarchy_path.includes('test_demo_trader_01'), 'hierarchy_path must include demo user');
  console.log('✓ Verified client_mapping in PostgreSQL: master=' + pgMapping.master_id + ', path=' + pgMapping.hierarchy_path);

  // 6. Test Client Retrieval with account_type filtering
  const allClients = await postgresClientMappingRepository.getClients({
    caller: superAdmin,
    accountType: 'all',
  });
  console.log('All clients count:', allClients.length);
  assert(allClients.some((c) => c.userId === 'test_demo_trader_01'), 'All clients must include demo user');
  for (const c of allClients) {
    assert(c.account_type === 'demo' || c.account_type === 'real', 'Every client must have account_type');
    assert(c.userId, 'Client must retain userId');
    assert(c.fullName, 'Client must retain fullName');
  }

  const demoOnlyClients = await postgresClientMappingRepository.getClients({
    caller: superAdmin,
    accountType: 'demo',
  });
  console.log('Demo clients count:', demoOnlyClients.length);
  assert(demoOnlyClients.length > 0, 'Must have at least 1 demo client');
  assert(demoOnlyClients.every((c) => c.account_type === 'demo'), 'All clients in demo query must have account_type demo');

  const realOnlyClients = await postgresClientMappingRepository.getClients({
    caller: superAdmin,
    accountType: 'real',
  });
  console.log('Real clients count:', realOnlyClients.length);
  assert(realOnlyClients.every((c) => c.account_type === 'real'), 'All clients in real query must have account_type real');
  assert(!realOnlyClients.some((c) => c.userId === 'test_demo_trader_01'), 'Real query must not include demo user');

  // 7. Verify JWT token payload keys
  const verified = authService.verifyToken(demoResult.token);
  assert(verified, 'Token must verify successfully');
  assert(verified.id, 'Token must have id');
  assert(verified.userId, 'Token must have userId');
  assert(verified.role, 'Token must have role');
  assert(verified.hierarchyPath, 'Token must have hierarchyPath');
  assert(verified.tenantId, 'Token must have tenantId');
  console.log('✓ Token payload keys verified intact without breaking changes');

  console.log('====================================================');
  console.log('ALL DEMO PERSISTENCE & CLIENT MAPPING TESTS PASSED!');
  console.log('====================================================');
  await pgDb.close();
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
