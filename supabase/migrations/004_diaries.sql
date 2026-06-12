-- =============================================
-- 004_diaries.sql
-- 日记表 — 极简文章，仅标题+内容
-- =============================================

-- ── 日记表 ──
CREATE TABLE diaries (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       text NOT NULL,
  slug        text NOT NULL UNIQUE,
  content     text NOT NULL DEFAULT '',
  author_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_diaries_slug ON diaries(slug);
CREATE INDEX idx_diaries_created_at ON diaries(created_at DESC);
CREATE INDEX idx_diaries_author_id ON diaries(author_id);

-- ── updated_at 触发器（重用 001 中创建的函数）──
CREATE TRIGGER update_diaries_updated_at
  BEFORE UPDATE ON diaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──
ALTER TABLE diaries ENABLE ROW LEVEL SECURITY;

-- 公开可读
CREATE POLICY "diaries_public_read" ON diaries
  FOR SELECT USING (true);

-- 仅认证用户可写
CREATE POLICY "diaries_auth_insert" ON diaries
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "diaries_auth_update" ON diaries
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "diaries_auth_delete" ON diaries
  FOR DELETE USING (auth.role() = 'authenticated');
