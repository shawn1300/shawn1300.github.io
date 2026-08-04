-- =============================================
-- 006_environment_monitoring.sql
-- Home Assistant 环境读数、30 天保留与私有访问边界
-- =============================================

BEGIN;

CREATE TABLE environment_locations (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_zh     text NOT NULL,
  name_en     text NOT NULL,
  name_ja     text NOT NULL,
  timezone    text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE environment_sensors (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id   uuid NOT NULL REFERENCES environment_locations(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('indoor', 'outdoor')),
  name_zh       text NOT NULL,
  name_en       text NOT NULL,
  name_ja       text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, role)
);

CREATE TABLE environment_readings (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_id           uuid NOT NULL REFERENCES environment_sensors(id) ON DELETE CASCADE,
  temperature_c       numeric(5, 2) NOT NULL CHECK (temperature_c BETWEEN -30 AND 100),
  humidity_percent    numeric(5, 2) NOT NULL CHECK (humidity_percent BETWEEN 0 AND 100),
  battery_percent     numeric(5, 2) CHECK (battery_percent BETWEEN 0 AND 100),
  source_updated_at   timestamptz NOT NULL,
  collected_at        timestamptz NOT NULL DEFAULT now(),
  idempotency_key     text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 80),
  UNIQUE (sensor_id, idempotency_key)
);

CREATE INDEX environment_sensors_location_idx
  ON environment_sensors (location_id, enabled, role);
CREATE INDEX environment_readings_sensor_time_idx
  ON environment_readings (sensor_id, collected_at DESC);
CREATE INDEX environment_readings_collected_at_idx
  ON environment_readings (collected_at);

CREATE TRIGGER update_environment_locations_updated_at
  BEFORE UPDATE ON environment_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_environment_sensors_updated_at
  BEFORE UPDATE ON environment_sensors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE environment_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_readings ENABLE ROW LEVEL SECURITY;

-- No anonymous or authenticated client policies are intentional. All reads
-- and writes are projected through server-only Route Handlers using the
-- Service Role client, which bypasses RLS.

INSERT INTO environment_locations (slug, name_zh, name_en, name_ja, timezone)
VALUES ('home', '家', 'Home', '自宅', 'Australia/Perth')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO environment_sensors (location_id, role, name_zh, name_en, name_ja)
SELECT id, 'indoor', '室内', 'Indoor', '室内'
FROM environment_locations
WHERE slug = 'home'
ON CONFLICT (location_id, role) DO NOTHING;

INSERT INTO environment_sensors (location_id, role, name_zh, name_en, name_ja)
SELECT id, 'outdoor', '室外', 'Outdoor', '屋外'
FROM environment_locations
WHERE slug = 'home'
ON CONFLICT (location_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION cleanup_environment_readings()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM environment_readings
  WHERE collected_at < now() - interval '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_environment_readings() FROM PUBLIC;
REVOKE ALL ON FUNCTION cleanup_environment_readings() FROM anon;
REVOKE ALL ON FUNCTION cleanup_environment_readings() FROM authenticated;
GRANT EXECUTE ON FUNCTION cleanup_environment_readings() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'environment-readings-retention';

SELECT cron.schedule(
  'environment-readings-retention',
  '17 19 * * *',
  $$SELECT public.cleanup_environment_readings();$$
);

COMMIT;
