import type { ApiAccount } from "@/components/ApiKeysForm";
import type { BotData } from "@/components/BotsTable";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface AccountData {
  label: string;
  totalBalance: number;
  spotBalance: number;
  futuresBalance: number;
  botBalance: number;
  profit: number;
  profitPct: number;
  bots: BotData[];
  error?: string;
  rawDebug?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBots(raw: any, type: string, label: string): BotData[] {
  if (!raw || raw.code === "404" || !raw.data) return [];
  const items: Record<string, unknown>[] =
    raw.data?.items || raw.data?.list || raw.data?.strategies ||
    (Array.isArray(raw.data) ? raw.data : []);
  if (!Array.isArray(items) || items.length === 0) return [];

  return items.map((bot) => {
    const invested = parseFloat(String(
      bot.investment ?? bot.totalInvestment ?? bot.gridInvestment ??
      bot.investedAmount ?? bot.gridAmount ?? bot.runningAmt ?? 0
    ));
    const profit = parseFloat(String(
      bot.profit ?? bot.totalProfit ?? bot.pnl ?? bot.gridProfit ??
      bot.totalPnl ?? bot.floatProfit ?? 0
    ));
    const currentValue = parseFloat(String(
      bot.totalValue ?? bot.currentValue ?? bot.totalAssets ?? bot.curValue ?? 0
    )) || (invested + profit);
    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;
    let startTime = bot.startTime ? Number(bot.startTime) : 0;
    if (startTime > 0 && startTime < 1e12) startTime *= 1000;
    const runningDays = startTime > 0
      ? Math.max(0, Math.floor((Date.now() - startTime) / 86400000)) : 0;
    const rawStatus = String(bot.status ?? bot.state ?? "active").toLowerCase();
    const status: BotData["status"] =
      rawStatus === "active" || rawStatus === "running" ? "active" :
      rawStatus === "completed" || rawStatus === "finish" ? "completed" : "stopped";

    return {
      id: String(bot.id ?? bot.orderId ?? bot.botId ?? Math.random()),
      symbol: String(bot.symbol ?? bot.tradePair ?? bot.pair ?? ""),
      type, status, invested, currentValue, profit, profitPct, runningDays, label,
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

    if (!res.ok) throw new Error(`Edge function error ${res.status}: ${await res.text()}`);

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    console.log("[KuCoin raw]", JSON.stringify(data, null, 2));

    // --- Spot balance (USDT/USDC only) ---
    let spotBalance = 0;
    for (const acc of [...(data.spotTrade?.data ?? []), ...(data.spotMain?.data ?? [])]) {
      const cur = String(acc.currency ?? "");
      if (cur === "USDT" || cur === "USDC") {
        spotBalance += parseFloat(String(acc.balance ?? 0));
      }
    }

    // --- Futures balance: accountEquity = full balance including grid bots ---
    // futuresOverviewUSDT: { accountEquity, unrealisedPNL, positionMargin, ... }
    const futUSDT = data.futuresOverviewUSDT?.data;
    const futuresBalance = parseFloat(String(futUSDT?.accountEquity ?? 0));

    // --- Parse bots from whichever endpoint worked ---
    const workingSpot = [data.gridV1Spot, data.gridV1SpotOrders, data.gridV2Spot]
      .find((r) => r?.code === "200000" && r?.data);
    const workingFutures = [data.gridV1Futures, data.gridV1FuturesOrders, data.gridV2Futures]
      .find((r) => r?.code === "200000" && r?.data);

    const spotBots = parseBots(workingSpot, "SPOT_GRID", account.label);
    const futuresBots = parseBots(workingFutures, "FUTURES_GRID", account.label);
    const allBots = [...spotBots, ...futuresBots];

    // Bot balance: prefer actual bot data, fallback to futures equity (which includes bot funds)
    const botBalance = allBots.length > 0
      ? allBots.reduce((s, b) => s + b.currentValue, 0)
      : futuresBalance;

    const totalProfit = allBots.reduce((s, b) => s + b.profit, 0)
      + parseFloat(String(futUSDT?.unrealisedPNL ?? 0));
    const totalInvested = allBots.reduce((s, b) => s + b.invested, 0);
    const profitPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    const totalBalance = spotBalance + futuresBalance;

    return {
      label: account.label,
      totalBalance,
      spotBalance,
      futuresBalance,
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
      futuresBalance: 0,
      botBalance: 0,
      profit: 0,
      profitPct: 0,
      bots: [],
      error: msg,
    };
  }
}
