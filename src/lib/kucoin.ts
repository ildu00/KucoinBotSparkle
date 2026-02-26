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
  diagnosis?: "OK" | "MISSING_SUB_PERMISSION" | "ZERO_ALL";
  hasSubPermission?: boolean;
  subCount?: number;
  error?: string;
  rawDebug?: unknown;
}

export async function fetchAccountData(account: ApiAccount): Promise<AccountData> {
  const empty = (diag?: AccountData["diagnosis"], error?: string): AccountData => ({
    label: account.label,
    totalBalance: 0, spotBalance: 0, futuresBalance: 0,
    botBalance: 0, profit: 0, profitPct: 0, bots: [],
    diagnosis: diag, error,
  });

  try {
    const { data, error } = await supabase.functions.invoke("kucoin-proxy", {
      body: { apiKey: account.apiKey, apiSecret: account.apiSecret, apiPassphrase: account.apiPassphrase },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    const grandTotal = parseFloat(String(data.grandTotal ?? 0));
    const masterUSDT = parseFloat(String(data.masterUSDT ?? 0));
    const subTotal = parseFloat(String(data.subTotal ?? 0));

    // Build bot list from sub-account details
    const bots: BotData[] = (data.subDetails ?? []).map((sub: {
      name: string; id: string; spotUSDT: number; futuresUSDT: number; total: number;
    }) => ({
      id: sub.id || sub.name,
      symbol: sub.name,
      type: sub.futuresUSDT > 0 ? "FUTURES_GRID" : "SPOT_GRID",
      status: "active" as const,
      invested: sub.total,
      currentValue: sub.total,
      profit: 0,
      profitPct: 0,
      runningDays: 0,
      label: account.label,
    }));

    return {
      label: account.label,
      totalBalance: grandTotal,
      spotBalance: masterUSDT,
      futuresBalance: subTotal,
      botBalance: subTotal,
      profit: 0,
      profitPct: 0,
      bots,
      diagnosis: data.diagnosis,
      hasSubPermission: data.hasSubPermission,
      subCount: data.subCount ?? 0,
      rawDebug: data,
    };
  } catch (err) {
    return empty(undefined, err instanceof Error ? err.message : "Unknown error");
  }
}
