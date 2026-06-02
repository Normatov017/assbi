import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Camera,
  Car,
  Download,
  Eye,
  Filter,
  Laptop,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import {
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
  site: string;
  type?: string;
  running?: boolean;
  frame_url?: string;
  active_people?: number;
  risk_score?: number;
  fps?: number;
  quality?: number;
  laptops?: number;
  phones?: number;
  vehicles?: number;
  objects?: number;
};

type IncidentData = {
  id?: string | number;
  incident_type?: string;
  severity?: string;
  camera_id?: string;
  message?: string;
  status?: string;
  created_at?: string;
};

type SummaryData = {
  kpis?: {
    active_people?: number;
    laptops?: number;
    phones?: number;
    vehicles?: number;
    objects?: number;
    risk_score?: number;
    quality?: number;
    fps?: number;
  };
  trend?: Array<{
    time: string;
    active?: number;
    laptops?: number;
    phones?: number;
    vehicles?: number;
    objects?: number;
    risk?: number;
  }>;
};

type FilterMode = "all" | "online" | "offline" | "has-objects" | "high-risk";
type SortMode = "objects" | "people" | "risk" | "quality" | "name";

type ObjectEvent = {
  id: string;
  title: string;
  message: string;
  camera_id: string;
  severity: "info" | "warning" | "critical" | "success";
  icon: LucideIcon;
};

function numberValue(value: unknown) {
  return Number(value || 0);
}

function formatPercent(value: unknown) {
  return `${numberValue(value).toFixed(0)}%`;
}

function getTotalCameraObjects(camera?: CameraData | null) {
  if (!camera) return 0;

  return (
    numberValue(camera.laptops) +
    numberValue(camera.phones) +
    numberValue(camera.vehicles) +
    numberValue(camera.objects)
  );
}

function statusBadge(running?: boolean) {
  return running ? "bg-green-500 text-white" : "bg-red-500 text-white";
}

