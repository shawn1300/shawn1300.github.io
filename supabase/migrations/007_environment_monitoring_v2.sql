-- =============================================
-- 007_environment_monitoring_v2.sql
-- 模块化场所、来源、设备、指标与独立 30 天读数保留
-- =============================================

BEGIN;

ALTER TABLE environment_locations
  ADD COLUMN public_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0);

CREATE TABLE environment_sources (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  source_type   text NOT NULL CHECK (source_type IN ('home_assistant', 'esp32')),
  token_digest  text CHECK (token_digest IS NULL OR token_digest ~ '^[0-9a-f]{64}$'),
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX environment_sources_token_digest_uidx
  ON environment_sources (token_digest)
  WHERE token_digest IS NOT NULL;
CREATE INDEX environment_sources_enabled_idx
  ON environment_sources (enabled, slug);

CREATE TABLE environment_devices (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id    uuid NOT NULL REFERENCES environment_locations(id) ON DELETE CASCADE,
  source_id      uuid NOT NULL REFERENCES environment_sources(id) ON DELETE RESTRICT,
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_zh        text NOT NULL,
  name_en        text NOT NULL,
  name_ja        text NOT NULL,
  placement      text NOT NULL CHECK (placement IN ('indoor', 'outdoor', 'other')),
  enabled        boolean NOT NULL DEFAULT true,
  display_order  integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX environment_devices_location_order_idx
  ON environment_devices (location_id, enabled, display_order, slug);
CREATE INDEX environment_devices_source_idx
  ON environment_devices (source_id, enabled, slug);

CREATE TABLE environment_device_metrics (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id      uuid NOT NULL REFERENCES environment_devices(id) ON DELETE CASCADE,
  metric_key     text NOT NULL CHECK (
    metric_key IN ('temperatureC', 'humidityPercent', 'co2Ppm', 'pm25UgM3', 'batteryPercent')
  ),
  enabled        boolean NOT NULL DEFAULT true,
  display_order  integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  show_aqi       boolean NOT NULL DEFAULT false CHECK (NOT show_aqi OR metric_key = 'pm25UgM3'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, metric_key)
);

CREATE INDEX environment_device_metrics_lookup_idx
  ON environment_device_metrics (device_id, enabled, display_order, metric_key);

CREATE TABLE environment_metric_readings (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_id           uuid NOT NULL REFERENCES environment_device_metrics(id) ON DELETE CASCADE,
  value               numeric NOT NULL,
  source_updated_at   timestamptz NOT NULL,
  collected_at        timestamptz NOT NULL DEFAULT now(),
  ten_minute_bucket   timestamptz NOT NULL,
  idempotency_key     text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (metric_id, ten_minute_bucket)
);

CREATE INDEX environment_metric_readings_metric_time_idx
  ON environment_metric_readings (metric_id, source_updated_at DESC);
CREATE INDEX environment_metric_readings_collected_at_idx
  ON environment_metric_readings (collected_at);

CREATE TABLE environment_location_comparisons (
  location_id       uuid PRIMARY KEY REFERENCES environment_locations(id) ON DELETE CASCADE,
  indoor_device_id  uuid NOT NULL REFERENCES environment_devices(id) ON DELETE CASCADE,
  outdoor_device_id uuid NOT NULL REFERENCES environment_devices(id) ON DELETE CASCADE,
  CHECK (indoor_device_id <> outdoor_device_id)
);

CREATE OR REPLACE FUNCTION validate_environment_metric_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  configured_key text;
BEGIN
  SELECT metric_key INTO configured_key
  FROM environment_device_metrics
  WHERE id = NEW.metric_id AND enabled = true;

  IF configured_key IS NULL THEN
    RAISE EXCEPTION 'environment metric is unavailable' USING ERRCODE = '23514';
  END IF;

  IF NOT (CASE configured_key
    WHEN 'temperatureC' THEN NEW.value BETWEEN -30 AND 100
    WHEN 'humidityPercent' THEN NEW.value BETWEEN 0 AND 100
    WHEN 'co2Ppm' THEN NEW.value BETWEEN 1 AND 50000
    WHEN 'pm25UgM3' THEN NEW.value BETWEEN 0 AND 5000
    WHEN 'batteryPercent' THEN NEW.value BETWEEN 0 AND 100
    ELSE false
  END) THEN
    RAISE EXCEPTION 'environment metric value is outside its allowed range' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_environment_metric_reading_before_write
  BEFORE INSERT OR UPDATE OF metric_id, value ON environment_metric_readings
  FOR EACH ROW EXECUTE FUNCTION validate_environment_metric_reading();

CREATE OR REPLACE FUNCTION validate_environment_location_comparison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  indoor_ok boolean;
  outdoor_ok boolean;
BEGIN
  SELECT d.location_id = NEW.location_id AND d.placement = 'indoor' AND d.enabled
    AND EXISTS (SELECT 1 FROM environment_device_metrics m WHERE m.device_id = d.id AND m.metric_key = 'temperatureC' AND m.enabled)
    AND EXISTS (SELECT 1 FROM environment_device_metrics m WHERE m.device_id = d.id AND m.metric_key = 'humidityPercent' AND m.enabled)
  INTO indoor_ok FROM environment_devices d WHERE d.id = NEW.indoor_device_id;

  SELECT d.location_id = NEW.location_id AND d.placement = 'outdoor' AND d.enabled
    AND EXISTS (SELECT 1 FROM environment_device_metrics m WHERE m.device_id = d.id AND m.metric_key = 'temperatureC' AND m.enabled)
    AND EXISTS (SELECT 1 FROM environment_device_metrics m WHERE m.device_id = d.id AND m.metric_key = 'humidityPercent' AND m.enabled)
  INTO outdoor_ok FROM environment_devices d WHERE d.id = NEW.outdoor_device_id;

  IF coalesce(indoor_ok, false) IS NOT true OR coalesce(outdoor_ok, false) IS NOT true THEN
    RAISE EXCEPTION 'invalid environment location comparison' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_environment_location_comparison_before_write
  BEFORE INSERT OR UPDATE ON environment_location_comparisons
  FOR EACH ROW EXECUTE FUNCTION validate_environment_location_comparison();

CREATE TRIGGER update_environment_sources_updated_at
  BEFORE UPDATE ON environment_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_environment_devices_updated_at
  BEFORE UPDATE ON environment_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_environment_device_metrics_updated_at
  BEFORE UPDATE ON environment_device_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE environment_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_device_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_metric_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_location_comparisons ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE environment_sources, environment_devices,
  environment_device_metrics, environment_metric_readings,
  environment_location_comparisons FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE environment_sources,
  environment_devices, environment_device_metrics,
  environment_metric_readings, environment_location_comparisons TO service_role;

CREATE INDEX environment_locations_public_order_idx
  ON environment_locations (public_enabled, enabled, display_order, slug);

INSERT INTO environment_locations
  (slug, name_zh, name_en, name_ja, timezone, enabled, public_enabled, display_order)
VALUES ('home', '家', 'Home', '自宅', 'Australia/Perth', true, true, 0)
ON CONFLICT (slug) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  name_ja = EXCLUDED.name_ja,
  timezone = EXCLUDED.timezone,
  enabled = EXCLUDED.enabled,
  public_enabled = EXCLUDED.public_enabled,
  display_order = EXCLUDED.display_order;

INSERT INTO environment_sources (slug, name, source_type, token_digest, enabled)
VALUES ('home-assistant', 'Home Assistant', 'home_assistant', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  enabled = EXCLUDED.enabled;

INSERT INTO environment_devices
  (location_id, source_id, slug, name_zh, name_en, name_ja, placement, enabled, display_order)
SELECT l.id, s.id, seed.slug, seed.name_zh, seed.name_en, seed.name_ja,
  seed.placement, true, seed.display_order
FROM environment_locations l
CROSS JOIN environment_sources s
CROSS JOIN (VALUES
  ('home-indoor', '室内', 'Indoor', '室内', 'indoor', 0),
  ('home-outdoor', '室外', 'Outdoor', '屋外', 'outdoor', 1)
) AS seed(slug, name_zh, name_en, name_ja, placement, display_order)
WHERE l.slug = 'home' AND s.slug = 'home-assistant'
ON CONFLICT (slug) DO UPDATE SET
  location_id = EXCLUDED.location_id,
  source_id = EXCLUDED.source_id,
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  name_ja = EXCLUDED.name_ja,
  placement = EXCLUDED.placement,
  enabled = EXCLUDED.enabled,
  display_order = EXCLUDED.display_order;

INSERT INTO environment_device_metrics
  (device_id, metric_key, enabled, display_order, show_aqi)
SELECT d.id, seed.metric_key, true, seed.display_order, false
FROM environment_devices d
CROSS JOIN (VALUES
  ('temperatureC', 0),
  ('humidityPercent', 1),
  ('batteryPercent', 2)
) AS seed(metric_key, display_order)
WHERE d.slug IN ('home-indoor', 'home-outdoor')
ON CONFLICT (device_id, metric_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  display_order = EXCLUDED.display_order,
  show_aqi = EXCLUDED.show_aqi;

INSERT INTO environment_location_comparisons
  (location_id, indoor_device_id, outdoor_device_id)
SELECT l.id, indoor.id, outdoor.id
FROM environment_locations l
CROSS JOIN environment_devices indoor
CROSS JOIN environment_devices outdoor
WHERE l.slug = 'home'
  AND indoor.slug = 'home-indoor'
  AND outdoor.slug = 'home-outdoor'
ON CONFLICT (location_id) DO UPDATE SET
  indoor_device_id = EXCLUDED.indoor_device_id,
  outdoor_device_id = EXCLUDED.outdoor_device_id;

INSERT INTO environment_metric_readings
  (metric_id, value, source_updated_at, collected_at, ten_minute_bucket, idempotency_key)
SELECT metric.id,
  CASE values.metric_key
    WHEN 'temperatureC' THEN reading.temperature_c
    WHEN 'humidityPercent' THEN reading.humidity_percent
    WHEN 'batteryPercent' THEN reading.battery_percent
  END,
  reading.source_updated_at,
  reading.collected_at,
  date_bin('10 minutes', reading.collected_at, timestamptz '1970-01-01 00:00:00+00'),
  'legacy:' || reading.id::text || ':' || values.metric_key
FROM environment_readings reading
JOIN environment_sensors sensor ON sensor.id = reading.sensor_id
JOIN environment_locations location ON location.id = sensor.location_id AND location.slug = 'home'
JOIN environment_devices device ON device.slug = 'home-' || sensor.role
CROSS JOIN LATERAL (VALUES
  ('temperatureC'),
  ('humidityPercent'),
  ('batteryPercent')
) AS values(metric_key)
JOIN environment_device_metrics metric
  ON metric.device_id = device.id AND metric.metric_key = values.metric_key
WHERE reading.collected_at >= now() - interval '30 days'
  AND CASE values.metric_key
    WHEN 'temperatureC' THEN reading.temperature_c
    WHEN 'humidityPercent' THEN reading.humidity_percent
    WHEN 'batteryPercent' THEN reading.battery_percent
  END IS NOT NULL
ON CONFLICT (metric_id, ten_minute_bucket) DO NOTHING;

CREATE OR REPLACE FUNCTION cleanup_environment_readings()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  legacy_count bigint;
  modular_count bigint;
BEGIN
  DELETE FROM environment_metric_readings
  WHERE collected_at < now() - interval '30 days';
  GET DIAGNOSTICS modular_count = ROW_COUNT;

  DELETE FROM environment_readings
  WHERE collected_at < now() - interval '30 days';
  GET DIAGNOSTICS legacy_count = ROW_COUNT;

  RETURN modular_count + legacy_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_environment_readings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_environment_readings() TO service_role;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'environment-readings-retention';

SELECT cron.schedule(
  'environment-readings-retention',
  '17 19 * * *',
  $$SELECT public.cleanup_environment_readings();$$
);

COMMIT;
