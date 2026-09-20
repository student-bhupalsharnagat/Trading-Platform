import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type UserRole = 'SUPER_ADMIN' | 'MASTER' | 'BROKER' | 'SUB_BROKER' | 'CLIENT';

export interface UserRecord {
  id: string; // UUID
  full_name: string;
  user_id: string; // Normalized lowercase unique
  country_code: string;
  mobile: string; // Normalized unique
  email?: string;
  password_hash: string;
  role?: UserRole;
  parent_id?: string | null;
  hierarchy_path?: string;
  company?: string;
  address?: string;
  commission_rate?: number;
  is_verified: boolean;
  status: 'active' | 'suspended' | 'demo' | 'deactivated';
  is_frozen?: boolean;
  tenant_id?: string;
  referral_code?: string;
  referred_by?: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  demo_balance?: number;
}

export interface OtpRecord {
  id: string;
  user_id: string; // normalized user_id
  otp_hash: string;
  purpose: 'registration' | 'login' | 'password_reset';
  expires_at: string;
  attempts: number;
  verified_at?: string;
  created_at: string;
  // Non-sensitive dev aid for immediate preview when SMTP not configured
  dev_otp_preview?: string;
}

export interface ReferralRecord {
  code: string;
  owner_user_id: string;
  bonus_amount: number;
  is_active: boolean;
  created_at: string;
}

interface DatabaseState {
  users: UserRecord[];
  otp_verifications: OtpRecord[];
  referral_codes: ReferralRecord[];
}

const DB_FILE = path.join(process.cwd(), '.vertex_db_store.json');

