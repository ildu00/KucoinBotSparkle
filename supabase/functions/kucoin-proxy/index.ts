import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function apiCall(
  apiKey: string, apiSecret: string, apiPassphrase: string,
  baseUrl: string, endpoint: string
) {
  const method = "GET";
  const timestamp = Date.now().toString();
  const strToSign = timestamp + method + endpoint;
  const signature = await hmacSha256Base64(apiSecret, strToSign);
  const passphraseSign = await hmacSha256Base64(apiSecret, apiPassphrase);
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        "KC-API-KEY": apiKey,
        "KC-API-SIGN": signature,
        "KC-API-TIMESTAMP": timestamp,
        "KC-API-PASSPHRASE": passphraseSign,
        "KC-API-KEY-VERSION": "3",
        "Content-Type": "application/json",
      },
    });
    return await res.json();
  } catch (e) {
    return { fetchError: String(e) };
  }
}

const SPOT = "https://api.kucoin.com";
const FUT  = "https://api-futures.kucoin.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { apiKey, apiSecret, apiPassphrase } = await req.json();
    if (!apiKey || !apiSecret || !apiPassphrase) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const s = (ep: string) => apiCall(apiKey, apiSecret, apiPassphrase, SPOT, ep);
    const f = (ep: string) => apiCall(apiKey, apiSecret, apiPassphrase, FUT, ep);

    // Step 1: Get master account balances + sub-account list in parallel
    const [masterTrade, masterMain, subAccountsRaw] = await Promise.all([
      s("/api/v1/accounts?type=trade"),
      s("/api/v1/accounts?type=main"),
      s("/api/v1/sub-accounts"),
    ]);

    // Step 2: Extract robot sub-account names
    const subList: Array<{ subName: string }> = subAccountsRaw?.data ?? [];
    const robotNames = subList
      .map((s) => s.subName)
      .filter((n) => typeof n === "string" && n.startsWith("robot"));

    // Step 3: For each robot sub-account, query:
    // (a) its spot balance via /api/v1/sub-accounts/{subName}
    // (b) its futures balance via futures host (subName param)
    const subBalanceResults = await Promise.all(
      robotNames.map(async (name) => {
        const [spotBal, futBal, futOverview] = await Promise.all([
          s(`/api/v1/sub-accounts/${name}`),
          f(`/api/v1/account-overview?subName=${name}&currency=USDT`),
          f(`/api/v1/account-overview?currency=USDT&subName=${name}`),
        ]);
        return { name, spotBal, futBal, futOverview };
      })
    );

    // Step 4: Also try getting sub-account aggregated balance endpoints
    const [
      subAggBalance,
      subTransferable,
      subTotalAssets,
    ] = await Promise.all([
      s("/api/v1/sub-accounts/aggregate-balance"),
      s("/api/v1/accounts/transferable?currency=USDT&type=MAIN"),
      s("/api/v1/sub-accounts/total-balance?currency=USDT"),
    ]);

    // Step 5: Parse results
    let masterBalance = 0;
    for (const acc of [...(masterTrade?.data ?? []), ...(masterMain?.data ?? [])]) {
      if (acc.currency === "USDT" || acc.currency === "USDC") {
        masterBalance += parseFloat(acc.balance ?? "0");
      }
    }

    // Try to compute sub-account balances
    const subBalancesSummary = subBalanceResults.map((r) => {
      let spotTotal = 0;
      let futTotal = 0;

      // Spot balance from sub-account detail
      const subDetail = r.spotBal?.data;
      if (subDetail) {
        for (const acc of [
          ...(subDetail.mainAccounts ?? []),
          ...(subDetail.tradeAccounts ?? []),
          ...(subDetail.tradeHFAccounts ?? []),
        ]) {
          if (acc.currency === "USDT") spotTotal += parseFloat(acc.balance ?? "0");
        }
      }

      // Futures balance
      const futData = r.futBal?.data ?? r.futOverview?.data;
      if (futData?.accountEquity) {
        futTotal = parseFloat(futData.accountEquity ?? "0");
      }

      return {
        name: r.name,
        spotTotal,
        futTotal,
        total: spotTotal + futTotal,
        raw: {
          spotBal: r.spotBal,
          futBal: r.futBal,
        },
      };
    });

    const totalSubBalance = subBalancesSummary.reduce((s, r) => s + r.total, 0);
    const grandTotal = masterBalance + totalSubBalance;

    return new Response(JSON.stringify({
      grandTotal,
      masterBalance,
      totalSubBalance,
      masterTrade,
      masterMain,
      subAggBalance,
      subTransferable,
      subTotalAssets,
      subBalancesSummary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
