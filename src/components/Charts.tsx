import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = [
  "hsl(168, 84%, 48%)",
  "hsl(199, 89%, 48%)",
  "hsl(271, 91%, 65%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
];

interface AllocationChartProps {
  data: Array<{ name: string; value: number }>;
}

export function AllocationChart({ data }: AllocationChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (active && payload?.length) {
      const pct = ((payload[0].value / total) * 100).toFixed(1);
      return (
        <div className="card-trading px-3 py-2 text-sm">
          <p className="font-semibold">{payload[0].name}</p>
          <p className="font-mono text-primary">${payload[0].value.toFixed(2)} <span className="text-muted-foreground">({pct}%)</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex-1 space-y-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="text-sm text-muted-foreground truncate">{item.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-mono text-sm font-medium">${item.value.toFixed(0)}</span>
              <span className="text-xs text-muted-foreground font-mono w-12 text-right">
                {((item.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PerformanceChartProps {
  data: Array<{ time: string; value: number }>;
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload?.length) {
      return (
        <div className="card-trading px-3 py-2 text-sm">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="font-mono text-primary font-semibold">${payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(168, 84%, 48%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(168, 84%, 48%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 16%)" />
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="hsl(168, 84%, 48%)"
          strokeWidth={2}
          fill="url(#colorValue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
