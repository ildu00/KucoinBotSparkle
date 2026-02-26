import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  change?: number;
  icon?: React.ReactNode;
  highlight?: boolean;
  loading?: boolean;
}

export function StatCard({ title, value, subtitle, change, icon, highlight, loading }: StatCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div className={`card-trading p-5 space-y-3 transition-all duration-300 hover:border-primary/30 ${highlight ? "border-glow" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">{title}</span>
        {icon && <div className="text-primary opacity-70">{icon}</div>}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-32 bg-secondary rounded animate-pulse" />
          <div className="h-4 w-20 bg-secondary rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className={`text-2xl font-bold font-mono tracking-tight ${highlight ? "text-primary" : "text-foreground"}`}>
            {value}
          </div>

          <div className="flex items-center gap-2">
            {change !== undefined && (
              <span className={`flex items-center gap-1 text-xs font-medium font-mono ${isPositive ? "text-profit" : isNegative ? "text-loss" : "text-muted-foreground"}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : isNegative ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {isPositive ? "+" : ""}{change?.toFixed(2)}%
              </span>
            )}
            {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
          </div>
        </>
      )}
    </div>
  );
}
