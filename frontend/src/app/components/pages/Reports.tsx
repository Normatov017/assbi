import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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

const COLORS = ["#3b82f6", "#06b6d4", "#a855f7", "#f97316", "#22c55e"];

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
  type?: string;
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
  standing?: number;
  sitting?: number;
};

type IncidentData = {
  id?: string | number;
  incident_type?: string;
  title?: string;
  message?: string;
  description?: string;
  severity?: string;
  status?: string;
  camera_id?: string;
  created_at?: string;
  timestamp?: string;
};

type SummaryData = {
  kpis?: {
    active_people?: number;
    total_unique?: number;
    risk_score?: number;
    quality?: number;
    fps?: number;
    incidents?: number;
    laptops?: number;
    phones?: number;
    vehicles?: number;
    objects?: number;
  };
  trend?: Array<{
    time: string;
    active?: number;
    people?: number;
    risk?: number;
    quality?: number;
    laptops?: number;
    phones?: number;
    vehicles?: number;
    objects?: number;
  }>;
};

type ReportCardData = {
  title: string;
  description: string;
  endpoint: string;
  icon: LucideIcon;
  format: string;
  tone: "blue" | "red" | "green" | "purple" | "orange";
};

function numberValue(value: unknown) {
  return Number(value || 0);
}

function formatPercent(value: unknown) {
  return `${numberValue(value).toFixed(0)}%`;
}

function downloadFile(path: string) {
  window.open(`${API}${path}`, "_blank");
}

