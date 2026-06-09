-- =============================================
-- 001_initial.sql
-- 个人博客系统 — 初始数据库迁移
-- 在 Supabase SQL Editor 中执行此文件
-- =============================================

-- ── 启用 UUID 扩展 ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. 分类表
-- =============================================
CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 2. 标签表
-- =============================================
CREATE TABLE tags (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 3. 文章表
-- =============================================
CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         text NOT NULL,
  slug          text NOT NULL UNIQUE,
  content       text NOT NULL DEFAULT '',
  excerpt       text NOT NULL DEFAULT '',
  cover_image   text,
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at  timestamptz,
  author_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_published_at ON posts(published_at DESC);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_author_id ON posts(author_id);

-- =============================================
-- 4. 文章-标签关联表
-- =============================================
CREATE TABLE post_tags (
  post_id  uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id   uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- =============================================
-- 5. 评论表
-- =============================================
CREATE TABLE comments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_name   text NOT NULL DEFAULT '匿名',
  author_email  text,
  content       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_post_id ON comments(post_id, created_at ASC);

-- =============================================
-- 6. updated_at 自动更新触发器
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 7. 自动设置 published_at
-- =============================================
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status = 'draft' THEN
    NEW.published_at = COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_posts_published_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_published_at();

-- =============================================
-- 8. Row Level Security (RLS)
-- =============================================

-- 启用 RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 辅助函数：判断当前用户是否为博主
-- 博主 ID 从 auth.users 中获取（你在 Supabase Auth 中注册的账号）
-- 你需要在执行此迁移后，将你的 user ID 替换到下面的策略中
-- 或者你可以创建一个 profiles 表，用一个 is_admin 字段标记

-- ── categories ──
-- 公开可读
CREATE POLICY "categories_public_read" ON categories
  FOR SELECT USING (true);
-- 仅认证用户可写（后续可限制为指定博主 ID）
CREATE POLICY "categories_auth_write" ON categories
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "categories_auth_update" ON categories
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "categories_auth_delete" ON categories
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── tags ──
CREATE POLICY "tags_public_read" ON tags
  FOR SELECT USING (true);
CREATE POLICY "tags_auth_write" ON tags
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "tags_auth_update" ON tags
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "tags_auth_delete" ON tags
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── posts ──
-- 公开可读已发布文章
CREATE POLICY "posts_public_read_published" ON posts
  FOR SELECT USING (status = 'published');
-- 认证用户可读所有文章（包括草稿）
CREATE POLICY "posts_auth_read_all" ON posts
  FOR SELECT USING (auth.role() = 'authenticated');
-- 认证用户可写
CREATE POLICY "posts_auth_insert" ON posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "posts_auth_update" ON posts
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "posts_auth_delete" ON posts
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── post_tags ──
CREATE POLICY "post_tags_public_read" ON post_tags
  FOR SELECT USING (true);
CREATE POLICY "post_tags_auth_write" ON post_tags
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "post_tags_auth_delete" ON post_tags
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── comments ──
-- 公开可读
CREATE POLICY "comments_public_read" ON comments
  FOR SELECT USING (true);
-- 公开可插入（匿名评论）
CREATE POLICY "comments_public_insert" ON comments
  FOR INSERT WITH CHECK (true);
-- 仅认证用户可删除
CREATE POLICY "comments_auth_delete" ON comments
  FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- 9. Storage Bucket 配置
-- 在 Supabase Dashboard → Storage 中手动创建：
--   Bucket 名称: blog-images
--   公开访问: 开启
--   RLS 策略:
--     SELECT — 公开
--     INSERT — auth.role() = 'authenticated'
--     DELETE — auth.role() = 'authenticated'
-- =============================================
