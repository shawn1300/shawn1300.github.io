-- =============================================
-- 002_gallery_bucket.sql
-- 相册专用 Storage Bucket RLS 策略
-- 请在 Supabase Dashboard → SQL Editor 中执行
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'gallery_public_read' AND tablename = 'objects'
  ) THEN
    CREATE POLICY gallery_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'gallery');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'gallery_auth_insert' AND tablename = 'objects'
  ) THEN
    CREATE POLICY gallery_auth_insert ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'gallery' AND auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'gallery_auth_delete' AND tablename = 'objects'
  ) THEN
    CREATE POLICY gallery_auth_delete ON storage.objects
      FOR DELETE USING (bucket_id = 'gallery' AND auth.role() = 'authenticated');
  END IF;
END $$;
