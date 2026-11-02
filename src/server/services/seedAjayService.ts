import { pgDb } from '../db/postgres.ts';
import { db } from '../db/database.ts';
import { PasswordHashUtil } from '../utils/passwordHash.ts';
import { postgresClientMappingRepository } from '../repositories/PostgresClientMappingRepository.ts';
import { postgresWalletRepository } from '../repositories/trading/PostgresWalletRepository.ts';
import { postgresPositionRepository } from '../repositories/trading/PostgresPositionRepository.ts';
import { postgresOrderRepository } from '../repositories/trading/PostgresOrderRepository.ts';
import { postgresFundTransactionRepository } from '../repositories/trading/PostgresFundTransactionRepository.ts';

export async function seedAjayAccount(): Promise<void> {
  const userId = 'Ajay12';
  const normUserId = userId.toLowerCase();
  const rawPassword = 'Ajay@123';
  const fullName = 'Ajay';
  const email = 'ajay@goldfut.com';
  const phone = '+919876543299';
  const tenantId = 'vertex-default';
  const initialBalance = 500000.0;

  try {
    const passwordHash = await PasswordHashUtil.hashPassword(rawPassword);

    // 1. Provision client mapping, trading_platform_accounts, and wallet
    await postgresClientMappingRepository.createClientMappingAndWallet({
      id: 'usr-ajay-001',
      user_id: userId,
      full_name: fullName,
      email,
      mobile: phone,
      password_hash: passwordHash,
      role: 'CLIENT',
      tenant_id: tenantId,
      broker_id: 'BRK-001',
      client_code: 'AJAY12',
      account_type: 'real',
      demo_balance: initialBalance,
      is_verified: true,
      status: 'ACTIVE',
    }, tenantId);

    // Also ensure password hash is saved in users table
    await pgDb.query(
      `UPDATE users SET password_hash = $1, status = 'ACTIVE', is_verified = true WHERE LOWER(user_id) = LOWER($2);`,
      [passwordHash, userId]
    ).catch(() => {});

    // 2. Add or update in-memory db
    const existing = db.findUserByUserId(normUserId) || db.findUserByUserId(userId);
    if (!existing) {
      db.addUser({
        id: 'usr-ajay-001',
        full_name: fullName,
        user_id: userId,
        country_code: '+91',
        mobile: phone,
        phone_e164: phone,
        email,
        role: 'CLIENT',
        parent_id: 'master-node-0001',
        hierarchy_path: `root.master_alpha.${normUserId}`,
        is_verified: true,
        status: 'ACTIVE',
        tenant_id: tenantId,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date().toISOString(),
        account_type: 'real',
        demo_balance: initialBalance,
        password_hash: passwordHash,
        failed_login_attempts: 0,
        client_code: 'AJAY12',
        broker_id: 'BRK-001',
      });
    } else {
      existing.password_hash = passwordHash;
      existing.status = 'ACTIVE';
      existing.is_verified = true;
    }

    // 3. Ensure wallet has initial deposit balance across vertex-default and TNT-001
    const targetTenants = ['vertex-default', 'TNT-001'];
    for (const t of targetTenants) {
      await postgresWalletRepository.upsertWallet({
        id: `wal-${t}-${normUserId}`,
        tenant_id: t,
        user_id: userId,
        available_balance: initialBalance,
        blocked_balance: 0,
        used_margin: 345040.50, // margin used for the 3 positions
        realized_pnl: 0,
      });

      // 4. Ensure fund deposit transaction exists
      const existingDeposit = await postgresFundTransactionRepository.findById(t, `TX-DEP-AJAY-001-${t}`);
      if (!existingDeposit) {
        await postgresFundTransactionRepository.create({
          id: `TX-DEP-AJAY-001-${t}`,
          tenant_id: t,
          user_id: userId,
          transaction_type: 'DEPOSIT',
          amount: initialBalance,
          status: 'APPROVED',
          payment_method: 'BANK_TRANSFER',
          reference_id: 'DEP-AJAY-INIT',
          approved_by: 'superadmin',
          approved_at: new Date(Date.now() - 86400000).toISOString(),
          rejected_by: null,
          rejected_at: null,
          failure_reason: null,
        });
      }

      // 5. Ensure stock orders (TCS, RELIANCE, NIFTY 50) exist
      const ordersToSeed = [
        {
          id: `ORD-AJAY-TCS-${t}`,
          instrumentId: 'tcs',
          side: 'BUY' as const,
          orderType: 'MARKET' as const,
          qty: 50,
          price: 4141.05,
        },
        {
          id: `ORD-AJAY-REL-${t}`,
          instrumentId: 'reliance',
          side: 'BUY' as const,
          orderType: 'MARKET' as const,
          qty: 100,
          price: 2931.45,
        },
        {
          id: `ORD-AJAY-NIF-${t}`,
          instrumentId: 'nifty_50',
          side: 'BUY' as const,
          orderType: 'MARKET' as const,
          qty: 100,
          price: 24500.00,
        },
      ];

      for (const ord of ordersToSeed) {
        const existingOrd = await postgresOrderRepository.findById(t, ord.id);
        if (!existingOrd) {
          await postgresOrderRepository.create({
            id: ord.id,
            tenant_id: t,
            user_id: userId,
            client_order_id: `cli-${ord.id}`,
            instrument_id: ord.instrumentId,
            side: ord.side,
            order_type: ord.orderType,
            quantity: ord.qty,
            price: ord.price,
            trigger_price: null,
            status: 'EXECUTED',
            broker_order_id: `BRK-${ord.id}`,
            normalized_status: 'COMPLETE',
            filled_quantity: ord.qty,
            remaining_quantity: 0,
            average_fill_price: ord.price,
            time_in_force: 'DAY',
            cancelled_at: null,
          });
        }
      }

      // 6. Ensure open positions exist with realistic live values
      const positionsToSeed = [
        {
          id: `POS-AJAY-TCS-${t}`,
          instrumentId: 'tcs',
          qty: 50,
          avgPrice: 4141.05,
          marginUsed: 41410.50,
        },
        {
          id: `POS-AJAY-REL-${t}`,
          instrumentId: 'reliance',
          qty: 100,
          avgPrice: 2931.45,
          marginUsed: 58630.00,
        },
        {
          id: `POS-AJAY-NIF-${t}`,
          instrumentId: 'nifty_50',
          qty: 100,
          avgPrice: 24500.00,
          marginUsed: 245000.00,
        },
      ];

      for (const pos of positionsToSeed) {
        await postgresPositionRepository.upsertPosition({
          id: pos.id,
          tenant_id: t,
          user_id: userId,
          instrument_id: pos.instrumentId,
          quantity: pos.qty,
          average_price: pos.avgPrice,
          realized_pnl: 0,
          unrealized_pnl: 0,
          margin_used: pos.marginUsed,
        });
      }
    }

    console.log(`[SEED] Ajay account (${userId}) verified and seeded with ₹${initialBalance} funds, stock orders, and positions.`);
  } catch (err: any) {
    console.warn('[SEED] Notice: Ajay account seeding error:', err.message);
  }
}
