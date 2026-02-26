import { supabase } from "@/integrations/supabase/client";
import type { ApiAccount } from "@/components/ApiKeysForm";
import type { BotData } from "@/components/BotsTable";

export interface AccountData {
  label: string;
  totalBalance: number;
  spotBalance: number;
  futuresBalance: number;
  botBalance: number;
  profit: number;
  profitPct: number;
  bots: BotData[];
  diagnosis?: string;
  error?: string;
  rawDebug?: unknown;
}

export async function fetchAccountData(account: ApiAccount): Promise<AccountData> {
  const empty = (diagnosis?: string, error?: string): AccountData => ({
    label: account.label,
    totalBalance: 0, spotBalance: 0, futuresBalance: 0,
    botBalance: 0, profit: 0, profitPct: 0, bots: [],
    diagnosis, error,
  });

  try {
    const { data, error } = await supabase.functions.invoke("kucoin-proxy", {
      body: { apiKey: account.apiKey, apiSecret: account.apiSecret, apiPassphrase: account.apiPassphrase },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    console.log("[KuCoin]", JSON.stringify(data, null, 2));

    const total = parseFloat(String(data.totalBalance ?? 0));
    const fut = parseFloat(String(data.futuresUSDT?.accountEquity ?? 0));

    return {
      label: account.label,
      totalBalance: total,
      spotBalance: total - fut,
      futuresBalance: fut,
      botBalance: fut,
      profit: 0,
      profitPct: 0,
      bots: [],
      diagnosis: data.diagnosis,
      rawDebug: data,
    };
  } catch (err) {
    return empty(undefined, err instanceof Error ? err.message : "Unknown error");
  }
}
