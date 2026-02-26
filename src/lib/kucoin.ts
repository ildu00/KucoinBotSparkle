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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBots(raw: any, type: string, label: string): BotData[] {
  const items = raw?.data?.items || raw?.data?.list || [];
  return items.map((bot: Record<string, unknown>) => {
    const invested = parseFloat(String(bot.investment || bot.totalInvested || bot.investedAmount || 0));
    const currentValue = parseFloat(String(bot.totalValue || bot.currentValue || bot.totalAssets || invested));
    const profit = parseFloat(String(bot.profit || bot.totalProfit || bot.pnl || 0));
    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;
    const startTime = bot.startTime ? Number(bot.startTime) : Date.now();
    const runningDays = Math.floor((Date.now() - startTime) / (1000 * 60 * 60 * 24));

    return {
      id: String(bot.id || bot.orderId || Math.random()),
      symbol: String(bot.symbol || bot.tradePair || ""),
      type,
      status: String(bot.status || "active").toLowerCase() === "active" ? "active" : "stopped",
      invested,
      currentValue,
      profit,
      profitPct,
      runningDays: Math.max(0, runningDays),
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

    // Parse spot & main balances
    let spotBalance = 0;
    const spotItems = data.spotAccounts?.data || [];
    const mainItems = data.mainAccounts?.data || [];
    const allSpotItems = [...spotItems, ...mainItems];
    for (const acc of allSpotItems) {
      if (acc.currency === "USDT" || acc.currency === "USDC") {
        spotBalance += parseFloat(acc.balance || "0");
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
