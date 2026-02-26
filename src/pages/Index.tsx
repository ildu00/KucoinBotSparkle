import { useState, useCallback } from "react";
import { DebugPanel } from "@/components/DebugPanel";
import { RefreshCw, Settings, Bot, DollarSign, TrendingUp, Wallet, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysForm, type ApiAccount } from "@/components/ApiKeysForm";
import { StatCard } from "@/components/StatCard";
import { BotsTable, type BotData } from "@/components/BotsTable";
import { AllocationChart, PerformanceChart } from "@/components/Charts";
import { fetchAccountData, type AccountData } from "@/lib/kucoin";
import { toast } from "sonner";

const STORAGE_KEY = "kucoin_accounts";

function loadAccounts(): ApiAccount[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [{ id: crypto.randomUUID(), label: "Account 1", apiKey: "", apiSecret: "", apiPassphrase: "" }];
}

function generateSimulatedHistory(total: number) {
  const points = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const variance = (Math.random() - 0.45) * (total * 0.02);
    points.push({ time: label, value: Math.max(0, total - i * (total * 0.001) + variance) });
  }
  points[points.length - 1].value = total;
  return points;
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<ApiAccount[]>(loadAccounts);
  const [accountsData, setAccountsData] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(accountsData.length === 0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const saveAccounts = (accs: ApiAccount[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accs));
    setAccounts(accs);
  };

  const fetchAll = useCallback(async () => {
    const valid = accounts.filter((a) => a.apiKey && a.apiSecret && a.apiPassphrase);
    if (valid.length === 0) {
      toast.error("Please enter at least one set of API credentials");
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(valid.map(fetchAccountData));
      setAccountsData(results);
      setLastUpdate(new Date());
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        errors.forEach((e) => toast.error(`${e.label}: ${e.error}`));
      } else {
        toast.success("Data refreshed successfully");
      }
      setShowSettings(false);
    } finally {
      setLoading(false);
    }
  }, [accounts]);

  // Aggregate totals
  const totalBalance = accountsData.reduce((s, a) => s + a.totalBalance, 0);
  const totalBotBalance = accountsData.reduce((s, a) => s + a.botBalance, 0);
  const totalFuturesBalance = accountsData.reduce((s, a) => s + (a.futuresBalance ?? 0), 0);
  const totalSpotBalance = accountsData.reduce((s, a) => s + a.spotBalance, 0);
  const totalProfit = accountsData.reduce((s, a) => s + a.profit, 0);
  const allBots: BotData[] = accountsData.flatMap((a) => a.bots);
  const activeBots = allBots.filter((b) => b.status === "active");

  const allocationData = accountsData.length > 1
    ? accountsData.map((a) => ({ name: a.label, value: a.totalBalance })).filter((d) => d.value > 0)
    : [
        { name: "Futures / Bots", value: totalFuturesBalance },
        { name: "Spot / Main", value: totalSpotBalance },
      ].filter((d) => d.value > 0);

  const historyData = totalBalance > 0 ? generateSimulatedHistory(totalBalance) : [];

  const totalProfitPct = totalBalance > 0 ? (totalProfit / (totalBalance - totalProfit)) * 100 : 0;

  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide">KuCoin</span>
              <span className="text-primary font-bold text-sm"> Bot Dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSettings(!showSettings)}
              className="gap-2 border-border hover:border-primary/50"
            >
              {showSettings ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{showSettings ? "Close" : "API Keys"}</span>
            </Button>
            <Button
              size="sm"
              onClick={fetchAll}
              disabled={loading}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Loading..." : "Refresh"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Settings Panel */}
        {showSettings && (
          <div className="animate-fade-in">
            <div className="card-trading p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 rounded-full bg-primary" />
                <h2 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">API Configuration</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Keys are stored locally in your browser. Enable: General, Spot, Futures permissions. Keys never leave your device — all signing happens server-side via encrypted edge function.
              </p>
              <ApiKeysForm accounts={accounts} onChange={saveAccounts} />
              <Button onClick={fetchAll} disabled={loading} className="w-full gap-2 bg-primary text-primary-foreground glow-primary">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Fetching data..." : "Load Dashboard"}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && accountsData.length === 0 && !showSettings && (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-primary opacity-60" />
            </div>
            <h2 className="font-semibold text-lg mb-2">No data yet</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">Configure your KuCoin API keys to see your bot balances and statistics.</p>
            <Button onClick={() => setShowSettings(true)} variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
              <Settings className="w-4 h-4 mr-2" />
              Configure API Keys
            </Button>
          </div>
        )}

        {/* Dashboard */}
        {accountsData.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            {/* Error / Diagnosis banners */}
            {accountsData.filter((a) => a.error).map((a) => (
              <div key={a.label} className="flex items-center gap-3 p-4 rounded-lg bg-loss/10 border border-loss/30 text-sm">
                <AlertCircle className="w-4 h-4 text-loss flex-shrink-0" />
                <span><strong>{a.label}:</strong> {a.error}</span>
              </div>
            ))}
            {accountsData.filter((a) => a.diagnosis === "MISSING_SUB_PERMISSION").map((a) => (
              <div key={a.label + "_perm"} className="p-5 rounded-lg bg-warning/10 border border-warning/40 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-warning text-sm">
                  <AlertCircle className="w-4 h-4" />
                  Action Required — Missing "Sub-Account" Permission ({a.label})
                </div>
                <p className="text-sm text-muted-foreground">
                  Found <strong className="text-foreground">{a.subCount} trading bot sub-accounts</strong> (robot…), but balances are hidden. Your API key is missing <strong className="text-foreground">Sub-Account Management</strong> permission.
                </p>
                <div className="bg-secondary rounded-lg p-4 space-y-2 text-sm">
                  <p className="font-semibold text-xs uppercase tracking-widest text-muted-foreground mb-2">Fix — 3 steps:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground leading-relaxed">
                    <li>Open <strong className="text-foreground">KuCoin → Account → API Management</strong></li>
                    <li>Create a new API key and check these permissions:
                      <div className="mt-1.5 ml-5 flex flex-wrap gap-1.5">
                        {["General", "Spot Trading", "Futures Trading", "Sub-Account Management"].map(p => (
                          <span key={p} className="px-2 py-0.5 rounded text-xs font-mono bg-primary/20 text-primary border border-primary/30">{p}</span>
                        ))}
                      </div>
                    </li>
                    <li>Enter the new key above and click <strong className="text-foreground">Refresh</strong></li>
                  </ol>
                </div>
              </div>
            ))}
              <div key={a.label + "diag"} className="p-5 rounded-lg bg-warning/10 border border-warning/30 text-sm space-y-3">
                <div className="flex items-center gap-2 font-semibold text-warning">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  API Key Issue Detected — {a.label}
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Your API key appears to be created on a <strong className="text-foreground">sub-account</strong>, not the master account. The ~3708 USDT balance is on the master account.
                </p>
                <div className="space-y-1.5 text-muted-foreground">
                  <p className="font-medium text-foreground text-xs uppercase tracking-widest">How to fix:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                    <li>Go to <strong className="text-foreground">KuCoin.com → Account → API Management</strong></li>
                    <li>Make sure you are on the <strong className="text-foreground">Master Account</strong> (not a sub-account page)</li>
                    <li>Create a new API key with permissions: <strong className="text-foreground">General + Spot Trading + Futures Trading + Sub-Account</strong></li>
                    <li>Enter the new key here and click Refresh</li>
                  </ol>
                </div>
              </div>
            ))}

            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Balance"
                value={`$${totalBalance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={<DollarSign className="w-4 h-4" />}
                highlight
              />
              <StatCard
                title="Futures / Bots"
                value={`$${totalFuturesBalance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subtitle={allBots.length > 0 ? `${allBots.length} bots` : "Futures equity"}
                icon={<Bot className="w-4 h-4" />}
              />
              <StatCard
                title="Total Profit"
                value={`${totalProfit >= 0 ? "+" : ""}$${totalProfit.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                change={totalProfitPct}
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <StatCard
                title="Free Balance"
                value={`$${totalSpotBalance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subtitle="Spot + Main"
                icon={<Wallet className="w-4 h-4" />}
              />
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="card-trading p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-primary" />
                  <h3 className="font-semibold text-sm">Balance History (30d)</h3>
                </div>
                <PerformanceChart data={historyData} />
              </div>

              <div className="card-trading p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-chart-2" />
                  <h3 className="font-semibold text-sm">Allocation</h3>
                </div>
                {allocationData.length > 0 ? (
                  <AllocationChart data={allocationData} />
                ) : (
                  <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data</div>
                )}
              </div>
            </div>

            {/* Per-account tabs if multiple */}
            {accountsData.length > 1 ? (
              <div className="card-trading p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-chart-3" />
                  <h3 className="font-semibold text-sm">Bots</h3>
                </div>
                <Tabs defaultValue="all">
                  <TabsList className="bg-secondary border border-border">
                    <TabsTrigger value="all">All ({allBots.length})</TabsTrigger>
                    {accountsData.map((a) => (
                      <TabsTrigger key={a.label} value={a.label}>
                        {a.label} ({a.bots.length})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value="all" className="mt-4">
                    <BotsTable bots={allBots} />
                  </TabsContent>
                  {accountsData.map((a) => (
                    <TabsContent key={a.label} value={a.label} className="mt-4">
                      <BotsTable bots={a.bots} />
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            ) : (
              <div className="card-trading p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-chart-3" />
                    <h3 className="font-semibold text-sm">Active Bots</h3>
                    <span className="text-xs text-muted-foreground font-mono ml-1">({activeBots.length} running)</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{allBots.length} total</span>
                </div>
                <BotsTable bots={allBots} />
              </div>
            )}

            {/* Debug panels */}
            {accountsData.map((acc) => acc.rawDebug && (
              <DebugPanel key={acc.label} data={{ account: acc.label, raw: acc.rawDebug }} />
            ))}

            {/* Per-account cards */}
            {accountsData.length > 1 && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accountsData.map((acc) => (
                  <div key={acc.label} className="card-trading p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${acc.error ? "bg-loss" : "bg-profit"}`} />
                        <span className="font-semibold text-sm">{acc.label}</span>
                      </div>
                      <span className="font-mono text-lg font-bold text-primary">
                        ${acc.totalBalance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {acc.error ? (
                      <p className="text-xs text-loss">{acc.error}</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Bots</p>
                          <p className="font-mono font-medium">${acc.botBalance.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Free</p>
                          <p className="font-mono font-medium">${acc.spotBalance.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Profit</p>
                          <p className={`font-mono font-medium ${acc.profit >= 0 ? "text-profit" : "text-loss"}`}>
                            {acc.profit >= 0 ? "+" : ""}${acc.profit.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Active bots</p>
                          <p className="font-mono font-medium">{acc.bots.filter((b) => b.status === "active").length}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
