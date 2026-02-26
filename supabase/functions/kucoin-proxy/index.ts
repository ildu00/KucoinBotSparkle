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

async function signedRequest(
  apiKey: string,
  apiSecret: string,
  apiPassphrase: string,
  baseUrl: string,
  endpoint: string,
  method = "GET",
  body = ""
) {
  const timestamp = Date.now().toString();
  const strToSign = timestamp + method + endpoint + body;
  const signature = await hmacSha256Base64(apiSecret, strToSign);
  const passphraseSign = await hmacSha256Base64(apiSecret, apiPassphrase);

  const headers: Record<string, string> = {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": signature,
    "KC-API-TIMESTAMP": timestamp,
    "KC-API-PASSPHRASE": passphraseSign,
    "KC-API-KEY-VERSION": "3",
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, { method, headers, body: body || undefined });
    return await res.json();
  } catch (e) {
    return { error: String(e) };
  }
}

const SPOT_BASE = "https://api.kucoin.com";
const FUTURES_BASE = "https://api-futures.kucoin.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { apiKey, apiSecret, apiPassphrase } = await req.json();

    if (!apiKey || !apiSecret || !apiPassphrase) {
      return new Response(JSON.stringify({ error: "Missing API credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const call = (base: string, ep: string) => signedRequest(apiKey, apiSecret, apiPassphrase, base, ep);

    // Fetch everything in parallel
    const [
      spotTrade,
      spotMain,
      futuresOverviewUSDT,
      futuresOverviewXBT,
      // Try all possible grid bot list endpoints
      gridV1Spot,
      gridV1Futures,
      gridV1SpotOrders,
      gridV1FuturesOrders,
      gridV2Spot,
      gridV2Futures,
    ] = await Promise.all([
      // Spot balances
      call(SPOT_BASE, "/api/v1/accounts?type=trade"),
      call(SPOT_BASE, "/api/v1/accounts?type=main"),
      // Futures account overview (this INCLUDES grid bot locked funds)
      call(FUTURES_BASE, "/api/v1/account-overview?currency=USDT"),
      call(FUTURES_BASE, "/api/v1/account-overview?currency=XBT"),
      // Grid bot endpoints - trying multiple paths
      call(SPOT_BASE, "/api/v1/grid/strategy/spot?status=active&pageSize=50&currentPage=1"),
      call(SPOT_BASE, "/api/v1/grid/strategy/futures?status=active&pageSize=50&currentPage=1"),
      call(SPOT_BASE, "/api/v1/grid/strategy/spot?pageSize=50&currentPage=1"),
      call(SPOT_BASE, "/api/v1/grid/strategy/futures?pageSize=50&currentPage=1"),
      call(SPOT_BASE, "/api/v2/grid/strategy/spot?pageSize=50&currentPage=1"),
      call(SPOT_BASE, "/api/v2/grid/strategy/futures?pageSize=50&currentPage=1"),
    ]);

    const result = {
      spotTrade,
      spotMain,
      futuresOverviewUSDT,
      futuresOverviewXBT,
      gridV1Spot,
      gridV1Futures,
      gridV1SpotOrders,
      gridV1FuturesOrders,
      gridV2Spot,
      gridV2Futures,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
