-- =============================================
-- 005_i18n_translations.sql
-- 多语言译文、增量同步状态与运行记录
-- =============================================

CREATE TABLE post_translations (
  post_id            uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  locale             text NOT NULL CHECK (locale IN ('en', 'ja')),
  title              text NOT NULL DEFAULT '',
  excerpt            text NOT NULL DEFAULT '',
  content            text NOT NULL DEFAULT '',
  source_hash        text NOT NULL DEFAULT '',
  source_title_hash  text NOT NULL DEFAULT '',
  source_excerpt_hash text NOT NULL DEFAULT '',
  source_blocks      jsonb NOT NULL DEFAULT '[]'::jsonb,
  translated_blocks  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  retry_count         integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error          text,
  translated_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, locale)
);

CREATE TABLE diary_translations (
  diary_id            uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
  locale              text NOT NULL CHECK (locale IN ('en', 'ja')),
  title               text NOT NULL DEFAULT '',
  content             text NOT NULL DEFAULT '',
  source_hash         text NOT NULL DEFAULT '',
  source_title_hash   text NOT NULL DEFAULT '',
  source_blocks       jsonb NOT NULL DEFAULT '[]'::jsonb,
  translated_blocks   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  retry_count         integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error          text,
  translated_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (diary_id, locale)
);

CREATE TABLE category_translations (
  category_id    uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale         text NOT NULL CHECK (locale IN ('en', 'ja')),
  name           text NOT NULL DEFAULT '',
  source_hash    text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  retry_count    integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error     text,
  translated_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, locale)
);

CREATE TABLE tag_translations (
  tag_id         uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  locale         text NOT NULL CHECK (locale IN ('en', 'ja')),
  name           text NOT NULL DEFAULT '',
  source_hash    text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  retry_count    integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error     text,
  translated_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, locale)
);

CREATE TABLE translation_runs (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_source    text NOT NULL CHECK (trigger_source IN ('cron', 'admin')),
  status            text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'complete', 'partial', 'failed')),
  model_id          text NOT NULL DEFAULT '',
  scanned_count     integer NOT NULL DEFAULT 0,
  reused_count      integer NOT NULL DEFAULT 0,
  translated_count integer NOT NULL DEFAULT 0,
  failed_count      integer NOT NULL DEFAULT 0,
  deleted_count     integer NOT NULL DEFAULT 0,
  error_summary     text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

-- A partial unique index is an atomic lock: only one run may be active.
CREATE UNIQUE INDEX translation_runs_single_active
  ON translation_runs (status)
  WHERE status = 'running';

CREATE INDEX post_translations_status_idx ON post_translations (status, locale);
CREATE INDEX diary_translations_status_idx ON diary_translations (status, locale);
CREATE INDEX category_translations_status_idx ON category_translations (status, locale);
CREATE INDEX tag_translations_status_idx ON tag_translations (status, locale);
CREATE INDEX translation_runs_started_at_idx ON translation_runs (started_at DESC);

CREATE TRIGGER update_post_translations_updated_at
  BEFORE UPDATE ON post_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_diary_translations_updated_at
  BEFORE UPDATE ON diary_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_category_translations_updated_at
  BEFORE UPDATE ON category_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tag_translations_updated_at
  BEFORE UPDATE ON tag_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Mark translations as pending when the Simplified Chinese source changes.
CREATE OR REPLACE FUNCTION mark_post_translations_pending()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' THEN
    INSERT INTO post_translations (post_id, locale, status)
    SELECT NEW.id, locale, 'pending'
    FROM unnest(ARRAY['en', 'ja']) AS locale
    ON CONFLICT (post_id, locale)
    DO UPDATE SET status = 'pending', last_error = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_mark_translations_pending
  AFTER INSERT OR UPDATE OF title, excerpt, content, status ON posts
  FOR EACH ROW EXECUTE FUNCTION mark_post_translations_pending();

CREATE OR REPLACE FUNCTION mark_diary_translations_pending()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO diary_translations (diary_id, locale, status)
  SELECT NEW.id, locale, 'pending'
  FROM unnest(ARRAY['en', 'ja']) AS locale
  ON CONFLICT (diary_id, locale)
  DO UPDATE SET status = 'pending', last_error = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diaries_mark_translations_pending
  AFTER INSERT OR UPDATE OF title, content ON diaries
  FOR EACH ROW EXECUTE FUNCTION mark_diary_translations_pending();

CREATE OR REPLACE FUNCTION mark_category_translations_pending()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO category_translations (category_id, locale, status)
  SELECT NEW.id, locale, 'pending'
  FROM unnest(ARRAY['en', 'ja']) AS locale
  ON CONFLICT (category_id, locale)
  DO UPDATE SET status = 'pending', last_error = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER categories_mark_translations_pending
  AFTER INSERT OR UPDATE OF name ON categories
  FOR EACH ROW EXECUTE FUNCTION mark_category_translations_pending();

CREATE OR REPLACE FUNCTION mark_tag_translations_pending()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tag_translations (tag_id, locale, status)
  SELECT NEW.id, locale, 'pending'
  FROM unnest(ARRAY['en', 'ja']) AS locale
  ON CONFLICT (tag_id, locale)
  DO UPDATE SET status = 'pending', last_error = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tags_mark_translations_pending
  AFTER INSERT OR UPDATE OF name ON tags
  FOR EACH ROW EXECUTE FUNCTION mark_tag_translations_pending();

ALTER TABLE post_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_translations_public_read_complete" ON post_translations
  FOR SELECT USING (status = 'complete');
CREATE POLICY "diary_translations_public_read_complete" ON diary_translations
  FOR SELECT USING (status = 'complete');
CREATE POLICY "category_translations_public_read_complete" ON category_translations
  FOR SELECT USING (status = 'complete');
CREATE POLICY "tag_translations_public_read_complete" ON tag_translations
  FOR SELECT USING (status = 'complete');
CREATE POLICY "translation_runs_auth_read" ON translation_runs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Translation writes intentionally have no client RLS policy. The server-side
-- Service Role is the only writer and bypasses RLS.
