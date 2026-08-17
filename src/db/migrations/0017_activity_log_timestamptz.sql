-- Convert activity_log.created_at from timestamp without time zone to
-- timestamp with time zone. Existing values are Asia/Jakarta wall-clock time
-- (the DB session timezone), so re-interpret them as WIB. This does not delete
-- or rewrite any row data; it only changes how the stored instant is typed.
ALTER TABLE "activity_log"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE 'Asia/Jakarta';
