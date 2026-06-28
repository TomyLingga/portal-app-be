import crypto from 'crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { user as userTable, employee, userPasskey } from '../db/schema'
import { config } from '../config/env'
import { createRefreshToken } from './auth.service'
import type { FastifyInstance } from 'fastify'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'

// ─── Passkey (WebAuthn) Services ──────────────────────────────────────────────

export async function generatePasskeyRegistrationOptionsService(fastify: FastifyInstance, userId: string) {
  const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!user) throw new Error('User tidak ditemukan')

  let displayName = user.email
  if (user.employeeId) {
    const [emp] = await db.select().from(employee).where(eq(employee.id, user.employeeId)).limit(1)
    if (emp) displayName = emp.nama
  }

  // Get user's existing passkeys
  const existingPasskeys = await db.select().from(userPasskey).where(eq(userPasskey.userId, userId))

  const options = await generateRegistrationOptions({
    rpName: 'PT Industri Nabati Lestari',
    rpID: 'localhost',
    userID: Buffer.from(userId),
    userName: user.email,
    userDisplayName: displayName,
    attestationType: 'none',
    excludeCredentials: existingPasskeys.map(p => ({
      id: p.credentialId,
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  // Sign challenge so we can verify it state-freely
  const challengeToken = fastify.jwt.sign({
    challenge: options.challenge,
    userId,
    purpose: 'passkey_registration'
  } as any, { expiresIn: '5m' })

  return { options, challengeToken }
}

export async function verifyPasskeyRegistrationService(
  fastify: FastifyInstance,
  userId: string,
  registrationResponse: any,
  challengeToken: string,
  name?: string
) {
  let decoded: any
  try {
    decoded = fastify.jwt.verify(challengeToken)
  } catch (err) {
    throw new Error('Token tantangan kadaluwarsa atau tidak valid')
  }

  if (decoded.purpose !== 'passkey_registration' || decoded.userId !== userId) {
    throw new Error('Tantangan tidak valid')
  }

  const expectedChallenge = decoded.challenge

  const verification = await verifyRegistrationResponse({
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: ['http://localhost:3002', 'http://localhost:3001'],
    expectedRPID: 'localhost',
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registrasi passkey gagal diverifikasi')
  }

  const { credential } = verification.registrationInfo
  const { id: credentialID, publicKey: credentialPublicKey, counter } = credential

  const credentialIdBase64 = typeof credentialID === 'string'
    ? credentialID
    : Buffer.from(credentialID).toString('base64url')
  const publicKeyBase64 = Buffer.from(credentialPublicKey).toString('base64')

  // Save the passkey
  await db.insert(userPasskey).values({
    userId,
    name: name || 'Perangkat Passkey',
    credentialId: credentialIdBase64,
    publicKey: publicKeyBase64,
    counter,
    transports: JSON.stringify(registrationResponse.response.transports || []),
  })

  return { success: true }
}

export async function generatePasskeyLoginOptionsService(fastify: FastifyInstance) {
  const options = await generateAuthenticationOptions({
    rpID: 'localhost',
    userVerification: 'preferred',
  })

  const challengeToken = fastify.jwt.sign({
    challenge: options.challenge,
    purpose: 'passkey_login'
  } as any, { expiresIn: '5m' })

  return { options, challengeToken }
}

export async function verifyPasskeyLoginService(
  fastify: FastifyInstance,
  loginResponse: any,
  challengeToken: string
) {
  let decoded: any
  try {
    decoded = fastify.jwt.verify(challengeToken)
  } catch (err) {
    throw new Error('Token tantangan kadaluwarsa atau tidak valid')
  }

  if (decoded.purpose !== 'passkey_login') {
    throw new Error('Tantangan tidak valid')
  }

  const expectedChallenge = decoded.challenge
  const credentialId = loginResponse.id

  const [passkey] = await db
    .select()
    .from(userPasskey)
    .where(eq(userPasskey.credentialId, credentialId))
    .limit(1)

  if (!passkey) {
    throw new Error('Passkey tidak terdaftar untuk akun manapun')
  }

  const verification = await verifyAuthenticationResponse({
    response: loginResponse,
    expectedChallenge,
    expectedOrigin: ['http://localhost:3052', 'http://localhost:3002', 'http://localhost:3001'],
    expectedRPID: 'localhost',
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, 'base64'),
      counter: passkey.counter,
      transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
    },
  })

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error('Autentikasi passkey gagal diverifikasi')
  }

  const { newCounter } = verification.authenticationInfo

  // Update counter
  await db.update(userPasskey).set({ counter: newCounter }).where(eq(userPasskey.id, passkey.id))

  // Fetch and log in the user
  const [user] = await db.select().from(userTable).where(eq(userTable.id, passkey.userId)).limit(1)
  if (!user) throw new Error('User tidak ditemukan')
  if (!user.isActive) throw new Error('Akun dinonaktifkan, hubungi administrator')

  // Update lastLogin
  await db.update(userTable).set({ lastLogin: new Date() }).where(eq(userTable.id, user.id))

  const accessToken = fastify.jwt.sign({
    sub:          user.id,
    email:        user.email,
    role:         user.role,
    tokenVersion: user.tokenVersion,
  } as any)
  const refreshTokenRaw = await createRefreshToken(user.id)

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    expiresIn:    config.jwt.expiresIn,
    user: {
      id:        user.id,
      email:     user.email,
      role:      user.role,
      isActive:  user.isActive,
      lastLogin: user.lastLogin,
    },
  }
}

export async function listPasskeysService(userId: string) {
  return db
    .select({
      id: userPasskey.id,
      name: userPasskey.name,
      counter: userPasskey.counter,
      createdAt: userPasskey.createdAt,
    })
    .from(userPasskey)
    .where(eq(userPasskey.userId, userId))
}

export async function updatePasskeyService(userId: string, id: string, name: string) {
  if (!name || name.trim() === '') throw new Error('Nama passkey wajib diisi')
  const [updated] = await db
    .update(userPasskey)
    .set({ name })
    .where(and(eq(userPasskey.id, id), eq(userPasskey.userId, userId)))
    .returning()
  if (!updated) throw new Error('Passkey tidak ditemukan')
  return updated
}

export async function deletePasskeyService(userId: string, id: string) {
  const [deleted] = await db
    .delete(userPasskey)
    .where(and(eq(userPasskey.id, id), eq(userPasskey.userId, userId)))
    .returning()
  if (!deleted) throw new Error('Passkey tidak ditemukan')
  return { success: true }
}
