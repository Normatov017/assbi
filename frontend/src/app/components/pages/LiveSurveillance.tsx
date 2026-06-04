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
  X,
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
import { useI18n } from "../../lib/i18n";

interface CameraType {
  camera_id: string;
  site: string;
  url?: string;
  type?: string;
  speed_mode?: string;
  enabled?: boolean;
  running?: boolean;
  has_frame?: boolean;
  frame_updated_at?: string;
  frame_url?: string;
  stream_url?: string;
  active_people?: number;
  total_unique?: number;
  today_visitors?: number;
  daily_visitors?: number;
  risk_score?: number;
  fps?: number;
  quality?: number;
  laptops?: number;
  phones?: number;
  vehicles?: number;
  objects?: number;
}

type FilterMode = "all" | "online" | "offline" | "high-risk" | "low-quality";
type StreamMode = "original" | "detection";
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

function hasLiveFrame(camera?: CameraType) {
  return Boolean(camera?.running && camera.has_frame);
}

function statusBadge(running?: boolean, healthy?: boolean) {
  if (running && healthy === false) return "bg-yellow-500 text-black";
  return running ? "bg-green-500 text-white" : "bg-red-500 text-white";
}

function hasYoutubeOriginal(camera?: CameraType) {
  return Boolean(getYoutubeEmbedUrl(camera));
}

