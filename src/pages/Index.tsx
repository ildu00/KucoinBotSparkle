import { useState, useCallback, useEffect } from "react";
import { DebugPanel } from "@/components/DebugPanel";
import { RefreshCw, Settings, Bot, DollarSign, TrendingUp, Wallet, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysForm, type ApiAccount } from "@/components/ApiKeysForm";
import { StatCard } from "@/components/StatCard";
import { BotsTable, type BotData } from "@/components/BotsTable";
import { AllocationChart, PerformanceChart } from "@/components/Charts";
import { fetchAccountData, recordBalanceSnapshot, fetchBalanceHistory, type AccountData } from "@/lib/kucoin";
import { toast } from "sonner";

const STORAGE_KEY = "kucoin_accounts";

function loadAccounts(): ApiAccount[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [{ id: crypto.randomUUID(), label: "Account 1", apiKey: "", apiSecret: "", apiPassphrase: "" }];
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<ApiAccount[]>(loadAccounts);
  const [accountsData, setAccountsData] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [showSettings, setShowSettings] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [historyData, setHistoryData] = useState<Array<{ time: string; value: number }>>([]);

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
    setLoadingStatus("Подключение к KuCoin...");
    const slowTimer = setTimeout(() => setLoadingStatus("Ожидание ответа KuCoin API (может занять до 30с при cold start)..."), 6000);
    try {
      const results = await Promise.all(valid.map(fetchAccountData));
      clearTimeout(slowTimer);
      setAccountsData(results);
      setLastUpdate(new Date());

      // Record snapshots & refresh history in background
      const successResults = results.filter((r) => !r.error && r.totalBalance > 0);
      Promise.all(successResults.map((r) => recordBalanceSnapshot(r.label, r.totalBalance)))
        .then(() => Promise.all(successResults.map((r) => fetchBalanceHistory(r.label))))
        .then((allHistories) => {
          const combined = new Map<string, number>();
          for (const hist of allHistories) {
            for (const point of hist) {
              combined.set(point.time, (combined.get(point.time) ?? 0) + point.value);
            }
          }
          if (combined.size > 0) {
            setHistoryData(Array.from(combined.entries()).map(([time, value]) => ({ time, value })));
          }
        })
        .catch(() => {});

      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        errors.forEach((e) => toast.error(`${e.label}: ${e.error}`));
      } else {
        toast.success("Данные обновлены");
      }
      setShowSettings(false);
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setLoadingStatus("");
    }
  }, [accounts]);

  // Load history on mount
  useEffect(() => {
    const valid = accounts.filter((a) => a.apiKey && a.apiSecret && a.apiPassphrase);
    if (valid.length === 0) return;
    Promise.all(valid.map((a) => fetchBalanceHistory(a.label))).then((allHistories) => {
      const combined = new Map<string, number>();
      for (const hist of allHistories) {
        for (const point of hist) {
          combined.set(point.time, (combined.get(point.time) ?? 0) + point.value);
        }
      }
      if (combined.size > 0) {
        setHistoryData(Array.from(combined.entries()).map(([time, value]) => ({ time, value })));
      }
    });
  }, []);

  const totalBalance = accountsData.reduce((s, a) => s + a.totalBalance, 0);
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

  const totalProfitPct = totalBalance > 0 ? (totalProfit / (totalBalance - totalProfit)) * 100 : 0;
  const missingSubPermission = accountsData.filter((a) => a.diagnosis === "MISSING_SUB_PERMISSION");

  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-sm tracking-wide">KuCoin</span>
            <span className="text-primary font-bold text-sm">Bot Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowSettings(!showSettings)}
              className="gap-2 border-border hover:border-primary/50">
              {showSettings ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{showSettings ? "Close" : "API Keys"}</span>
            </Button>
            <Button size="sm" onClick={fetchAll} disabled={loading}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 glow-primary">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Loading..." : "Refresh"}</span>
            </Button>
          </div>
        </div>
        {loading && loadingStatus && (
          <div className="border-t border-border/30 bg-background/60 px-6 py-1.5">
            <p className="text-xs text-muted-foreground animate-pulse max-w-7xl mx-auto">{loadingStatus}</p>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Settings */}
        {showSettings && (
          <div className="animate-fade-in card-trading p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 rounded-full bg-primary" />
              <h2 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">API Configuration</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Keys stored locally in your browser. Required permissions: <span className="font-mono text-xs text-primary">General + Spot + Futures + <strong>Sub-Account Management</strong></span>
            </p>
            <ApiKeysForm accounts={accounts} onChange={saveAccounts} />
            <Button onClick={fetchAll} disabled={loading} className="w-full gap-2 bg-primary text-primary-foreground glow-primary">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? (loadingStatus || "Fetching data...") : "Load Dashboard"}
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && accountsData.length === 0 && !showSettings && (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-primary opacity-60" />
            </div>
            <h2 className="font-semibold text-lg mb-2">No data yet</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">Configure your KuCoin API keys to see your bot balances.</p>
            <Button onClick={() => setShowSettings(true)} variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
              <Settings className="w-4 h-4 mr-2" />Configure API Keys
            </Button>
          </div>
        )}

        {/* Dashboard */}
        {accountsData.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            {/* Error banners */}
            {accountsData.filter((a) => a.error).map((a) => (
              <div key={a.label} className="flex items-center gap-3 p-4 rounded-lg bg-loss/10 border border-loss/30 text-sm">
                <AlertCircle className="w-4 h-4 text-loss flex-shrink-0" />
                <span><strong>{a.label}:</strong> {a.error}</span>
              </div>
            ))}

            {/* Sub-account permission warning */}
            {missingSubPermission.map((a) => (
              <div key={a.label + "_perm"} className="p-5 rounded-lg bg-warning/10 border border-warning/40 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-warning text-sm">
                  <AlertCircle className="w-4 h-4" />
                  Action Required — API key missing "Sub-Account Management" permission
                </div>
                <p className="text-sm text-muted-foreground">
                  Found <strong className="text-foreground">{a.subCount} bot sub-accounts</strong> (robot…) but cannot read their balances.
                </p>
              </div>
            ))}

            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Balance"
                value={`$${totalBalance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={<DollarSign className="w-4 h-4" />} highlight />
              <StatCard title="Futures / Bots"
                value={`$${totalFuturesBalance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subtitle={allBots.length > 0 ? `${allBots.length} bots` : "Futures equity"}
                icon={<Bot className="w-4 h-4" />} />
              <StatCard title="Total Profit"
                value={`${totalProfit >= 0 ? "+" : ""}$${totalProfit.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                change={totalProfitPct} icon={<TrendingUp className="w-4 h-4" />} />
              <StatCard title="Free Balance"
                value={`$${totalSpotBalance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subtitle="Spot + Main" icon={<Wallet className="w-4 h-4" />} />
            </div>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="card-trading p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-primary" />
                  <h3 className="font-semibold text-sm">Balance History (30d)</h3>
                </div>
                {historyData.length > 0
                  ? <PerformanceChart data={historyData} />
                  : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No history yet — refresh to start recording</div>}
              </div>
              <div className="card-trading p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-chart-2" />
                  <h3 className="font-semibold text-sm">Allocation</h3>
                </div>
                {allocationData.length > 0
                  ? <AllocationChart data={allocationData} />
                  : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data</div>}
              </div>
            </div>

            {/* Bots table */}
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
                      <TabsTrigger key={a.label} value={a.label}>{a.label} ({a.bots.length})</TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value="all" className="mt-4"><BotsTable bots={allBots} /></TabsContent>
                  {accountsData.map((a) => (
                    <TabsContent key={a.label} value={a.label} className="mt-4"><BotsTable bots={a.bots} /></TabsContent>
                  ))}
                </Tabs>
              </div>
            ) : (
              <div className="card-trading p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-chart-3" />
                    <h3 className="font-semibold text-sm">Bots</h3>
                    <span className="text-xs text-muted-foreground font-mono ml-1">({activeBots.length} active)</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{allBots.length} total</span>
                </div>
                <BotsTable bots={allBots} />
              </div>
            )}

            {/* Per-account summary (multi-account) */}
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
                        <div><p className="text-xs text-muted-foreground">Bots</p><p className="font-mono font-medium">${acc.botBalance.toFixed(2)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Free</p><p className="font-mono font-medium">${acc.spotBalance.toFixed(2)}</p></div>
                        <div>
                          <p className="text-xs text-muted-foreground">Profit</p>
                          <p className={`font-mono font-medium ${acc.profit >= 0 ? "text-profit" : "text-loss"}`}>
                            {acc.profit >= 0 ? "+" : ""}${acc.profit.toFixed(2)}
                          </p>
                        </div>
                        <div><p className="text-xs text-muted-foreground">Active</p><p className="font-mono font-medium">{acc.bots.filter((b) => b.status === "active").length}</p></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Debug panel */}
            {accountsData.map((acc) => acc.rawDebug && (
              <DebugPanel key={acc.label} data={{ account: acc.label, raw: acc.rawDebug }} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
