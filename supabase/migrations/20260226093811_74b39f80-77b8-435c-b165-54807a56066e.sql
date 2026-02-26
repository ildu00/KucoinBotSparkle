
CREATE TABLE public.bot_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_label TEXT NOT NULL,
  bot_name TEXT NOT NULL,
  baseline_balance NUMERIC NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_label, bot_name)
);

ALTER TABLE public.bot_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON public.bot_baselines FOR ALL USING (true) WITH CHECK (true);
