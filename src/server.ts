// ─── Server Entry Point ───────────────────────────────────────────────────────
import 'dotenv/config'
import path         from 'path'
import fs           from 'fs'
import Fastify      from 'fastify'
import cors         from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import multipart    from '@fastify/multipart'
import { config }   from './config/env'
import { errorHandler } from './utils/errorHandler'

import jwtPlugin    from './plugins/jwt'
import authPlugin   from './plugins/auth'

import authRoutes       from './routes/auth.route'
import userRoutes       from './routes/user.route'
import employeeRoutes   from './routes/employee.route'
import organisasiRoutes from './routes/organisasi.route'
import aplikasiRoutes   from './routes/aplikasi.route'
import ssoRoutes        from './routes/sso.route'
import masterRoutes     from './routes/master.route'

// ─── Pastikan folder uploads ada ─────────────────────────────────────────────
const uploadDir = path.resolve(config.upload.dir)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// ─── Fastify instance ─────────────────────────────────────────────────────────
const fastify = Fastify({
  logger: {
    transport: config.app.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  },
})

// ─── Global Error Handler ─────────────────────────────────────────────────────
fastify.setErrorHandler(errorHandler)

// ─── Plugins ──────────────────────────────────────────────────────────────────
async function buildApp() {
  await fastify.register(cors,    { origin: true, credentials: true })
  await fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  })
  await fastify.register(fastifyStatic, {
    root:   uploadDir,
    prefix: '/uploads/',
  })

  await fastify.register(jwtPlugin)
  await fastify.register(authPlugin)

  // ─── Routes ─────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes,       { prefix: '/api/auth'   })
  await fastify.register(userRoutes,       { prefix: '/api/users'  })
  await fastify.register(employeeRoutes,   { prefix: '/api/employees' })
  await fastify.register(organisasiRoutes, { prefix: '/api/org'    })
  await fastify.register(aplikasiRoutes,   { prefix: '/api/apps'   })
  await fastify.register(ssoRoutes,        { prefix: '/api/sso'    })
  await fastify.register(masterRoutes,     { prefix: '/api/master' })

  // ─── Health check ────────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({
    status:    'ok',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version ?? '1.0.0',
  }))

  return fastify
}

// ─── Start ────────────────────────────────────────────────────────────────────
buildApp()
  .then(app => app.listen({ port: config.app.port, host: config.app.host }))
  .then(() => {
    console.log(`\n🚀  INL Portal API running on http://${config.app.host}:${config.app.port}`)
    console.log(`📁  Static files: ${config.upload.url}`)
    console.log(`🔑  Health check: http://localhost:${config.app.port}/health\n`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
