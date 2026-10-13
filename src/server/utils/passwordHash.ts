import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

export const ARGON2_OPTIONS = {
  type: (argon2.argon2id ?? 2) as 0 | 1 | 2,
  memoryCost: 19456, // 19 MiB for high performance and low server latency
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

export class PasswordHashUtil {
  /**
   * Hashes plaintext password using Argon2id.
   * Plaintext passwords are NEVER stored.
   */
  public static async hashPassword(password: string): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string.');
    }
    return String(await argon2.hash(password, ARGON2_OPTIONS));
  }

  /**
   * Verifies password against stored hash.
   * Supports Argon2id hashes, with backward-compatibility for legacy bcrypt hashes.
   */
  public static async verifyPassword(password: string, hash: string): Promise<{
    valid: boolean;
    needsRehash: boolean;
  }> {
    if (!password || !hash) {
      return { valid: false, needsRehash: false };
    }

    // Check if hash is Argon2 (starts with $argon2)
    if (hash.startsWith('$argon2')) {
      try {
        const valid = await argon2.verify(hash, password);
        return { valid, needsRehash: false };
      } catch {
        return { valid: false, needsRehash: false };
      }
    }

    // Fallback support for legacy bcrypt hashes ($2a$, $2b$, $2y$)
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
      try {
        const valid = await bcrypt.compare(password, hash);
        return { valid, needsRehash: valid }; // Needs upgrade to Argon2id upon successful match
      } catch {
        return { valid: false, needsRehash: false };
      }
    }

    return { valid: false, needsRehash: false };
  }
}
