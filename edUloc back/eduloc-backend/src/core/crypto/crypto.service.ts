import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AppConfig } from '../config/app.config';

@Injectable()
export class CryptoService {
  constructor(private readonly cfg: AppConfig) {}

  /** OTP séance : 6 chiffres, CSPRNG. */
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /** Code e-mail à 6 chiffres (vérification de compte, réinitialisation de mot de passe). */
  generateEmailCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /** Empreinte d'un code e-mail, liée à l'adresse : deux comptes peuvent recevoir le même code. */
  emailCodeHash(email: string, code: string): string {
    return this.sha256(`${email.trim().toLowerCase()}:${code}`);
  }

  generateToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  /** AES-256-GCM : iv(12) | tag(16) | ciphertext — authentifié. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cfg.otpEncryptionKey, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.cfg.otpEncryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}
