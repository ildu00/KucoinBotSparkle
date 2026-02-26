import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  // base64 encode
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function kucoinRequest(
  apiKey: string,
  apiSecret: string,
  apiPassphrase: string,
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

  const url = `https://api.kucoin.com${endpoint}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body || undefined,
  });

  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { apiKey, apiSecret, apiPassphrase, action } = await req.json();

    if (!apiKey || !apiSecret || !apiPassphrase) {
      return new Response(JSON.stringify({ error: "Missing API credentials" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result: Record<string, unknown> = {};

    if (action === "overview" || !action) {
      // Fetch all in parallel
      const [spotAccounts, mainAccounts, spotBots, allSpotBots, futuresBots, allFuturesBots, infinityBots, dcaBots] =
        await Promise.all([
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/accounts?type=trade"),
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/accounts?type=main"),
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/spot/list?status=active&pageSize=50&currentPage=1"),
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/spot/list?pageSize=50&currentPage=1"),
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/futures/list?status=active&pageSize=50&currentPage=1"),
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/futures/list?pageSize=50&currentPage=1"),
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/infinity/list?pageSize=50&currentPage=1"),
          kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/dca/list?pageSize=50&currentPage=1"),
        ]);

      result.spotAccounts = spotAccounts;
      result.mainAccounts = mainAccounts;
      result.spotBots = spotBots;
      result.allSpotBots = allSpotBots;
      result.futuresBots = futuresBots;
      result.allFuturesBots = allFuturesBots;
      result.infinityBots = infinityBots;
      result.dcaBots = dcaBots;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
