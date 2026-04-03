import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TimeseriesChartPoint {
  dayLabel: string;
  events: number;
  recoveryAttempts: number;
}

interface TimeseriesChartProps {
  data: TimeseriesChartPoint[];
}

export default function TimeseriesChart({ data }: TimeseriesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="eventsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ds-data-visualization-area-primary-gradient-start)" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--ds-data-visualization-area-primary-gradient-stop)" stopOpacity={1} />
          </linearGradient>
          <linearGradient id="attemptsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ds-data-visualization-area-secondary-gradient-start)" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--ds-data-visualization-area-secondary-gradient-stop)" stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 6" stroke="var(--chart-grid)" />
        <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)" }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid rgba(186, 195, 255, 0.2)",
            background: "rgba(41, 42, 44, 0.76)",
            boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.4), 0px 0px 1px rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(14px)",
          }}
        />
        <Legend wrapperStyle={{ color: "var(--muted)" }} />
        <Area
          type="monotone"
          dataKey="events"
          stroke="var(--ds-data-visualization-line-primary)"
          strokeWidth={2}
          fill="url(#eventsGradient)"
          name="Eventos"
        />
        <Area
          type="monotone"
          dataKey="recoveryAttempts"
          stroke="var(--ds-data-visualization-line-secondary)"
          strokeWidth={2}
          fill="url(#attemptsGradient)"
          name="Tentativas"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
