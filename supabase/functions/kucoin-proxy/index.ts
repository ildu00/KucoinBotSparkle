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

    // Step 1: get sub-accounts list (need Sub-Account permission for non-null IDs)
    const [subAccounts, userInfoV2, masterAccounts] = await Promise.all([
      s("/api/v1/sub-accounts"),
      s("/api/v2/user-info"),
      s("/api/v1/accounts"),
    ]);

    const subList: Array<{ subUserId: string | null; subName: string }> = subAccounts?.data ?? [];
    const hasSubPermission = subList.some((s) => s.subUserId !== null);

    // Step 2: if we have sub-account IDs, query each one's balance
    let subDetails: Array<{
      name: string;
      id: string;
      spotUSDT: number;
      futuresUSDT: number;
      total: number;
    }> = [];

    if (hasSubPermission) {
      const robotSubs = subList.filter((s) => s.subName?.startsWith("robot") && s.subUserId);
      subDetails = await Promise.all(
        robotSubs.map(async (sub) => {
          const [spotDetail, futBal] = await Promise.all([
            s(`/api/v1/sub-accounts/${sub.subUserId}`),
            f(`/api/v1/account-overview?currency=USDT&subName=${sub.subName}`),
          ]);
          let spotUSDT = 0;
          for (const type of ["mainAccounts", "tradeAccounts", "tradeHFAccounts"]) {
            for (const acc of spotDetail?.data?.[type] ?? []) {
              if (acc.currency === "USDT") spotUSDT += parseFloat(acc.balance ?? "0");
            }
          }
          const futuresUSDT = parseFloat(futBal?.data?.accountEquity ?? "0");
          return {
            name: sub.subName,
            id: sub.subUserId!,
            spotUSDT,
            futuresUSDT,
            total: spotUSDT + futuresUSDT,
          };
        })
      );
    }

    // Master account balances
    let masterUSDT = 0;
    for (const acc of masterAccounts?.data ?? []) {
      if (acc.currency === "USDT") masterUSDT += parseFloat(acc.balance ?? "0");
    }
    const futMaster = await f("/api/v1/account-overview?currency=USDT");
    masterUSDT += parseFloat(futMaster?.data?.accountEquity ?? "0");

    const subTotal = subDetails.reduce((s, r) => s + r.total, 0);
    const grandTotal = masterUSDT + subTotal;

    // Determine diagnosis
    let diagnosis: "OK" | "MISSING_SUB_PERMISSION" | "ZERO_ALL" = "OK";
    if (!hasSubPermission && subList.length > 0) {
      diagnosis = "MISSING_SUB_PERMISSION";
    } else if (grandTotal === 0) {
      diagnosis = "ZERO_ALL";
    }

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
