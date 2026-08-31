BEGIN;

CREATE SCHEMA IF NOT EXISTS propeptiq_auth;

CREATE TABLE IF NOT EXISTS propeptiq_auth.rate_limit_windows (
  scope_hash text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  count integer NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT rate_limit_windows_scope_start_pk
    PRIMARY KEY (scope_hash, window_start),
  CONSTRAINT rate_limit_windows_scope_sha256
    CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT rate_limit_windows_count_positive
    CHECK (count > 0),
  CONSTRAINT rate_limit_windows_expiry_after_start
    CHECK (expires_at > window_start)
);

CREATE INDEX IF NOT EXISTS rate_limit_windows_expiry_idx
  ON propeptiq_auth.rate_limit_windows (expires_at);

DO $migration_postconditions$
DECLARE
  actual_columns text[];
BEGIN
  SELECT array_agg(
    column_name || ':' || data_type || ':' || is_nullable
    ORDER BY ordinal_position
  )
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'propeptiq_auth'
    AND table_name = 'rate_limit_windows';

  IF actual_columns IS DISTINCT FROM ARRAY[
    'scope_hash:text:NO',
    'window_start:timestamp with time zone:NO',
    'count:integer:NO',
    'expires_at:timestamp with time zone:NO'
  ]::text[] THEN
    RAISE EXCEPTION
      'Unexpected propeptiq_auth.rate_limit_windows column shape: %',
      actual_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'propeptiq_auth.rate_limit_windows'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) =
        'PRIMARY KEY (scope_hash, window_start)'
  ) THEN
    RAISE EXCEPTION
      'propeptiq_auth.rate_limit_windows requires its composite primary key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'rate_limit_windows_scope_sha256',
          'CHECK ((scope_hash ~ ''^[0-9a-f]{64}$''::text))'
        ),
        (
          'rate_limit_windows_count_positive',
          'CHECK ((count > 0))'
        ),
        (
          'rate_limit_windows_expiry_after_start',
          'CHECK ((expires_at > window_start))'
        )
    ) AS expected(conname, definition)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_constraint actual
      WHERE actual.conrelid =
        'propeptiq_auth.rate_limit_windows'::regclass
        AND actual.conname = expected.conname
        AND pg_get_constraintdef(actual.oid) = expected.definition
    )
  ) THEN
    RAISE EXCEPTION
      'propeptiq_auth.rate_limit_windows requires its safety checks';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'propeptiq_auth'
      AND tablename = 'rate_limit_windows'
      AND indexname = 'rate_limit_windows_expiry_idx'
      AND indexdef =
        'CREATE INDEX rate_limit_windows_expiry_idx ON propeptiq_auth.rate_limit_windows USING btree (expires_at)'
  ) THEN
    RAISE EXCEPTION
      'propeptiq_auth.rate_limit_windows requires its expiry index';
  END IF;
END
$migration_postconditions$;

COMMIT;
