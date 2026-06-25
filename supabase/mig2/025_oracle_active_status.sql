-- ╨Ю╤А╨░╨║╤Г╨╗: ╨╛╨┤╨╕╨╜ ╨░╨║╤В╨╕╨▓╨╜╤Л╨╣ ╤З╨░╤В ╨╜╨░ ╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤П, ╨╛╤Б╤В╨░╨╗╤М╨╜╤Л╨╡ тАФ ╨░╤А╤Е╨╕╨▓ (╨╕╤Б╤В╨╛╤А╨╕╤П)
ALTER TABLE public.oracle_chats
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'archived';

ALTER TABLE public.oracle_chats
  DROP CONSTRAINT IF EXISTS oracle_chats_status_check;

ALTER TABLE public.oracle_chats
  ADD CONSTRAINT oracle_chats_status_check CHECK (status IN ('active', 'archived'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_oracle_chats_one_active_per_user
  ON public.oracle_chats(user_id)
  WHERE status = 'active';

UPDATE public.oracle_chats SET status = 'archived' WHERE status IS DISTINCT FROM 'active';

COMMENT ON COLUMN public.oracle_chats.status IS 'active тАФ ╨╡╨┤╨╕╨╜╤Б╤В╨▓╨╡╨╜╨╜╤Л╨╣ ╤В╨╡╨║╤Г╤Й╨╕╨╣ ╤З╨░╤В; archived тАФ ╨╕╤Б╤В╨╛╤А╨╕╤П';
