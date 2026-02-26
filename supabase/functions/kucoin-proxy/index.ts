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

async function apiCall(ak: string, as_: string, ap: string, base: string, ep: string) {
  const method = "GET";
  const ts = Date.now().toString();
  const sig = await hmacSha256Base64(as_, ts + method + ep);
  const pp  = await hmacSha256Base64(as_, ap);
  try {
    const res = await fetch(`${base}${ep}`, {
      method,
      headers: {
        "KC-API-KEY": ak, "KC-API-SIGN": sig, "KC-API-TIMESTAMP": ts,
        "KC-API-PASSPHRASE": pp, "KC-API-KEY-VERSION": "3", "Content-Type": "application/json",
      },
    });
    return await res.json();
  } catch (e) { return { fetchError: String(e) }; }
}

const SPOT = "https://api.kucoin.com";
const FUT  = "https://api-futures.kucoin.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { apiKey: ak, apiSecret: as_, apiPassphrase: ap } = await req.json();
    if (!ak || !as_ || !ap) return new Response(JSON.stringify({ error: "Missing creds" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const s = (ep: string) => apiCall(ak, as_, ap, SPOT, ep);
    const f = (ep: string) => apiCall(ak, as_, ap, FUT,  ep);

    // Get ALL currencies in ALL account types
    const [
      allAccountsAllCurrencies,  // no filter = every currency and every type
      userInfo,
      // UA API - more complete
      uaSpot, uaFutures,
      // Futures all currencies
      futUSDT, futXBT,
      futAllPositions,
      // Earn
      earnHold, earnFixed,
      // Sub-accounts
      subAccounts,
      // Try to get sub-account balance by NAME (v2 endpoint)
      subV2,
    ] = await Promise.all([
      s("/api/v1/accounts"),           // ALL currencies, ALL types
      s("/api/v1/user-info"),
      s("/api/ua/v1/account/balance?accountType=SPOT"),
      s("/api/ua/v1/account/balance?accountType=FUTURES"),
      f("/api/v1/account-overview?currency=USDT"),
      f("/api/v1/account-overview?currency=XBT"),
      f("/api/v1/positions"),
      s("/api/v1/earn/hold-assets?currentPage=1&pageSize=50"),
      s("/api/v1/earn/saving/redemptionable?currentPage=1&pageSize=50"),
      s("/api/v1/sub-accounts"),
      s("/api/v2/sub-accounts?currentPage=1&pageSize=50"),
    ]);

    // Find any non-zero balance anywhere
    const nonZeroAccounts = (allAccountsAllCurrencies?.data ?? []).filter(
      (a: { balance: string }) => parseFloat(a.balance ?? "0") > 0
    );

    // Check if sub-accounts have any non-zero via v2
    const subV2List = subV2?.data?.items ?? subV2?.data ?? [];

    // Try to query sub-accounts that have non-null subUserId
    const subAccountsWithId = (subAccounts?.data ?? []).filter(
      (s: { subUserId: string | null }) => s.subUserId !== null
    );

    // For sub-accounts with IDs, get their balances
    const subBalancesById = await Promise.all(
      subAccountsWithId.slice(0, 5).map(async (sub: { subUserId: string; subName: string }) => {
        const [spotBal] = await Promise.all([
          s(`/api/v1/sub-accounts/${sub.subUserId}`),
        ]);
        return { name: sub.subName, id: sub.subUserId, spotBal };
      })
    );

    return new Response(JSON.stringify({
      // Key findings
      nonZeroAccountsFound: nonZeroAccounts.length,
      nonZeroAccounts,
      // All accounts raw
      allAccountsAllCurrencies: allAccountsAllCurrencies?.data ?? [],
      // User identity
      userInfo: userInfo?.data ?? userInfo,
      // UA
      uaSpot: uaSpot?.data,
      uaFutures: uaFutures?.data,
      // Futures
      futUSDT: futUSDT?.data,
      futPositionsCount: (futAllPositions?.data ?? []).length,
      futPositions: futAllPositions?.data,
      // Earn
      earnItems: earnHold?.data?.items ?? [],
      earnFixed: earnFixed?.data?.items ?? [],
      // Sub-accounts
      subAccountsTotal: subAccounts?.data?.length ?? 0,
      subV2Sample: subV2List.slice(0, 3),
      subBalancesById,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
