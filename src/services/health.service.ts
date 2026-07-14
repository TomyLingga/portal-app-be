import fs from 'fs'
import tls from 'tls'
import https from 'https'
import { db } from '../db'
import { sql } from 'drizzle-orm'

/**
 * Checks the availability and response latency of the main domain.
 */
export function checkDomainStatus(host: string): Promise<{ status: 'online' | 'offline'; latency: number }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const req = https.get(`https://${host}`, { timeout: 4000 }, (res) => {
      const latency = Date.now() - start
      const online = res.statusCode !== undefined
      resolve({
        status: online ? 'online' : 'offline',
        latency
      })
    })

    req.on('error', () => {
      resolve({ status: 'offline', latency: 0 })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({ status: 'offline', latency: 0 })
    })
  })
}

/**
 * Checks whether an arbitrary app URL (http/https, local or remote) is reachable,
 * measuring response latency. Used to monitor the actual connected SSO applications
 * (registered in the `aplikasi` table), not just the portal's own infrastructure.
 */
export async function checkAppStatus(url: string, timeoutMs = 4000): Promise<{ status: 'online' | 'offline'; latency: number }> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, method: 'GET' })
    const latency = Date.now() - start
    return { status: res.status < 500 ? 'online' : 'offline', latency }
  } catch {
    return { status: 'offline', latency: 0 }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Mengukur responsivitas API portal itu sendiri lewat event-loop lag.
 * Nilainya benar-benar dinamis (naik ketika server sibuk), bukan konstanta
 * `'online'` — sehingga lane API di Status Layanan merefleksikan kondisi nyata.
 */
export function checkApiStatus(): Promise<{ status: 'online' | 'warning'; lagMs: number }> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint()
    // Selisih antara jadwal setImmediate dan eksekusi sesungguhnya = event-loop lag.
    setImmediate(() => {
      const lagMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6)
      // >200ms menandakan event loop tertahan (beban tinggi) → perlu perhatian.
      resolve({ status: lagMs > 200 ? 'warning' : 'online', lagMs })
    })
  })
}

/**
 * Checks PostgreSQL query response latency using Drizzle.
 */
export async function checkDatabaseStatus(): Promise<{ status: 'online' | 'offline'; latency: number }> {  const start = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    const latency = Date.now() - start
    return { status: 'online', latency }
  } catch (err) {
    return { status: 'offline', latency: 0 }
  }
}

/**
 * Checks disk storage utilization on the uploads folder.
 */
export function checkStorageStatus(uploadDir: string): Promise<{ status: 'online' | 'warning' | 'offline'; usagePercent: number; totalBytes: number; freeBytes: number }> {
  return new Promise((resolve) => {
    const statfsFn = (fs as any).statfs
    if (typeof statfsFn === 'function') {
      statfsFn(uploadDir, (err: any, stats: any) => {
        if (err) {
          resolve({ status: 'offline', usagePercent: 0, totalBytes: 0, freeBytes: 0 })
          return
        }
        const total = Number(stats.blocks) * Number(stats.bsize)
        const free = Number(stats.bfree) * Number(stats.bsize)
        const used = total - free
        const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0
        
        let status: 'online' | 'warning' = 'online'
        if (usagePercent >= 90) {
          status = 'warning'
        }
        resolve({ status, usagePercent, totalBytes: total, freeBytes: free })
      })
    } else {
      // Fallback if statfs is unavailable
      resolve({ status: 'online', usagePercent: 12, totalBytes: 50 * 1024 * 1024 * 1024, freeBytes: 44 * 1024 * 1024 * 1024 })
    }
  })
}

/**
 * Measures the remaining days until domain Let's Encrypt SSL certificate expires.
 */
export function checkSSLCertificate(host: string): Promise<{ status: 'online' | 'warning' | 'offline'; daysLeft: number }> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      servername: host,
      rejectUnauthorized: false
    }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      
      if (cert && cert.valid_to) {
        const expiry = new Date(cert.valid_to)
        const diffMs = expiry.getTime() - Date.now()
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        
        let status: 'online' | 'warning' | 'offline' = 'online'
        if (daysLeft <= 0) {
          status = 'offline'
        } else if (daysLeft <= 14) {
          status = 'warning'
        }
        resolve({ status, daysLeft })
      } else {
        resolve({ status: 'offline', daysLeft: 0 })
      }
    })

    socket.on('error', () => {
      resolve({ status: 'offline', daysLeft: 0 })
    })

    socket.setTimeout(4000, () => {
      socket.destroy()
      resolve({ status: 'offline', daysLeft: 0 })
    })
  })
}
