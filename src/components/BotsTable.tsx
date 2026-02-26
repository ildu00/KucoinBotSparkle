import { Bot, TrendingUp, TrendingDown, RotateCcw } from "lucide-react";
import { resetBaseline } from "@/lib/kucoin";
import { toast } from "sonner";

export interface BotData {
  id: string;
  symbol: string;
  type: string;
  status: "active" | "stopped" | "completed";
  invested: number;
  currentValue: number;
  profit: number;
  profitPct: number;
  runningDays: number;
  label?: string;
}

interface BotsTableProps {
  bots: BotData[];
  loading?: boolean;
}

const STATUS_CONFIG = {
  active: { label: "Active", color: "text-profit", dot: "bg-profit" },
  stopped: { label: "Stopped", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  completed: { label: "Completed", color: "text-warning", dot: "bg-warning" },
};

const TYPE_LABELS: Record<string, string> = {
  SPOT_GRID: "Spot Grid",
  FUTURES_GRID: "Futures Grid",
  INFINITY_GRID: "Infinity",
  DCA: "DCA",
};

export function BotsTable({ bots, loading }: BotsTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-secondary rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Bot className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">No bots found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-widest">
        <span className="col-span-2">Bot / Symbol</span>
        <span className="text-right">Invested</span>
        <span className="text-right">Value</span>
        <span className="text-right">Profit</span>
        <span className="text-right">Days</span>
      </div>

      {bots.map((bot) => {
        const status = STATUS_CONFIG[bot.status];
        const isProfit = bot.profit >= 0;

        return (
          <div
            key={bot.id}
            className="grid grid-cols-6 gap-4 px-4 py-3 card-trading hover:border-primary/30 transition-all items-center"
          >
            <div className="col-span-2 flex items-center gap-3 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot} ${bot.status === "active" ? "animate-pulse_glow" : ""}`} />
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{bot.symbol}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">{TYPE_LABELS[bot.type] || bot.type}</span>
                  {bot.label && <span className="text-xs text-muted-foreground opacity-60">· {bot.label}</span>}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono text-sm font-medium">${bot.invested.toFixed(2)}</div>
            </div>

            <div className="text-right">
              <div className="font-mono text-sm font-medium">${bot.currentValue.toFixed(2)}</div>
            </div>

            <div className="text-right">
              <div className={`font-mono text-sm font-semibold ${isProfit ? "text-profit" : "text-loss"} flex items-center justify-end gap-1`}>
                {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isProfit ? "+" : ""}{bot.profit.toFixed(2)}
              </div>
              <div className={`text-xs font-mono ${isProfit ? "text-profit" : "text-loss"} opacity-70`}>
                {isProfit ? "+" : ""}{bot.profitPct.toFixed(2)}%
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono text-sm text-muted-foreground">{bot.runningDays}d</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
