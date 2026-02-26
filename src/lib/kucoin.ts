import type { ApiAccount } from "@/components/ApiKeysForm";
import type { BotData } from "@/components/BotsTable";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface AccountData {
  label: string;
  totalBalance: number;
  spotBalance: number;
  botBalance: number;
  profit: number;
  profitPct: number;
  bots: BotData[];
  error?: string;
  rawDebug?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBots(raw: any, type: string, label: string): BotData[] {
  if (!raw) return [];

  // KuCoin returns: { code: "200000", data: { items: [...] } } or { data: [...] }
  const items: Record<string, unknown>[] =
    raw?.data?.items ||
    raw?.data?.list ||
    raw?.data ||
    (Array.isArray(raw) ? raw : []);

  if (!Array.isArray(items) || items.length === 0) return [];

  return items.map((bot) => {
    // KuCoin Spot Grid fields
    // invested / gridAmount / investment / totalInvestment / gridInvestment
    const invested =
      parseFloat(String(
        bot.investment ?? bot.totalInvestment ?? bot.gridInvestment ??
        bot.investedAmount ?? bot.gridAmount ?? bot.runningAmt ?? 0
      ));

    // current total value = invested + profit
    const profit =
      parseFloat(String(
        bot.profit ?? bot.totalProfit ?? bot.pnl ?? bot.gridProfit ??
        bot.totalPnl ?? bot.floatProfit ?? 0
      ));

    const currentValue =
      parseFloat(String(
        bot.totalValue ?? bot.currentValue ?? bot.totalAssets ??
        bot.curValue ?? 0
      )) || (invested + profit);

    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;

    // startTime can be ms or seconds
    let startTime = bot.startTime ? Number(bot.startTime) : 0;
    if (startTime > 0 && startTime < 1e12) startTime *= 1000; // convert seconds → ms
    const runningDays = startTime > 0
      ? Math.max(0, Math.floor((Date.now() - startTime) / (1000 * 60 * 60 * 24)))
      : 0;

    const rawStatus = String(bot.status ?? bot.state ?? "active").toLowerCase();
    const status: BotData["status"] =
      rawStatus === "active" || rawStatus === "running" ? "active" :
      rawStatus === "completed" || rawStatus === "finish" ? "completed" : "stopped";

    return {
      id: String(bot.id ?? bot.orderId ?? bot.botId ?? Math.random()),
      symbol: String(bot.symbol ?? bot.tradePair ?? bot.pair ?? ""),
      type,
      status,
      invested,
      currentValue,
      profit,
      profitPct,
      runningDays,
      label,
    } as BotData;
  });
}

export async function fetchAccountData(account: ApiAccount): Promise<AccountData> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/kucoin-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
        apiPassphrase: account.apiPassphrase,
        action: "overview",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Edge function error ${res.status}: ${text}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Log raw data for debugging
    console.log("[KuCoin raw]", JSON.stringify(data, null, 2));

    // Parse spot & main balances — sum ALL currencies converted to USDT equivalent
    // KuCoin returns: data: [ { currency, balance, available, holds } ]
    let spotBalance = 0;
    const spotItems: Record<string, unknown>[] = data.spotAccounts?.data ?? [];
    const mainItems: Record<string, unknown>[] = data.mainAccounts?.data ?? [];
    for (const acc of [...spotItems, ...mainItems]) {
      const currency = String(acc.currency ?? "");
      if (currency === "USDT" || currency === "USDC") {
        spotBalance += parseFloat(String(acc.balance ?? acc.available ?? 0));
      }
    }

    // Parse bots
    const spotBots = parseBots(data.allSpotBots, "SPOT_GRID", account.label);
    const futuresBots = parseBots(data.allFuturesBots, "FUTURES_GRID", account.label);
    const infinityBots = parseBots(data.infinityBots, "INFINITY_GRID", account.label);
    const dcaBots = parseBots(data.dcaBots, "DCA", account.label);
    const allBots = [...spotBots, ...futuresBots, ...infinityBots, ...dcaBots];

    const botBalance = allBots.reduce((s, b) => s + b.currentValue, 0);
    const totalProfit = allBots.reduce((s, b) => s + b.profit, 0);
    const totalInvested = allBots.reduce((s, b) => s + b.invested, 0);
    const profitPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    const totalBalance = spotBalance + botBalance;

    return {
      label: account.label,
      totalBalance,
      spotBalance,
      botBalance,
      profit: totalProfit,
      profitPct,
      bots: allBots,
      rawDebug: data,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      label: account.label,
      totalBalance: 0,
      spotBalance: 0,
      botBalance: 0,
      profit: 0,
      profitPct: 0,
      bots: [],
      error: msg,
    };
  }
}
