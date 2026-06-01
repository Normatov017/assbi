import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Filter,
  Laptop,
  Maximize2,
  Package,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Signal,
  Smartphone,
  Users,
  Video,
  WifiOff,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { API_BASE as API } from "../../lib/config";

interface CameraType {
  camera_id: string;
  site: string;
  url?: string;
  type?: string;
  speed_mode?: string;
  enabled?: boolean;
  running?: boolean;
  frame_url?: string;
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
}

type FilterMode = "all" | "online" | "offline" | "high-risk" | "low-quality";
type SortMode = "risk" | "people" | "fps" | "quality" | "name";

type CameraEvent = {
  id: string;
  title: string;
  message: string;
  camera_id: string;
  severity: "critical" | "warning" | "info" | "success";
  time: string;
  icon: LucideIcon;
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

function statusBadge(running?: boolean) {
  return running ? "bg-green-500 text-white" : "bg-red-500 text-white";
}

function getTotalObjects(cam?: CameraType) {
  if (!cam) return 0;

  return (
    numberValue(cam.laptops) +
    numberValue(cam.phones) +
    numberValue(cam.vehicles) +
    numberValue(cam.objects)
  );
}

function getFrameUrl(camera?: CameraType) {
  if (!camera?.frame_url) return "";

  if (camera.frame_url.startsWith("http")) {
    return `${camera.frame_url}?t=${Date.now()}`;
  }

  return `${API}${camera.frame_url}?t=${Date.now()}`;
}

function getStreamUrl(camera?: CameraType) {
  if (!camera?.stream_url) return "";

  const cacheKey = `camera=${encodeURIComponent(camera.camera_id)}`;

  if (camera.stream_url.startsWith("http")) {
    return camera.stream_url.includes("?")
      ? `${camera.stream_url}&${cacheKey}`
      : `${camera.stream_url}?${cacheKey}`;
  }

  return `${API}${camera.stream_url}?${cacheKey}`;
}

function getYoutubeEmbedUrl(camera?: CameraType) {
  if (!camera?.url || !String(camera.type || "").toLowerCase().includes("youtube")) {
    return "";
  }

  const source = String(camera.url);
  const match =
    source.match(/[?&]v=([^&]+)/) ||
    source.match(/youtu\.be\/([^?&]+)/) ||
    source.match(/youtube\.com\/live\/([^?&/]+)/);

  const videoId = match?.[1];
  return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1` : "";
}

function cameraSourceLabel(type?: string) {
  const value = String(type || "unknown").toLowerCase();

  if (value.includes("youtube")) return "YouTube";
  if (value.includes("rtsp")) return "RTSP";
  if (value.includes("local")) return "Local Video";
  if (value.includes("webcam")) return "Webcam";
  return type || "Unknown";
}

function sourceBadge(type?: string) {
  const value = String(type || "").toLowerCase();

  if (value.includes("youtube")) return "bg-red-500 text-white";
  if (value.includes("rtsp")) return "bg-blue-500 text-white";
  if (value.includes("local")) return "bg-purple-500 text-white";
  if (value.includes("webcam")) return "bg-green-500 text-white";
  return "bg-muted text-foreground";
}

function eventStyle(severity: CameraEvent["severity"]) {
  if (severity === "critical") {
    return {
      box: "border-red-500/30 bg-red-500/10",
      icon: "text-red-500",
      title: "text-red-500",
    };
  }

  if (severity === "warning") {
    return {
      box: "border-yellow-500/30 bg-yellow-500/10",
      icon: "text-yellow-500",
      title: "text-yellow-500",
    };
  }

  if (severity === "success") {
    return {
      box: "border-green-500/30 bg-green-500/10",
      icon: "text-green-500",
      title: "text-green-500",
    };
  }

  return {
    box: "border-blue-500/30 bg-blue-500/10",
    icon: "text-blue-500",
    title: "text-blue-500",
  };
}

function makeCameraEvents(cameras: CameraType[]): CameraEvent[] {
  const events: CameraEvent[] = [];

  cameras.forEach((camera, index) => {
    if (!camera.running) {
      events.push({
        id: `offline-${camera.camera_id}`,
        title: "Camera Offline",
        message: `${camera.site || camera.camera_id} stream javob bermayapti.`,
        camera_id: camera.camera_id,
        severity: "critical",
        time: `${index + 1} min ago`,
        icon: WifiOff,
      });
    }

    if (numberValue(camera.risk_score) >= 70) {
      events.push({
        id: `risk-${camera.camera_id}`,
        title: "High Risk Camera",
        message: `Risk score ${formatPercent(camera.risk_score)} ga chiqdi.`,
        camera_id: camera.camera_id,
        severity: "warning",
        time: `${index + 2} min ago`,
        icon: ShieldAlert,
      });
    }

    if (numberValue(camera.quality) > 0 && numberValue(camera.quality) < 50) {
      events.push({
        id: `quality-${camera.camera_id}`,
        title: "Low Stream Quality",
        message: `Stream quality ${formatPercent(
          camera.quality
        )}. Video source tekshirish kerak.`,
        camera_id: camera.camera_id,
        severity: "warning",
        time: `${index + 3} min ago`,
        icon: Signal,
      });
    }

    if (numberValue(camera.fps) > 0 && numberValue(camera.fps) < 6) {
      events.push({
        id: `fps-${camera.camera_id}`,
        title: "Low FPS",
        message: `Detection FPS ${numberValue(camera.fps).toFixed(
          1
        )}. Processing sekinlashgan.`,
        camera_id: camera.camera_id,
        severity: "info",
        time: `${index + 4} min ago`,
        icon: Zap,
      });
    }
  });

  if (events.length === 0 && cameras.length > 0) {
    events.push({
      id: "stable",
      title: "Camera Monitoring Stable",
      message: "Hamma asosiy kamera signallari normal holatda.",
      camera_id: "system",
      severity: "success",
      time: "now",
      icon: CheckCircle2,
    });
  }

  return events.slice(0, 8);
}

export default function LiveSurveillance() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("risk");
  const selectedCameraButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadCameras = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);

      setIsRefreshing(true);
      setError("");

      const res = await fetch(`${API}/api/cameras`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Camera API returned ${res.status}`);
      }

      const data: CameraType[] = await res.json();
      const normalized = Array.isArray(data) ? data : [];

      setCameras(normalized);
      setLastUpdated(new Date());

      setSelectedCameraId((prev) => {
        if (!prev && normalized.length > 0) {
          return normalized[0].camera_id;
        }

        const exists = normalized.some((camera) => camera.camera_id === prev);

        return exists ? prev : normalized[0]?.camera_id || "";
      });
    } catch (err) {
      console.error("Live surveillance API error:", err);
      setError("Camera API bilan ulanishda muammo yuz berdi.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCameras(false);
  }, [loadCameras]);

  useEffect(() => {
    if (!isMonitoring) return;

    const timer = window.setInterval(() => {
      loadCameras(true);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [isMonitoring, loadCameras]);

  const selectedCamera =
    cameras.find((camera) => camera.camera_id === selectedCameraId) ||
    cameras[0];

  const filteredCameras = useMemo(() => {
    let items = [...cameras];
    const q = search.trim().toLowerCase();

    if (q) {
      items = items.filter((camera) => {
        return (
          camera.site?.toLowerCase().includes(q) ||
          camera.camera_id?.toLowerCase().includes(q) ||
          camera.type?.toLowerCase().includes(q) ||
          camera.speed_mode?.toLowerCase().includes(q)
        );
      });
    }

    if (filterMode === "online") {
      items = items.filter((camera) => camera.running);
    }

    if (filterMode === "offline") {
      items = items.filter((camera) => !camera.running);
    }

    if (filterMode === "high-risk") {
      items = items.filter((camera) => numberValue(camera.risk_score) >= 70);
    }

    if (filterMode === "low-quality") {
      items = items.filter(
        (camera) =>
          numberValue(camera.quality) > 0 && numberValue(camera.quality) < 50
      );
    }

    items.sort((a, b) => {
      if (sortMode === "people") {
        return numberValue(b.active_people) - numberValue(a.active_people);
      }

      if (sortMode === "fps") {
        return numberValue(b.fps) - numberValue(a.fps);
      }

      if (sortMode === "quality") {
        return numberValue(b.quality) - numberValue(a.quality);
      }

      if (sortMode === "name") {
        return String(a.site || a.camera_id).localeCompare(
          String(b.site || b.camera_id)
        );
      }

      return numberValue(b.risk_score) - numberValue(a.risk_score);
    });

    return items;
  }, [cameras, search, filterMode, sortMode]);

  const sidebarCameras = useMemo(() => {
    if (!selectedCameraId) return filteredCameras;

    const selected = filteredCameras.find(
      (camera) => camera.camera_id === selectedCameraId
    );

    if (!selected) return filteredCameras;

    return [
      selected,
      ...filteredCameras.filter((camera) => camera.camera_id !== selectedCameraId),
    ];
  }, [filteredCameras, selectedCameraId]);

  const selectCamera = useCallback((cameraId: string) => {
    setSelectedCameraId(cameraId);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    selectedCameraButtonRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedCameraId]);

  const cameraEvents = useMemo(() => makeCameraEvents(cameras), [cameras]);

  const selectedFrameUrl = getFrameUrl(selectedCamera);
  const selectedStreamUrl = getStreamUrl(selectedCamera);
  const selectedYoutubeEmbedUrl = getYoutubeEmbedUrl(selectedCamera);

  const operatorInsight = useMemo(() => {
    if (error) {
      return {
        title: "Camera API offline",
        text: "Backend camera endpoint javob bermayapti. api_server.py va detector processni tekshiring.",
        badge: "API ISSUE",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (!selectedCamera) {
      return {
        title: "No camera selected",
        text: "Monitoring uchun kamera qo‘shish yoki camera API dan ma’lumot olish kerak.",
        badge: "NO DATA",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (!selectedCamera.running) {
      return {
        title: "Selected camera offline",
        text: "Kamera stream ishlamayapti. Source URL, local path yoki detector processni tekshiring.",
        badge: "OFFLINE",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (numberValue(selectedCamera.risk_score) >= 70) {
      return {
        title: "Selected camera needs attention",
        text: "Ushbu kamerada risk yuqori. Live feed, object overlay va anomaly eventlarni tekshirish kerak.",
        badge: "HIGH RISK",
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (numberValue(selectedCamera.quality) < 50) {
      return {
        title: "Stream quality issue",
        text: "Video quality past. Network, source resolution yoki detect intervalni optimizatsiya qiling.",
        badge: "LOW QUALITY",
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    return {
      title: "Camera monitoring stable",
      text: "Tanlangan kamera normal ishlayapti. FPS, quality va risk nazorat ostida.",
      badge: "STABLE",
      badgeClass: "bg-green-500 text-white",
    };
  }, [error, selectedCamera]);

  function exportSnapshot() {
    if (!selectedCamera) return;

    window.open(`${API}/api/cameras/${selectedCamera.camera_id}/snapshot`, "_blank");
  }

  function exportCameraReport() {
    window.open(`${API}/api/reports/cameras/excel`, "_blank");
  }

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              Camera Operator Workspace
            </h1>

            <Badge
              className={
                isMonitoring
                  ? "bg-green-500 text-white"
                  : "bg-red-500 text-white"
              }
            >
              <Radio className="size-3.5 mr-1" />
              {isMonitoring ? "Monitoring Active" : "Monitoring Paused"}
            </Badge>

            <Badge variant="outline" className="text-foreground">
              <Clock className="size-3.5 mr-1" />
              {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-4xl">
            Live camera feed, source health, frame diagnostics and per-camera
            object visibility for operators.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant={isMonitoring ? "destructive" : "default"}
            onClick={() => setIsMonitoring((prev) => !prev)}
          >
            {isMonitoring ? (
              <Pause className="size-4 mr-2" />
            ) : (
              <Play className="size-4 mr-2" />
            )}
            {isMonitoring ? "Pause Monitoring" : "Start Monitoring"}
          </Button>

          <Button variant="outline" onClick={() => loadCameras(false)}>
            <RefreshCw
              className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button variant="outline" onClick={exportSnapshot}>
            <Download className="size-4 mr-2" />
            Snapshot
          </Button>

          <Button variant="outline" onClick={exportCameraReport}>
            <Download className="size-4 mr-2" />
            Camera Report
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <p className="font-semibold text-red-500">Camera API Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-center">
            <div className="xl:col-span-2">
              <p className="text-sm text-muted-foreground">Selected Camera</p>
              <h2 className="text-2xl font-semibold text-foreground">
                {selectedCamera?.site || "No camera selected"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCamera?.camera_id || "Camera ID"} •{" "}
                {cameraSourceLabel(selectedCamera?.type)} •{" "}
                {selectedCamera?.speed_mode || "normal"}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:col-span-2 gap-3">
              <MiniCameraStatus
                label="Status"
                value={selectedCamera?.running ? "Online" : "Offline"}
                tone={selectedCamera?.running ? "good" : "bad"}
              />
              <MiniCameraStatus
                label="FPS"
                value={numberValue(selectedCamera?.fps).toFixed(1)}
                tone="info"
              />
              <MiniCameraStatus
                label="Quality"
                value={formatPercent(selectedCamera?.quality)}
                tone={
                  numberValue(selectedCamera?.quality) >= 70
                    ? "good"
                    : numberValue(selectedCamera?.quality) >= 40
                    ? "warning"
                    : "bad"
                }
              />
              <MiniCameraStatus
                label="Risk"
                value={formatPercent(selectedCamera?.risk_score)}
                tone={
                  numberValue(selectedCamera?.risk_score) >= 70
                    ? "bad"
                    : numberValue(selectedCamera?.risk_score) >= 35
                    ? "warning"
                    : "good"
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 space-y-5">
          <Card className="border-border/50 overflow-hidden">
            <CardHeader className="border-b border-border/50">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                    <Video className="size-6 text-blue-500" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-2xl text-foreground">
                        {selectedCamera?.site || "No camera selected"}
                      </CardTitle>

                      {selectedCamera && (
                        <>
                          <Badge className={statusBadge(selectedCamera.running)}>
                            {selectedCamera.running ? "LIVE" : "OFFLINE"}
                          </Badge>

                          <Badge
                            className={riskBadge(
                              numberValue(selectedCamera.risk_score)
                            )}
                          >
                            RISK{" "}
                            {riskLabel(numberValue(selectedCamera.risk_score))}
                          </Badge>

                          <Badge
                            className={qualityBadge(
                              numberValue(selectedCamera.quality)
                            )}
                          >
                            QUALITY {formatPercent(selectedCamera.quality)}
                          </Badge>

                          <Badge variant="outline" className="text-foreground">
                            {selectedCamera.speed_mode || "normal"}
                          </Badge>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedCamera?.camera_id || "Select a camera"} •{" "}
                      {cameraSourceLabel(selectedCamera?.type)} source • refreshed{" "}
                      {lastUpdated.toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <Button variant="outline">
                  <Maximize2 className="size-4 mr-2" />
                  Focus View
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <MetricBox
                  label="Live People"
                  value={selectedCamera?.active_people || 0}
                />
                <MetricBox
                  label="Unique Count"
                  value={formatNumber(selectedCamera?.total_unique)}
                />
                <MetricBox
                  label="Standing"
                  value={selectedCamera?.standing || 0}
                />
                <MetricBox
                  label="Sitting"
                  value={selectedCamera?.sitting || 0}
                />
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-black min-h-[430px] flex items-center justify-center">
                {selectedCamera?.running && selectedStreamUrl ? (
                  <img
                    key={`${selectedCamera.camera_id}-stream`}
                    src={selectedStreamUrl}
                    alt={selectedCamera.site || selectedCamera.camera_id}
                    className="w-full h-full object-contain max-h-[600px]"
                  />
                ) : selectedYoutubeEmbedUrl ? (
                  <iframe
                    key={`${selectedCamera?.camera_id}-youtube`}
                    src={selectedYoutubeEmbedUrl}
                    title={selectedCamera?.site || selectedCamera?.camera_id}
                    className="w-full min-h-[430px] h-full max-h-[600px]"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : selectedCamera && selectedFrameUrl ? (
                  <img
                    key={`${selectedCamera.camera_id}-${lastUpdated.getTime()}`}
                    src={selectedFrameUrl}
                    alt={selectedCamera.site || selectedCamera.camera_id}
                    className="w-full h-full object-contain max-h-[600px]"
                  />
                ) : (
                  <div className="text-center p-10">
                    <Camera className="size-14 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-semibold text-white">
                      Camera frame not available
                    </p>
                    <p className="text-sm text-white/60 mt-2">
                      Camera API ishlayotganini va frame_url qaytayotganini
                      tekshiring.
                    </p>
                  </div>
                )}

                {selectedCamera && (
                  <>
                    <div className="absolute left-4 top-4 flex flex-col gap-2">
                      <Badge className="bg-red-500 text-white">
                        LIVE STREAM
                      </Badge>

                      <Badge className="bg-black/70 text-white">
                        FPS {numberValue(selectedCamera.fps).toFixed(1)}
                      </Badge>

                      <Badge className="bg-black/70 text-white">
                        QUALITY {formatPercent(selectedCamera.quality)}
                      </Badge>
                    </div>

                    <div className="absolute right-4 top-4 flex flex-col gap-2 items-end">
                      <Badge className="bg-black/70 text-white">
                        {lastUpdated.toLocaleTimeString()}
                      </Badge>

                      <Badge
                        className={riskBadge(
                          numberValue(selectedCamera.risk_score)
                        )}
                      >
                        {formatPercent(selectedCamera.risk_score)} RISK
                      </Badge>
                    </div>

                    <div className="absolute left-4 right-4 bottom-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <OverlayMetric
                        label="People"
                        value={selectedCamera.active_people || 0}
                      />
                      <OverlayMetric
                        label="Objects"
                        value={getTotalObjects(selectedCamera)}
                      />
                      <OverlayMetric
                        label="Standing"
                        value={selectedCamera.standing || 0}
                      />
                      <OverlayMetric
                        label="Sitting"
                        value={selectedCamera.sitting || 0}
                      />
                    </div>
                  </>
                )}
              </div>

              {selectedCamera && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <DeviceBox
                    icon={Laptop}
                    label="Laptops"
                    value={selectedCamera.laptops || 0}
                  />
                  <DeviceBox
                    icon={Smartphone}
                    label="Phones"
                    value={selectedCamera.phones || 0}
                  />
                  <DeviceBox
                    icon={Car}
                    label="Vehicles"
                    value={selectedCamera.vehicles || 0}
                  />
                  <DeviceBox
                    icon={Package}
                    label="Other Objects"
                    value={selectedCamera.objects || 0}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Signal className="size-5 text-blue-500" />
                  Camera Diagnostics
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {selectedCamera ? (
                  <>
                    <ProgressMetric
                      label="Stream Quality"
                      value={numberValue(selectedCamera.quality)}
                    />
                    <ProgressMetric
                      label="Risk Level"
                      value={numberValue(selectedCamera.risk_score)}
                    />
                    <ProgressMetric
                      label="FPS Efficiency"
                      value={Math.min(100, numberValue(selectedCamera.fps) * 5)}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <MetricBox
                        label="Camera Type"
                        value={cameraSourceLabel(selectedCamera.type)}
                      />
                      <MetricBox
                        label="Speed Mode"
                        value={selectedCamera.speed_mode || "normal"}
                      />
                      <MetricBox
                        label="Enabled"
                        value={selectedCamera.enabled === false ? "No" : "Yes"}
                      />
                      <MetricBox
                        label="Status"
                        value={selectedCamera.running ? "Online" : "Offline"}
                      />
                    </div>
                  </>
                ) : (
                  <EmptyBox message="Camera tanlanmagan." />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Activity className="size-5 text-purple-500" />
                  Camera Events
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {cameraEvents.length === 0 ? (
                  <EmptyBox message="Camera event mavjud emas." />
                ) : (
                  cameraEvents.map((event) => {
                    const Icon = event.icon;
                    const styles = eventStyle(event.severity);

                    return (
                      <div
                        key={event.id}
                        className={`rounded-xl border p-4 ${styles.box}`}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className={`size-5 mt-0.5 ${styles.icon}`} />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className={`font-semibold ${styles.title}`}>
                                {event.title}
                              </p>

                              <span className="text-xs text-muted-foreground">
                                {event.time}
                              </span>
                            </div>

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
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Camera className="size-5 text-blue-500" />
                Camera Operations Table
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Camera</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>People</TableHead>
                      <TableHead>Objects</TableHead>
                      <TableHead>FPS</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Risk</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredCameras.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-muted-foreground py-8"
                        >
                          Camera topilmadi.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCameras.map((camera) => (
                        <TableRow
                          key={camera.camera_id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => selectCamera(camera.camera_id)}
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

                          <TableCell>
                            <Badge className={sourceBadge(camera.type)}>
                              {cameraSourceLabel(camera.type)}
                            </Badge>
                          </TableCell>

                          <TableCell>{camera.active_people || 0}</TableCell>
                          <TableCell>{getTotalObjects(camera)}</TableCell>
                          <TableCell>
                            {numberValue(camera.fps).toFixed(1)}
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
        </div>

        <div className="xl:col-span-4 space-y-5 self-start">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Filter className="size-5 text-blue-500" />
                Camera Filters
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
                    <option value="high-risk">High Risk</option>
                    <option value="low-quality">Low Quality</option>
                  </select>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Sort</p>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-foreground outline-none"
                  >
                    <option value="risk">Risk</option>
                    <option value="people">People</option>
                    <option value="fps">FPS</option>
                    <option value="quality">Quality</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Filtered Result</p>
                <p className="text-3xl font-semibold text-foreground mt-1">
                  {filteredCameras.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Current search / filter / sort natijasi
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Camera className="size-5 text-green-500" />
                  Camera List
                </CardTitle>

                <Badge variant="outline" className="text-foreground">
                  {filteredCameras.length}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 max-h-[560px] overflow-y-auto pr-2">
              {filteredCameras.length === 0 ? (
                <EmptyBox message="Camera topilmadi." />
              ) : (
                sidebarCameras.map((camera) => {
                  const active =
                    selectedCamera?.camera_id === camera.camera_id;

                  return (
                    <button
                      key={camera.camera_id}
                      ref={active ? selectedCameraButtonRef : null}
                      onClick={() => selectCamera(camera.camera_id)}
                      className={`group w-full text-left rounded-xl border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                        active
                          ? "border-blue-500 bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                          : "border-border/50 bg-muted/15 hover:border-blue-500/50 hover:bg-blue-500/5"
                      }`}
                    >
                      <div className="flex gap-3">
                        <div
                          className={`mt-1 h-12 w-1.5 rounded-full ${
                            active
                              ? "bg-blue-500"
                              : camera.running
                              ? "bg-green-500/80"
                              : "bg-red-500/80"
                          }`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-foreground truncate">
                                  {camera.site || camera.camera_id}
                                </p>
                                {active && (
                                  <Badge className="bg-blue-500 text-white">
                                    SELECTED
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {camera.camera_id}
                              </p>
                            </div>

                            <Badge className={statusBadge(camera.running)}>
                              {camera.running ? "ONLINE" : "OFFLINE"}
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                            <TinyMetric
                              label="People"
                              value={camera.active_people || 0}
                            />
                            <TinyMetric
                              label="Obj"
                              value={getTotalObjects(camera)}
                            />
                            <TinyMetric
                              label="FPS"
                              value={numberValue(camera.fps).toFixed(1)}
                            />
                            <TinyMetric
                              label="Risk"
                              value={formatPercent(camera.risk_score)}
                              tone={
                                numberValue(camera.risk_score) >= 70
                                  ? "bad"
                                  : numberValue(camera.risk_score) >= 35
                                  ? "warning"
                                  : "good"
                              }
                            />
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">
                              {cameraSourceLabel(camera.type)} •{" "}
                              {camera.speed_mode || "normal"}
                            </span>
                            <span className="shrink-0">
                              Q {formatPercent(camera.quality)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Activity className="size-5 text-purple-500" />
                AI Camera Insight
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {operatorInsight.title}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {operatorInsight.text}
                    </p>
                  </div>

                  <Badge className={operatorInsight.badgeClass}>
                    {operatorInsight.badge}
                  </Badge>
                </div>
              </div>

              {selectedCamera && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricBox
                    label="Selected FPS"
                    value={numberValue(selectedCamera.fps).toFixed(1)}
                  />
                  <MetricBox
                    label="Selected Quality"
                    value={formatPercent(selectedCamera.quality)}
                  />
                  <MetricBox
                    label="Selected Risk"
                    value={formatPercent(selectedCamera.risk_score)}
                  />
                  <MetricBox
                    label="Selected Objects"
                    value={getTotalObjects(selectedCamera)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniCameraStatus({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "good" | "warning" | "bad" | "info";
}) {
  const toneClass =
    tone === "good"
      ? "border-green-500/25 bg-green-500/10 text-green-500"
      : tone === "warning"
      ? "border-yellow-500/25 bg-yellow-500/10 text-yellow-500"
      : tone === "bad"
      ? "border-red-500/25 bg-red-500/10 text-red-500"
      : "border-blue-500/25 bg-blue-500/10 text-blue-500";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function MetricBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

function TinyMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warning" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-green-500/25 bg-green-500/10"
      : tone === "warning"
      ? "border-yellow-500/25 bg-yellow-500/10"
      : tone === "bad"
      ? "border-red-500/25 bg-red-500/10"
      : "border-border/50 bg-background/40";

  return (
    <div className={`rounded-lg border p-2 ${toneClass}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

function OverlayMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-black/70 border border-white/10 p-3 backdrop-blur">
      <p className="text-xs text-white/70">{label}</p>
      <p className="text-xl font-semibold text-white mt-1">{value}</p>
    </div>
  );
}

function DeviceBox({
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

      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 text-center text-muted-foreground">
      {message}
    </div>
  );
}