class DatabaseService {
  private state: DatabaseState = {
    users: [],
    otp_verifications: [],
    referral_codes: [
      {
        code: 'VERTEXPRO',
        owner_user_id: 'system',
        bonus_amount: 1000.0,
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        code: 'ALPHA2026',
        owner_user_id: 'system',
        bonus_amount: 500.0,
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        code: 'TRADER99',
        owner_user_id: 'system',
        bonus_amount: 250.0,
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ],
  };

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && Array.isArray(parsed.users)) {
          this.state.users = parsed.users;
        }
        if (parsed.otp_verifications && Array.isArray(parsed.otp_verifications)) {
          this.state.otp_verifications = parsed.otp_verifications;
        }
        if (parsed.referral_codes && Array.isArray(parsed.referral_codes)) {
          this.state.referral_codes = parsed.referral_codes;
        }
      }
    } catch (err) {
      console.error('[DB] Failed to load database file, starting with fresh state:', err);
    }
  }

  private save() {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[DB] Failed to write database file:', err);
    }
  }

  // --- Users Operations ---
  public findUserById(id: string): UserRecord | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  public findUserByUserId(userId: string): UserRecord | undefined {
    const normalized = userId.trim().toLowerCase();
    return this.state.users.find((u) => u.user_id.toLowerCase() === normalized);
  }

  public findUserByMobile(mobile: string): UserRecord | undefined {
    const cleanMobile = mobile.replace(/\D/g, '');
    return this.state.users.find((u) => u.mobile.replace(/\D/g, '') === cleanMobile);
  }

  public findUserByUserIdOrMobile(identifier: string): UserRecord | undefined {
    const trimmed = identifier.trim();
    const normalized = trimmed.toLowerCase();
    const cleanDigits = trimmed.replace(/\D/g, '');

    return this.state.users.find((u) => {
      if (u.user_id.toLowerCase() === normalized) return true;
      if (cleanDigits.length >= 10 && u.mobile.replace(/\D/g, '').endsWith(cleanDigits.slice(-10))) {
        return true;
      }
      return false;
    });
  }

  public createUser(userData: {
    fullName: string;
    userId: string;
    countryCode: string;
    mobile: string;
    passwordHash: string;
    email?: string;
    role?: UserRole;
    parentId?: string | null;
    hierarchyPath?: string;
    company?: string;
    address?: string;
    commissionRate?: number;
    demoBalance?: number;
    referralCode?: string;
    referredBy?: string;
    status?: 'active' | 'suspended' | 'demo';
    isVerified?: boolean;
    tenantId?: string;
  }): UserRecord {
    const normalizedUserId = userData.userId.trim().toLowerCase();
    const cleanMobile = userData.mobile.replace(/\D/g, '');

    // Check unique constraints (scoped per tenant if specified)
    const existingByUserId = this.state.users.find(
      (u) =>
        u.user_id.toLowerCase() === normalizedUserId &&
        (!userData.tenantId || (u.tenant_id || 'vertex-default') === userData.tenantId)
    );
    if (existingByUserId) {
      const err = new Error('User ID is already taken.');
      (err as any).statusCode = 409;
      (err as any).field = 'userId';
      throw err;
    }

    const existingByMobile = this.state.users.find(
      (u) =>
        u.mobile.replace(/\D/g, '') === cleanMobile &&
        (!userData.tenantId || (u.tenant_id || 'vertex-default') === userData.tenantId)
    );
    if (existingByMobile) {
      const err = new Error('Mobile number is already registered with another account.');
      (err as any).statusCode = 409;
      (err as any).field = 'mobile';
      throw err;
    }

    const now = new Date().toISOString();
    const newUser: UserRecord = {
      id: crypto.randomUUID(),
      tenant_id: userData.tenantId || 'vertex-default',
      full_name: userData.fullName.trim(),
      user_id: normalizedUserId,
      email: userData.email,
      country_code: userData.countryCode || '+91',
      mobile: cleanMobile,
      password_hash: userData.passwordHash,
      role: userData.role || 'CLIENT',
      parent_id: userData.parentId !== undefined ? userData.parentId : null,
      hierarchy_path: userData.hierarchyPath || `root.${normalizedUserId}`,
      company: userData.company,
      address: userData.address,
      commission_rate: userData.commissionRate,
      is_verified: userData.isVerified ?? false,
      status: userData.status || 'active',
      is_frozen: false,
      referral_code: userData.referralCode,
      referred_by: userData.referredBy,
      created_at: now,
      updated_at: now,
      demo_balance: userData.demoBalance !== undefined ? userData.demoBalance : 1000000.0, // ₹10,00,000 virtual demo trading balance
    };

    this.state.users.push(newUser);
    this.save();
    return newUser;
  }

  public setUserFrozen(userId: string, isFrozen: boolean): UserRecord | null {
    const user = this.findUserById(userId) || this.findUserByUserId(userId);
    if (!user) return null;
    user.is_frozen = isFrozen;
    user.updated_at = new Date().toISOString();
    this.save();
    return user;
  }

  public isUserOrHierarchyFrozen(user: UserRecord): { frozen: boolean; reason?: string } {
    // 1. Direct individual user freeze
    if (user.status === 'suspended' || user.is_frozen === true) {
      return {
        frozen: true,
        reason: 'Your trading account is currently frozen. Please contact customer support.',
      };
    }

    // 2. Check Broker / Master hierarchy freeze
    if (user.hierarchy_path) {
      const pathParts = user.hierarchy_path.split('.');
      for (const ancestorUserId of pathParts) {
        if (ancestorUserId === 'root' || ancestorUserId.toLowerCase() === user.user_id.toLowerCase()) continue;
        const ancestor = this.findUserByUserId(ancestorUserId);
        if (ancestor) {
          if (ancestor.status === 'suspended' || ancestor.is_frozen === true) {
            const roleLabel = ancestor.role === 'MASTER' ? 'Master Broker' : 'Broker';
            return {
              frozen: true,
              reason: `Trading is temporarily suspended for accounts under ${roleLabel} (${ancestor.full_name}).`,
            };
          }
        }
      }
    }

    return { frozen: false };
  }

  public getAllUsers(): UserRecord[] {
    return this.state.users.map((u) => ({
      ...u,
      role: u.role || 'CLIENT',
      hierarchy_path: u.hierarchy_path || `root.${u.user_id}`,
    }));
  }

  public getUsersByTenant(tenantId: string): UserRecord[] {
    const normTenant = tenantId || 'vertex-default';
    return this.getAllUsers().filter((u) => (u.tenant_id || 'vertex-default') === normTenant);
  }

  public updateUser(id: string, updates: Partial<UserRecord>): UserRecord | undefined {
    const userIndex = this.state.users.findIndex((u) => u.id === id);
    if (userIndex === -1) return undefined;

    this.state.users[userIndex] = {
      ...this.state.users[userIndex],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.save();
    return this.state.users[userIndex];
  }

  public markUserVerified(userId: string): boolean {
    const normalized = userId.trim().toLowerCase();
    const user = this.state.users.find((u) => u.user_id.toLowerCase() === normalized);
    if (user) {
      user.is_verified = true;
      user.updated_at = new Date().toISOString();
      this.save();
      return true;
    }
    return false;
  }

  public updateLastLogin(id: string): void {
    const user = this.findUserById(id);
    if (user) {
      user.last_login_at = new Date().toISOString();
      this.save();
    }
  }

  public updateUserPassword(userId: string, newPasswordHash: string): boolean {
    const user = this.findUserByUserId(userId);
    if (user) {
      user.password_hash = newPasswordHash;
      user.updated_at = new Date().toISOString();
      this.save();
      return true;
    }
    return false;
  }

  // --- OTP Verifications Operations ---
  public createOtp(params: {
    userId: string;
    otpHash: string;
    purpose: 'registration' | 'login' | 'password_reset';
    expiresAt: Date;
    devOtpPreview?: string;
  }): OtpRecord {
    const normalizedUserId = params.userId.trim().toLowerCase();

    // Invalidate existing active OTPs for the same purpose
    this.invalidateExistingOtps(normalizedUserId, params.purpose);

    const otpRecord: OtpRecord = {
      id: crypto.randomUUID(),
      user_id: normalizedUserId,
      otp_hash: params.otpHash,
      purpose: params.purpose,
      expires_at: params.expiresAt.toISOString(),
      attempts: 0,
      created_at: new Date().toISOString(),
      dev_otp_preview: params.devOtpPreview,
    };

    this.state.otp_verifications.push(otpRecord);
    this.save();
    return otpRecord;
  }

  public getLatestActiveOtp(
    userId: string,
    purpose: 'registration' | 'login' | 'password_reset'
  ): OtpRecord | undefined {
    const normalizedUserId = userId.trim().toLowerCase();
    const validOtps = this.state.otp_verifications
      .filter((o) => o.user_id.toLowerCase() === normalizedUserId && o.purpose === purpose && !o.verified_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return validOtps[0];
  }

  public incrementOtpAttempts(otpId: string): number {
    const otp = this.state.otp_verifications.find((o) => o.id === otpId);
    if (otp) {
      otp.attempts += 1;
      this.save();
      return otp.attempts;
    }
    return 0;
  }

  public markOtpVerified(otpId: string): void {
    const otp = this.state.otp_verifications.find((o) => o.id === otpId);
    if (otp) {
      otp.verified_at = new Date().toISOString();
      this.save();
    }
  }

  public invalidateExistingOtps(
    userId: string,
    purpose: 'registration' | 'login' | 'password_reset'
  ): void {
    const normalizedUserId = userId.trim().toLowerCase();
    const now = new Date().toISOString();
    this.state.otp_verifications.forEach((o) => {
      if (o.user_id.toLowerCase() === normalizedUserId && o.purpose === purpose && !o.verified_at) {
        o.verified_at = now; // invalidate
      }
    });
    this.save();
  }

  // --- Referral Validation ---
  public validateReferralCode(code: string): boolean {
    if (!code) return true;
    const cleanCode = code.trim().toUpperCase();
    const found = this.state.referral_codes.find((r) => r.code === cleanCode && r.is_active);
    if (found) return true;

    // Also check if any existing verified user has this user_id as their referral code
    const userReferrer = this.state.users.find(
      (u) => u.user_id.toUpperCase() === cleanCode && u.is_verified
    );
    return !!userReferrer;
  }

  // --- Demo Account Helper ---
  public getOrCreateDemoUser(): UserRecord {
    const demoUserId = 'vtx_demo';
    let demoUser = this.findUserByUserId(demoUserId);
    if (!demoUser) {
      demoUser = {
        id: 'demo-user-uuid-0000-000000000001',
        full_name: 'Demo Trader',
        user_id: 'vtx123',
        country_code: '+91',
        mobile: '9876543210',
        password_hash: '$2a$10$DEMO_ACCOUNT_NOT_PASSWORD_ACCESSIBLE_DIRECTLY',
        is_verified: true,
        status: 'demo',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        demo_balance: 1000000.0,
      };
      this.state.users.push(demoUser);
      this.save();
    }
    return demoUser;
  }
}

export const db = new DatabaseService();
