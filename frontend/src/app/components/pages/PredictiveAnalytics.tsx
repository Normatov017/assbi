import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Brain,
  Calendar,
  Download,
  Gauge,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { API_BASE as API } from "../../lib/config";

const CHART_TEXT = "hsl(var(--foreground))";
const CHART_MUTED = "hsl(var(--muted-foreground))";
const CHART_BORDER = "hsl(var(--border))";
const CHART_CARD = "hsl(var(--card))";

const tooltipStyle = {
  backgroundColor: CHART_CARD,
  border: `1px solid ${CHART_BORDER}`,
  borderRadius: 12,
  color: CHART_TEXT,
};

type CameraData = {
  camera_id: string;
  site?: string;
  running?: boolean;
  active_people?: number;
  risk_score?: number;
  fps?: number;
  quality?: number;
};

type SummaryData = {
  kpis?: {
    active_people?: number;
    risk_score?: number;
    fps?: number;
    quality?: number;
  };
  trend?: Array<{
    time: string;
    active?: number;
    people?: number;
    risk?: number;
  }>;
};

type PredictiveApiData = {
  forecast?: ForecastPoint[];
  risk?: RiskPoint[];
  summary?: {
    peak_people?: number;
    confidence?: number;
    risk_window?: string;
    forecast_horizon?: string;
    next_hour_people?: number;
  };
};

type ForecastPoint = {
  time: string;
  actual?: number;
  predicted?: number;
  upper?: number;
  lower?: number;
  risk?: number;
  confidence?: number;
};

type RiskPoint = {
  time: string;
  risk?: number;
  probability?: number;
};

function numberValue(value: unknown) {
  return Number(value || 0);
}

