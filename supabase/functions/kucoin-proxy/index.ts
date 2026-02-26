import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.132.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version',
};

function sign(message: string, secret: string): string {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const msg = encoder.encode(message);
  const hmac = createHmac("sha256", key);
  hmac.update(msg);
  return base64Encode(hmac.digest());
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
  const signature = sign(strToSign, apiSecret);
  const passphraseSign = sign(apiPassphrase, apiSecret);

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

  const data = await res.json();
  return data;
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
      // Spot accounts
      const spotAccounts = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/accounts?type=trade");
      result.spotAccounts = spotAccounts;

      // Spot main accounts
      const mainAccounts = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/accounts?type=main");
      result.mainAccounts = mainAccounts;

      // Margin accounts
      const marginAccounts = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/accounts?type=margin");
      result.marginAccounts = marginAccounts;

      // Active spot grid bots
      const spotBots = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/spot/list?status=active&pageSize=50&currentPage=1");
      result.spotBots = spotBots;

      // Spot grid bots details (all statuses)
      const allSpotBots = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/spot/list?pageSize=50&currentPage=1");
      result.allSpotBots = allSpotBots;

      // Futures grid bots
      const futuresBots = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/futures/list?status=active&pageSize=50&currentPage=1");
      result.futuresBots = futuresBots;

      const allFuturesBots = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/futures/list?pageSize=50&currentPage=1");
      result.allFuturesBots = allFuturesBots;

      // Infinity grid bots
      const infinityBots = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/infinity/list?pageSize=50&currentPage=1");
      result.infinityBots = infinityBots;

      // DCA bots
      const dcaBots = await kucoinRequest(apiKey, apiSecret, apiPassphrase, "/api/v1/grid/strategy/dca/list?pageSize=50&currentPage=1");
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