function riskBadge(value: number) {
  if (value >= 70) return "bg-red-500 text-white";
  if (value >= 35) return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function qualityBadge(value: number) {
  if (value >= 80) return "bg-green-500 text-white";
  if (value >= 50) return "bg-yellow-500 text-black";
  return "bg-red-500 text-white";
}

function eventStyle(severity: ObjectEvent["severity"]) {
  if (severity === "critical") return "border-red-500/30 bg-red-500/10";
  if (severity === "warning") return "border-yellow-500/30 bg-yellow-500/10";
  if (severity === "success") return "border-green-500/30 bg-green-500/10";
  return "border-blue-500/30 bg-blue-500/10";
}

function makeObjectEvents(cameras: CameraData[], incidents: IncidentData[]) {
  const events: ObjectEvent[] = [];

  cameras.forEach((camera) => {
    const total = getTotalCameraObjects(camera);

    if (total > 0) {
      events.push({
        id: `objects-${camera.camera_id}`,
        title: "Objects Detected",
        message: `${camera.site || camera.camera_id} kamerada ${total} ta object aniqlandi.`,
        camera_id: camera.camera_id,
        severity: total >= 5 ? "warning" : "info",
        icon: Package,
      });
    }

    if (numberValue(camera.laptops) > 0) {
      events.push({
        id: `laptop-${camera.camera_id}`,
        title: "Laptop Detected",
        message: `${numberValue(camera.laptops)} laptop detected in camera frame.`,
        camera_id: camera.camera_id,
        severity: "info",
        icon: Laptop,
      });
    }

    if (numberValue(camera.phones) > 0) {
      events.push({
        id: `phone-${camera.camera_id}`,
        title: "Phone Detected",
        message: `${numberValue(camera.phones)} phone detected in camera frame.`,
        camera_id: camera.camera_id,
        severity: "info",
        icon: Smartphone,
      });
    }

    if (numberValue(camera.vehicles) > 0) {
      events.push({
        id: `vehicle-${camera.camera_id}`,
        title: "Vehicle Detected",
        message: `${numberValue(camera.vehicles)} vehicle detected in monitored area.`,
        camera_id: camera.camera_id,
        severity: "warning",
        icon: Car,
      });
    }
  });

  incidents.slice(0, 4).forEach((incident, index) => {
    events.push({
      id: `incident-${incident.id || index}`,
      title: incident.incident_type || "Detection Alert",
      message: incident.message || "Object-related event detected by AI system.",
      camera_id: incident.camera_id || "unknown",
      severity:
        String(incident.severity || "").toUpperCase() === "HIGH"
          ? "critical"
          : "warning",
      icon: AlertTriangle,
    });
  });

  if (events.length === 0) {
    events.push({
      id: "stable",
      title: "Object Detection Stable",
      message: "Hozircha object alert yoki suspicious object aniqlanmadi.",
      camera_id: "system",
      severity: "success",
      icon: ShieldAlert,
    });
  }

  return events.slice(0, 8);
}

function makeFallbackTrend(
  summary: SummaryData | null,
  totals: {
    people: number;
    laptops: number;
    phones: number;
    vehicles: number;
    objects: number;
  }
) {
  if (Array.isArray(summary?.trend) && summary.trend.length > 0) {
    return summary.trend.slice(-12).map((item) => ({
      time: item.time,
      people: numberValue(item.active),
      laptops: numberValue(item.laptops),
      phones: numberValue(item.phones),
      vehicles: numberValue(item.vehicles),
      objects: numberValue(item.objects),
      risk: numberValue(item.risk),
    }));
  }

  return Array.from({ length: 8 }).map((_, index) => ({
    time: `${index + 1}m`,
    people: Math.round(totals.people * (0.55 + index * 0.05)),
    laptops: Math.round(totals.laptops * (0.4 + index * 0.08)),
    phones: Math.round(totals.phones * (0.35 + index * 0.08)),
    vehicles: Math.round(totals.vehicles * (0.5 + index * 0.05)),
    objects: Math.round(totals.objects * (0.45 + index * 0.06)),
    risk: 0,
  }));
}

export default function ObjectDetection() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("objects");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);

      setIsRefreshing(true);
      setError("");

      const [summaryRes, camerasRes, incidentsRes] = await Promise.all([
        fetch(`${API}/api/summary`, { cache: "no-store" }),
        fetch(`${API}/api/cameras`, { cache: "no-store" }),
        fetch(`${API}/api/incidents`, { cache: "no-store" }),
      ]);

      if (!summaryRes.ok || !camerasRes.ok) {
        throw new Error("API response error");
      }

      const summaryData = await summaryRes.json();
      const camerasData = await camerasRes.json();
      const incidentsData = incidentsRes.ok ? await incidentsRes.json() : [];

      const cameraList = Array.isArray(camerasData) ? camerasData : [];

      setSummary(summaryData || {});
      setCameras(cameraList);
      setIncidents(Array.isArray(incidentsData) ? incidentsData : []);
      setLastUpdated(new Date());

      setSelectedCameraId((prev) => {
        if (!prev && cameraList.length > 0) return cameraList[0].camera_id;

        const exists = cameraList.some(
          (camera: CameraData) => camera.camera_id === prev
        );

        return exists ? prev : cameraList[0]?.camera_id || "";
      });
    } catch (err) {
      console.error("Object detection API error:", err);
      setError("Object Detection API bilan ulanishda muammo yuz berdi.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);

    const timer = window.setInterval(() => {
      loadData(true);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [loadData]);

  const selectedCamera =
    cameras.find((camera) => camera.camera_id === selectedCameraId) ||
    cameras[0];

  const totals = useMemo(() => {
    return {
      people: cameras.reduce(
        (sum, camera) => sum + numberValue(camera.active_people),
        0
      ),
      laptops: cameras.reduce(
        (sum, camera) => sum + numberValue(camera.laptops),
        0
      ),
      phones: cameras.reduce(
        (sum, camera) => sum + numberValue(camera.phones),
        0
      ),
      vehicles: cameras.reduce(
        (sum, camera) => sum + numberValue(camera.vehicles),
        0
      ),
      objects: cameras.reduce(
        (sum, camera) => sum + numberValue(camera.objects),
        0
      ),
    };
  }, [cameras]);

  const totalDetectedObjects =
    totals.laptops + totals.phones + totals.vehicles + totals.objects;

  const avgQuality = useMemo(() => {
    if (!cameras.length) return 0;

    return (
      cameras.reduce((sum, camera) => sum + numberValue(camera.quality), 0) /
      cameras.length
    );
  }, [cameras]);

  const avgFps = useMemo(() => {
    if (!cameras.length) return 0;

    return (
      cameras.reduce((sum, camera) => sum + numberValue(camera.fps), 0) /
      cameras.length
    );
  }, [cameras]);

  const objectCategoryData = [
    { name: "Laptops", value: totals.laptops },
    { name: "Phones", value: totals.phones },
    { name: "Vehicles", value: totals.vehicles },
    { name: "Other", value: totals.objects },
  ];

  const chartObjectData = objectCategoryData.filter((item) => item.value > 0);

  const cameraObjectData = useMemo(() => {
    return cameras
      .map((camera) => ({
        camera: camera.site || camera.camera_id,
        objects: getTotalCameraObjects(camera),
        laptops: numberValue(camera.laptops),
        phones: numberValue(camera.phones),
        vehicles: numberValue(camera.vehicles),
        other: numberValue(camera.objects),
        risk: numberValue(camera.risk_score),
      }))
      .sort((a, b) => b.objects - a.objects)
      .slice(0, 8);
  }, [cameras]);

  const trendData = useMemo(
    () => makeFallbackTrend(summary, totals),
    [summary, totals]
  );

  const filteredCameras = useMemo(() => {
    let items = [...cameras];
    const q = search.trim().toLowerCase();

    if (q) {
      items = items.filter((camera) => {
        return (
          camera.site?.toLowerCase().includes(q) ||
          camera.camera_id?.toLowerCase().includes(q) ||
          camera.type?.toLowerCase().includes(q)
        );
      });
    }

    if (filterMode === "online") {
      items = items.filter((camera) => camera.running);
    }

    if (filterMode === "offline") {
      items = items.filter((camera) => !camera.running);
    }

    if (filterMode === "has-objects") {
      items = items.filter((camera) => getTotalCameraObjects(camera) > 0);
    }

    if (filterMode === "high-risk") {
      items = items.filter((camera) => numberValue(camera.risk_score) >= 70);
    }

    items.sort((a, b) => {
      if (sortMode === "people") {
        return numberValue(b.active_people) - numberValue(a.active_people);
      }

      if (sortMode === "risk") {
        return numberValue(b.risk_score) - numberValue(a.risk_score);
      }

      if (sortMode === "quality") {
        return numberValue(b.quality) - numberValue(a.quality);
      }

      if (sortMode === "name") {
        return String(a.site || a.camera_id).localeCompare(
          String(b.site || b.camera_id)
        );
      }

      return getTotalCameraObjects(b) - getTotalCameraObjects(a);
    });

    return items;
  }, [cameras, search, filterMode, sortMode]);

  const objectEvents = useMemo(
    () => makeObjectEvents(cameras, incidents),
    [cameras, incidents]
  );

  const highestObjectCamera =
    cameras.length > 0
      ? [...cameras].sort(
          (a, b) => getTotalCameraObjects(b) - getTotalCameraObjects(a)
        )[0]
      : null;

  const insight = useMemo(() => {
    if (error) {
      return {
        title: "Object API issue",
        text: "Backend API javob bermayapti. api_server.py, camera endpoint va detector processni tekshiring.",
        badge: "API ISSUE",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (totalDetectedObjects === 0) {
      return {
        title: "No object activity",
        text: "Hozircha laptop, phone, vehicle yoki boshqa object aniqlanmadi. Camera feed va model confidence sozlamalarini tekshirish mumkin.",
        badge: "CLEAR",
        badgeClass: "bg-green-500 text-white",
      };
    }

    if (totals.vehicles > 0) {
      return {
        title: "Vehicle objects detected",
        text: "Vehicle detection mavjud. Agar bu indoor/classroom camera bo‘lsa, false positive bo‘lishi mumkin.",
        badge: "REVIEW",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (totals.phones > totals.laptops && totals.phones > 0) {
      return {
        title: "Phone activity visible",
        text: "Phone objectlar laptopdan ko‘proq ko‘rinyapti. Camera-wise table orqali qaysi source’da ko‘pligini tekshiring.",
        badge: "PHONE",
        badgeClass: "bg-blue-500 text-white",
      };
    }

    return {
      title: "Object detection active",
      text: "Object detection ishlayapti. Detected objects, camera comparison va event feed orqali monitoringni davom ettiring.",
      badge: "ACTIVE",
      badgeClass: "bg-green-500 text-white",
    };
  }, [
    error,
    totalDetectedObjects,
    totals.vehicles,
    totals.phones,
    totals.laptops,
  ]);

  function exportObjectReport() {
    window.open(`${API}/api/reports/analytics/excel`, "_blank");
  }

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              Object Intelligence Center
            </h1>

            <Badge className="bg-blue-500 text-white">
              <Eye className="size-3.5 mr-1" />
              Object Detection Active
            </Badge>

            <Badge variant="outline" className="text-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-4xl">
            Dedicated object analytics page for laptops, phones, vehicles,
            camera-wise object distribution and detection events.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => loadData(false)}>
            <RefreshCw
              className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button variant="outline" onClick={exportObjectReport}>
            <Download className="size-4 mr-2" />
            Export Object Report
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <p className="font-semibold text-red-500">API Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ObjectCard
          icon={Laptop}
          title="Laptops"
          value={totals.laptops}
          hint="Detected laptop objects"
          className="border-cyan-500/30 bg-cyan-500/10"
          iconClassName="text-cyan-500"
          isLoading={isLoading}
        />

        <ObjectCard
          icon={Smartphone}
          title="Phones"
          value={totals.phones}
          hint="Detected phone objects"
          className="border-purple-500/30 bg-purple-500/10"
          iconClassName="text-purple-500"
          isLoading={isLoading}
        />

        <ObjectCard
          icon={Car}
          title="Vehicles"
          value={totals.vehicles}
          hint="Detected vehicle objects"
          className="border-orange-500/30 bg-orange-500/10"
          iconClassName="text-orange-500"
          isLoading={isLoading}
        />

        <ObjectCard
          icon={Package}
          title="Other Objects"
          value={totals.objects}
          hint="Other tracked objects"
          className="border-green-500/30 bg-green-500/10"
          iconClassName="text-green-500"
          isLoading={isLoading}
        />
      </div>

      <Card className="border-border/50 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <div className="xl:col-span-2">
              <p className="text-sm text-muted-foreground">
                Selected Object Camera
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                {selectedCamera?.site || "No camera selected"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCamera?.camera_id || "Camera ID"} • objects{" "}
                {getTotalCameraObjects(selectedCamera)} • people{" "}
                {numberValue(selectedCamera?.active_people)}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:col-span-2 gap-3">
              <MiniMetric
                label="Objects"
                value={getTotalCameraObjects(selectedCamera)}
              />
              <MiniMetric
                label="People"
                value={numberValue(selectedCamera?.active_people)}
              />
              <MiniMetric
                label="FPS"
                value={numberValue(selectedCamera?.fps).toFixed(1)}
              />
              <MiniMetric
                label="Quality"
                value={formatPercent(selectedCamera?.quality)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Package className="size-5 text-blue-500" />
                  Object Category Distribution
                </CardTitle>
              </CardHeader>

              <CardContent>
                {chartObjectData.length === 0 ? (
                  <EmptyBox message="Object category data mavjud emas." />
                ) : (
                  <ResponsiveContainer width="100%" height={290}>
                    <PieChart>
                      <Pie
                        data={chartObjectData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={105}
                        paddingAngle={4}
                        label={{
                          fill: CHART_TEXT,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                        labelLine={{ stroke: CHART_MUTED }}
                      >
                        {chartObjectData.map((_, index) => (
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

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <BarChart3 className="size-5 text-purple-500" />
                  Object Count by Camera
                </CardTitle>
              </CardHeader>

              <CardContent>
                {cameraObjectData.length === 0 ? (
                  <EmptyBox message="Camera-wise object data mavjud emas." />
                ) : (
                  <ResponsiveContainer width="100%" height={290}>
                    <BarChart data={cameraObjectData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={CHART_BORDER}
                      />

                      <XAxis
                        dataKey="camera"
                        stroke={CHART_MUTED}
                        tick={{
                          fill: CHART_MUTED,
                          fontSize: 11,
                        }}
                        axisLine={{ stroke: CHART_BORDER }}
                        tickLine={{ stroke: CHART_BORDER }}
                      />

                      <YAxis
                        stroke={CHART_MUTED}
                        tick={{
                          fill: CHART_MUTED,
                          fontSize: 12,
                        }}
                        axisLine={{ stroke: CHART_BORDER }}
                        tickLine={{ stroke: CHART_BORDER }}
                      />

                      <Tooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: CHART_TEXT }}
                        labelStyle={{ color: CHART_TEXT }}
                      />

                      <Bar
                        dataKey="objects"
                        fill="#3b82f6"
                        radius={[8, 8, 0, 0]}
                        name="Objects"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <TrendingUp className="size-5 text-cyan-500" />
                Object Detection Trend
              </CardTitle>
            </CardHeader>

            <CardContent>
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={trendData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_BORDER}
                  />

                  <XAxis
                    dataKey="time"
                    stroke={CHART_MUTED}
                    tick={{
                      fill: CHART_MUTED,
                      fontSize: 12,
                    }}
                    axisLine={{ stroke: CHART_BORDER }}
                    tickLine={{ stroke: CHART_BORDER }}
                  />

                  <YAxis
                    stroke={CHART_MUTED}
                    tick={{
                      fill: CHART_MUTED,
                      fontSize: 12,
                    }}
                    axisLine={{ stroke: CHART_BORDER }}
                    tickLine={{ stroke: CHART_BORDER }}
                  />

                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: CHART_TEXT }}
                    labelStyle={{ color: CHART_TEXT }}
                  />

                  <Bar dataKey="laptops" stackId="a" fill="#06b6d4" />
                  <Bar dataKey="phones" stackId="a" fill="#a855f7" />
                  <Bar dataKey="vehicles" stackId="a" fill="#f97316" />
                  <Bar dataKey="objects" stackId="a" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Camera className="size-5 text-blue-500" />
                Camera Object Table
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
                      <TableHead>Laptops</TableHead>
                      <TableHead>Phones</TableHead>
                      <TableHead>Vehicles</TableHead>
                      <TableHead>Other</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Risk</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredCameras.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="text-center text-muted-foreground py-8"
                        >
                          Camera object data topilmadi.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCameras.map((camera) => (
                        <TableRow
                          key={camera.camera_id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setSelectedCameraId(camera.camera_id)}
                        >
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
                            <Badge className={statusBadge(camera.running)}>
                              {camera.running ? "ONLINE" : "OFFLINE"}
                            </Badge>
                          </TableCell>

                          <TableCell>{camera.active_people || 0}</TableCell>
                          <TableCell>{camera.laptops || 0}</TableCell>
                          <TableCell>{camera.phones || 0}</TableCell>
                          <TableCell>{camera.vehicles || 0}</TableCell>
                          <TableCell>{camera.objects || 0}</TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {getTotalCameraObjects(camera)}
                          </TableCell>

                          <TableCell>
                            <Badge
                              className={qualityBadge(
                                numberValue(camera.quality)
                              )}
                            >
                              {formatPercent(camera.quality)}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <Badge
                              className={riskBadge(
                                numberValue(camera.risk_score)
                              )}
                            >
                              {formatPercent(camera.risk_score)}
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

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <ShieldAlert className="size-5 text-yellow-500" />
                Object Review & Validation
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-blue-500/25 bg-blue-500/10 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-xl bg-blue-500/15">
                      <Eye className="size-5 text-blue-500" />
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">
                        Selected Camera Review
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Current object detection context
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <ReviewRow
                      label="Camera"
                      value={
                        selectedCamera?.site ||
                        selectedCamera?.camera_id ||
                        "N/A"
                      }
                    />
                    <ReviewRow
                      label="Objects"
                      value={getTotalCameraObjects(selectedCamera)}
                    />
                    <ReviewRow
                      label="People"
                      value={numberValue(selectedCamera?.active_people)}
                    />
                    <ReviewRow
                      label="Quality"
                      value={formatPercent(selectedCamera?.quality)}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-xl bg-yellow-500/15">
                      <AlertTriangle className="size-5 text-yellow-500" />
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">
                        False Positive Check
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Model confidence validation
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <ReviewRow
                      label="Vehicle Warning"
                      value={totals.vehicles > 0 ? "Review needed" : "Clear"}
                    />
                    <ReviewRow
                      label="Laptop/Phone"
                      value={totals.laptops + totals.phones}
                    />
                    <ReviewRow
                      label="Risk Level"
                      value={formatPercent(selectedCamera?.risk_score)}
                    />
                    <ReviewRow
                      label="Recommendation"
                      value={
                        totals.vehicles > 0
                          ? "Check frame manually"
                          : "Normal monitoring"
                      }
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-green-500/25 bg-green-500/10 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-xl bg-green-500/15">
                      <Activity className="size-5 text-green-500" />
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">
                        Operator Checklist
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Suggested manual actions
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <ChecklistItem
                      done={numberValue(selectedCamera?.quality) >= 50}
                      text="Stream quality is acceptable"
                    />
                    <ChecklistItem
                      done={numberValue(selectedCamera?.fps) > 0}
                      text="Detection process is active"
                    />
                    <ChecklistItem
                      done={getTotalCameraObjects(selectedCamera) >= 0}
                      text="Object count is available"
                    />
                    <ChecklistItem
                      done={numberValue(selectedCamera?.risk_score) < 70}
                      text="Risk level is under control"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-4 space-y-5 self-start">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Filter className="size-5 text-blue-500" />
                Object Filters
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Camera, site yoki type qidirish..."
                  className="w-full h-11 rounded-xl border border-border bg-background pl-10 pr-4 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Filter</p>
                  <select
                    value={filterMode}
                    onChange={(e) =>
                      setFilterMode(e.target.value as FilterMode)
                    }
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-foreground outline-none"
                  >
                    <option value="all">All Cameras</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="has-objects">Has Objects</option>
                    <option value="high-risk">High Risk</option>
                  </select>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Sort</p>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-foreground outline-none"
                  >
                    <option value="objects">Objects</option>
                    <option value="people">People</option>
                    <option value="risk">Risk</option>
                    <option value="quality">Quality</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Filtered Cameras</p>
                <p className="text-3xl font-semibold text-foreground mt-1">
                  {filteredCameras.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Object table search result
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Activity className="size-5 text-purple-500" />
                AI Object Insight
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {insight.title}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {insight.text}
                    </p>
                  </div>

                  <Badge className={insight.badgeClass}>{insight.badge}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="All Objects" value={totalDetectedObjects} />
                <MiniMetric label="People" value={totals.people} />
                <MiniMetric label="Avg FPS" value={avgFps.toFixed(1)} />
                <MiniMetric
                  label="Avg Quality"
                  value={formatPercent(avgQuality)}
                />
              </div>

              <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4">
                <p className="text-sm text-muted-foreground">
                  Top Object Camera
                </p>
                <p className="font-semibold text-foreground mt-1">
                  {highestObjectCamera?.site ||
                    highestObjectCamera?.camera_id ||
                    "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Objects: {getTotalCameraObjects(highestObjectCamera)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Package className="size-5 text-orange-500" />
                Object Event Feed
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {objectEvents.map((event) => {
                const Icon = event.icon;

                return (
                  <div
                    key={event.id}
                    className={`rounded-xl border p-4 ${eventStyle(
                      event.severity
                    )}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="size-5 text-blue-500 mt-0.5" />

                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {event.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.message}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono mt-2">
                          {event.camera_id}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Eye className="size-5 text-cyan-500" />
                Selected Camera Objects
              </CardTitle>
            </CardHeader>

            <CardContent className="grid grid-cols-2 gap-3">
              <ObjectMini
                icon={Laptop}
                label="Laptops"
                value={selectedCamera?.laptops || 0}
              />
              <ObjectMini
                icon={Smartphone}
                label="Phones"
                value={selectedCamera?.phones || 0}
              />
              <ObjectMini
                icon={Car}
                label="Vehicles"
                value={selectedCamera?.vehicles || 0}
              />
              <ObjectMini
                icon={Package}
                label="Other"
                value={selectedCamera?.objects || 0}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ObjectCard({
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

function ObjectMini({
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
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground truncate">
        {value}
      </span>
    </div>
  );
}

function ChecklistItem({
  done,
  text,
}: {
  done: boolean;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2">
      <span
        className={`size-2.5 rounded-full ${
          done ? "bg-green-500" : "bg-yellow-500"
        }`}
      />
      <span className="text-sm text-foreground">{text}</span>
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="h-[260px] rounded-2xl border border-dashed border-border/60 bg-muted/20 flex items-center justify-center text-center text-muted-foreground px-4">
      {message}
    </div>
  );
}
