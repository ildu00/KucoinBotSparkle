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
    if (!ak || !as_ || !ap) return new Response(
      JSON.stringify({ error: "Missing credentials" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    const s = (ep: string) => apiCall(ak, as_, ap, SPOT, ep);
    const f = (ep: string) => apiCall(ak, as_, ap, FUT,  ep);

    // Step 1: get all data in parallel
    const [subAccountsV2, userInfoV2, masterAccounts, futMaster] = await Promise.all([
      // v2 endpoint returns inline tradeAccounts balances even for robot sub-accounts
      // (confirmed by KuCoin support: https://www.kucoin.com/docs-new/rest/account-info/sub-account/get-subaccount-list-spot-balance-v2)
      s("/api/v2/sub-accounts?pageSize=100"),
      s("/api/v2/user-info"),
      s("/api/v1/accounts"),
      f("/api/v1/account-overview?currency=USDT"),
    ]);

    type SubV2Item = {
      subUserId: string | null;
      subName: string;
      mainAccounts: Array<{ currency: string; balance: string }>;
      tradeAccounts: Array<{ currency: string; balance: string }>;
      tradeHFAccounts: Array<{ currency: string; balance: string }>;
    };

    const subList: SubV2Item[] = subAccountsV2?.data?.items ?? subAccountsV2?.data ?? [];
    const hasSubPermission = subList.some((s) => s.subUserId !== null);
    const robotSubs = subList.filter((s) => s.subName?.startsWith("robot"));

    // Step 2: for each robot sub, get spot from inline tradeAccounts + futures from futures API
    // Only process first 3 robots to keep response fast for debugging
    const subDetails = await Promise.all(
      robotSubs.slice(0, 3).map(async (sub) => {
        // Spot balance from inline tradeAccounts (v2 endpoint provides this)
        let spotUSDT = 0;
        for (const type of ["mainAccounts", "tradeAccounts", "tradeHFAccounts"] as const) {
          for (const acc of sub[type] ?? []) {
            if (acc.currency === "USDT") spotUSDT += parseFloat(acc.balance ?? "0");
          }
        }

        // Try multiple futures endpoints for sub-accounts
        const [futByName, futByNameSpot] = await Promise.all([
          f(`/api/v1/account-overview?currency=USDT&subName=${encodeURIComponent(sub.subName)}`),
          s(`/api/v1/sub-accounts/${encodeURIComponent(sub.subName)}`),
        ]);
        const futuresUSDT = parseFloat(futByName?.data?.accountEquity ?? "0");

        return {
          name: sub.subName,
          id: sub.subUserId ?? sub.subName,
          spotUSDT,
          futuresUSDT,
          total: spotUSDT + futuresUSDT,
          // raw debug
          _rawV2Sub: { mainAccounts: sub.mainAccounts, tradeAccounts: sub.tradeAccounts, tradeHFAccounts: sub.tradeHFAccounts },
          _rawFutByName: futByName,
          _rawSpotByName: futByNameSpot,
        };
      })
    );

    // Master account balances
    let masterUSDT = 0;
    for (const acc of masterAccounts?.data ?? []) {
      if ((acc as {currency:string}).currency === "USDT") {
        masterUSDT += parseFloat((acc as {balance:string}).balance ?? "0");
      }
    }
    masterUSDT += parseFloat(futMaster?.data?.accountEquity ?? "0");

    const subTotal = subDetails.reduce((s, r) => s + r.total, 0);
    const grandTotal = masterUSDT + subTotal;

    // Determine diagnosis
    const diagnosis: "OK" | "MISSING_SUB_PERMISSION" | "ZERO_ALL" =
      grandTotal === 0 ? "ZERO_ALL" : "OK";

    return new Response(JSON.stringify({
      diagnosis,
      hasSubPermission,
      grandTotal,
      masterUSDT,
      subTotal,
      subDetails,
      subCount: subList.length,
      userInfoV2: userInfoV2?.data ?? userInfoV2,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: unknown) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