function formatPercent(value: unknown) {
  return `${numberValue(value).toFixed(0)}%`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function riskBadge(value: number) {
  if (value >= 70) return "bg-red-500 text-white";
  if (value >= 35) return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function confidenceBadge(value: number) {
  if (value >= 80) return "bg-green-500 text-white";
  if (value >= 55) return "bg-yellow-500 text-black";
  return "bg-red-500 text-white";
}

function buildForecast(
  summary: SummaryData | null,
  cameras: CameraData[],
  predictive: PredictiveApiData | null
): ForecastPoint[] {
  if (Array.isArray(predictive?.forecast) && predictive.forecast.length > 0) {
    return predictive.forecast;
  }

  const trend = Array.isArray(summary?.trend) ? summary.trend : [];

  const currentPeople =
    cameras.reduce((sum, camera) => sum + numberValue(camera.active_people), 0) ||
    numberValue(summary?.kpis?.active_people);

  const avgRisk =
    cameras.length > 0
      ? cameras.reduce((sum, camera) => sum + numberValue(camera.risk_score), 0) /
        cameras.length
      : numberValue(summary?.kpis?.risk_score);

  if (trend.length > 0) {
    return trend.slice(-10).map((item, index) => {
      const actual = numberValue(item.active || item.people);
      const predicted = Math.round(actual * (1 + index * 0.04));

      return {
        time: item.time,
        actual,
        predicted,
        lower: Math.max(0, Math.round(predicted * 0.8)),
        upper: Math.round(predicted * 1.2),
        risk: clamp(numberValue(item.risk) || avgRisk + index * 1.5),
        confidence: clamp(88 - index * 2),
      };
    });
  }

  return Array.from({ length: 9 }).map((_, index) => {
    const predicted = Math.max(
      0,
      Math.round(currentPeople * (0.75 + index * 0.07))
    );

    return {
      time: `+${index + 1}h`,
      actual: index < 2 ? Math.round(currentPeople * (0.9 + index * 0.04)) : undefined,
      predicted,
      lower: Math.max(0, Math.round(predicted * 0.8)),
      upper: Math.round(predicted * 1.2),
      risk: clamp(avgRisk * (0.8 + index * 0.04)),
      confidence: clamp(90 - index * 2),
    };
  });
}

function buildRiskForecast(
  predictive: PredictiveApiData | null,
  forecast: ForecastPoint[]
): RiskPoint[] {
  if (Array.isArray(predictive?.risk) && predictive.risk.length > 0) {
    return predictive.risk;
  }

  return forecast.map((item, index) => ({
    time: item.time,
    risk: clamp(numberValue(item.risk)),
    probability: clamp(numberValue(item.risk) * 0.85 + index * 1.5),
  }));
}

export default function PredictiveAnalytics() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [predictive, setPredictive] = useState<PredictiveApiData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);

      setIsRefreshing(true);
      setError("");

      const [summaryResult, camerasResult, predictiveResult] =
        await Promise.allSettled([
          fetch(`${API}/api/summary`, { cache: "no-store" }),
          fetch(`${API}/api/cameras`, { cache: "no-store" }),
          fetch(`${API}/api/predictive`, { cache: "no-store" }),
        ]);

      let summaryData: SummaryData | null = null;
      let camerasData: CameraData[] = [];
      let predictiveData: PredictiveApiData | null = null;

      if (summaryResult.status === "fulfilled" && summaryResult.value.ok) {
        summaryData = await summaryResult.value.json();
      }

      if (camerasResult.status === "fulfilled" && camerasResult.value.ok) {
        const json = await camerasResult.value.json();
        camerasData = Array.isArray(json) ? json : [];
      }

      if (
        predictiveResult.status === "fulfilled" &&
        predictiveResult.value.ok
      ) {
        predictiveData = await predictiveResult.value.json();
      }

      if (!summaryData && camerasData.length === 0 && !predictiveData) {
        throw new Error("No predictive data");
      }

      setSummary(summaryData || {});
      setCameras(camerasData);
      setPredictive(predictiveData || {});
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Predictive Analytics error:", err);
      setError("Predictive Analytics API bilan ulanishda muammo yuz berdi.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);

    const timer = window.setInterval(() => {
      loadData(true);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [loadData]);

  const forecastData = useMemo(
    () => buildForecast(summary, cameras, predictive),
    [summary, cameras, predictive]
  );

  const riskForecast = useMemo(
    () => buildRiskForecast(predictive, forecastData),
    [predictive, forecastData]
  );

  const currentPeople =
    cameras.reduce((sum, camera) => sum + numberValue(camera.active_people), 0) ||
    numberValue(summary?.kpis?.active_people);

  const avgRisk =
    cameras.length > 0
      ? cameras.reduce((sum, camera) => sum + numberValue(camera.risk_score), 0) /
        cameras.length
      : numberValue(summary?.kpis?.risk_score);

  const onlineCameras = cameras.filter((camera) => camera.running).length;
  const offlineCameras = Math.max(0, cameras.length - onlineCameras);

  const predictedPeak = Math.max(
    numberValue(predictive?.summary?.peak_people),
    currentPeople,
    ...forecastData.map((item) => numberValue(item.predicted))
  );

  const nextHourPeople =
    numberValue(predictive?.summary?.next_hour_people) ||
    numberValue(forecastData[0]?.predicted);

  const peakRisk = Math.max(
    avgRisk,
    ...riskForecast.map((item) => numberValue(item.risk))
  );

  const confidence =
    numberValue(predictive?.summary?.confidence) ||
    Math.round(
      forecastData.reduce((sum, item) => sum + numberValue(item.confidence), 0) /
        Math.max(1, forecastData.length)
    ) ||
    75;

  const riskWindow =
    predictive?.summary?.risk_window ||
    [...riskForecast].sort((a, b) => numberValue(b.risk) - numberValue(a.risk))[0]
      ?.time ||
    "No data";

  const forecastHorizon =
    predictive?.summary?.forecast_horizon || "Next 24 hours";

  const insight = useMemo(() => {
    if (error) {
      return {
        title: "Fallback forecast ishlayapti",
        text: "Predictive endpoint ishlamasa ham sahifa summary va camera ma’lumotlaridan taxminiy forecast hisoblaydi.",
        badge: "API WARNING",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (offlineCameras > 0) {
      return {
        title: "Forecast coverage pastroq",
        text: `${offlineCameras} ta kamera offline. Prediction aniqligi uchun camera source va detector processni tekshirish kerak.`,
        badge: "COVERAGE",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (peakRisk >= 70) {
      return {
        title: "High future risk",
        text: "Keyingi forecast oynasida risk yuqori ko‘rinyapti. Anomaly Detection sahifasini kuzatish kerak.",
        badge: "HIGH RISK",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (predictedPeak > currentPeople * 1.4 && currentPeople > 0) {
      return {
        title: "Crowd increase expected",
        text: "Odamlar soni oshishi mumkin. Operator monitoringni kuchaytirishi kerak.",
        badge: "PEAK",
        badgeClass: "bg-orange-500 text-white",
      };
    }

    return {
      title: "Forecast stable",
      text: "People forecast va risk trend normal holatda. Monitoringni davom ettirish mumkin.",
      badge: "STABLE",
      badgeClass: "bg-green-500 text-white",
    };
  }, [error, offlineCameras, peakRisk, predictedPeak, currentPeople]);

  function exportForecastReport() {
    window.open(`${API}/api/reports/forecast/excel`, "_blank");
  }

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              Predictive Analytics
            </h1>

            <Badge className="bg-purple-500 text-white">
              <Brain className="size-3.5 mr-1" />
              Forecast Engine
            </Badge>

            <Badge variant="outline" className="text-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-4xl">
            Clean forecast page for people prediction, future risk trend and
            operator planning.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => loadData(false)}>
            <RefreshCw
              className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button variant="outline" onClick={exportForecastReport}>
            <Download className="size-4 mr-2" />
            Export Forecast
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-yellow-500/30 bg-yellow-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-yellow-500" />
            <div>
              <p className="font-semibold text-yellow-500">
                Predictive API Warning
              </p>
              <p className="text-sm text-muted-foreground">
                {error} Fallback forecast ishlatilmoqda.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          title="Predicted Peak"
          value={predictedPeak}
          hint={forecastHorizon}
          className="border-blue-500/30 bg-blue-500/10"
          iconClassName="text-blue-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={Users}
          title="Next Hour People"
          value={nextHourPeople}
          hint="Short-term prediction"
          className="border-cyan-500/30 bg-cyan-500/10"
          iconClassName="text-cyan-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={ShieldAlert}
          title="Peak Risk"
          value={formatPercent(peakRisk)}
          hint={`${riskWindow} risk window`}
          className="border-red-500/30 bg-red-500/10"
          iconClassName="text-red-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={Gauge}
          title="AI Confidence"
          value={`${confidence}%`}
          hint="Forecast reliability"
          className="border-green-500/30 bg-green-500/10"
          iconClassName="text-green-500"
          isLoading={isLoading}
        />
      </div>

      <Card className="border-border/50 bg-purple-500/5">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-center">
            <div className="xl:col-span-2">
              <p className="text-sm text-muted-foreground">
                AI Forecast Recommendation
              </p>

              <h2 className="text-2xl font-semibold text-foreground">
                {insight.title}
              </h2>

              <p className="text-sm text-muted-foreground mt-1">
                {insight.text}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:col-span-2 gap-3">
              <MiniMetric label="Now" value={currentPeople} />
              <MiniMetric label="Peak" value={predictedPeak} />
              <MiniMetric label="Online" value={`${onlineCameras}/${cameras.length}`} />
              <MiniMetric label="Confidence" value={`${confidence}%`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <TrendingUp className="size-5 text-blue-500" />
              Crowd Forecast Curve
            </CardTitle>
          </CardHeader>

          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={forecastData}>
                <defs>
                  <linearGradient
                    id="predictionGradientClean"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />

                <XAxis
                  dataKey="time"
                  stroke={CHART_MUTED}
                  tick={{ fill: CHART_MUTED, fontSize: 12 }}
                  axisLine={{ stroke: CHART_BORDER }}
                  tickLine={{ stroke: CHART_BORDER }}
                />

                <YAxis
                  stroke={CHART_MUTED}
                  tick={{ fill: CHART_MUTED, fontSize: 12 }}
                  axisLine={{ stroke: CHART_BORDER }}
                  tickLine={{ stroke: CHART_BORDER }}
                />

                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: CHART_TEXT }}
                  labelStyle={{ color: CHART_TEXT }}
                />

                <Area
                  type="monotone"
                  dataKey="predicted"
                  stroke="#3b82f6"
                  fill="url(#predictionGradientClean)"
                  strokeWidth={3}
                  name="Predicted People"
                />

                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#22c55e"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="Actual People"
                />

                <Line
                  type="monotone"
                  dataKey="upper"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  name="Upper Range"
                />

                <Line
                  type="monotone"
                  dataKey="lower"
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  name="Lower Range"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ShieldAlert className="size-5 text-red-500" />
              Risk Forecast
            </CardTitle>
          </CardHeader>

          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={riskForecast}>
                <defs>
                  <linearGradient
                    id="riskGradientClean"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />

                <XAxis
                  dataKey="time"
                  stroke={CHART_MUTED}
                  tick={{ fill: CHART_MUTED, fontSize: 12 }}
                  axisLine={{ stroke: CHART_BORDER }}
                  tickLine={{ stroke: CHART_BORDER }}
                />

                <YAxis
                  stroke={CHART_MUTED}
                  tick={{ fill: CHART_MUTED, fontSize: 12 }}
                  axisLine={{ stroke: CHART_BORDER }}
                  tickLine={{ stroke: CHART_BORDER }}
                />

                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: CHART_TEXT }}
                  labelStyle={{ color: CHART_TEXT }}
                />

                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="#ef4444"
                  fill="url(#riskGradientClean)"
                  strokeWidth={3}
                  name="Predicted Risk"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Calendar className="size-5 text-cyan-500" />
            Forecast Table
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Predicted</TableHead>
                  <TableHead>Lower</TableHead>
                  <TableHead>Upper</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {forecastData.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8"
                    >
                      Forecast data topilmadi.
                    </TableCell>
                  </TableRow>
                ) : (
                  forecastData.map((item, index) => (
                    <TableRow key={`${item.time}-${index}`}>
                      <TableCell className="font-mono text-foreground">
                        {item.time}
                      </TableCell>

                      <TableCell>{item.actual ?? "-"}</TableCell>

                      <TableCell className="font-semibold text-foreground">
                        {item.predicted || 0}
                      </TableCell>

                      <TableCell>{item.lower || 0}</TableCell>
                      <TableCell>{item.upper || 0}</TableCell>

                      <TableCell>
                        <Badge className={riskBadge(numberValue(item.risk))}>
                          {formatPercent(item.risk)}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge
                          className={confidenceBadge(
                            numberValue(item.confidence)
                          )}
                        >
                          {formatPercent(item.confidence)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  title,
  value,
  hint,
  className,
  iconClassName,
  isLoading,
}: {
  icon: LucideIcon;
  title: string;
  value: string | number;
  hint: string;
  className: string;
  iconClassName: string;
  isLoading: boolean;
}) {
  return (
    <Card className={`border ${className}`}>
      <CardContent className="p-5">
        <Icon className={`size-6 mb-3 ${iconClassName}`} />

        <p className="text-sm text-muted-foreground">{title}</p>

        <h2 className="text-3xl font-semibold text-foreground">
          {isLoading ? "--" : value}
        </h2>

        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}
