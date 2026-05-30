import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Camera,
  CheckCircle2,
  Clock,
  Cpu,
  Eye,
  Gauge,
  Laptop,
  Layers,
  Package,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

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
import { getSummary } from "../../lib/api";

const CHART_COLORS = ["#10b981", "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444"];

type ApiStatus = "Connecting" | "Live" | "Offline";

type Kpis = {
  active_people?: number;
  new_unique_today?: number;
  total_unique?: number;
  risk_score?: number;
  fps?: number;
  quality?: number;
  laptops?: number;
  phones?: number;
  vehicles?: number;
  objects?: number;
  incidents?: number;
  standing?: number;
  sitting?: number;
  cameras?: number;
  online_cameras?: number;
};

type TrendItem = {
  time: string;
  active?: number;
  people?: number;
  risk?: number;
  fps?: number;
  quality?: number;
};

type CameraItem = {
  camera_id: string;
  site?: string;
  running?: boolean;
  active_people?: number;
  total_unique?: number;
  risk_score?: number;
  fps?: number;
  quality?: number;
  laptops?: number;
  phones?: number;
  vehicles?: number;
  objects?: number;
  speed_mode?: string;
  type?: string;
};

type IncidentItem = {
  id?: string | number;
  incident_type?: string;
  severity?: string;
  camera_id?: string;
  message?: string;
  status?: string;
  created_at?: string;
};

type SummaryData = {
  kpis?: Kpis;
  trend?: TrendItem[];
  posture?: { name: string; value: number }[];
  incidents?: IncidentItem[];
  cameras?: CameraItem[];
  camera_health?: CameraItem[];
  objects?: { name: string; value: number }[];
};

const DEFAULT_KPIS: Kpis = {
  active_people: 0,
  new_unique_today: 0,
  total_unique: 0,
  risk_score: 0,
  fps: 0,
  quality: 0,
  laptops: 0,
  phones: 0,
  vehicles: 0,
  objects: 0,
  incidents: 0,
  standing: 0,
  sitting: 0,
  cameras: 0,
  online_cameras: 0,
};

function numberValue(value: unknown) {
  return Number(value || 0);
}

function formatNumber(value: unknown) {
  return numberValue(value).toLocaleString();
}

function formatPercent(value: unknown) {
  return `${numberValue(value).toFixed(0)}%`;
}

function riskLabel(value: number) {
  if (value >= 70) return "HIGH";
  if (value >= 35) return "MEDIUM";
  return "LOW";
}

