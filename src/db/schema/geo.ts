// ─── Schema: Geo Cache ────────────────────────────────────────────────────────
// Cache hasil pencarian tempat & reverse geocode supaya permintaan yang sama
// tidak berulang-ulang dikirim ke layanan peta eksternal (services/geo.service.ts).
import { pgTable, varchar, text, integer, numeric, timestamp } from 'drizzle-orm/pg-core'

// Tempat yang pernah DIPILIH user dari hasil pencarian. Pencarian berikutnya
// dilayani dari sini lebih dulu, diurutkan dari yang paling sering dipakai.
export const geoPlaceCache = pgTable('geo_place_cache', {
  placeKey:   varchar('place_key', { length: 120 }).primaryKey(), // mis. 'osm:N10996444518'
  source:     varchar('source', { length: 20 }).notNull(),        // 'osm'
  nama:       varchar('nama', { length: 255 }).notNull(),
  alamat:     text('alamat').notNull().default(''),
  kategori:   varchar('kategori', { length: 60 }),
  lat:        numeric('lat', { precision: 10, scale: 7 }).notNull(),
  lng:        numeric('lng', { precision: 10, scale: 7 }).notNull(),
  searchText: text('search_text').notNull(),                      // nama + kategori + alamat, huruf kecil tanpa diakritik
  hitCount:   integer('hit_count').notNull().default(1),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Hasil reverse geocode per koordinat (dibulatkan 5 desimal ≈ 1 m).
export const geoReverseCache = pgTable('geo_reverse_cache', {
  coordKey:     varchar('coord_key', { length: 40 }).primaryKey(), // '3.13200,99.34257'
  alamat:       text('alamat').notNull().default(''),
  provinsi:     varchar('provinsi', { length: 120 }),
  provinsiKode: varchar('provinsi_kode', { length: 10 }),           // ISO 3166-2, mis. 'ID-SU'
  negara:       varchar('negara', { length: 120 }),
  negaraKode:   varchar('negara_kode', { length: 2 }),
  source:       varchar('source', { length: 20 }).notNull(),        // 'nominatim'
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
