import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  BarChart3,
  Download,
  Flame,
  TrendingUp,
  Users,
  Camera,
  Brain,
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
import { API_BASE as API } from "../../lib/config";

export default function CrowdAnalytics() {
  const [summary, setSummary] = useState<any>(null);
  const [cameras, setCameras] = useState<any[]>([]);

  async function loadData() {
    try {
      const [summaryRes, camerasRes] = await Promise.all([
        fetch(`${API}/api/summary`),
        fetch(`${API}/api/cameras`),
      ]);

      setSummary(await summaryRes.json());
      setCameras(await camerasRes.json());
    } catch (error) {
      console.error("Crowd analytics API error:", error);
    }
  }

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 1000);
    return () => clearInterval(timer);
  }, []);

  const kpis = summary?.kpis || {};

  const trendData =
    summary?.trend?.slice(-20).map((item: any) => ({
      time: item.time,
      active: item.active || 0,
      risk: item.risk || 0,
    })) || [];

  const zoneData = summary?.zones || [
    { zone: "Left", value: 0 },
    { zone: "Center", value: 0 },
    { zone: "Right", value: 0 },
  ];

  const postureData = summary?.posture || [
    { name: "Standing", value: 0 },
    { name: "Sitting", value: 0 },
  ];

  const totalPeople = cameras.reduce(
    (sum, cam) => sum + (cam.active_people || 0),
    0
  );

  const peakPeople = Math.max(
    0,
    ...trendData.map((item: any) => item.active || 0)
  );

  const avgRisk =
    cameras.length > 0
      ? cameras.reduce((sum, cam) => sum + (cam.risk_score || 0), 0) /
        cameras.length
      : kpis.risk_score || 0;

  const avgFps =
    cameras.length > 0
      ? cameras.reduce((sum, cam) => sum + (cam.fps || 0), 0) / cameras.length
      : kpis.fps || 0;

  const busiestCamera =
    cameras.length > 0
      ? [...cameras].sort(
          (a, b) => (b.active_people || 0) - (a.active_people || 0)
        )[0]
      : null;

  const highestRiskCamera =
    cameras.length > 0
      ? [...cameras].sort(
          (a, b) => (b.risk_score || 0) - (a.risk_score || 0)
        )[0]
      : null;

  const heatLevel =
    totalPeople >= 20 || avgRisk >= 70
      ? "High"
      : totalPeople >= 10 || avgRisk >= 35
      ? "Medium"
      : "Low";

  function riskLabel(value: number) {
    if (value >= 70) return "High";
    if (value >= 35) return "Medium";
    return "Low";
  }

  function actionText(value: number) {
    if (value >= 70) return "Immediate attention required";
    if (value >= 35) return "Monitor closely";
    return "Normal operation";
  }

  function badgeClass(value: string) {
    if (value === "High") return "bg-red-500 text-white";
    if (value === "Medium") return "bg-yellow-500 text-black";
    return "bg-green-500 text-white";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2">
            Crowd Analytics
          </h1>
          <p className="text-muted-foreground">
            Real-time crowd density, posture, zone, risk and AI insights
          </p>
        </div>

        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            (window.location.href = `${API}/api/reports/analytics/excel`)
          }
        >
          <Download className="size-4" />
          Export Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Current Occupancy
                </p>
                <h3 className="text-2xl font-semibold">{totalPeople}</h3>
                <div className="flex items-center gap-1 text-xs text-green-500 font-medium">
                  <ArrowUp className="size-3" />
                  Live from cameras
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Users className="size-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">
              Peak Occupancy
            </p>
            <h3 className="text-2xl font-semibold">{peakPeople}</h3>
            <p className="text-xs text-muted-foreground">Latest trend peak</p>
          </CardContent>
        </Card>

        <Card className="border-cyan-500/20">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">
              Avg Processing
            </p>
            <h3 className="text-2xl font-semibold">{avgFps.toFixed(1)} FPS</h3>
            <p className="text-xs text-muted-foreground">Across cameras</p>
          </CardContent>
        </Card>

        <Card className="border-red-500/20">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">
              Congestion Risk
            </p>
            <h3 className="text-2xl font-semibold">{riskLabel(avgRisk)}</h3>
            <p className="text-xs text-red-500">
              Avg risk: {avgRisk.toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-500/20">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">Heat Level</p>
            <h3 className="text-2xl font-semibold">{heatLevel}</h3>
            <p className="text-xs text-orange-500">AI density status</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <Camera className="size-5 text-blue-500" />
              <h3 className="font-semibold">Busiest Camera</h3>
            </div>
            <h2 className="text-xl font-semibold">
              {busiestCamera?.site || "N/A"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {busiestCamera?.camera_id || "-"} •{" "}
              {busiestCamera?.active_people || 0} people
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="size-5 text-orange-500" />
              <h3 className="font-semibold">Highest Risk Camera</h3>
            </div>
            <h2 className="text-xl font-semibold">
              {highestRiskCamera?.site || "N/A"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {highestRiskCamera?.camera_id || "-"} •{" "}
              {highestRiskCamera?.risk_score || 0}% risk
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-blue-500/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <Brain className="size-5 text-purple-500" />
              <h3 className="font-semibold">AI Crowd Insight</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Current occupancy is {totalPeople}. Highest activity is detected
              at {busiestCamera?.site || "N/A"}. Average risk is{" "}
              {avgRisk.toFixed(0)}%. Recommended status:{" "}
              {actionText(avgRisk)}.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5 text-blue-500" />
              Crowd Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="active"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.25}
                  name="Active People"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-5 text-orange-500" />
              Risk Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.25}
                  name="Risk Score"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-purple-500" />
              Zone Density
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={zoneData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis dataKey="zone" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5 text-green-500" />
              Standing vs Sitting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={postureData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={105}
                  label
                >
                  {postureData.map((entry: any, index: number) => (
                    <Cell
                      key={entry.name}
                      fill={index === 0 ? "#22c55e" : "#06b6d4"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-yellow-500" />
            Camera-wise Crowd Density
          </CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Camera</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>People</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>FPS</TableHead>
                <TableHead>Recommended Action</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {cameras.map((cam) => {
                const risk = cam.risk_score || 0;
                const label = riskLabel(risk);

                return (
                  <TableRow key={cam.camera_id}>
                    <TableCell className="font-mono">{cam.camera_id}</TableCell>
                    <TableCell>{cam.site}</TableCell>
                    <TableCell>{cam.active_people || 0}</TableCell>
                    <TableCell>{risk}%</TableCell>
                    <TableCell>{Number(cam.fps || 0).toFixed(1)}</TableCell>
                    <TableCell>{actionText(risk)}</TableCell>
                    <TableCell>
                      <Badge className={badgeClass(label)}>{label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}

              {cameras.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    No camera analytics available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
