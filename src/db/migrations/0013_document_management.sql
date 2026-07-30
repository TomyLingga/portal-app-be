DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ref_grade"
    GROUP BY "level"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ref_grade.level harus unik sebelum modul dokumen dapat dipasang';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "ref_grade" ADD CONSTRAINT "ref_grade_level_unique" UNIQUE("level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_organisasi_parent_id_idx" ON "unit_organisasi" USING btree ("parent_id");
--> statement-breakpoint
CREATE TYPE "public"."document_access_type" AS ENUM('view', 'edit', 'approve');
--> statement-breakpoint
CREATE TYPE "public"."document_download_status" AS ENUM('pending', 'approved', 'rejected', 'expired');
--> statement-breakpoint
CREATE TYPE "public"."document_audit_action" AS ENUM('view', 'download_request', 'download_approved', 'download_rejected', 'downloaded', 'uploaded', 'edited', 'deleted');
--> statement-breakpoint
CREATE TABLE "document_categories" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" varchar(150) NOT NULL,
  "code" varchar(40) NOT NULL,
  "default_confidentiality_level" integer NOT NULL,
  "auto_approve_grade_level" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "document_categories_code_unique" UNIQUE("code"),
  CONSTRAINT "document_categories_confidentiality_check" CHECK ("document_categories"."default_confidentiality_level" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "category_id" uuid NOT NULL,
  "title" varchar(300) NOT NULL,
  "description" text,
  "file_path" varchar(500) NOT NULL,
  "file_size" integer NOT NULL,
  "mime_type" varchar(150) NOT NULL,
  "confidentiality_level" integer,
  "owner_unit_id" uuid,
  "uploaded_by" uuid NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "documents_file_path_unique" UNIQUE("file_path"),
  CONSTRAINT "documents_file_size_check" CHECK ("documents"."file_size" > 0),
  CONSTRAINT "documents_version_check" CHECK ("documents"."version" >= 1),
  CONSTRAINT "documents_confidentiality_check" CHECK ("documents"."confidentiality_level" IS NULL OR "documents"."confidentiality_level" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "document_access_rules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid,
  "document_category_id" uuid,
  "unit_organisasi_id" uuid,
  "include_descendants" boolean DEFAULT true NOT NULL,
  "min_grade_level" integer,
  "access_type" "document_access_type" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "document_access_rules_target_check" CHECK ("document_access_rules"."document_id" IS NOT NULL OR "document_access_rules"."document_category_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "document_approvers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_category_id" uuid,
  "unit_organisasi_id" uuid,
  "employee_id" uuid NOT NULL,
  "approval_order" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "document_approvers_target_check" CHECK ("document_approvers"."document_category_id" IS NOT NULL OR "document_approvers"."unit_organisasi_id" IS NOT NULL),
  CONSTRAINT "document_approvers_order_check" CHECK ("document_approvers"."approval_order" >= 1)
);
--> statement-breakpoint
CREATE TABLE "document_download_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "status" "document_download_status" DEFAULT 'pending' NOT NULL,
  "reason" text,
  "approver_id" uuid,
  "approved_at" timestamp with time zone,
  "rejection_reason" text,
  "download_token" uuid,
  "token_expires_at" timestamp with time zone,
  "downloaded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "document_download_requests_download_token_unique" UNIQUE("download_token")
);
--> statement-breakpoint
CREATE TABLE "document_audit_log" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "action" "document_audit_action" NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_notification" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "type" varchar(80) NOT NULL,
  "title" varchar(180) NOT NULL,
  "message" text NOT NULL,
  "entity_type" varchar(80),
  "entity_id" uuid,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_auto_approve_grade_level_ref_grade_level_fk" FOREIGN KEY ("auto_approve_grade_level") REFERENCES "public"."ref_grade"("level") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_unit_id_unit_organisasi_id_fk" FOREIGN KEY ("owner_unit_id") REFERENCES "public"."unit_organisasi"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_employee_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_document_category_id_document_categories_id_fk" FOREIGN KEY ("document_category_id") REFERENCES "public"."document_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_unit_organisasi_id_unit_organisasi_id_fk" FOREIGN KEY ("unit_organisasi_id") REFERENCES "public"."unit_organisasi"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_access_rules" ADD CONSTRAINT "document_access_rules_min_grade_level_ref_grade_level_fk" FOREIGN KEY ("min_grade_level") REFERENCES "public"."ref_grade"("level") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "document_approvers" ADD CONSTRAINT "document_approvers_document_category_id_document_categories_id_fk" FOREIGN KEY ("document_category_id") REFERENCES "public"."document_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_approvers" ADD CONSTRAINT "document_approvers_unit_organisasi_id_unit_organisasi_id_fk" FOREIGN KEY ("unit_organisasi_id") REFERENCES "public"."unit_organisasi"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_approvers" ADD CONSTRAINT "document_approvers_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_download_requests" ADD CONSTRAINT "document_download_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_download_requests" ADD CONSTRAINT "document_download_requests_requested_by_employee_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_download_requests" ADD CONSTRAINT "document_download_requests_approver_id_employee_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portal_notification" ADD CONSTRAINT "portal_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "documents_category_id_idx" ON "documents" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "documents_owner_unit_id_idx" ON "documents" USING btree ("owner_unit_id");
--> statement-breakpoint
CREATE INDEX "documents_uploaded_by_idx" ON "documents" USING btree ("uploaded_by");
--> statement-breakpoint
CREATE INDEX "documents_active_created_idx" ON "documents" USING btree ("is_active", "created_at");
--> statement-breakpoint
CREATE INDEX "document_access_rules_document_idx" ON "document_access_rules" USING btree ("document_id", "access_type");
--> statement-breakpoint
CREATE INDEX "document_access_rules_category_idx" ON "document_access_rules" USING btree ("document_category_id", "access_type");
--> statement-breakpoint
CREATE INDEX "document_access_rules_unit_idx" ON "document_access_rules" USING btree ("unit_organisasi_id");
--> statement-breakpoint
CREATE INDEX "document_approvers_category_idx" ON "document_approvers" USING btree ("document_category_id");
--> statement-breakpoint
CREATE INDEX "document_approvers_unit_idx" ON "document_approvers" USING btree ("unit_organisasi_id");
--> statement-breakpoint
CREATE INDEX "document_approvers_employee_idx" ON "document_approvers" USING btree ("employee_id");
--> statement-breakpoint
CREATE INDEX "document_download_requests_document_idx" ON "document_download_requests" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX "document_download_requests_requester_idx" ON "document_download_requests" USING btree ("requested_by", "created_at");
--> statement-breakpoint
CREATE INDEX "document_download_requests_approver_idx" ON "document_download_requests" USING btree ("approver_id");
--> statement-breakpoint
CREATE INDEX "document_download_requests_status_idx" ON "document_download_requests" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_download_requests_pending_uidx" ON "document_download_requests" USING btree ("document_id", "requested_by") WHERE "document_download_requests"."status" = 'pending';
--> statement-breakpoint
CREATE INDEX "document_audit_log_document_idx" ON "document_audit_log" USING btree ("document_id", "created_at");
--> statement-breakpoint
CREATE INDEX "document_audit_log_employee_idx" ON "document_audit_log" USING btree ("employee_id", "created_at");
--> statement-breakpoint
CREATE INDEX "document_audit_log_action_idx" ON "document_audit_log" USING btree ("action", "created_at");
--> statement-breakpoint
CREATE INDEX "portal_notification_user_unread_idx" ON "portal_notification" USING btree ("user_id", "is_read", "created_at");
--> statement-breakpoint
INSERT INTO "document_categories" ("id", "name", "code", "default_confidentiality_level") VALUES
  (gen_random_uuid(), 'SOP', 'SOP', 2),
  (gen_random_uuid(), 'Laporan Keuangan', 'LK', 4),
  (gen_random_uuid(), 'Pedoman Bisnis', 'PB', 3),
  (gen_random_uuid(), 'Annual Report', 'ANNUAL', 1)
ON CONFLICT ("code") DO NOTHING;
