import { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/env'

const ACCESS_COOKIE = 'inl_access_token'
const REFRESH_COOKIE = 'inl_refresh_token'

function parseMaxAgeSeconds(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/)
  if (!match) return 900
  const amount = Number(match[1])
  switch (match[2]) {
    case 's': return amount
    case 'm': return amount * 60
    case 'h': return amount * 60 * 60
    case 'd': return amount * 24 * 60 * 60
    default: return 900
  }
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (config.app.nodeEnv === 'production') {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function getCookie(request: FastifyRequest, name: string): string | null {
  const raw = request.headers.cookie
  if (!raw) return null

  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

export function getAccessCookie(request: FastifyRequest): string | null {
  return getCookie(request, ACCESS_COOKIE)
}

export function getRefreshCookie(request: FastifyRequest): string | null {
  return getCookie(request, REFRESH_COOKIE)
}

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.header('Set-Cookie', [
    cookieHeader(ACCESS_COOKIE, accessToken, parseMaxAgeSeconds(config.jwt.expiresIn)),
    cookieHeader(REFRESH_COOKIE, refreshToken, parseMaxAgeSeconds(config.refreshToken.expiresIn)),
  ])
}

export function clearAuthCookies(reply: FastifyReply) {
  reply.header('Set-Cookie', [
    cookieHeader(ACCESS_COOKIE, '', 0),
    cookieHeader(REFRESH_COOKIE, '', 0),
  ])
}
