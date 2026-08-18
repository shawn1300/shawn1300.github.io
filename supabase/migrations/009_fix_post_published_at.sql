-- Keep published article ordering deterministic for both direct publication
-- and draft-to-published transitions.

UPDATE posts
SET published_at = created_at
WHERE status = 'published'
  AND published_at IS NULL;

CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      NEW.published_at = COALESCE(NEW.published_at, now());
    END IF;
  ELSIF NEW.status = 'published' AND OLD.status = 'draft' THEN
    NEW.published_at = COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_posts_published_at ON posts;

CREATE TRIGGER set_posts_published_at
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_published_at();
