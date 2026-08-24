CREATE TABLE "ref_tipe_unit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	"warna" varchar(50) NOT NULL,
	CONSTRAINT "ref_tipe_unit_kode_unique" UNIQUE("kode")
);
