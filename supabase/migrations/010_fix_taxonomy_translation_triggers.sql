-- =============================================
-- 010_fix_taxonomy_translation_triggers.sql
-- Allow authenticated taxonomy writes to enqueue translations without
-- granting clients direct write access to the translation tables.
-- =============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_category_translations_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.category_translations (category_id, locale, status)
  SELECT NEW.id, target_locale, 'pending'
  FROM unnest(ARRAY['en', 'ja']) AS target_locale
  ON CONFLICT (category_id, locale)
  DO UPDATE SET status = 'pending', last_error = NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_tag_translations_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.tag_translations (tag_id, locale, status)
  SELECT NEW.id, target_locale, 'pending'
  FROM unnest(ARRAY['en', 'ja']) AS target_locale
  ON CONFLICT (tag_id, locale)
  DO UPDATE SET status = 'pending', last_error = NULL;

  RETURN NEW;
END;
$$;

-- These functions are trigger-only. Existing triggers retain their function
-- references, while API roles cannot invoke the SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION public.mark_category_translations_pending()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_tag_translations_pending()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.mark_category_translations_pending() IS
  'Trigger-only function that enqueues category translations with owner privileges.';
COMMENT ON FUNCTION public.mark_tag_translations_pending() IS
  'Trigger-only function that enqueues tag translations with owner privileges.';

COMMIT;