function statusLabel(camera?: CameraType, t?: (key: string) => string) {
  if (!camera?.running) return t ? t("common.offline") : "Offline";
  if (!hasLiveFrame(camera) && hasYoutubeOriginal(camera)) {
    return t ? t("live.originalAvailable") : "Original";
  }
  if (!hasLiveFrame(camera)) return t ? t("live.noFrame") : "No frame";
  return t ? t("common.online") : "Online";
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

function getTodayVisitors(cam?: CameraType) {
  return numberValue(cam?.today_visitors) || numberValue(cam?.daily_visitors);
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
  if (!camera?.url) {
    return "";
  }

  const type = String(camera.type || "").toLowerCase();
  const source = String(camera.url);
  const isYoutubeSource =
    type.includes("youtube") ||
    source.includes("youtube.com") ||
    source.includes("youtu.be");

  if (!isYoutubeSource) {
    return "";
  }

  try {
    const parsed = new URL(source);
    let videoId = "";

    if (parsed.hostname.includes("youtu.be")) {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    } else if (parsed.searchParams.get("v")) {
      videoId = parsed.searchParams.get("v") || "";
    } else {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const videoPathIndex = parts.findIndex((part) =>
        ["embed", "live", "shorts"].includes(part)
      );
      videoId =
        videoPathIndex >= 0 ? parts[videoPathIndex + 1] || "" : parts[0] || "";
    }

    return videoId
      ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1`
      : "";
  } catch {
    const match =
      source.match(/[?&]v=([^&]+)/) ||
      source.match(/youtu\.be\/([^?&]+)/) ||
      source.match(/youtube\.com\/(?:live|embed|shorts)\/([^?&/]+)/);

    return match?.[1]
      ? `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=1&playsinline=1`
      : "";
  }
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

function makeCameraEvents(cameras: CameraType[], t: (key: string) => string): CameraEvent[] {
  const events: CameraEvent[] = [];

  cameras.forEach((camera, index) => {
    if (!camera.running) {
      events.push({
        id: `offline-${camera.camera_id}`,
        title: t("live.eventCameraOffline"),
        message: `${camera.site || camera.camera_id} ${t("live.eventCameraOfflineText")}`,
        camera_id: camera.camera_id,
        severity: "critical",
        time: `${index + 1} ${t("common.minutesAgo")}`,
        icon: WifiOff,
      });
    }

    if (numberValue(camera.risk_score) >= 70) {
      events.push({
        id: `risk-${camera.camera_id}`,
        title: t("live.eventHighRisk"),
        message: `${t("live.eventRiskScore")} ${formatPercent(camera.risk_score)} ga chiqdi.`,
        camera_id: camera.camera_id,
        severity: "warning",
        time: `${index + 2} ${t("common.minutesAgo")}`,
        icon: ShieldAlert,
      });
    }

    if (numberValue(camera.quality) > 0 && numberValue(camera.quality) < 50) {
      events.push({
        id: `quality-${camera.camera_id}`,
        title: t("live.eventLowQuality"),
        message: `Stream quality ${formatPercent(
          camera.quality
        )}. ${t("live.eventQualityText")}`,
        camera_id: camera.camera_id,
        severity: "warning",
        time: `${index + 3} ${t("common.minutesAgo")}`,
        icon: Signal,
      });
    }

    if (numberValue(camera.fps) > 0 && numberValue(camera.fps) < 6) {
      events.push({
        id: `fps-${camera.camera_id}`,
        title: t("live.eventLowFps"),
        message: `Detection FPS ${numberValue(camera.fps).toFixed(
          1
        )}. ${t("live.eventFpsText")}`,
        camera_id: camera.camera_id,
        severity: "info",
        time: `${index + 4} ${t("common.minutesAgo")}`,
        icon: Zap,
      });
    }
  });

  if (events.length === 0 && cameras.length > 0) {
    events.push({
      id: "stable",
      title: t("live.monitoringStableTitle"),
      message: t("live.eventStableText"),
      camera_id: "system",
      severity: "success",
      time: t("common.now"),
      icon: CheckCircle2,
    });
  }

  return events.slice(0, 8);
}

export default function LiveSurveillance() {
  const { t } = useI18n();
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [focusOpen, setFocusOpen] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("risk");
  const [streamMode, setStreamMode] = useState<StreamMode>("original");
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
      setError(t("live.cameraApiErrorText"));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

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

  useEffect(() => {
    if (!focusOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFocusOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [focusOpen]);

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

  const cameraEvents = useMemo(() => makeCameraEvents(cameras, t), [cameras, t]);

  const selectedFrameUrl = getFrameUrl(selectedCamera);
  const selectedStreamUrl = getStreamUrl(selectedCamera);
  const selectedYoutubeEmbedUrl = getYoutubeEmbedUrl(selectedCamera);
  const selectedHasFrame = hasLiveFrame(selectedCamera);
  const canShowOriginalStream = Boolean(selectedYoutubeEmbedUrl);
  const canShowDetectionStream = Boolean(selectedCamera?.running && selectedHasFrame && selectedStreamUrl);
  const useDetectionStream = canShowDetectionStream && (!canShowOriginalStream || streamMode === "detection");

  const operatorInsight = useMemo(() => {
    if (error) {
      return {
        title: t("live.apiOfflineTitle"),
        text: t("live.apiOfflineText"),
        badge: t("common.issue"),
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (!selectedCamera) {
      return {
        title: t("live.noCameraSelected"),
        text: t("live.noDataText"),
        badge: t("common.no"),
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    if (!selectedCamera.running) {
      return {
        title: t("live.selectedOfflineTitle"),
        text: t("live.selectedOfflineText"),
        badge: t("common.offline"),
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (numberValue(selectedCamera.risk_score) >= 70) {
      return {
        title: t("live.selectedRiskTitle"),
        text: t("live.selectedRiskText"),
        badge: t("common.highRisk"),
        badgeClass: "bg-red-500 text-white",
      };
    }

    if (numberValue(selectedCamera.quality) < 50) {
      return {
        title: t("live.streamQualityIssueTitle"),
        text: t("live.streamQualityIssueText"),
        badge: t("common.lowQuality"),
        badgeClass: "bg-yellow-500 text-black",
      };
    }

    return {
      title: t("live.monitoringStableTitle"),
      text: t("live.monitoringStableText"),
      badge: t("common.stable"),
      badgeClass: "bg-green-500 text-white",
    };
  }, [error, selectedCamera, t]);

  function exportSnapshot() {
    if (!selectedCamera) return;

    window.open(`${API}/api/snapshot/${selectedCamera.camera_id}`, "_blank");
  }

  function exportCameraReport() {
    window.open(`${API}/api/reports/analytics/excel`, "_blank");
  }

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              {t("live.title")}
            </h1>

            <Badge
              className={
                isMonitoring
                  ? "bg-green-500 text-white"
                  : "bg-red-500 text-white"
              }
            >
              <Radio className="size-3.5 mr-1" />
              {isMonitoring ? t("live.monitoringActive") : t("live.monitoringPaused")}
            </Badge>

            <Badge variant="outline" className="text-foreground">
              <Clock className="size-3.5 mr-1" />
              {lastUpdated.toLocaleTimeString()}
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-4xl">
            {t("live.subtitle")}
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
            {isMonitoring ? t("live.pauseMonitoring") : t("live.startMonitoring")}
          </Button>

          <Button variant="outline" onClick={() => loadCameras(false)}>
            <RefreshCw
              className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {t("common.refresh")}
          </Button>

          <Button variant="outline" onClick={exportSnapshot} disabled={!selectedCamera || !selectedHasFrame}>
            <Download className="size-4 mr-2" />
            {t("live.snapshot")}
          </Button>

          <Button variant="outline" onClick={exportCameraReport}>
            <Download className="size-4 mr-2" />
            {t("live.cameraReport")}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <p className="font-semibold text-red-500">{t("live.cameraApiError")}</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-blue-500/5">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-center">
            <div className="xl:col-span-2">
              <p className="text-sm text-muted-foreground">{t("live.selectedCamera")}</p>
              <h2 className="text-2xl font-semibold text-foreground">
                {selectedCamera?.site || t("live.noCameraSelected")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCamera?.camera_id || t("live.cameraId")} •{" "}
                {cameraSourceLabel(selectedCamera?.type)} •{" "}
                {selectedCamera?.speed_mode || "normal"}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:col-span-2 gap-3">
              <MiniCameraStatus
                label={t("common.status")}
                value={statusLabel(selectedCamera, t)}
                tone={!selectedCamera?.running ? "bad" : selectedHasFrame ? "good" : "warning"}
              />
              <MiniCameraStatus
                label="FPS"
                value={numberValue(selectedCamera?.fps).toFixed(1)}
                tone="info"
              />
              <MiniCameraStatus
                label={t("common.quality")}
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
                label={t("common.risk")}
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
                        {selectedCamera?.site || t("live.noCameraSelected")}
                      </CardTitle>

                      {selectedCamera && (
                        <>
                          <Badge className={statusBadge(selectedCamera.running, selectedHasFrame)}>
                            {statusLabel(selectedCamera, t).toUpperCase()}
                          </Badge>

                          <Badge
                            className={riskBadge(
                              numberValue(selectedCamera.risk_score)
                            )}
                          >
                            {t("common.risk").toUpperCase()}{" "}
                            {t(riskLevelKey(numberValue(selectedCamera.risk_score))).toUpperCase()}
                          </Badge>

                          <Badge
                            className={qualityBadge(
                              numberValue(selectedCamera.quality)
                            )}
                          >
                            {t("common.quality").toUpperCase()} {formatPercent(selectedCamera.quality)}
                          </Badge>

                          <Badge variant="outline" className="text-foreground">
                            {selectedCamera.speed_mode || "normal"}
                          </Badge>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedCamera?.camera_id || t("live.selectCamera")} •{" "}
                      {cameraSourceLabel(selectedCamera?.type)} {t("live.source")} • {t("live.refreshed")}{" "}
                      {lastUpdated.toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedCamera && (
                    <div className="flex rounded-lg border border-border/60 bg-muted/40 p-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={streamMode === "original" ? "default" : "ghost"}
                        disabled={!canShowOriginalStream}
                        onClick={() => setStreamMode("original")}
                        className="h-8 px-3"
                      >
                        Original
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={streamMode === "detection" ? "default" : "ghost"}
                        disabled={!canShowDetectionStream}
                        onClick={() => setStreamMode("detection")}
                        className="h-8 px-3"
                      >
                        Detection
                      </Button>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    disabled={!selectedCamera}
                    onClick={() => setFocusOpen(true)}
                  >
                    <Maximize2 className="size-4 mr-2" />
                    {t("live.focusView")}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <MetricBox
                  label={t("live.livePeople")}
                  value={selectedCamera?.active_people || 0}
                />
                <MetricBox
                  label={t("live.todayVisitors")}
                  value={formatNumber(getTodayVisitors(selectedCamera))}
                />
                <MetricBox
                  label={t("live.totalUnique")}
                  value={formatNumber(selectedCamera?.total_unique)}
                />
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-black min-h-[430px] flex items-center justify-center">
                {useDetectionStream ? (
                  <img
                    key={`${selectedCamera?.camera_id}-stream`}
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
                ) : selectedCamera && selectedHasFrame && selectedFrameUrl ? (
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
                      {t("live.frameUnavailable")}
                    </p>
                    <p className="text-sm text-white/60 mt-2">
                      {t("live.frameUnavailableHint")}
                    </p>
                  </div>
                )}

                {selectedCamera && (
                  <>
                    <div className="absolute left-4 top-4 flex flex-col gap-2">
                      <Badge className="bg-red-500 text-white">
                        {(useDetectionStream ? "Detection" : t("live.liveStream")).toUpperCase()}
                      </Badge>

                      <Badge className="bg-black/70 text-white">
                        FPS {numberValue(selectedCamera.fps).toFixed(1)}
                      </Badge>

                      <Badge className="bg-black/70 text-white">
                        {t("common.quality").toUpperCase()} {formatPercent(selectedCamera.quality)}
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
                        {formatPercent(selectedCamera.risk_score)} {t("common.risk").toUpperCase()}
                      </Badge>
                    </div>

                    <div className="absolute left-4 right-4 bottom-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <OverlayMetric
                        label={t("common.people")}
                        value={selectedCamera.active_people || 0}
                      />
                      <OverlayMetric
                        label={t("live.today")}
                        value={formatNumber(getTodayVisitors(selectedCamera))}
                      />
                      <OverlayMetric
                        label={t("live.total")}
                        value={formatNumber(selectedCamera.total_unique)}
                      />
                    </div>
                  </>
                )}
              </div>

              {selectedCamera && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <DeviceBox
                    icon={Laptop}
                    label={t("dashboard.laptops")}
                    value={selectedCamera.laptops || 0}
                  />
                  <DeviceBox
                    icon={Smartphone}
                    label={t("dashboard.phones")}
                    value={selectedCamera.phones || 0}
                  />
                  <DeviceBox
                    icon={Car}
                    label={t("dashboard.vehicles")}
                    value={selectedCamera.vehicles || 0}
                  />
                  <DeviceBox
                    icon={Package}
                    label={t("dashboard.otherObjects")}
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
                  {t("live.cameraDiagnostics")}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {selectedCamera ? (
                  <>
                    <ProgressMetric
                      label={t("live.streamQuality")}
                      value={numberValue(selectedCamera.quality)}
                    />
                    <ProgressMetric
                      label={t("live.riskLevel")}
                      value={numberValue(selectedCamera.risk_score)}
                    />
                    <ProgressMetric
                      label={t("live.fpsEfficiency")}
                      value={Math.min(100, numberValue(selectedCamera.fps) * 5)}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <MetricBox
                        label={t("live.cameraType")}
                        value={cameraSourceLabel(selectedCamera.type)}
                      />
                      <MetricBox
                        label={t("live.speedMode")}
                        value={selectedCamera.speed_mode || "normal"}
                      />
                      <MetricBox
                        label={t("live.enabled")}
                        value={selectedCamera.enabled === false ? t("common.no") : t("common.yes")}
                      />
                      <MetricBox
                        label={t("common.status")}
                        value={statusLabel(selectedCamera, t)}
                      />
                    </div>
                  </>
                ) : (
                  <EmptyBox message={t("live.noCameraSelected")} />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Activity className="size-5 text-purple-500" />
                  {t("live.cameraEvents")}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {cameraEvents.length === 0 ? (
                  <EmptyBox message={t("live.noCameraEvents")} />
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
                {t("live.cameraOperationsTable")}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.camera")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("common.source")}</TableHead>
                      <TableHead>{t("common.people")}</TableHead>
                      <TableHead>{t("common.objects")}</TableHead>
                      <TableHead>FPS</TableHead>
                      <TableHead>{t("common.quality")}</TableHead>
                      <TableHead>{t("common.risk")}</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredCameras.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-muted-foreground py-8"
                        >
                          {t("live.cameraNotFound")}
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
                            <Badge className={statusBadge(camera.running, hasLiveFrame(camera))}>
                              {statusLabel(camera, t).toUpperCase()}
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
                {t("live.cameraFilters")}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("live.searchPlaceholder")}
                  className="w-full h-11 rounded-xl border border-border bg-background pl-10 pr-4 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">{t("common.filter")}</p>
                  <select
                    value={filterMode}
                    onChange={(e) =>
                      setFilterMode(e.target.value as FilterMode)
                    }
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-foreground outline-none"
                  >
                    <option value="all">{t("common.allCameras")}</option>
                    <option value="online">{t("common.online")}</option>
                    <option value="offline">{t("common.offline")}</option>
                    <option value="high-risk">{t("common.highRisk")}</option>
                    <option value="low-quality">{t("common.lowQuality")}</option>
                  </select>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-2">{t("common.sort")}</p>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-foreground outline-none"
                  >
                    <option value="risk">{t("common.risk")}</option>
                    <option value="people">{t("common.people")}</option>
                    <option value="fps">FPS</option>
                    <option value="quality">{t("common.quality")}</option>
                    <option value="name">{t("common.name")}</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">{t("live.filteredResult")}</p>
                <p className="text-3xl font-semibold text-foreground mt-1">
                  {filteredCameras.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("live.currentFilterResult")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Camera className="size-5 text-green-500" />
                  {t("live.cameraList")}
                </CardTitle>

                <Badge variant="outline" className="text-foreground">
                  {filteredCameras.length}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 max-h-[560px] overflow-y-auto pr-2">
              {filteredCameras.length === 0 ? (
                <EmptyBox message={t("live.cameraNotFound")} />
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
                              : hasLiveFrame(camera)
                              ? "bg-green-500/80"
                              : camera.running
                              ? "bg-yellow-500/80"
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
                                    {t("common.selected").toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {camera.camera_id}
                              </p>
                            </div>

                            <Badge className={statusBadge(camera.running, hasLiveFrame(camera))}>
                              {statusLabel(camera, t).toUpperCase()}
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                            <TinyMetric
                              label={t("common.people")}
                              value={camera.active_people || 0}
                            />
                            <TinyMetric
                              label={t("common.obj")}
                              value={getTotalObjects(camera)}
                            />
                            <TinyMetric
                              label="FPS"
                              value={numberValue(camera.fps).toFixed(1)}
                            />
                            <TinyMetric
                              label={t("common.risk")}
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
                {t("live.aiCameraInsight")}
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
                    label={t("live.selectedFps")}
                    value={numberValue(selectedCamera.fps).toFixed(1)}
                  />
                  <MetricBox
                    label={t("live.selectedQuality")}
                    value={formatPercent(selectedCamera.quality)}
                  />
                  <MetricBox
                    label={t("live.selectedRisk")}
                    value={formatPercent(selectedCamera.risk_score)}
                  />
                  <MetricBox
                    label={t("live.selectedObjects")}
                    value={getTotalObjects(selectedCamera)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {focusOpen && selectedCamera && (
        <div className="fixed inset-0 z-[100] bg-black/95 text-white">
          <div className="h-full w-full flex flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#070b1f]/95 px-4 sm:px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/25">
                    <Video className="size-5 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-2xl font-semibold truncate">
                      {selectedCamera.site || selectedCamera.camera_id}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/55 truncate">
                      {selectedCamera.camera_id} • {cameraSourceLabel(selectedCamera.type)} • {t("live.refreshed")} {lastUpdated.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={statusBadge(selectedCamera.running, selectedHasFrame)}>
                  {statusLabel(selectedCamera, t).toUpperCase()}
                </Badge>
                <Badge className={riskBadge(numberValue(selectedCamera.risk_score))}>
                  {formatPercent(selectedCamera.risk_score)} {t("common.risk").toUpperCase()}
                </Badge>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setFocusOpen(false)}
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                >
                  <X className="size-5" />
                </Button>
              </div>
            </div>

            <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center">
              {useDetectionStream ? (
                <img
                  key={`${selectedCamera.camera_id}-focus-stream`}
                  src={`${selectedStreamUrl}&focus=1`}
                  alt={selectedCamera.site || selectedCamera.camera_id}
                  className="h-full w-full object-contain"
                />
              ) : selectedYoutubeEmbedUrl ? (
                <iframe
                  key={`${selectedCamera.camera_id}-focus-youtube`}
                  src={selectedYoutubeEmbedUrl}
                  title={selectedCamera.site || selectedCamera.camera_id}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="text-center">
                  <WifiOff className="size-12 mx-auto mb-3 text-white/45" />
                  <p className="text-lg font-semibold">{t("live.noLiveStream")}</p>
                </div>
              )}

              <div className="absolute left-4 right-4 bottom-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <OverlayMetric label={t("common.live")} value={selectedCamera.active_people || 0} />
                <OverlayMetric label={t("live.today")} value={formatNumber(getTodayVisitors(selectedCamera))} />
                <OverlayMetric label={t("live.total")} value={formatNumber(selectedCamera.total_unique)} />
                <OverlayMetric label={t("common.objects")} value={getTotalObjects(selectedCamera)} />
                <OverlayMetric label="FPS" value={numberValue(selectedCamera.fps).toFixed(1)} />
              </div>
            </div>
          </div>
        </div>
      )}
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
