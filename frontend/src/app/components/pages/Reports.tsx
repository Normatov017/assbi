import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
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
import { Input } from "../ui/input";
import { Label } from "../ui/label";
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

type ReportType = "all" | "people" | "objects" | "incidents" | "forecast";

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
  created_at?: string;
  timestamp?: string;
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
    camera_id?: string;
    created_at?: string;
    timestamp?: string;
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

function getDateValue(item: { created_at?: string; timestamp?: string }) {
  return item.created_at || item.timestamp || "";
}

function isInsideDateRange(
  value: string,
  startDate: string,
  endDate: string
) {
  if (!startDate && !endDate) return true;
  if (!value) return true;

  const itemDate = new Date(value);
  if (Number.isNaN(itemDate.getTime())) return true;

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`);
    if (itemDate < start) return false;
  }

  if (endDate) {
    const end = new Date(`${endDate}T23:59:59`);
    if (itemDate > end) return false;
  }

  return true;
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

function buildTrend(
  summary: SummaryData | null,
  cameras: CameraData[],
  selectedCamera: string,
  startDate: string,
  endDate: string
) {
  const sourceTrend = Array.isArray(summary?.trend) ? summary.trend : [];

  const filteredTrend = sourceTrend.filter((item) => {
    const matchesCamera =
      selectedCamera === "all" || item.camera_id === selectedCamera;

    const matchesDate = isInsideDateRange(
      getDateValue(item),
      startDate,
      endDate
    );

    return matchesCamera && matchesDate;
  });

  if (filteredTrend.length > 0) {
    return filteredTrend.slice(-12).map((item) => ({
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
  const [selectedCamera, setSelectedCamera] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportType, setReportType] = useState<ReportType>("all");
  const [filterApplied, setFilterApplied] = useState(false);
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

  function buildReportQuery() {
    const params = new URLSearchParams();

    if (selectedCamera !== "all") {
      params.set("camera_id", selectedCamera);
    }

    if (startDate) {
      params.set("start_date", startDate);
    }

    if (endDate) {
      params.set("end_date", endDate);
    }

    if (reportType !== "all") {
      params.set("type", reportType);
    }

    const query = params.toString();
    return query ? `?${query}` : "";
  }

  function downloadFile(path: string) {
    window.open(`${API}${path}${buildReportQuery()}`, "_blank");
  }

  function applyCustomFilter() {
    setFilterApplied(true);
    loadData(false);
  }

  function resetCustomFilter() {
    setSelectedCamera("all");
    setStartDate("");
    setEndDate("");
    setReportType("all");
    setFilterApplied(false);
  }

  const filteredCameras = useMemo(() => {
    return cameras.filter((camera) => {
      const matchesCamera =
        selectedCamera === "all" || camera.camera_id === selectedCamera;

      const matchesDate = isInsideDateRange(
        getDateValue(camera),
        startDate,
        endDate
      );

      return matchesCamera && matchesDate;
    });
  }, [cameras, selectedCamera, startDate, endDate]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      const matchesCamera =
        selectedCamera === "all" || incident.camera_id === selectedCamera;

      const matchesDate = isInsideDateRange(
        getDateValue(incident),
        startDate,
        endDate
      );

      return matchesCamera && matchesDate;
    });
  }, [incidents, selectedCamera, startDate, endDate]);

  const kpis = summary?.kpis || {};
  const activeCameraList = filterApplied ? filteredCameras : cameras;
  const activeIncidentList = filterApplied ? filteredIncidents : incidents;

  const onlineCameras = activeCameraList.filter((camera) => camera.running).length;
  const offlineCameras = Math.max(0, activeCameraList.length - onlineCameras);

  const totalPeople =
    activeCameraList.reduce(
      (sum, camera) => sum + numberValue(camera.active_people),
      0
    ) || numberValue(kpis.active_people);

  const totalUnique =
    activeCameraList.reduce(
      (sum, camera) => sum + numberValue(camera.total_unique),
      0
    ) || numberValue(kpis.total_unique);

  const avgRisk =
    activeCameraList.length > 0
      ? activeCameraList.reduce(
          (sum, camera) => sum + numberValue(camera.risk_score),
          0
        ) / activeCameraList.length
      : numberValue(kpis.risk_score);

  const avgQuality =
    activeCameraList.length > 0
      ? activeCameraList.reduce(
          (sum, camera) => sum + numberValue(camera.quality),
          0
        ) / activeCameraList.length
      : numberValue(kpis.quality);

  const avgFps =
    activeCameraList.length > 0
      ? activeCameraList.reduce(
          (sum, camera) => sum + numberValue(camera.fps),
          0
        ) / activeCameraList.length
      : numberValue(kpis.fps);

  const highIncidents = activeIncidentList.filter((incident) =>
    ["HIGH", "CRITICAL"].includes(String(incident.severity || "").toUpperCase())
  ).length;

  const mediumIncidents = activeIncidentList.filter(
    (incident) => String(incident.severity || "").toUpperCase() === "MEDIUM"
  ).length;

  const lowIncidents = Math.max(
    0,
    activeIncidentList.length - highIncidents - mediumIncidents
  );

  const objectTotals = {
    laptops:
      activeCameraList.reduce(
        (sum, camera) => sum + numberValue(camera.laptops),
        0
      ) || numberValue(kpis.laptops),
    phones:
      activeCameraList.reduce(
        (sum, camera) => sum + numberValue(camera.phones),
        0
      ) || numberValue(kpis.phones),
    vehicles:
      activeCameraList.reduce(
        (sum, camera) => sum + numberValue(camera.vehicles),
        0
      ) || numberValue(kpis.vehicles),
    other:
      activeCameraList.reduce(
        (sum, camera) => sum + numberValue(camera.objects),
        0
      ) || numberValue(kpis.objects),
  };

  const totalObjects =
    objectTotals.laptops +
    objectTotals.phones +
    objectTotals.vehicles +
    objectTotals.other;

  const highestRiskCamera =
    activeCameraList.length > 0
      ? [...activeCameraList].sort(
          (a, b) => numberValue(b.risk_score) - numberValue(a.risk_score)
        )[0]
      : null;

  const busiestCamera =
    activeCameraList.length > 0
      ? [...activeCameraList].sort(
          (a, b) => numberValue(b.active_people) - numberValue(a.active_people)
        )[0]
      : null;

  const trendData = useMemo(
    () =>
      buildTrend(
        summary,
        activeCameraList,
        selectedCamera,
        startDate,
        endDate
      ),
    [summary, activeCameraList, selectedCamera, startDate, endDate]
  );

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

  const cameraPerformance = activeCameraList
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
      title: "Filtered BI Excel Report",
      description: "Custom camera, date range and report type filter bilan Excel export.",
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
      description: "Raw filtered analytics data for Power BI or external analysis.",
      endpoint: "/api/reports/analytics/csv",
      icon: Database,
      format: "CSV",
      tone: "blue",
    },
    {
      title: "Incidents Excel Report",
      description: "Camera and date filtered incident evidence export.",
      endpoint: "/api/reports/incidents/excel",
      icon: AlertTriangle,
      format: "XLSX",
      tone: "purple",
    },
    {
      title: "Incidents CSV Export",
      description: "Lightweight incident export for filtered review.",
      endpoint: "/api/reports/incidents/csv",
      icon: ShieldCheck,
      format: "CSV",
      tone: "orange",
    },
    {
      title: "Forecast Report",
      description: "Predictive analytics report with filtered planning context.",
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

    if (filterApplied) {
      return {
        title: "Custom report filter applied",
        text: "Hisobot ma’lumotlari tanlangan kamera, date range va report type bo‘yicha ko‘rsatilmoqda. Export tugmalari ham shu filter bilan ishlaydi.",
        badge: "FILTERED",
        badgeClass: "bg-blue-500 text-white",
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
  }, [error, filterApplied, highIncidents, avgRisk, offlineCameras]);

  const showPeopleSections = reportType === "all" || reportType === "people";
  const showObjectSections = reportType === "all" || reportType === "objects";
  const showIncidentSections =
    reportType === "all" || reportType === "incidents";
  const showForecastSections = reportType === "all" || reportType === "forecast";

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
              Custom Reports
            </Badge>

            <Badge variant="outline" className="text-foreground">
              <Clock className="size-3.5 mr-1" />
              Updated {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-4xl">
            Generate custom reports by camera, date range and report type.
            Export filtered analytics, incidents, objects and forecast data.
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
            Export Filtered Excel
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

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Filter className="size-5 text-blue-500" />
            Custom Report Filter
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Camera</Label>
              <select
                value={selectedCamera}
                onChange={(event) => setSelectedCamera(event.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-foreground outline-none"
              >
                <option value="all">All Cameras</option>
                {cameras.map((camera) => (
                  <option key={camera.camera_id} value={camera.camera_id}>
                    {camera.site || camera.camera_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Report Type</Label>
              <select
                value={reportType}
                onChange={(event) =>
                  setReportType(event.target.value as ReportType)
                }
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-foreground outline-none"
              >
                <option value="all">All Data</option>
                <option value="people">People Analytics</option>
                <option value="objects">Object Detection</option>
                <option value="incidents">Incidents</option>
                <option value="forecast">Forecast</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <Button className="flex-1" onClick={applyCustomFilter}>
                Apply
              </Button>

              <Button variant="outline" onClick={resetCustomFilter}>
                Reset
              </Button>
            </div>
          </div>

          {filterApplied && (
            <div className="mt-4 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4">
              <p className="text-sm font-semibold text-foreground">
                Active Filter
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Camera: {selectedCamera} • Start: {startDate || "Any"} • End:{" "}
                {endDate || "Any"} • Type: {reportType}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={Users}
          title="Filtered People"
          value={totalPeople}
          hint={`${totalUnique} unique people`}
          className="border-blue-500/30 bg-blue-500/10"
          iconClassName="text-blue-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={Camera}
          title="Filtered Cameras"
          value={`${onlineCameras}/${activeCameraList.length}`}
          hint={`${offlineCameras} offline`}
          className="border-green-500/30 bg-green-500/10"
          iconClassName="text-green-500"
          isLoading={isLoading}
        />

        <KpiCard
          icon={AlertTriangle}
          title="Filtered Incidents"
          value={activeIncidentList.length}
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
                  <div
                    className={`p-3 rounded-2xl border ${toneClasses(
                      report.tone
                    )}`}
                  >
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

      {showPeopleSections && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <TrendingUp className="size-5 text-blue-500" />
                Filtered People Trend
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
                Filtered Camera Performance
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
      )}

      {(showObjectSections || showIncidentSections) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {showObjectSections && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Database className="size-5 text-cyan-500" />
                  Filtered Object Evidence
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
                          <Cell
                            key={index}
                            fill={COLORS[index % COLORS.length]}
                          />
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
          )}

          {showIncidentSections && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <AlertTriangle className="size-5 text-orange-500" />
                  Filtered Incident Severity
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
                          <Cell
                            key={index}
                            fill={COLORS[index % COLORS.length]}
                          />
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
          )}
        </div>
      )}

      {showForecastSections && (
        <Card className="border-border/50 bg-purple-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <TrendingUp className="size-5 text-purple-500" />
              Forecast Report Context
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniMetric
              label="Selected Camera"
              value={selectedCamera === "all" ? "All Cameras" : selectedCamera}
            />
            <MiniMetric
              label="Date Range"
              value={`${startDate || "Any"} → ${endDate || "Any"}`}
            />
            <MiniMetric label="Report Type" value={reportType} />
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Camera className="size-5 text-blue-500" />
            Filtered Camera Report Table
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
                {activeCameraList.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      Camera report data topilmadi.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeCameraList.map((camera) => {
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

      {showIncidentSections && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Calendar className="size-5 text-red-500" />
              Filtered Incident Evidence
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
                  {activeIncidentList.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        Filter bo‘yicha incident evidence topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeIncidentList.slice(0, 10).map((incident, index) => (
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
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <ReportSummaryCard
          icon={CheckCircle2}
          title="Report Filter Status"
          value={filterApplied ? "Filtered" : "Default"}
          hint="Current report view mode"
          tone={filterApplied ? "blue" : "green"}
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
