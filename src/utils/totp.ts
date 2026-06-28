import crypto from 'crypto'

/**
 * Decodes a Base32 string into a Buffer.
 * Supports the standard RFC 4648 Base32 alphabet.
 */
export function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  
  let val = 0
  let count = 0
  const bytes: number[] = []
  
  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i])
    if (idx === -1) {
      throw new Error('Karakter Base32 tidak valid')
    }
    val = (val << 5) | idx
    count += 5
    if (count >= 8) {
      bytes.push((val >> (count - 8)) & 255)
      count -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * Encodes a Buffer into a Base32 string.
 */
export function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let val = 0
  let count = 0
  let out = ''
  for (let i = 0; i < buffer.length; i++) {
    val = (val << 8) | buffer[i]
    count += 8
    while (count >= 5) {
      out += alphabet[(val >> (count - 5)) & 31]
      count -= 5
    }
  }
  if (count > 0) {
    out += alphabet[(val << (5 - count)) & 31]
  }
  return out
}

/**
 * Generates a random Base32 TOTP secret (16 characters, 10 bytes).
 */
export function generateTOTPSecret(): string {
  const bytes = crypto.randomBytes(10)
  return base32Encode(bytes)
}

/**
 * Generates a 6-digit TOTP token for a given Base32 secret at a specific time.
 */
export function generateTOTP(secret: string, time: number = Date.now()): string {
  const key = base32Decode(secret)
  const epoch = Math.floor(time / 1000)
  const timeStep = 30
  const counter = Math.floor(epoch / timeStep)
  
  // Convert counter to an 8-byte big-endian buffer
  const buffer = Buffer.alloc(8)
  let tmp = counter
  for (let i = 7; i >= 0; i--) {
    buffer[i] = tmp & 0xff
    tmp = tmp >> 8
  }
  
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest()
  
  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0xf
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
    
  const otp = code % 1000000
  return otp.toString().padStart(6, '0')
}

/**
 * Verifies a 6-digit TOTP code against a Base32 secret.
 * Allows a clock skew window (default: 1 step of 30 seconds, i.e., +/- 30s).
 */
export function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  const cleanToken = token.trim().replace(/\s/g, '')
  if (cleanToken.length !== 6 || isNaN(Number(cleanToken))) {
    return false
  }
  
  const now = Date.now()
  for (let i = -window; i <= window; i++) {
    const calculated = generateTOTP(secret, now + i * 30000)
    if (calculated === cleanToken) {
      return true
    }
  }
  return false
}

/**
 * Generates the otpauth URI for QR codes.
 */
export function getTOTPKeyURI(email: string, secret: string, issuer: string = 'PT Industri Nabati Lestari'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`
}
