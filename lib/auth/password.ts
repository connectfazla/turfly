/**
 * Password hashing. bcrypt, cost 12.
 *
 * Cost 12 is ~250ms on this class of hardware — slow enough to make offline
 * cracking of a leaked hash expensive, fast enough that a sign-in does not
 * feel broken. Raise it, never lower it.
 */
import bcrypt from 'bcryptjs';
import { MIN_PASSWORD_LENGTH } from './constants';

const BCRYPT_COST = 12;

export { MIN_PASSWORD_LENGTH };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * SECURITY: a null hash NEVER verifies.
 *
 * An invited staff member has a User row and a grant but no password yet.
 * Passing their null hash to bcrypt.compare would throw, and a careless
 * `catch { return false }` around it would be fine — but a careless
 * `hash ?? ''` would not, and neither would any code path that treats
 * "no hash" as "no password required". Refusing explicitly here means the
 * dangerous interpretation is impossible at the one place it could occur.
 */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same time as a real bcrypt comparison.
 *
 * Sign-in calls this when the email matches no account, so a wrong address
 * and a wrong password take the same time. Without it, response latency
 * tells an attacker which addresses are registered — which for a product
 * whose users are business owners is worth not leaking.
 */
export async function fakeVerify(): Promise<void> {
  await bcrypt.compare('timing-equalisation', '$2a$12$C6UzMDM.H6dfI/f/IKcEe.jQ8VZ3ZLcYJmVJ0FGh0FS0.9Cq3wxAO');
}