function riskBadge(value: number) {
  if (value >= 70) return "bg-red-500 text-white";
  if (value >= 35) return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function severityBadge(severity?: string) {
  const level = String(severity || "LOW").toUpperCase();

  if (level === "HIGH" || level === "CRITICAL") return "bg-red-500 text-white";
  if (level === "MEDIUM") return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function toneClasses(tone: ReportCardData["tone"]) {
  if (tone === "red") return "border-red-500/25 bg-red-500/10 text-red-500";
  if (tone === "green")
    return "border-green-500/25 bg-green-500/10 text-green-500";
  if (tone === "purple")
    return "border-purple-500/25 bg-purple-500/10 text-purple-500";
  if (tone === "orange")
    return "border-orange-500/25 bg-orange-500/10 text-orange-500";

  return "border-blue-500/25 bg-blue-500/10 text-blue-500";
}

function buildTrend(summary: SummaryData | null, cameras: CameraData[]) {
  if (Array.isArray(summary?.trend) && summary.trend.length > 0) {
    return summary.trend.slice(-12).map((item) => ({
      time: item.time,
      people: numberValue(item.active || item.people),
      risk: numberValue(item.risk),
      quality: numberValue(item.quality),
      objects:
        numberValue(item.laptops) +
        numberValue(item.phones) +
        numberValue(item.vehicles) +
        numberValue(item.objects),
    }));
  }

  const people = cameras.reduce(
    (sum, camera) => sum + numberValue(camera.active_people),
    0
  );

  const avgRisk =
    cameras.length > 0
      ? cameras.reduce((sum, camera) => sum + numberValue(camera.risk_score), 0) /
        cameras.length
      : 0;

  return Array.from({ length: 8 }).map((_, index) => ({
    time: `${index + 1}m`,
    people: Math.round(people * (0.6 + index * 0.06)),
    risk: Math.round(avgRisk * (0.7 + index * 0.04)),
    quality: 75,
    objects: Math.round(index * 1.2),
  }));
}

export default function Reports() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);

      setIsRefreshing(true);
      setError("");

      const [summaryResult, camerasResult, incidentsResult] =
        await Promise.allSettled([
          fetch(`${API}/api/summary`, { cache: "no-store" }),
          fetch(`${API}/api/cameras`, { cache: "no-store" }),
          fetch(`${API}/api/incidents`, { cache: "no-store" }),
        ]);

      let summaryData: SummaryData | null = null;
      let cameraData: CameraData[] = [];
      let incidentData: IncidentData[] = [];

      if (summaryResult.status === "fulfilled" && summaryResult.value.ok) {
        summaryData = await summaryResult.value.json();
      }

      if (camerasResult.status === "fulfilled" && camerasResult.value.ok) {
        const json = await camerasResult.value.json();
        cameraData = Array.isArray(json) ? json : [];
      }

      if (incidentsResult.status === "fulfilled" && incidentsResult.value.ok) {
        const json = await incidentsResult.value.json();
        incidentData = Array.isArray(json) ? json : [];
      }

      if (!summaryData && cameraData.length === 0 && incidentData.length === 0) {
        throw new Error("Reports data not available");
      }

      setSummary(summaryData || {});
      setCameras(cameraData);
      setIncidents(incidentData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Reports API error:", err);
      setError("Reports API bilan ulanishda muammo yuz berdi.");
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

  const kpis = summary?.kpis || {};

  const onlineCameras = cameras.filter((camera) => camera.running).length;
  const offlineCameras = Math.max(0, cameras.length - onlineCameras);

  const totalPeople =
    cameras.reduce((sum, camera) => sum + numberValue(camera.active_people), 0) ||
    numberValue(kpis.active_people);

  const totalUnique =
    cameras.reduce((sum, camera) => sum + numberValue(camera.total_unique), 0) ||
    numberValue(kpis.total_unique);

  const avgRisk =
    cameras.length > 0
      ? cameras.reduce((sum, camera) => sum + numberValue(camera.risk_score), 0) /
        cameras.length
      : numberValue(kpis.risk_score);

  const avgQuality =
    cameras.length > 0
      ? cameras.reduce((sum, camera) => sum + numberValue(camera.quality), 0) /
        cameras.length
      : numberValue(kpis.quality);

  const avgFps =
    cameras.length > 0
      ? cameras.reduce((sum, camera) => sum + numberValue(camera.fps), 0) /
        cameras.length
      : numberValue(kpis.fps);

  const highIncidents = incidents.filter((incident) =>
    ["HIGH", "CRITICAL"].includes(String(incident.severity || "").toUpperCase())
  ).length;

  const mediumIncidents = incidents.filter(
    (incident) => String(incident.severity || "").toUpperCase() === "MEDIUM"
  ).length;

  const lowIncidents = Math.max(
    0,
    incidents.length - highIncidents - mediumIncidents
  );

  const objectTotals = {
    laptops:
      cameras.reduce((sum, camera) => sum + numberValue(camera.laptops), 0) ||
      numberValue(kpis.laptops),
    phones:
      cameras.reduce((sum, camera) => sum + numberValue(camera.phones), 0) ||
      numberValue(kpis.phones),
    vehicles:
      cameras.reduce((sum, camera) => sum + numberValue(camera.vehicles), 0) ||
      numberValue(kpis.vehicles),
    other:
      cameras.reduce((sum, camera) => sum + numberValue(camera.objects), 0) ||
      numberValue(kpis.objects),
  };

  const totalObjects =
    objectTotals.laptops +
    objectTotals.phones +
    objectTotals.vehicles +
    objectTotals.other;

  const highestRiskCamera =
    cameras.length > 0
      ? [...cameras].sort(
          (a, b) => numberValue(b.risk_score) - numberValue(a.risk_score)
        )[0]
      : null;

  const busiestCamera =
    cameras.length > 0
      ? [...cameras].sort(
          (a, b) => numberValue(b.active_people) - numberValue(a.active_people)
        )[0]
      : null;

  const trendData = useMemo(() => buildTrend(summary, cameras), [summary, cameras]);

  const objectData = [
    { name: "Laptops", value: objectTotals.laptops },
    { name: "Phones", value: objectTotals.phones },
    { name: "Vehicles", value: objectTotals.vehicles },
    { name: "Other", value: objectTotals.other },
  ].filter((item) => item.value > 0);

  const severityData = [
    { name: "High", value: highIncidents },
    { name: "Medium", value: mediumIncidents },
    { name: "Low", value: lowIncidents },
  ].filter((item) => item.value > 0);

  const cameraPerformance = cameras
    .map((camera) => ({
      name: camera.site || camera.camera_id,
      people: numberValue(camera.active_people),
      risk: numberValue(camera.risk_score),
      quality: numberValue(camera.quality),
      fps: numberValue(camera.fps),
    }))
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 8);

  const reportCards: ReportCardData[] = [
    {
      title: "Full BI Excel Report",
      description: "Analytics, camera performance and KPI evidence in spreadsheet format.",
      endpoint: "/api/reports/analytics/excel",
      icon: FileSpreadsheet,
      format: "XLSX",
      tone: "green",
    },
    {
      title: "Executive PDF Report",
      description: "Management-ready summary with incidents and AI recommendation.",
      endpoint: "/api/reports/executive/pdf",
      icon: FileText,
      format: "PDF",
      tone: "red",
    },
    {
      title: "Analytics CSV Export",
      description: "Raw crowd analytics data for Power BI or external analysis.",
      endpoint: "/api/reports/analytics/csv",
      icon: Database,
      format: "CSV",
      tone: "blue",
    },
    {
      title: "Incidents Excel Report",
      description: "Security incidents, severity levels and camera alert history.",
      endpoint: "/api/reports/incidents/excel",
      icon: AlertTriangle,
      format: "XLSX",
      tone: "purple",
    },
    {
      title: "Incidents CSV Export",
      description: "Lightweight anomaly and incident export for quick review.",
      endpoint: "/api/reports/incidents/csv",
      icon: ShieldCheck,
      format: "CSV",
      tone: "orange",
    },
    {
      title: "Forecast Report",
      description: "Predictive analytics report with future crowd and risk planning.",
      endpoint: "/api/reports/forecast/excel",
      icon: TrendingUp,
      format: "AI",
      tone: "blue",
    },
  ];

  const insight = useMemo(() => {
    if (error) {
      return {
        title: "Report data warning",
        text: "API endpointlaridan biri javob bermayapti. Export tugmalari ishlashi uchun backend report route’larini tekshirish kerak.",
        badge: "API WARNING",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (highIncidents > 0 || avgRisk >= 70) {
      return {
        title: "Executive attention required",
        text: "Hisobotlarda high risk yoki high severity incident mavjud. Executive PDF va Incidents Excel export qilish tavsiya qilinadi.",
        badge: "HIGH RISK",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (offlineCameras > 0) {
      return {
        title: "Camera coverage issue",
        text: `${offlineCameras} ta kamera offline. Report sifati uchun camera source va detector processni tekshirish kerak.`,
        badge: "COVERAGE",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    return {
      title: "Reporting data is ready",
      text: "Analytics, camera performance, incidents and forecast data export uchun tayyor. BI evidence sifatida ishlatish mumkin.",
      badge: "READY",
      badgeClass: "bg-green-500 text-white",
    };
  }, [error, highIncidents, avgRisk, offlineCameras]);

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              BI Report Center
            </h1>

            <Badge className="bg-blue-500 text-white">
              <FileText className="size-3.5 mr-1" />
              Executive Exports
            </Badge>

            <Badge variant="outline" className="text-foreground">
              <Clock className="size-3.5 mr-1" />
              Updated {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-4xl">
            Generate management reports, analytics exports, incident evidence,
            camera performance summaries and forecast documents.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => loadData(false)}>
            <RefreshCw
              className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button onClick={() => downloadFile("/api/reports/analytics/excel")}>
            <Download className="size-4 mr-2" />
            Generate Full BI Report
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-yellow-500/30 bg-yellow-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-yellow-500" />
            <div>
              <p className="font-semibold text-yellow-500">Reports Warning</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={Users}
          title="Active People"
          value={totalPeople}
          hint={`${totalUnique} unique people`}
          className="border-blue-500/30 bg-blue-500/10"
          iconClassName="text-blue-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={Camera}
          title="Camera Coverage"
          value={`${onlineCameras}/${cameras.length}`}
          hint={`${offlineCameras} offline`}
          className="border-green-500/30 bg-green-500/10"
          iconClassName="text-green-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={AlertTriangle}
          title="Incidents"
          value={incidents.length}
          hint={`${highIncidents} high severity`}
          className="border-red-500/30 bg-red-500/10"
          iconClassName="text-red-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={Zap}
          title="Avg FPS"
          value={avgFps.toFixed(1)}
          hint="Processing speed"
          className="border-yellow-500/30 bg-yellow-500/10"
          iconClassName="text-yellow-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={ShieldCheck}
          title="Avg Risk"
          value={formatPercent(avgRisk)}
          hint={`${formatPercent(avgQuality)} quality`}
          className="border-purple-500/30 bg-purple-500/10"
          iconClassName="text-purple-500"
          isLoading={isLoading}
        />
      </div>

      <Card className="border-border/50 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-center">
            <div className="xl:col-span-2">
              <p className="text-sm text-muted-foreground">
                AI Executive Summary
              </p>

              <h2 className="text-2xl font-semibold text-foreground">
                {insight.title}
              </h2>

              <p className="text-sm text-muted-foreground mt-1">
                {insight.text}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:col-span-2 gap-3">
              <MiniMetric label="Reports" value={reportCards.length} />
              <MiniMetric label="Objects" value={totalObjects} />
              <MiniMetric label="High Alerts" value={highIncidents} />
              <MiniMetric label="Status" value={insight.badge} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {reportCards.map((report) => {
          const Icon = report.icon;

          return (
            <Card
              key={report.title}
              className="border-border/50 hover:border-blue-500/40 transition-all"
            >
              <CardContent className="p-5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className={`p-3 rounded-2xl border ${toneClasses(report.tone)}`}>
                    <Icon className="size-6" />
                  </div>

                  <Badge variant="outline" className="text-foreground">
                    {report.format}
                  </Badge>
                </div>

                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {report.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    {report.description}
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => downloadFile(report.endpoint)}
                >
                  <Download className="size-4 mr-2" />
                  Download
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <TrendingUp className="size-5 text-blue-500" />
              Report Trend Overview
            </CardTitle>
          </CardHeader>

          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="reportPeople" x1="0" y1="0" x2="0" y2="1">
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
                  dataKey="people"
                  stroke="#3b82f6"
                  fill="url(#reportPeople)"
                  strokeWidth={3}
                  name="People"
                />

                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="#ef4444"
                  fill="transparent"
                  strokeWidth={2}
                  name="Risk"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <BarChart3 className="size-5 text-purple-500" />
              Camera Performance Report
            </CardTitle>
          </CardHeader>

          <CardContent>
            {cameraPerformance.length === 0 ? (
              <EmptyBox message="Camera performance data mavjud emas." />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={cameraPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />

                  <XAxis
                    dataKey="name"
                    stroke={CHART_MUTED}
                    tick={{ fill: CHART_MUTED, fontSize: 11 }}
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

                  <Bar dataKey="people" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="risk" fill="#ef4444" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Database className="size-5 text-cyan-500" />
              Object Evidence Summary
            </CardTitle>
          </CardHeader>

          <CardContent>
            {objectData.length === 0 ? (
              <EmptyBox message="Object report data mavjud emas." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={objectData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    label={{
                      fill: CHART_TEXT,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                    labelLine={{ stroke: CHART_MUTED }}
                  >
                    {objectData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>

                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: CHART_TEXT }}
                    labelStyle={{ color: CHART_TEXT }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="size-5 text-orange-500" />
              Incident Severity Summary
            </CardTitle>
          </CardHeader>

          <CardContent>
            {severityData.length === 0 ? (
              <EmptyBox message="Incident severity data mavjud emas." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    label={{
                      fill: CHART_TEXT,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                    labelLine={{ stroke: CHART_MUTED }}
                  >
                    {severityData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>

                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: CHART_TEXT }}
                    labelStyle={{ color: CHART_TEXT }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Camera className="size-5 text-blue-500" />
            Camera Report Table
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Camera</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>People</TableHead>
                  <TableHead>Objects</TableHead>
                  <TableHead>FPS</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Report Note</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {cameras.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      Camera report data topilmadi.
                    </TableCell>
                  </TableRow>
                ) : (
                  cameras.map((camera) => {
                    const objects =
                      numberValue(camera.laptops) +
                      numberValue(camera.phones) +
                      numberValue(camera.vehicles) +
                      numberValue(camera.objects);

                    return (
                      <TableRow key={camera.camera_id}>
                        <TableCell>
                          <div>
                            <p className="font-semibold text-foreground">
                              {camera.site || camera.camera_id}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {camera.camera_id}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            className={
                              camera.running
                                ? "bg-green-500 text-white"
                                : "bg-red-500 text-white"
                            }
                          >
                            {camera.running ? "ONLINE" : "OFFLINE"}
                          </Badge>
                        </TableCell>

                        <TableCell>{camera.active_people || 0}</TableCell>
                        <TableCell>{objects}</TableCell>
                        <TableCell>{numberValue(camera.fps).toFixed(1)}</TableCell>
                        <TableCell>{formatPercent(camera.quality)}</TableCell>

                        <TableCell>
                          <Badge className={riskBadge(numberValue(camera.risk_score))}>
                            {formatPercent(camera.risk_score)}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {numberValue(camera.risk_score) >= 70
                            ? "Needs executive review"
                            : camera.running
                            ? "Normal monitoring"
                            : "Camera source check needed"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Calendar className="size-5 text-red-500" />
            Recent Incident Evidence
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Camera</TableHead>
                  <TableHead>Incident</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {incidents.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      Recent incident evidence mavjud emas.
                    </TableCell>
                  </TableRow>
                ) : (
                  incidents.slice(0, 10).map((incident, index) => (
                    <TableRow key={incident.id || index}>
                      <TableCell className="font-mono text-xs">
                        {incident.created_at || incident.timestamp || "-"}
                      </TableCell>

                      <TableCell>{incident.camera_id || "Unknown"}</TableCell>

                      <TableCell className="font-medium text-foreground">
                        {incident.incident_type || incident.title || "Incident"}
                      </TableCell>

                      <TableCell>
                        <Badge className={severityBadge(incident.severity)}>
                          {incident.severity || "LOW"}
                        </Badge>
                      </TableCell>

                      <TableCell>{incident.status || "open"}</TableCell>

                      <TableCell className="text-muted-foreground max-w-[360px] truncate">
                        {incident.message ||
                          incident.description ||
                          "AI incident event captured for report evidence."}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <ReportSummaryCard
          icon={CheckCircle2}
          title="Report Readiness"
          value={error ? "Warning" : "Ready"}
          hint="Export data availability"
          tone={error ? "yellow" : "green"}
        />

        <ReportSummaryCard
          icon={Camera}
          title="Busiest Camera"
          value={busiestCamera?.site || busiestCamera?.camera_id || "N/A"}
          hint={`${numberValue(busiestCamera?.active_people)} active people`}
          tone="blue"
        />

        <ReportSummaryCard
          icon={AlertTriangle}
          title="Highest Risk Camera"
          value={highestRiskCamera?.site || highestRiskCamera?.camera_id || "N/A"}
          hint={`${formatPercent(highestRiskCamera?.risk_score)} risk score`}
          tone={numberValue(highestRiskCamera?.risk_score) >= 70 ? "red" : "green"}
        />
      </div>
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
      <p className="text-xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

function ReportSummaryCard({
  icon: Icon,
  title,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "yellow" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-500/25 bg-red-500/10"
      : tone === "yellow"
      ? "border-yellow-500/25 bg-yellow-500/10"
      : tone === "green"
      ? "border-green-500/25 bg-green-500/10"
      : "border-blue-500/25 bg-blue-500/10";

  const iconClass =
    tone === "red"
      ? "text-red-500"
      : tone === "yellow"
      ? "text-yellow-500"
      : tone === "green"
      ? "text-green-500"
      : "text-blue-500";

  return (
    <Card className={`border ${toneClass}`}>
      <CardContent className="p-5">
        <Icon className={`size-6 mb-3 ${iconClass}`} />
        <p className="text-sm text-muted-foreground">{title}</p>
        <h2 className="text-xl font-semibold text-foreground truncate mt-1">
          {value}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="h-[260px] rounded-2xl border border-dashed border-border/60 bg-muted/20 flex items-center justify-center text-center text-muted-foreground px-4">
      {message}
    </div>
  );
}
