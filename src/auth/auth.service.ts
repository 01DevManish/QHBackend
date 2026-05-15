import { Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'crypto';

type TokenPayload = {
  sub: string;
  role: 'customer' | 'team' | 'admin';
  phone?: string;
  email?: string;
  iat: number;
  exp: number;
};

@Injectable()
export class AuthService {
  private getSecret(): string {
    return process.env.JWT_SECRET || process.env.DATABASE_URL || 'qh-fallback-secret';
  }

  signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresInSeconds = 60 * 60 * 24 * 7): string {
    const now = Math.floor(Date.now() / 1000);
    const full: TokenPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(full)).toString('base64url');
    const signature = createHmac('sha256', this.getSecret()).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const [header, body, signature] = token.split('.');
      if (!header || !body || !signature) return null;
      const expected = createHmac('sha256', this.getSecret()).update(`${header}.${body}`).digest('base64url');
      if (expected !== signature) return null;
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as TokenPayload;
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, stored: string): boolean {
    if (!stored) return false;
    
    // Support salt:hash format
    if (stored.includes(':')) {
      const [salt, hash] = stored.split(':');
      const computed = createHash('sha256').update(`${salt}:${password}`).digest('hex');
      return computed === hash;
    }
    
    // Fallback: Support plain text comparison (for initial migration/seed)
    return password === stored;
  }

  normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 10) return `+91${cleaned}`;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
    if (cleaned.length === 11 && cleaned.startsWith('0')) return `+91${cleaned.slice(1)}`;
    return cleaned;
  }

  hashOtp(phone: string, otp: string): string {
    return createHash('sha256').update(`${phone}:${otp}:${this.getSecret()}`).digest('hex');
  }
}
