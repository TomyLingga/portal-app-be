CREATE TABLE "ref_penempatan_area" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nama" varchar(150) NOT NULL,
	"longitude" varchar(50) NOT NULL,
	"latitude" varchar(50) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "penempatan_area_id" uuid;--> statement-breakpoint
ALTER TABLE "aplikasi" ADD COLUMN "warna" varchar(50) DEFAULT '#3b82f6' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_penempatan_area_id_ref_penempatan_area_id_fk" FOREIGN KEY ("penempatan_area_id") REFERENCES "public"."ref_penempatan_area"("id") ON DELETE no action ON UPDATE no action;