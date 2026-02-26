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
  baseUrl: string, endpoint: string, method = "GET", body = ""
) {
  const timestamp = Date.now().toString();
  const strToSign = timestamp + method + endpoint + body;
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
      body: body || undefined,
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
    const f = (ep: string) => apiCall(apiKey, apiSecret, apiPassphrase, FUT,  ep);

    const [
      // ALL accounts without type filter → shows bot/earn types too
      allAccounts,
      // Sub-accounts
      subAccounts,
      // Bot type accounts
      acctBot,
      acctTradeBot,
      // KuCoin earn / flexible savings
      earnList,
      // Total assets overview
      assetOverview,
      // Futures sub-accounts
      futSubAccounts,
      // Bot strategy list - new paths
      botSpot1, botSpot2, botSpot3,
      botFut1, botFut2, botFut3,
      // Futures bot positions
      futBotOrders,
    ] = await Promise.all([
      s("/api/v1/accounts"),                                                // ALL types
      s("/api/v1/sub-accounts"),                                            // sub-accounts list
      s("/api/v1/accounts?type=bot"),                                       // bot type
      s("/api/v1/accounts?type=trade_bot"),                                 // trade_bot type
      s("/api/v1/earn/hold-assets"),                                        // earn holdings
      s("/api/v1/asset/detail"),                                            // asset overview
      f("/api/v1/trade-statistics"),                                        // futures stats
      // Bot strategy endpoints (different patterns)
      s("/api/v1/bot/strategy/spot/list?pageSize=50&currentPage=1"),
      s("/api/v1/bot/strategy/futures/list?pageSize=50&currentPage=1"),
      s("/api/v1/bot/list?pageSize=50&currentPage=1"),
      f("/api/v1/bot/strategy/futures/list?pageSize=50&currentPage=1"),
      f("/api/v1/bot/list?pageSize=50&currentPage=1"),
      f("/api/v1/strategy/list?pageSize=50&currentPage=1"),
      f("/api/v1/order/strategy?pageSize=50&currentPage=1"),
    ]);

    return new Response(JSON.stringify({
      allAccounts,
      subAccounts,
      acctBot,
      acctTradeBot,
      earnList,
      assetOverview,
      futSubAccounts,
      botEndpoints: {
        "SPOT /bot/strategy/spot/list": botSpot1,
        "SPOT /bot/strategy/futures/list": botSpot2,
        "SPOT /bot/list": botSpot3,
        "FUT /bot/strategy/futures/list": botFut1,
        "FUT /bot/list": botFut2,
        "FUT /strategy/list": botFut3,
        "FUT /order/strategy": botBotOrders,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // silence TS unused var
    void futBotOrders;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
