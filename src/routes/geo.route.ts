// ─── Routes: Geo ──────────────────────────────────────────────────────────────
// Pencarian tempat, reverse geocode, dan link Google Maps untuk map picker.
// Semua lewat backend supaya cache & batas pemakaian provider terkendali, dan
// tidak ada API key peta di browser.
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ok } from '../utils/response'
import { httpError } from '../utils/httpError'
import { searchPlaces, recordPlaceSelection, reverseGeocode, resolveMapLink } from '../services/geo.service'

// Query string kosong ("lat=") jangan sampai di-coerce menjadi 0.
const optionalCoord = (min: number, max: number) => z.preprocess(
  value => (value === '' || value == null ? undefined : Number(value)),
  z.number().min(min).max(max).optional(),
)

const searchQuery = z.object({
  q:   z.string().max(200).default(''),
  lat: optionalCoord(-90, 90),
  lng: optionalCoord(-180, 180),
})

const reverseQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

// Pusat Sumatera Utara — bias default bila client belum mengirim titik peta.
const DEFAULT_BIAS = { lat: 3.3, lng: 99.1 }

export default async function geoRoutes(fastify: FastifyInstance) {
  const authOnly = [fastify.authenticate]

  // GET /api/geo/search?q=&lat=&lng= — Autocomplete tempat (master → cache → OpenStreetMap)
  fastify.get('/search', { preHandler: authOnly }, async (request, reply) => {
    const q = searchQuery.parse(request.query)
    const bias = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : DEFAULT_BIAS
    return reply.send(ok(await searchPlaces(q.q, bias)))
  })

  // POST /api/geo/select — Catat tempat yang dipilih agar masuk cache pencarian
  fastify.post('/select', { preHandler: authOnly }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(160) }).parse(request.body)
    return reply.send(ok({ saved: await recordPlaceSelection(id) }))
  })

  // GET /api/geo/reverse?lat=&lng= — Koordinat → alamat, provinsi, negara
  fastify.get('/reverse', { preHandler: authOnly }, async (request, reply) => {
    const { lat, lng } = reverseQuery.parse(request.query)
    return reply.send(ok(await reverseGeocode(lat, lng)))
  })

  // GET /api/geo/resolve-link?url= — Ambil koordinat / nama tempat dari link Google Maps
  fastify.get('/resolve-link', { preHandler: authOnly }, async (request, reply) => {
    const { url } = z.object({ url: z.string().min(1).max(2000) }).parse(request.query)
    const result = await resolveMapLink(url).catch(() => null)
    if (!result) {
      throw httpError(422, 'Link tidak dikenali. Tempel link "Bagikan" dari Google Maps atau ketik koordinat, mis. 3.1319, 99.3425.')
    }
    return reply.send(ok({
      lat:  result.point?.lat ?? null,
      lng:  result.point?.lng ?? null,
      nama: result.nama,
    }))
  })
}
