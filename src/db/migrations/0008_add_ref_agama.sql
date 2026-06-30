CREATE TABLE "ref_agama" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	CONSTRAINT "ref_agama_kode_unique" UNIQUE("kode")
);
