-- =============================================
-- 003_comments_delete_ip.sql
-- 评论表新增：删除令牌 + IP 记录
-- 请在 Supabase Dashboard → SQL Editor 中执行
-- =============================================

-- 新增字段
ALTER TABLE comments ADD COLUMN IF NOT EXISTS delete_token text;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS ip_address text;

-- 更新 RLS：允许凭 delete_token 删除自己的评论
DROP POLICY IF EXISTS comments_token_delete ON comments;
CREATE POLICY comments_token_delete ON comments
  FOR DELETE USING (
    auth.role() = 'authenticated'
    OR delete_token IS NOT NULL
  );
