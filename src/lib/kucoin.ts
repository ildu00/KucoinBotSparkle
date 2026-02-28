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

async function getBatchBaselines(
  accountLabel: string,
  subs: Array<{ name: string; total: number }>
): Promise<Map<string, number>> {
  const botNames = subs.map((s) => s.name);

  const { data } = await supabase
    .from("bot_baselines")
    .select("bot_name, baseline_balance")
    .eq("account_label", accountLabel)
    .in("bot_name", botNames);

  const existing = new Map<string, number>();
  for (const row of data ?? []) {
    existing.set(row.bot_name, parseFloat(String(row.baseline_balance)));
  }

  // Insert missing baselines in one batch
  const missing = subs.filter((s) => !existing.has(s.name) && s.total > 0);
  if (missing.length > 0) {
    await supabase.from("bot_baselines").insert(
      missing.map((s) => ({
        account_label: accountLabel,
        bot_name: s.name,
        baseline_balance: s.total,
      }))
    );
    for (const s of missing) existing.set(s.name, s.total);
  }

  return existing;
}

export async function fetchAccountData(account: ApiAccount): Promise<AccountData> {
  const empty = (diag?: AccountData["diagnosis"], error?: string): AccountData => ({
    label: account.label,
    totalBalance: 0, spotBalance: 0, futuresBalance: 0,
    botBalance: 0, profit: 0, profitPct: 0, bots: [],
    diagnosis: diag, error,
  });

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("kucoin-proxy", {
        body: { apiKey: account.apiKey, apiSecret: account.apiSecret, apiPassphrase: account.apiPassphrase },
      });

      if (error) {
        // "Failed to send a request" = cold start / network blip, retry
        if (attempt < maxRetries && error.message?.includes("Failed to send")) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw new Error(error.message);
      }
      if (data?.error) throw new Error(data.error);

      const grandTotal = parseFloat(String(data.grandTotal ?? 0));
      const masterUSDT = parseFloat(String(data.masterUSDT ?? 0));
      const subTotal = parseFloat(String(data.subTotal ?? 0));

      type SubDetail = { name: string; id: string; spotUSDT: number; futuresUSDT: number; total: number };

    const subDetailsList: SubDetail[] = data.subDetails ?? [];
    const baselines = await getBatchBaselines(account.label, subDetailsList);
    const bots: BotData[] = subDetailsList.map((sub) => {
      const baseline = baselines.get(sub.name) ?? sub.total;
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
    });

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
      if (attempt === maxRetries) {
        return empty(undefined, err instanceof Error ? err.message : "Unknown error");
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  return empty(undefined, "Max retries exceeded");
}

export async function recordBalanceSnapshot(accountLabel: string, totalBalance: number): Promise<void> {
  if (totalBalance <= 0) return;
  await supabase.from("balance_history").insert({
    account_label: accountLabel,
    total_balance: totalBalance,
  });
}

export async function fetchBalanceHistory(accountLabel: string): Promise<Array<{ time: string; value: number }>> {
  // Fetch up to 30 most recent daily snapshots
  const { data } = await supabase
    .from("balance_history")
    .select("total_balance, recorded_at")
    .eq("account_label", accountLabel)
    .order("recorded_at", { ascending: true })
    .limit(200);

  if (!data || data.length === 0) return [];

  // Group by date (keep last snapshot per day)
  const byDay = new Map<string, number>();
  for (const row of data) {
    const d = new Date(row.recorded_at);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    byDay.set(key, parseFloat(String(row.total_balance)));
  }

  return Array.from(byDay.entries())
    .slice(-30)
    .map(([time, value]) => ({ time, value }));
}

export async function resetBaseline(accountLabel: string, botName: string): Promise<void> {
  await supabase.from("bot_baselines").delete()
    .eq("account_label", accountLabel)
    .eq("bot_name", botName);
}
