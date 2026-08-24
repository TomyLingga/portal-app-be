CREATE TYPE "public"."tipe_unit" AS ENUM('direktorat', 'sevp', 'bagian', 'sub_bagian', 'seksi');--> statement-breakpoint
CREATE TYPE "public"."auth_mode" AS ENUM('sso', 'independent');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'super_admin');--> statement-breakpoint
CREATE TABLE "ref_grade" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"keterangan" text,
	CONSTRAINT "ref_grade_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "ref_pendidikan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ref_pendidikan_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "ref_status_karyawan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	CONSTRAINT "ref_status_karyawan_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "ref_status_pernikahan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	CONSTRAINT "ref_status_pernikahan_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "unit_organisasi" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nama" varchar(150) NOT NULL,
	"kode" varchar(20) NOT NULL,
	"tipe" "tipe_unit" NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "unit_organisasi_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nrk" varchar(50) NOT NULL,
	"nik" varchar(20) NOT NULL,
	"nama" varchar(150) NOT NULL,
	"jenis_kelamin" varchar(1) NOT NULL,
	"jabatan" varchar(150) NOT NULL,
	"grade_id" uuid,
	"atasan_id" uuid,
	"unit_organisasi_id" uuid,
	"tanggal_masuk" date,
	"tempat_lahir" varchar(100),
	"tanggal_lahir" date,
	"foto_profil" varchar(255),
	"status_karyawan_id" uuid,
	"pendidikan_terakhir_id" uuid,
	"status_pernikahan_id" uuid,
	"nomor_hp" varchar(20),
	"alamat" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_nrk_unique" UNIQUE("nrk"),
	CONSTRAINT "employee_nik_unique" UNIQUE("nik")
);
--> statement-breakpoint
CREATE TABLE "aplikasi" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nama" varchar(150) NOT NULL,
	"url" varchar(500) NOT NULL,
	"auth_mode" "auth_mode" DEFAULT 'independent' NOT NULL,
	"icon" varchar(500),
	"deskripsi" text,
	"urutan" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "refresh_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(500) NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "refresh_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sso_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"token_hash" varchar(500) NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"token_version" integer DEFAULT 1 NOT NULL,
	"employee_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
ALTER TABLE "unit_organisasi" ADD CONSTRAINT "unit_organisasi_parent_id_unit_organisasi_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."unit_organisasi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_grade_id_ref_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."ref_grade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_atasan_id_employee_id_fk" FOREIGN KEY ("atasan_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_unit_organisasi_id_unit_organisasi_id_fk" FOREIGN KEY ("unit_organisasi_id") REFERENCES "public"."unit_organisasi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_status_karyawan_id_ref_status_karyawan_id_fk" FOREIGN KEY ("status_karyawan_id") REFERENCES "public"."ref_status_karyawan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_pendidikan_terakhir_id_ref_pendidikan_id_fk" FOREIGN KEY ("pendidikan_terakhir_id") REFERENCES "public"."ref_pendidikan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_status_pernikahan_id_ref_status_pernikahan_id_fk" FOREIGN KEY ("status_pernikahan_id") REFERENCES "public"."ref_status_pernikahan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_access" ADD CONSTRAINT "app_user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_access" ADD CONSTRAINT "app_user_access_app_id_aplikasi_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."aplikasi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_access" ADD CONSTRAINT "app_user_access_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_token" ADD CONSTRAINT "sso_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_token" ADD CONSTRAINT "sso_token_app_id_aplikasi_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."aplikasi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;