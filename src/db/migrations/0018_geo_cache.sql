-- Migration: geo_cache
-- Cache pencarian tempat & reverse geocode untuk map picker (services/geo.service.ts),
-- supaya permintaan yang sama tidak berulang dikirim ke layanan peta eksternal.
CREATE TABLE IF NOT EXISTS "geo_place_cache" (
  "place_key"    VARCHAR(120) PRIMARY KEY NOT NULL,
  "source"       VARCHAR(20) NOT NULL,
  "nama"         VARCHAR(255) NOT NULL,
  "alamat"       TEXT DEFAULT '' NOT NULL,
  "kategori"     VARCHAR(60),
  "lat"          NUMERIC(10, 7) NOT NULL,
  "lng"          NUMERIC(10, 7) NOT NULL,
  "search_text"  TEXT NOT NULL,
  "hit_count"    INTEGER DEFAULT 1 NOT NULL,
  "last_used_at" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "created_at"   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_reverse_cache" (
  "coord_key"     VARCHAR(40) PRIMARY KEY NOT NULL,
  "alamat"        TEXT DEFAULT '' NOT NULL,
  "provinsi"      VARCHAR(120),
  "provinsi_kode" VARCHAR(10),
  "negara"        VARCHAR(120),
  "negara_kode"   VARCHAR(2),
  "source"        VARCHAR(20) NOT NULL,
  "created_at"    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
