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

    // Diagnose the account type first
    const [userInfo, subAccounts, allAccounts, futUSDT] = await Promise.all([
      s("/api/v1/user-info"),
      s("/api/v1/sub-accounts"),
      s("/api/v1/accounts"),
      f("/api/v1/account-overview?currency=USDT"),
    ]);

    // Determine if this is a sub-account or master account
    // Master account: userInfo.data.level should be 0 or not present
    // Sub-account: userInfo might show "subUser: true" or level > 0
    const subUserIds = (subAccounts?.data ?? []).map((s: { subUserId: string }) => s.subUserId).filter(Boolean);
    const isMasterAccount = subUserIds.length > 0 || (subAccounts?.data?.length > 0);
    
    // If master, subUserId should NOT be null
    const hasNullSubUserIds = (subAccounts?.data ?? []).some((s: { subUserId: null | string }) => s.subUserId === null);

    // Calculate whatever balance we can find
    let totalBalance = 0;
    const balanceDetails: Record<string, number> = {};

    for (const acc of allAccounts?.data ?? []) {
      const bal = parseFloat(acc.balance ?? "0");
      if (bal > 0) {
        balanceDetails[`${acc.type}_${acc.currency}`] = bal;
        if (acc.currency === "USDT" || acc.currency === "USDC") totalBalance += bal;
      }
    }

    const futEquity = parseFloat(futUSDT?.data?.accountEquity ?? "0");
    if (futEquity > 0) {
      balanceDetails["futures_USDT"] = futEquity;
      totalBalance += futEquity;
    }

    // Diagnosis
    const diagnosis = hasNullSubUserIds
      ? "SUB_ACCOUNT_KEY: Your API key appears to be from a sub-account. The master account holds the 3708 USDT. Please create a new API key on your MASTER account (not sub-account)."
      : totalBalance === 0
      ? "ZERO_BALANCE: API key valid but all balances are 0. Possible: wrong account, or funds locked in trading bots that require special permissions."
      : "OK";

    return new Response(JSON.stringify({
      diagnosis,
      totalBalance,
      balanceDetails,
      accountKeyInfo: {
        hasNullSubUserIds,
        subAccountCount: subAccounts?.data?.length ?? 0,
        userInfo: userInfo?.data ?? userInfo,
      },
      rawAccounts: allAccounts?.data ?? [],
      futuresUSDT: futUSDT?.data,
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
