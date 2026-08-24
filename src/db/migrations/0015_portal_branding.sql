CREATE TABLE IF NOT EXISTS "portal_branding" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"portal_name" varchar(120) NOT NULL,
	"admin_panel_name" varchar(100) NOT NULL,
	"admin_hero_title" varchar(160) NOT NULL,
	"admin_hero_description" text NOT NULL,
	"updated_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "portal_branding" (
	"id",
	"portal_name",
	"admin_panel_name",
	"admin_hero_title",
	"admin_hero_description"
) VALUES (
	'primary',
	'InTes (Integrated Enterprise System)',
	'InTes Admin Panel',
	'Pusat Administrasi Portal SSO PT INL',
	'Kelola seluruh aspek sistem portal dari satu pusat kontrol yang terintegrasi dan aman. Memastikan operasional aplikasi PT Industri Nabati Lestari (KEK Sei Mangkei) berjalan lancar.'
)
ON CONFLICT ("id") DO NOTHING;
