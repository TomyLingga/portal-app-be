-- Migration: document_global_viewers
CREATE TABLE IF NOT EXISTS document_global_viewers (
  id UUID PRIMARY KEY NOT NULL,
  unit_organisasi_id UUID REFERENCES unit_organisasi(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employee(id) ON DELETE CASCADE,
  include_descendants BOOLEAN NOT NULL DEFAULT TRUE,
  notes VARCHAR(300),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT document_global_viewers_target_check
    CHECK (unit_organisasi_id IS NOT NULL OR employee_id IS NOT NULL),
  CONSTRAINT document_global_viewers_exclusive_check
    CHECK (NOT (unit_organisasi_id IS NOT NULL AND employee_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS document_global_viewers_unit_idx ON document_global_viewers(unit_organisasi_id);
CREATE INDEX IF NOT EXISTS document_global_viewers_employee_idx ON document_global_viewers(employee_id);
