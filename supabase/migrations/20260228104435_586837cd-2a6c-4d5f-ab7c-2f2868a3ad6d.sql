
CREATE TABLE public.balance_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_label text NOT NULL,
  total_balance numeric NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on balance_history"
  ON public.balance_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_balance_history_account_label ON public.balance_history (account_label, recorded_at DESC);
