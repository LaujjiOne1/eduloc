CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  full_name text NOT NULL,
  phone text,
  email text,
  preferred_channel text,
  message text,
  status text NOT NULL DEFAULT 'nouvelle',
  CONSTRAINT len_name CHECK (char_length(full_name) BETWEEN 2 AND 100),
  CONSTRAINT len_msg CHECK (message IS NULL OR char_length(message) <= 2000),
  CONSTRAINT contact_present CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT cat_ok CHECK (category IN ('trouver_tuteur','cours_proche','reservation','autre'))
);
GRANT INSERT ON public.support_requests TO anon, authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can submit requests" ON public.support_requests FOR INSERT TO anon, authenticated WITH CHECK (status = 'nouvelle');