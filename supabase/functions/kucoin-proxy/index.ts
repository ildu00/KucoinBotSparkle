// deno-lint-ignore-file

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout per request
  try {
    const res = await fetch(`${base}${ep}`, {
      method,
      signal: controller.signal,
      headers: {
        "KC-API-KEY": ak, "KC-API-SIGN": sig, "KC-API-TIMESTAMP": ts,
        "KC-API-PASSPHRASE": pp, "KC-API-KEY-VERSION": "3", "Content-Type": "application/json",
      },
    });
    clearTimeout(timeout);
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    return { fetchError: String(e) };
  }
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

    // Fetch all data in parallel with hard 20s overall timeout
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
      return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
      ]);
    };

    const [subAccountsV2, futuresAllSubs, masterAccounts] = await withTimeout(Promise.all([
      s("/api/v2/sub-accounts?pageSize=100"),
      f("/api/v1/account-overview-all?currency=USDT"),
      s("/api/v1/accounts"),
    ]), 20000);

    // Build a map of subName -> futuresUSDT from the futures all-subs endpoint
    type FutAcct = { accountName: string; accountEquity: number };
    const futAccountsList: FutAcct[] = futuresAllSubs?.data?.accounts ?? [];
    const futuresMap = new Map<string, number>();
    for (const acct of futAccountsList) {
      futuresMap.set(acct.accountName, parseFloat(String(acct.accountEquity ?? 0)));
    }

    // Master futures equity (accountName === "main" in the overview-all response)
    const masterFuturesUSDT = futuresMap.get("main") ?? 0;

    // Master spot balance
    let masterSpotUSDT = 0;
    for (const acc of masterAccounts?.data ?? []) {
      if ((acc as { currency: string }).currency === "USDT") {
        masterSpotUSDT += parseFloat((acc as { balance: string }).balance ?? "0");
      }
    }
    const masterUSDT = masterSpotUSDT + masterFuturesUSDT;

    type SubV2Item = {
      subUserId: string | null;
      subName: string;
      mainAccounts: Array<{ currency: string; balance: string }>;
      tradeAccounts: Array<{ currency: string; balance: string }>;
      tradeHFAccounts: Array<{ currency: string; balance: string }>;
    };

    const subList: SubV2Item[] = subAccountsV2?.data?.items ?? subAccountsV2?.data ?? [];
    const robotSubs = subList.filter((s) => s.subName?.startsWith("robot"));

    // Build sub details combining spot (from V2 inline) + futures (from overview-all map)
    const subDetails = robotSubs.map((sub) => {
      let spotUSDT = 0;
      for (const type of ["mainAccounts", "tradeAccounts", "tradeHFAccounts"] as const) {
        for (const acc of sub[type] ?? []) {
          if (acc.currency === "USDT") spotUSDT += parseFloat(acc.balance ?? "0");
        }
      }
      const futuresUSDT = futuresMap.get(sub.subName) ?? 0;

      return {
        name: sub.subName,
        id: sub.subUserId ?? sub.subName,
        spotUSDT,
        futuresUSDT,
        total: spotUSDT + futuresUSDT,
      };
    });

    const subTotal = subDetails.reduce((sum, r) => sum + r.total, 0);
    const grandTotal = masterUSDT + subTotal;

    const diagnosis: "OK" | "MISSING_SUB_PERMISSION" | "ZERO_ALL" =
      grandTotal === 0 ? "ZERO_ALL" : "OK";

    return new Response(JSON.stringify({
      diagnosis,
      grandTotal,
      masterUSDT,
      masterSpotUSDT,
      masterFuturesUSDT,
      subTotal,
      subDetails,
      subCount: subList.length,
      // raw debug
      _rawFuturesAllSubs: futuresAllSubs,
      _rawSubAccountsV2: subAccountsV2,
      _rawMasterAccounts: masterAccounts,
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
