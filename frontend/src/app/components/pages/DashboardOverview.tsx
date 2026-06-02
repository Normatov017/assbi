import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LucideIcon } from "lucide-react";
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
import { useI18n } from "../../lib/i18n";

const CHART_COLORS = ["#10b981", "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444"];
const CHART_TEXT = "#e5e7eb";
const CHART_MUTED = "#94a3b8";

type ApiStatus = "Connecting" | "Live" | "Offline";
type TimeRange = "live" | "today" | "week";

type Kpis = {
  active_people?: number;
  new_unique_today?: number;
  today_visitors?: number;
  daily_visitors?: number;
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
  today_visitors: 0,
  daily_visitors: 0,
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

function riskLevelKey(value: number) {
  if (value >= 70) return "common.high";
  if (value >= 35) return "common.medium";
  return "common.low";
}

function riskBadge(value: number) {
  const level = riskLabel(value);
  if (level === "HIGH") return "bg-red-500 text-white";
  if (level === "MEDIUM") return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function qualityBadge(value: number) {
  if (value >= 80) return "bg-green-500 text-white";
  if (value >= 50) return "bg-yellow-500 text-black";
  return "bg-red-500 text-white";
}

function apiStatusLabel(status: ApiStatus, t: (key: string) => string) {
  if (status === "Live") return t("common.live");
  if (status === "Offline") return t("common.offline");
  return t("common.check");
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
  const { t } = useI18n();
  const [data, setData] = useState<SummaryData | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("Connecting");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [error, setError] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("live");

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
      setError(t("dashboard.backendError"));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    let alive = true;

    async function start() {
      if (!alive) return;
      await loadSummary(false);
    }

    start();

    const timer = setInterval(() => {
      if (!alive) return;
      loadSummary(true);
    }, 3000);

    return () => {
      alive = false;
      clearInterval(timer);
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
    if (Array.isArray(data?.posture) && data.posture.length > 0) return data.posture;
    return [
      { name: t("live.standing"), value: numberValue(kpis.standing) },
      { name: t("live.sitting"), value: numberValue(kpis.sitting) },
    ];
  }, [data?.posture, kpis.standing, kpis.sitting, t]);

  const objectBreakdown = useMemo(() => {
    if (Array.isArray(data?.objects) && data.objects.length > 0) return data.objects;
    return [
      { name: t("dashboard.laptops"), value: numberValue(kpis.laptops) },
      { name: t("dashboard.phones"), value: numberValue(kpis.phones) },
      { name: t("dashboard.vehicles"), value: numberValue(kpis.vehicles) },
      { name: t("dashboard.otherObjects"), value: numberValue(kpis.objects) },
    ].filter((item) => item.value > 0);
  }, [data?.objects, kpis.laptops, kpis.phones, kpis.vehicles, kpis.objects, t]);

  const avgCameraFps = useMemo(() => {
    if (!cameras.length) return numberValue(kpis.fps);
    return cameras.reduce((sum, camera) => sum + numberValue(camera.fps), 0) / cameras.length;
  }, [cameras, kpis.fps]);

  const avgCameraQuality = useMemo(() => {
    if (!cameras.length) return numberValue(kpis.quality);
    return cameras.reduce((sum, camera) => sum + numberValue(camera.quality), 0) / cameras.length;
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

  const uptimeScore = totalCameras > 0 ? Math.round((onlineCameras / totalCameras) * 100) : 0;
  const platformScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        uptimeScore * 0.35 + avgCameraQuality * 0.3 + Math.min(100, avgCameraFps * 4) * 0.2 + (100 - numberValue(kpis.risk_score)) * 0.15
      )
    )
  );

  const aiRecommendation = useMemo(() => {
    const risk = numberValue(kpis.risk_score);

    if (apiStatus === "Offline") {
      return {
        title: t("dashboard.backendIssueTitle"),
        text: t("dashboard.backendIssueText"),
        badge: t("common.offline"),
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (risk >= 70 || highRiskCameras > 0) {
      return {
        title: t("dashboard.highRiskTitle"),
        text: t("dashboard.highRiskText"),
        badge: t("common.highRisk"),
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (offlineCameras > 0) {
      return {
        title: t("dashboard.connectivityIssueTitle"),
        text: t("dashboard.connectivityIssueText"),
        badge: t("common.check"),
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (avgCameraQuality < 50) {
      return {
        title: t("dashboard.qualityIssueTitle"),
        text: t("dashboard.qualityIssueText"),
        badge: t("common.lowQuality"),
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    return {
      title: t("dashboard.systemStableTitle"),
      text: t("dashboard.systemStableText"),
      badge: t("common.stable"),
      badgeClass: "bg-green-500 text-white",
    };
  }, [apiStatus, kpis.risk_score, highRiskCameras, offlineCameras, avgCameraQuality, t]);

  const todayVisitors =
    numberValue(kpis.today_visitors) ||
    numberValue(kpis.daily_visitors) ||
    numberValue(kpis.new_unique_today);

  const kpiCards = useMemo(
    () => [
      {
        title: t("dashboard.livePeople"),
        value: formatNumber(kpis.active_people),
        change: t("dashboard.currentLive"),
        icon: Users,
        color: "text-cyan-500",
        bgColor: "bg-cyan-500/10",
        borderColor: "border-cyan-500/20",
      },
      {
        title: t("dashboard.todayVisitors"),
        value: formatNumber(todayVisitors),
        change: t("dashboard.enteredToday"),
        icon: TrendingUp,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/20",
      },
      {
        title: t("dashboard.totalUnique"),
        value: formatNumber(kpis.total_unique),
        change: t("dashboard.seenSinceStart"),
        icon: CheckCircle2,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/20",
      },
      {
        title: t("dashboard.camerasOnline"),
        value: `${onlineCameras}/${totalCameras}`,
        change: `${offlineCameras} ${t("common.offline")}`,
        icon: Camera,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/20",
      },
      {
        title: t("dashboard.riskScore"),
        value: formatPercent(kpis.risk_score),
        change: t(riskLevelKey(numberValue(kpis.risk_score))).toUpperCase(),
        icon: ShieldAlert,
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/20",
      },
      {
        title: t("dashboard.objects"),
        value: formatNumber(getTotalObjectsFromKpis(kpis)),
        change: t("dashboard.objectsIncluded"),
        icon: Package,
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/20",
      },
      {
        title: t("dashboard.incidents"),
        value: formatNumber(kpis.incidents || incidents.length),
        change: t("dashboard.recentEventCases"),
        icon: AlertTriangle,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/20",
      },
      {
        title: t("dashboard.processingFps"),
        value: avgCameraFps.toFixed(1),
        change: t("dashboard.detectionSpeed"),
        icon: Zap,
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/20",
      },
      {
        title: t("dashboard.dataQuality"),
        value: formatPercent(avgCameraQuality),
        change: apiStatusLabel(apiStatus, t),
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
      todayVisitors,
      t,
    ]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">{t("dashboard.title")}</h1>

            <Badge
              className={
                apiStatus === "Live"
                  ? "bg-green-500/15 text-green-500 border border-green-500/30"
                  : apiStatus === "Connecting"
                  ? "bg-yellow-500/15 text-yellow-500 border border-yellow-500/30"
                  : "bg-red-500/15 text-red-500 border border-red-500/30"
              }
            >
              {apiStatus === "Live" ? <Wifi className="size-3.5 mr-1" /> : <WifiOff className="size-3.5 mr-1" />}
              {apiStatusLabel(apiStatus, t)}
            </Badge>

            <Badge variant="outline">
              <Clock className="size-3.5 mr-1" />
              {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-3xl">
            {t("dashboard.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex rounded-xl border border-border/50 bg-muted/20 p-1">
            {(["live", "today", "week"] as TimeRange[]).map((item) => (
              <button
                key={item}
                onClick={() => setTimeRange(item)}
                className={`px-3 py-2 text-sm rounded-lg transition ${
                  timeRange === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item === "live" ? t("common.live") : item === "today" ? t("common.today") : t("common.week")}
              </button>
            ))}
          </div>

          <Button variant="outline" onClick={() => loadSummary(false)}>
            <RefreshCw className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <p className="font-medium text-red-600">{t("dashboard.apiError")}</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <Card key={kpi.title} className={`border ${kpi.borderColor} ${kpi.bgColor}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{kpi.title}</p>
                    <h3 className="text-3xl font-semibold text-foreground">{isLoading ? "--" : kpi.value}</h3>
                    <p className={`text-xs ${kpi.color} font-medium mt-1`}>{kpi.change}</p>
                  </div>

                  <div className={`p-3 rounded-xl ${kpi.bgColor} border ${kpi.borderColor}`}>
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
                    {t("dashboard.peopleTrend")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("dashboard.peopleTrendDesc")}
                  </p>
                </div>

                <Badge className={riskBadge(numberValue(kpis.risk_score))}>{riskLabel(numberValue(kpis.risk_score))}</Badge>
              </div>
            </CardHeader>

              <CardContent>
                <ResponsiveContainer width="100%" height={330}>
                <ComposedChart data={trend}>
                  <defs>
                    <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke={CHART_MUTED} tick={{ fill: CHART_TEXT, fontSize: 12 }} />
                  <YAxis stroke={CHART_MUTED} tick={{ fill: CHART_TEXT, fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="active" stroke="#06b6d4" fillOpacity={1} fill="url(#activeGradient)" name={t("dashboard.activePeople")} />
                  <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2.5} name={t("common.risk")} />
                  <Line type="monotone" dataKey="quality" stroke="#10b981" strokeWidth={2.5} name={t("common.quality")} />
                  <Bar dataKey="fps" fill="#8b5cf6" radius={[8, 8, 0, 0]} name="FPS" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <ScoreGauge title={t("dashboard.platformScore")} value={platformScore} icon={Cpu} hint={t("dashboard.combinedScore")} />
            <ScoreGauge title={t("dashboard.uptimeScore")} value={uptimeScore} icon={Wifi} hint={`${onlineCameras}/${totalCameras} ${t("dashboard.camerasOnlineHint")}`} />
            <ScoreGauge title={t("dashboard.riskControl")} value={Math.max(0, 100 - numberValue(kpis.risk_score))} icon={ShieldAlert} hint={t("dashboard.lowerRiskHint")} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="size-5 text-blue-500" />
                  {t("dashboard.cameraHealth")}
                </CardTitle>
              </CardHeader>

              <CardContent>
                {cameras.length === 0 ? (
                  <EmptyChart message={t("dashboard.noCameraHealth")} />
                ) : (
                  <ResponsiveContainer width="100%" height={270}>
                    <BarChart data={cameras.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="camera_id" stroke={CHART_MUTED} tick={{ fill: CHART_TEXT, fontSize: 11 }} interval={0} height={48} />
                      <YAxis stroke={CHART_MUTED} tick={{ fill: CHART_TEXT, fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                        }}
                      />
                      <Bar dataKey="quality" fill="#10b981" radius={[8, 8, 0, 0]} name={t("common.quality")} />
                      <Bar dataKey="fps" fill="#06b6d4" radius={[8, 8, 0, 0]} name="FPS" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="size-5 text-orange-500" />
                  {t("dashboard.objectBreakdown")}
                </CardTitle>
              </CardHeader>

              <CardContent>
                {objectBreakdown.length === 0 ? (
                  <EmptyChart message={t("dashboard.noObjectData")} />
                ) : (
                  <ResponsiveContainer width="100%" height={270}>
                    <PieChart>
                      <Pie data={objectBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} label={false}>
                        {objectBreakdown.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="size-5 text-blue-500" />
                  {t("dashboard.liveCameraOperations")}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {cameras.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10">{t("dashboard.noCameraOperations")}</div>
                ) : (
                  cameras.slice(0, 6).map((camera) => {
                    const risk = numberValue(camera.risk_score);
                    const quality = numberValue(camera.quality);
                    const objects = getTotalObjectsFromCamera(camera);

                    return (
                      <div key={camera.camera_id} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{camera.site || camera.camera_id}</p>
                            <p className="text-xs text-muted-foreground font-mono">{camera.camera_id}</p>
                          </div>

                          <Badge className={camera.running ? "bg-green-500 text-white" : "bg-red-500 text-white"}>
                            {camera.running ? t("common.online").toUpperCase() : t("common.offline").toUpperCase()}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center">
                          <MiniMetric label={t("common.people")} value={camera.active_people || 0} />
                          <MiniMetric label={t("common.objects")} value={objects} />
                          <MiniMetric label="FPS" value={numberValue(camera.fps).toFixed(1)} />
                          <MiniMetric label={t("common.risk")} value={`${risk.toFixed(0)}%`} />
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <ProgressMetric label={t("common.risk")} value={risk} />
                          <ProgressMetric label={t("common.quality")} value={quality} />
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
                  {t("dashboard.systemHealthOverview")}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <HealthRow label={t("dashboard.backendApi")} value={apiStatus === "Live" ? t("common.live") : t("common.offline")} status={apiStatus === "Live" ? "good" : "bad"} statusText={t} />
                <HealthRow label={t("dashboard.cameraConnectivity")} value={`${onlineCameras}/${totalCameras} ${t("common.online")}`} status={offlineCameras === 0 ? "good" : "warning"} statusText={t} />
                <HealthRow
                  label={t("dashboard.averageStreamQuality")}
                  value={formatPercent(avgCameraQuality)}
                  status={avgCameraQuality >= 70 ? "good" : avgCameraQuality >= 40 ? "warning" : "bad"}
                  statusText={t}
                />
                <HealthRow label={t("dashboard.averageFps")} value={avgCameraFps.toFixed(1)} status={avgCameraFps >= 15 ? "good" : avgCameraFps >= 7 ? "warning" : "bad"} statusText={t} />
                <HealthRow label={t("dashboard.highRiskCameras")} value={highRiskCameras} status={highRiskCameras === 0 ? "good" : "bad"} statusText={t} />

                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 mt-4">
                  <div className="flex items-start gap-3">
                    <Brain className="size-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-semibold">{t("dashboard.operationalRecommendation")}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {offlineCameras > 0
                          ? t("dashboard.offlineRecommendation")
                          : highRiskCameras > 0
                          ? t("dashboard.highRiskRecommendation")
                          : avgCameraQuality < 50
                          ? t("dashboard.lowQualityRecommendation")
                          : t("dashboard.stableRecommendation")}
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
                {t("dashboard.recentIncidents")}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.type")}</TableHead>
                      <TableHead>{t("common.severity")}</TableHead>
                      <TableHead>{t("common.camera")}</TableHead>
                      <TableHead>{t("common.message")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {incidents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          {t("dashboard.noIncidents")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      incidents.slice(0, 8).map((item, index) => (
                        <TableRow key={item.id || index}>
                          <TableCell className="font-medium">{item.incident_type || t("dashboard.unknown")}</TableCell>
                          <TableCell>
                            <Badge className={severityBadge(item.severity)}>{item.severity || "LOW"}</Badge>
                          </TableCell>
                          <TableCell className="font-mono">{item.camera_id || "N/A"}</TableCell>
                          <TableCell className="max-w-md truncate text-muted-foreground">{item.message || t("dashboard.noMessage")}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.status || "open"}</Badge>
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
                {t("dashboard.aiExecutiveSummary")}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{aiRecommendation.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{aiRecommendation.text}</p>
                  </div>

                  <Badge className={aiRecommendation.badgeClass}>{aiRecommendation.badge}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MiniInsight icon={Users} label={t("dashboard.busiest")} value={busiestCamera?.site || busiestCamera?.camera_id || "N/A"} hint={`${numberValue(busiestCamera?.active_people)} ${t("common.people").toLowerCase()}`} />
                <MiniInsight icon={ShieldAlert} label={t("dashboard.highestRisk")} value={highestRiskCamera?.site || highestRiskCamera?.camera_id || "N/A"} hint={`${numberValue(highestRiskCamera?.risk_score)}% ${t("common.risk").toLowerCase()}`} />
                <MiniInsight icon={Wifi} label={t("common.online")} value={onlineCameras} hint={t("common.activeCameras")} />
                <MiniInsight icon={WifiOff} label={t("common.offline")} value={offlineCameras} hint={t("common.needAttention")} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-5 text-emerald-500" />
                {t("dashboard.platformControlScore")}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="relative h-[270px]">
                <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="68%" outerRadius="100%" data={[{ name: "Score", value: platformScore, fill: "#10b981" }]} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" cornerRadius={18} background />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      color: CHART_TEXT,
                    }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-4xl font-semibold text-white">{platformScore}%</p>
                    <p className="text-sm text-white/75">{t("dashboard.operationalScore")}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5 text-red-500" />
                {t("dashboard.riskLeaderboard")}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {cameraLeaderboard.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">{t("dashboard.noCameraData")}</div>
              ) : (
                cameraLeaderboard.map((camera) => {
                  const risk = numberValue(camera.risk_score);
                  return (
                    <div key={camera.camera_id} className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{camera.site || camera.camera_id}</p>
                          <p className="text-xs text-muted-foreground font-mono">{camera.camera_id}</p>
                        </div>
                        <Badge className={riskBadge(risk)}>{risk.toFixed(0)}%</Badge>
                      </div>

                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, risk)}%` }} />
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("common.people")}: {camera.active_people || 0}</span>
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
                {t("dashboard.postureAnalytics")}
              </CardTitle>
            </CardHeader>

            <CardContent>
              {posture.every((item) => numberValue(item.value) === 0) ? (
                <EmptyChart message={t("dashboard.postureNoData")} />
              ) : (
                <ResponsiveContainer width="100%" height={245}>
                  <PieChart>
                    <Pie data={posture} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={false}>
                      {posture.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        color: CHART_TEXT,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {!posture.every((item) => numberValue(item.value) === 0) && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {posture.map((item, index) => (
                    <div key={item.name} className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="text-xs text-muted-foreground">{item.name}</span>
                      </div>
                      <p className="text-lg font-semibold text-white mt-1">{formatNumber(item.value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Laptop className="size-5 text-blue-500" />
                {t("dashboard.deviceAwareness")}
              </CardTitle>
            </CardHeader>

            <CardContent className="grid grid-cols-2 gap-3">
              <DeviceCard icon={Laptop} label={t("dashboard.laptops")} value={kpis.laptops || 0} />
              <DeviceCard icon={Smartphone} label={t("dashboard.phones")} value={kpis.phones || 0} />
              <DeviceCard icon={Camera} label={t("dashboard.vehicles")} value={kpis.vehicles || 0} />
              <DeviceCard icon={Package} label={t("common.objects")} value={kpis.objects || 0} />
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
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${safeValue}%` }} />
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
        <div className="h-full rounded-full bg-primary" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
  status,
  statusText,
}: {
  label: string;
  value: string | number;
  status: "good" | "warning" | "bad";
  statusText: (key: string) => string;
}) {
  const badgeClass =
    status === "good"
      ? "bg-green-500 text-white"
      : status === "warning"
      ? "bg-yellow-500 text-black"
      : "bg-red-500 text-white";

  const statusLabel =
    status === "good"
      ? statusText("common.good")
      : status === "warning"
      ? statusText("common.check")
      : statusText("common.issue");

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/20 p-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{value}</p>
      </div>

      <Badge className={badgeClass}>{statusLabel.toUpperCase()}</Badge>
    </div>
  );
}
