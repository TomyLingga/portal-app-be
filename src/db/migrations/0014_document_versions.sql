-- Create document_versions table for GitHub-style revision tracking
CREATE TABLE IF NOT EXISTS "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
	"version" integer NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"changelog" text,
	"uploaded_by" uuid NOT NULL REFERENCES "employee"("id") ON DELETE RESTRICT,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_versions_document_idx" ON "document_versions" ("document_id", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_doc_ver_uidx" ON "document_versions" ("document_id", "version");

ALTER TYPE "document_audit_action" ADD VALUE IF NOT EXISTS 'revised';
