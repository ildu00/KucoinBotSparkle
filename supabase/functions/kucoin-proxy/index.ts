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
      // Standard accounts
      acctTrade, acctMain, acctMargin, acctTradeHF,
      // UA API — Unified Account (might include bot funds)
      uaAll, uaSpot, uaFutures, uaMargin,
      // Futures overview (separate host)
      futUSDT, futXBT,
      // Futures positions (bots open positions)
      futPositions,
      // Try all realistic bot/strategy endpoints
      botList1, botList2, botList3, botList4, botList5,
      botList6, botList7, botList8, botList9, botList10,
    ] = await Promise.all([
      // Standard
      s("/api/v1/accounts?type=trade"),
      s("/api/v1/accounts?type=main"),
      s("/api/v1/accounts?type=margin"),
      s("/api/v1/accounts?type=trade_hf"),
      // UA API
      s("/api/ua/v1/account/balance"),
      s("/api/ua/v1/account/balance?accountType=SPOT"),
      s("/api/ua/v1/account/balance?accountType=FUTURES"),
      s("/api/ua/v1/account/balance?accountType=MARGIN"),
      // Futures host
      f("/api/v1/account-overview?currency=USDT"),
      f("/api/v1/account-overview?currency=XBT"),
      f("/api/v1/positions"),
      // Grid / Bot endpoints — wide search
      s("/api/v1/grid/strategy?pageSize=50"),
      s("/api/v1/grid/strategies?pageSize=50"),
      s("/api/v1/strategy?pageSize=50"),
      s("/api/v1/strategies?pageSize=50"),
      s("/api/v1/spot/grid?pageSize=50"),
      f("/api/v1/grid/strategy?pageSize=50"),
      f("/api/v1/grid/strategies?pageSize=50"),
      s("/api/v1/hf/strategy?pageSize=50"),
      s("/api/ua/v1/strategy?pageSize=50"),
      s("/api/ua/v1/grid?pageSize=50"),
    ]);

    return new Response(JSON.stringify({
      acctTrade, acctMain, acctMargin, acctTradeHF,
      uaAll, uaSpot, uaFutures, uaMargin,
      futUSDT, futXBT, futPositions,
      botEndpoints: {
        "SPOT /api/v1/grid/strategy": botList1,
        "SPOT /api/v1/grid/strategies": botList2,
        "SPOT /api/v1/strategy": botList3,
        "SPOT /api/v1/strategies": botList4,
        "SPOT /api/v1/spot/grid": botList5,
        "FUT /api/v1/grid/strategy": botList6,
        "FUT /api/v1/grid/strategies": botList7,
        "SPOT /api/v1/hf/strategy": botList8,
        "SPOT /api/ua/v1/strategy": botList9,
        "SPOT /api/ua/v1/grid": botList10,
      },
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
