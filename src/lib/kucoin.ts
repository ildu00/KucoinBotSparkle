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

async function getOrCreateBaseline(accountLabel: string, botName: string, currentBalance: number): Promise<number> {
  // Try to fetch existing baseline
  const { data } = await supabase
    .from("bot_baselines")
    .select("baseline_balance")
    .eq("account_label", accountLabel)
    .eq("bot_name", botName)
    .maybeSingle();

  if (data) {
    return parseFloat(String(data.baseline_balance));
  }

  // No baseline yet — store current balance as baseline
  if (currentBalance > 0) {
    await supabase.from("bot_baselines").insert({
      account_label: accountLabel,
      bot_name: botName,
      baseline_balance: currentBalance,
    });
  }

  return currentBalance;
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

    type SubDetail = { name: string; id: string; spotUSDT: number; futuresUSDT: number; total: number };

    // Build bot list with profit from baselines
    const subDetailsList: SubDetail[] = data.subDetails ?? [];
    const bots: BotData[] = await Promise.all(
      subDetailsList.map(async (sub) => {
        const baseline = await getOrCreateBaseline(account.label, sub.name, sub.total);
        const profit = sub.total - baseline;
        const profitPct = baseline > 0 ? (profit / baseline) * 100 : 0;

        return {
          id: sub.id || sub.name,
          symbol: sub.name,
          type: sub.futuresUSDT > 0 ? "FUTURES_GRID" : "SPOT_GRID",
          status: "active" as const,
          invested: baseline,
          currentValue: sub.total,
          profit,
          profitPct,
          runningDays: 0,
          label: account.label,
        };
      })
    );

    const totalProfit = bots.reduce((s, b) => s + b.profit, 0);
    const totalInvested = bots.reduce((s, b) => s + b.invested, 0);
    const profitPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

    return {
      label: account.label,
      totalBalance: grandTotal,
      spotBalance: masterUSDT,
      futuresBalance: subTotal,
      botBalance: subTotal,
      profit: totalProfit,
      profitPct,
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

export async function resetBaseline(accountLabel: string, botName: string): Promise<void> {
  await supabase.from("bot_baselines").delete()
    .eq("account_label", accountLabel)
    .eq("bot_name", botName);
}