function riskBadge(value: number) {
  const label = riskLabel(value);
  if (label === "HIGH") return "bg-red-500 text-white";
  if (label === "MEDIUM") return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function qualityBadge(value: number) {
  if (value >= 80) return "bg-green-500 text-white";
  if (value >= 50) return "bg-yellow-500 text-black";
  return "bg-red-500 text-white";
}

function severityBadge(value?: string) {
  const severity = String(value || "LOW").toUpperCase();
  if (severity === "CRITICAL") return "bg-red-700 text-white";
  if (severity === "HIGH") return "bg-red-500 text-white";
  if (severity === "MEDIUM") return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function getTotalObjectsFromKpis(kpis: Kpis) {
  return (
    numberValue(kpis.laptops) +
    numberValue(kpis.phones) +
    numberValue(kpis.vehicles) +
    numberValue(kpis.objects)
  );
}

function getTotalObjectsFromCamera(camera: CameraItem) {
  return (
    numberValue(camera.laptops) +
    numberValue(camera.phones) +
    numberValue(camera.vehicles) +
    numberValue(camera.objects)
  );
}

function makeFallbackTrend(kpis: Kpis): TrendItem[] {
  const active = numberValue(kpis.active_people);
  const risk = numberValue(kpis.risk_score);
  const quality = numberValue(kpis.quality);
  const fps = numberValue(kpis.fps);

  return Array.from({ length: 8 }).map((_, index) => ({
    time: `${index + 1}m`,
    active: Math.max(0, Math.round(active * (0.65 + index * 0.05))),
    risk: Math.max(0, Math.round(risk * (0.7 + index * 0.04))),
    quality: Math.max(0, Math.round(quality * (0.85 + index * 0.02))),
    fps: Math.max(0, Number((fps * (0.75 + index * 0.035)).toFixed(1))),
  }));
}

export default function DashboardOverview() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("Connecting");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [error, setError] = useState("");

  const loadSummary = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      setIsRefreshing(true);
      setError("");

      const summary = await getSummary();

      setData(summary || {});
      setApiStatus("Live");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Dashboard summary error:", err);
      setApiStatus("Offline");
      setError("Backend API bilan ulanishda muammo yuz berdi.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function start() {
      if (!alive) return;
      await loadSummary(false);
    }

    start();

    const timer = window.setInterval(() => {
      if (!alive) return;
      loadSummary(true);
    }, 3000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [loadSummary]);

  const kpis = data?.kpis || DEFAULT_KPIS;
  const cameras = data?.cameras || data?.camera_health || [];
  const incidents = data?.incidents || [];
  const rawTrend = data?.trend || [];
  const trend = rawTrend.length > 0 ? rawTrend : makeFallbackTrend(kpis);

  const totalCameras = numberValue(kpis.cameras || cameras.length);
  const onlineCameras =
    numberValue(kpis.online_cameras) || cameras.filter((camera) => camera.running).length;
  const offlineCameras = Math.max(0, totalCameras - onlineCameras);

  const posture = useMemo(() => {
    if (Array.isArray(data?.posture) && data.posture.length > 0) {
      return data.posture;
    }

    return [
      { name: "Standing", value: numberValue(kpis.standing) },
      { name: "Sitting", value: numberValue(kpis.sitting) },
    ];
  }, [data?.posture, kpis.standing, kpis.sitting]);

  const objectBreakdown = useMemo(() => {
    if (Array.isArray(data?.objects) && data.objects.length > 0) {
      return data.objects;
    }

    return [
      { name: "Laptops", value: numberValue(kpis.laptops) },
      { name: "Phones", value: numberValue(kpis.phones) },
      { name: "Vehicles", value: numberValue(kpis.vehicles) },
      { name: "Other", value: numberValue(kpis.objects) },
    ].filter((item) => item.value > 0);
  }, [data?.objects, kpis.laptops, kpis.phones, kpis.vehicles, kpis.objects]);

  const avgCameraFps = useMemo(() => {
    if (!cameras.length) return numberValue(kpis.fps);

    return (
      cameras.reduce((sum, camera) => sum + numberValue(camera.fps), 0) /
      cameras.length
    );
  }, [cameras, kpis.fps]);

  const avgCameraQuality = useMemo(() => {
    if (!cameras.length) return numberValue(kpis.quality);

    return (
      cameras.reduce((sum, camera) => sum + numberValue(camera.quality), 0) /
      cameras.length
    );
  }, [cameras, kpis.quality]);

  const highRiskCameras = useMemo(() => {
    return cameras.filter((camera) => numberValue(camera.risk_score) >= 70).length;
  }, [cameras]);

  const cameraLeaderboard = useMemo(() => {
    return [...cameras]
      .sort((a, b) => numberValue(b.risk_score) - numberValue(a.risk_score))
      .slice(0, 7);
  }, [cameras]);

  const busiestCamera = useMemo(() => {
    if (!cameras.length) return null;

    return [...cameras].sort(
      (a, b) => numberValue(b.active_people) - numberValue(a.active_people)
    )[0];
  }, [cameras]);

  const highestRiskCamera = useMemo(() => {
    if (!cameras.length) return null;

    return [...cameras].sort(
      (a, b) => numberValue(b.risk_score) - numberValue(a.risk_score)
    )[0];
  }, [cameras]);

  const uptimeScore =
    totalCameras > 0 ? Math.round((onlineCameras / totalCameras) * 100) : 0;

  const safeQuality =
    avgCameraQuality > 0 ? avgCameraQuality : numberValue(kpis.quality);

  const safeFps = avgCameraFps > 0 ? avgCameraFps : numberValue(kpis.fps);

  const platformScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        uptimeScore * 0.35 +
          safeQuality * 0.3 +
          Math.min(100, safeFps * 4) * 0.2 +
          (100 - numberValue(kpis.risk_score)) * 0.15
      )
    )
  );

  const aiRecommendation = useMemo(() => {
    const risk = numberValue(kpis.risk_score);

    if (apiStatus === "Offline") {
      return {
        title: "Backend connection issue",
        text: "API offline holatda. Camera API, detector process va database yozuvlarini tekshirish kerak.",
        badge: "OFFLINE",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (risk >= 70 || highRiskCameras > 0) {
      return {
        title: "High risk monitoring required",
        text: "Risk baland. Operator live camera, incident log va alert response workflow ni darhol tekshirishi kerak.",
        badge: "HIGH RISK",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (offlineCameras > 0) {
      return {
        title: "Camera connectivity issue",
        text: "Ba’zi kameralar offline. RTSP URL, YouTube stream, local video path yoki backend detector processni tekshiring.",
        badge: "CHECK",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (avgCameraQuality < 50) {
      return {
        title: "Stream quality needs attention",
        text: "Camera quality past. Network, video source yoki detection interval optimizatsiya qilinishi kerak.",
        badge: "LOW QUALITY",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    return {
      title: "System stable",
      text: "Platform barqaror. Live monitoring, people tracking, camera health va BI analytics normal ishlayapti.",
      badge: "STABLE",
      badgeClass: "bg-green-500 text-white",
    };
  }, [apiStatus, kpis.risk_score, highRiskCameras, offlineCameras, avgCameraQuality]);

  const kpiCards = useMemo(
    () => [
      {
        title: "Active People",
        value: formatNumber(kpis.active_people),
        change: "Current live count",
        icon: Users,
        color: "text-cyan-500",
        bgColor: "bg-cyan-500/10",
        borderColor: "border-cyan-500/20",
      },
      {
        title: "Total Unique",
        value: formatNumber(kpis.total_unique),
        change: `Today +${formatNumber(kpis.new_unique_today)}`,
        icon: CheckCircle2,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/20",
      },
      {
        title: "Cameras Online",
        value: `${onlineCameras}/${totalCameras}`,
        change: `${offlineCameras} offline`,
        icon: Camera,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/20",
      },
      {
        title: "Risk Score",
        value: formatPercent(kpis.risk_score),
        change: riskLabel(numberValue(kpis.risk_score)),
        icon: ShieldAlert,
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/20",
      },
      {
        title: "Objects",
        value: formatNumber(getTotalObjectsFromKpis(kpis)),
        change: "Phones, laptops, vehicles",
        icon: Package,
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/20",
      },
      {
        title: "Incidents",
        value: formatNumber(kpis.incidents || incidents.length),
        change: "Recent event cases",
        icon: AlertTriangle,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/20",
      },
      {
        title: "Processing FPS",
        value: avgCameraFps.toFixed(1),
        change: "Detection speed",
        icon: Zap,
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/20",
      },
      {
        title: "Data Quality",
        value: formatPercent(avgCameraQuality),
        change: apiStatus,
        icon: Activity,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/20",
      },
    ],
    [
      kpis,
      incidents.length,
      apiStatus,
      onlineCameras,
      offlineCameras,
      totalCameras,
      avgCameraFps,
      avgCameraQuality,
    ]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              ASSBI Ultra Dashboard
            </h1>

            <Badge
              className={
                apiStatus === "Live"
                  ? "bg-green-500/15 text-green-500 border border-green-500/30"
                  : apiStatus === "Connecting"
                  ? "bg-yellow-500/15 text-yellow-500 border border-yellow-500/30"
                  : "bg-red-500/15 text-red-500 border border-red-500/30"
              }
            >
              {apiStatus === "Live" ? (
                <Wifi className="size-3.5 mr-1" />
              ) : (
                <WifiOff className="size-3.5 mr-1" />
              )}
              {apiStatus}
            </Badge>

            <Badge variant="outline">
              <Clock className="size-3.5 mr-1" />
              {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-3xl">
            Real-time surveillance analytics, camera health monitoring,
            AI-based risk scoring and BI reporting overview.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => loadSummary(false)}>
            <RefreshCw
              className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <p className="font-medium text-red-600">API Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <Card
              key={kpi.title}
              className={`border ${kpi.borderColor} ${kpi.bgColor}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {kpi.title}
                    </p>
                    <h3 className="text-3xl font-semibold text-foreground">
                      {isLoading ? "--" : kpi.value}
                    </h3>
                    <p className={`text-xs ${kpi.color} font-medium mt-1`}>
                      {kpi.change}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl ${kpi.bgColor} border ${kpi.borderColor}`}
                  >
                    <Icon className={`size-5 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 space-y-5">
          <Card className="border-border/50 overflow-hidden">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="size-5 text-cyan-500" />
                    People, Risk & Quality Trend
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Main trend line for people flow, operational risk and stream
                    quality.
                  </p>
                </div>

                <Badge className={riskBadge(numberValue(kpis.risk_score))}>
                  {riskLabel(numberValue(kpis.risk_score))}
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              <ResponsiveContainer width="100%" height={330}>
                <ComposedChart data={trend}>
                  <defs>
                    <linearGradient
                      id="activeGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#06b6d4"
                        stopOpacity={0.45}
                      />
                      <stop
                        offset="95%"
                        stopColor="#06b6d4"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="time"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="active"
                    stroke="#06b6d4"
                    fillOpacity={1}
                    fill="url(#activeGradient)"
                    name="Active People"
                  />
                  <Bar
                    dataKey="fps"
                    fill="#8b5cf6"
                    radius={[8, 8, 0, 0]}
                    name="FPS"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <ScoreGauge
              title="Platform Score"
              value={platformScore}
              icon={Cpu}
              hint="Combined uptime, quality, FPS and risk score"
            />

            <ScoreGauge
              title="Uptime Score"
              value={uptimeScore}
              icon={Wifi}
              hint={`${onlineCameras}/${totalCameras} cameras online`}
            />

            <ScoreGauge
              title="Risk Control"
              value={Math.max(0, 100 - numberValue(kpis.risk_score))}
              icon={ShieldAlert}
              hint="Higher value means lower operational risk"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="size-5 text-blue-500" />
                  Camera Health
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {cameras.length === 0 ? (
                  <EmptyChart message="Camera health data mavjud emas." />
                ) : (
                  cameras.slice(0, 6).map((camera) => {
                    const quality = numberValue(camera.quality);
                    const fps = numberValue(camera.fps);
                    const risk = numberValue(camera.risk_score);

                    return (
                      <div
                        key={camera.camera_id}
                        className="rounded-xl border border-border/50 bg-muted/20 p-4"
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">
                              {camera.site || camera.camera_id}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {camera.camera_id}
                            </p>
                          </div>

                          <Badge
                            className={
                              camera.running
                                ? "bg-green-500 text-white"
                                : "bg-red-500 text-white"
                            }
                          >
                            {camera.running ? "ONLINE" : "OFFLINE"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <MiniMetric
                            label="Quality"
                            value={`${quality.toFixed(0)}%`}
                          />
                          <MiniMetric label="FPS" value={fps.toFixed(1)} />
                          <MiniMetric
                            label="Risk"
                            value={`${risk.toFixed(0)}%`}
                          />
                        </div>

                        <div className="space-y-3">
                          <ProgressMetric label="Stream Quality" value={quality} />
                          <ProgressMetric label="Risk Level" value={risk} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="size-5 text-orange-500" />
                  Object Breakdown
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {objectBreakdown.length === 0 ? (
                  <EmptyChart message="Object data hali mavjud emas." />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {objectBreakdown.map((item, index) => (
                        <div
                          key={item.name}
                          className="rounded-xl border border-border/50 bg-muted/20 p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground">
                              {item.name}
                            </p>
                            <div
                              className="size-3 rounded-full"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[index % CHART_COLORS.length],
                              }}
                            />
                          </div>

                          <p className="text-3xl font-semibold mt-2">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={objectBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={75}
                          paddingAngle={3}
                        >
                          {objectBreakdown.map((_, index) => (
                            <Cell
                              key={index}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>

                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="size-5 text-blue-500" />
                  Live Camera Operations
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {cameras.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10">
                    Camera operations data mavjud emas.
                  </div>
                ) : (
                  cameras.slice(0, 6).map((camera) => {
                    const risk = numberValue(camera.risk_score);
                    const quality = numberValue(camera.quality);
                    const objects = getTotalObjectsFromCamera(camera);

                    return (
                      <div
                        key={camera.camera_id}
                        className="rounded-xl border border-border/50 bg-muted/20 p-4"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">
                              {camera.site || camera.camera_id}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {camera.camera_id}
                            </p>
                          </div>

                          <Badge
                            className={
                              camera.running
                                ? "bg-green-500 text-white"
                                : "bg-red-500 text-white"
                            }
                          >
                            {camera.running ? "ONLINE" : "OFFLINE"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center">
                          <MiniMetric
                            label="People"
                            value={camera.active_people || 0}
                          />
                          <MiniMetric label="Objects" value={objects} />
                          <MiniMetric
                            label="FPS"
                            value={numberValue(camera.fps).toFixed(1)}
                          />
                          <MiniMetric
                            label="Risk"
                            value={`${risk.toFixed(0)}%`}
                          />
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <ProgressMetric label="Risk" value={risk} />
                          <ProgressMetric label="Quality" value={quality} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-5 text-emerald-500" />
                  System Health Overview
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <HealthRow
                  label="Backend API"
                  value={apiStatus}
                  status={apiStatus === "Live" ? "good" : "bad"}
                />

                <HealthRow
                  label="Camera Connectivity"
                  value={`${onlineCameras}/${totalCameras} online`}
                  status={offlineCameras === 0 ? "good" : "warning"}
                />

                <HealthRow
                  label="Average Stream Quality"
                  value={formatPercent(avgCameraQuality)}
                  status={
                    avgCameraQuality >= 70
                      ? "good"
                      : avgCameraQuality >= 40
                      ? "warning"
                      : "bad"
                  }
                />

                <HealthRow
                  label="Average FPS"
                  value={avgCameraFps.toFixed(1)}
                  status={
                    avgCameraFps >= 15
                      ? "good"
                      : avgCameraFps >= 7
                      ? "warning"
                      : "bad"
                  }
                />

                <HealthRow
                  label="High Risk Cameras"
                  value={highRiskCameras}
                  status={highRiskCameras === 0 ? "good" : "bad"}
                />

                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 mt-4">
                  <div className="flex items-start gap-3">
                    <Brain className="size-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        Operational Recommendation
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {offlineCameras > 0
                          ? "Some cameras are offline. Check camera source, RTSP link or backend detector process."
                          : highRiskCameras > 0
                          ? "High risk detected. Review live camera and incident table immediately."
                          : avgCameraQuality < 50
                          ? "Stream quality is low. Check video source, network or detection interval."
                          : "All major platform signals look stable. Continue normal monitoring."}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-amber-500" />
                Recent Incidents
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Camera</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {incidents.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground py-8"
                        >
                          No incidents yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      incidents.slice(0, 8).map((item, index) => (
                        <TableRow key={item.id || index}>
                          <TableCell className="font-medium">
                            {item.incident_type || "Unknown"}
                          </TableCell>

                          <TableCell>
                            <Badge className={severityBadge(item.severity)}>
                              {item.severity || "LOW"}
                            </Badge>
                          </TableCell>

                          <TableCell className="font-mono">
                            {item.camera_id || "N/A"}
                          </TableCell>

                          <TableCell className="max-w-md truncate text-muted-foreground">
                            {item.message || "No message"}
                          </TableCell>

                          <TableCell>
                            <Badge variant="outline">
                              {item.status || "open"}
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

        <div className="xl:col-span-4 space-y-5 self-start">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="size-5 text-purple-500" />
                AI Executive Summary
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {aiRecommendation.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {aiRecommendation.text}
                    </p>
                  </div>

                  <Badge className={aiRecommendation.badgeClass}>
                    {aiRecommendation.badge}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MiniInsight
                  icon={Users}
                  label="Busiest"
                  value={busiestCamera?.site || busiestCamera?.camera_id || "N/A"}
                  hint={`${numberValue(
                    busiestCamera?.active_people
                  )} people`}
                />

                <MiniInsight
                  icon={ShieldAlert}
                  label="Highest Risk"
                  value={
                    highestRiskCamera?.site ||
                    highestRiskCamera?.camera_id ||
                    "N/A"
                  }
                  hint={`${numberValue(
                    highestRiskCamera?.risk_score
                  )}% risk`}
                />

                <MiniInsight
                  icon={Wifi}
                  label="Online"
                  value={onlineCameras}
                  hint="Active cameras"
                />

                <MiniInsight
                  icon={WifiOff}
                  label="Offline"
                  value={offlineCameras}
                  hint="Need attention"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-5 text-emerald-500" />
                Platform Control Score
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="relative h-[260px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="72%"
                    outerRadius="100%"
                    data={[
                      {
                        name: "Score",
                        value: platformScore,
                        fill:
                          platformScore >= 75
                            ? "#10b981"
                            : platformScore >= 45
                            ? "#eab308"
                            : "#ef4444",
                      },
                    ]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar dataKey="value" cornerRadius={18} background />
                  </RadialBarChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-5xl font-semibold">{platformScore}%</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Operational score
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <MiniMetric label="Uptime" value={`${uptimeScore}%`} />
                <MiniMetric label="Quality" value={formatPercent(avgCameraQuality)} />
                <MiniMetric label="FPS" value={avgCameraFps.toFixed(1)} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5 text-red-500" />
                Risk Leaderboard
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {cameraLeaderboard.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No camera data available
                </div>
              ) : (
                cameraLeaderboard.map((camera) => {
                  const risk = numberValue(camera.risk_score);

                  return (
                    <div
                      key={camera.camera_id}
                      className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {camera.site || camera.camera_id}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {camera.camera_id}
                          </p>
                        </div>

                        <Badge className={riskBadge(risk)}>
                          {risk.toFixed(0)}%
                        </Badge>
                      </div>

                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, risk)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>People: {camera.active_people || 0}</span>
                        <span>FPS: {numberValue(camera.fps).toFixed(1)}</span>
                        <span>Q: {formatPercent(camera.quality)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="size-5 text-cyan-500" />
                Posture Analytics
              </CardTitle>
            </CardHeader>

            <CardContent>
              {posture.every((item) => numberValue(item.value) === 0) ? (
                <EmptyChart message="Posture data hali mavjud emas." />
              ) : (
                <ResponsiveContainer width="100%" height={245}>
                  <PieChart>
                    <Pie
                      data={posture}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      label
                    >
                      {posture.map((_, index) => (
                        <Cell
                          key={index}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Laptop className="size-5 text-blue-500" />
                Device Awareness
              </CardTitle>
            </CardHeader>

            <CardContent className="grid grid-cols-2 gap-3">
              <DeviceCard
                icon={Laptop}
                label="Laptops"
                value={kpis.laptops || 0}
              />
              <DeviceCard
                icon={Smartphone}
                label="Phones"
                value={kpis.phones || 0}
              />
              <DeviceCard
                icon={Camera}
                label="Vehicles"
                value={kpis.vehicles || 0}
              />
              <DeviceCard
                icon={Package}
                label="Objects"
                value={kpis.objects || 0}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[250px] flex items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 text-muted-foreground text-center px-4">
      {message}
    </div>
  );
}

function MiniInsight({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <Icon className="size-5 text-blue-500 mb-2" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold truncate">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function DeviceCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <Icon className="size-5 text-blue-500 mb-2" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ScoreGauge({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  hint: string;
}) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <Card className="border-border/50">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <h3 className="text-3xl font-semibold">{safeValue}%</h3>
          </div>

          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Icon className="size-5 text-blue-500" />
          </div>
        </div>

        <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${safeValue}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground">{hint}</p>
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
    <div className="rounded-lg border border-border/50 bg-background/40 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-1">{value}</p>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{safeValue.toFixed(0)}%</span>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string | number;
  status: "good" | "warning" | "bad";
}) {
  const badgeClass =
    status === "good"
      ? "bg-green-500 text-white"
      : status === "warning"
      ? "bg-yellow-500 text-black"
      : "bg-red-500 text-white";

  const statusText =
    status === "good" ? "GOOD" : status === "warning" ? "CHECK" : "ISSUE";

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/20 p-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{value}</p>
      </div>

      <Badge className={badgeClass}>{statusText}</Badge>
    </div>
  );
}
