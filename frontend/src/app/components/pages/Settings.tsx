import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Eye,
  FileVideo,
  Gauge,
  KeyRound,
  Link2,
  Loader2,
  MonitorPlay,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  Video,
  Wifi,
  WifiOff,
  Youtube,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Badge } from "../ui/badge";
import { API_BASE as API } from "../../lib/config";

type CameraType = "youtube" | "rtsp" | "local" | "webcam";
type SpeedMode = "slow" | "normal" | "fast";

type CameraItem = {
  camera_id: string;
  site: string;
  url: string;
  type: string;
  speed_mode?: string;
  enabled?: boolean;
  running?: boolean;
  active_people?: number;
  risk_score?: number;
  fps?: number;
};

type SettingsState = {
  max_people: number;
  risk_threshold: number;
  detection_confidence: number;
  suspicious_seconds: number;
  auto_recording: boolean;
  privacy_blur: boolean;
  gdpr_mode: boolean;
  face_blur: boolean;
  two_factor: boolean;
  ip_whitelist: boolean;
  detection_model: string;
  openai_api_key: string;
};

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
};

const DEFAULT_SETTINGS: SettingsState = {
  max_people: 50,
  risk_threshold: 70,
  detection_confidence: 0.5,
  suspicious_seconds: 120,
  auto_recording: true,
  privacy_blur: false,
  gdpr_mode: true,
  face_blur: false,
  two_factor: true,
  ip_whitelist: false,
  detection_model: "yolov8n",
  openai_api_key: "",
};

function normalizeCameraId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function makeCameraId(type: CameraType, site: string, cameras: CameraItem[]) {
  const base = normalizeCameraId(site || `${type}_camera`) || `${type}_camera`;
  let id = `${type}_${base}`;
  let counter = 1;

  while (cameras.some((cam) => cam.camera_id === id)) {
    id = `${type}_${base}_${counter}`;
    counter += 1;
  }

  return id;
}

function getCameraIcon(type?: string) {
  if (type === "youtube") return Youtube;
  if (type === "rtsp") return Wifi;
  if (type === "local") return FileVideo;
  if (type === "webcam") return MonitorPlay;
  return Camera;
}

function getCameraPlaceholder(type: CameraType) {
  if (type === "youtube") return "https://www.youtube.com/live/...";
  if (type === "rtsp") return "rtsp://username:password@192.168.1.10:554/stream1";
  if (type === "local") return "/Users/ogabek/Desktop/video.mp4";
  return "0 yoki webcam index";
}

function validateCameraForm({
  cameraId,
  site,
  url,
  type,
  hasVideoFile = false,
}: {
  cameraId: string;
  site: string;
  url: string;
  type: CameraType;
  hasVideoFile?: boolean;
}) {
  if (!cameraId.trim()) return "Camera ID kiritilishi kerak.";
  if (!site.trim()) return "Site name kiritilishi kerak.";
  if (!url.trim() && !(type === "local" && hasVideoFile)) return "Camera URL, local path yoki video file kiritilishi kerak.";

  const normalizedId = normalizeCameraId(cameraId);

  if (normalizedId !== cameraId.trim()) {
    return "Camera ID faqat kichik harf, raqam va underscore ko‘rinishida bo‘lsin. Masalan: main_entrance_01";
  }

  if (type === "youtube" && !url.includes("youtube.com") && !url.includes("youtu.be")) {
    return "YouTube kamera uchun YouTube live/video link kiriting.";
  }

  if (type === "rtsp" && !url.toLowerCase().startsWith("rtsp://")) {
    return "RTSP kamera uchun link rtsp:// bilan boshlanishi kerak.";
  }

  if (type === "local" && !hasVideoFile && !/\.(mp4|mov|avi|mkv|webm)$/i.test(url.trim())) {
    return "Local video uchun .mp4, .mov, .avi, .mkv yoki .webm fayl path kiriting yoki video file yuklang.";
  }

  return "";
}

export default function Settings() {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [site, setSite] = useState("");
  const [url, setUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [type, setType] = useState<CameraType>("youtube");
  const [speedMode, setSpeedMode] = useState<SpeedMode>("normal");
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);

  const [loadingCameras, setLoadingCameras] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingCamera, setSavingCamera] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  function showToast(type: ToastState["type"], message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function loadCameras() {
    try {
      setLoadingCameras(true);

      const res = await fetch(`${API}/api/cameras`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Camera API error: ${res.status}`);
      }

      const data = await res.json();
      setCameras(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("LOAD CAMERAS ERROR:", err);
      setCameras([]);
      showToast("error", "Camera ro‘yxatini yuklab bo‘lmadi. Backend ishlayotganini tekshiring.");
    } finally {
      setLoadingCameras(false);
    }
  }

  async function loadSettings() {
    try {
      setLoadingSettings(true);

      const res = await fetch(`${API}/api/thresholds`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Settings API error: ${res.status}`);
      }

      const data = await res.json();

      setSettings({
        max_people: Number(data.max_people ?? 50),
        risk_threshold: Number(data.risk_threshold ?? 70),
        detection_confidence: Number(data.detection_confidence ?? 0.5),
        suspicious_seconds: Number(data.suspicious_seconds ?? 120),
        auto_recording: Boolean(data.auto_recording ?? true),
        privacy_blur: Boolean(data.privacy_blur ?? false),
        gdpr_mode: Boolean(data.gdpr_mode ?? true),
        face_blur: Boolean(data.face_blur ?? false),
        two_factor: Boolean(data.two_factor ?? true),
        ip_whitelist: Boolean(data.ip_whitelist ?? false),
        detection_model: data.detection_model ?? "yolov8n",
        openai_api_key: data.openai_api_key ?? "",
      });
    } catch (err) {
      console.error("LOAD SETTINGS ERROR:", err);
      showToast("error", "Settings ma’lumotlarini yuklab bo‘lmadi.");
    } finally {
      setLoadingSettings(false);
    }
  }

  async function addCamera() {
    const validationMessage = validateCameraForm({
      cameraId,
      site,
      url,
      type,
      hasVideoFile: Boolean(videoFile),
    });

    if (validationMessage) {
      showToast("error", validationMessage);
      return;
    }

    if (cameras.some((cam) => cam.camera_id === cameraId.trim())) {
      showToast("error", "Bu Camera ID allaqachon mavjud. Boshqa ID tanlang.");
      return;
    }

    try {
      setSavingCamera(true);

      let response: Response;

      if (type === "local" && videoFile) {
        const form = new FormData();
        form.append("video", videoFile);
        form.append("camera_id", cameraId.trim());
        form.append("site", site.trim());
        form.append("speed_mode", speedMode);
        form.append("enabled", "true");

        response = await fetch(`${API}/api/cameras/upload-video`, {
          method: "POST",
          body: form,
        });
      } else {
        const payload = {
          camera_id: cameraId.trim(),
          site: site.trim(),
          url: url.trim(),
          type,
          speed_mode: speedMode,
          enabled: true,
        };

        response = await fetch(`${API}/api/cameras`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      let data: any = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok || data.ok === false) {
        showToast("error", data.detail || data.message || "Camera qo‘shilmadi.");
        return;
      }

      setCameraId("");
      setSite("");
      setUrl("");
      setVideoFile(null);
      setType("youtube");
      setSpeedMode("normal");

      await loadCameras();

      showToast("success", "Camera muvaffaqiyatli qo‘shildi.");
    } catch (err) {
      console.error("ADD CAMERA ERROR:", err);
      showToast("error", "Backend API ishlamayapti yoki ulanishda muammo bor.");
    } finally {
      setSavingCamera(false);
    }
  }

  async function deleteCamera(id: string) {
    const confirmed = window.confirm(`"${id}" kamerasini o‘chirishni xohlaysizmi?`);

    if (!confirmed) return;

    try {
      const response = await fetch(`${API}/api/cameras/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      await loadCameras();
      showToast("success", "Camera o‘chirildi.");
    } catch (err) {
      console.error("DELETE CAMERA ERROR:", err);
      showToast("error", "Camera o‘chirishda muammo yuz berdi.");
    }
  }

  async function saveSettings() {
    try {
      setSavingSettings(true);

      const safeSettings = {
        ...settings,
        max_people: Math.max(1, Number(settings.max_people || 1)),
        risk_threshold: Math.min(100, Math.max(1, Number(settings.risk_threshold || 70))),
        detection_confidence: Math.min(
          1,
          Math.max(0.01, Number(settings.detection_confidence || 0.5))
        ),
        suspicious_seconds: Math.max(1, Number(settings.suspicious_seconds || 120)),
      };

      for (const [key, value] of Object.entries(safeSettings)) {
        const res = await fetch(`${API}/api/thresholds/${key}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value }),
        });

        if (!res.ok) {
          throw new Error(`Failed to save ${key}`);
        }
      }

      setSettings(safeSettings);
      showToast("success", "Settings muvaffaqiyatli saqlandi.");
    } catch (err) {
      console.error("SAVE SETTINGS ERROR:", err);
      showToast("error", "Settings saqlashda muammo yuz berdi.");
    } finally {
      setSavingSettings(false);
    }
  }

  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
    showToast("info", "Default settings tiklandi. Saqlash uchun Save tugmasini bosing.");
  }

  function generateId() {
    const nextId = makeCameraId(type, site, cameras);
    setCameraId(nextId);
    showToast("info", `Camera ID yaratildi: ${nextId}`);
  }

  useEffect(() => {
    loadCameras();
    loadSettings();
  }, []);

  const onlineCount = useMemo(
    () => cameras.filter((cam) => cam.running).length,
    [cameras]
  );

  const offlineCount = cameras.length - onlineCount;

  const highRiskCount = useMemo(
    () => cameras.filter((cam) => Number(cam.risk_score || 0) >= 70).length,
    [cameras]
  );

  const avgFps = useMemo(() => {
    if (!cameras.length) return 0;
    return cameras.reduce((sum, cam) => sum + Number(cam.fps || 0), 0) / cameras.length;
  }, [cameras]);

  const formPreview = useMemo(() => {
    const Icon = getCameraIcon(type);

    return {
      Icon,
      title: site.trim() || "New Camera Source",
      id: cameraId.trim() || "camera_id_not_set",
      type,
      speedMode,
      url: videoFile ? videoFile.name : url.trim() || getCameraPlaceholder(type),
    };
  }, [cameraId, site, type, speedMode, url, videoFile]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              Settings & Configuration
            </h1>

            <Badge className="bg-blue-500/10 text-blue-500 border border-blue-500/20">
              ASSBI Control Panel
            </Badge>
          </div>

          <p className="text-muted-foreground max-w-3xl">
            Manage camera sources, AI detection thresholds, privacy settings and platform security controls.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={loadCameras}>
            <RefreshCw className={`size-4 mr-2 ${loadingCameras ? "animate-spin" : ""}`} />
            Refresh Cameras
          </Button>

          <Button variant="outline" onClick={resetSettings}>
            <RotateCcw className="size-4 mr-2" />
            Reset
          </Button>

          <Button onClick={saveSettings} disabled={savingSettings || loadingSettings}>
            {savingSettings ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            Save All Changes
          </Button>
        </div>
      </div>

      {toast && (
        <Card
          className={
            toast.type === "success"
              ? "border-green-500/30 bg-green-500/10"
              : toast.type === "error"
              ? "border-red-500/30 bg-red-500/10"
              : "border-blue-500/30 bg-blue-500/10"
          }
        >
          <CardContent className="p-4 flex items-center gap-3">
            {toast.type === "success" ? (
              <CheckCircle2 className="size-5 text-green-500" />
            ) : toast.type === "error" ? (
              <AlertTriangle className="size-5 text-red-500" />
            ) : (
              <SlidersHorizontal className="size-5 text-blue-500" />
            )}

            <p className="font-medium">{toast.message}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          icon={Camera}
          title="Total Cameras"
          value={cameras.length}
          description="Configured sources"
          className="border-blue-500/20 bg-blue-500/10"
          iconClassName="text-blue-500"
        />

        <SummaryCard
          icon={Wifi}
          title="Online"
          value={onlineCount}
          description={`${offlineCount} offline camera`}
          className="border-green-500/20 bg-green-500/10"
          iconClassName="text-green-500"
        />

        <SummaryCard
          icon={AlertTriangle}
          title="High Risk"
          value={highRiskCount}
          description="Risk score above threshold"
          className="border-red-500/20 bg-red-500/10"
          iconClassName="text-red-500"
        />

        <SummaryCard
          icon={Gauge}
          title="Average FPS"
          value={avgFps.toFixed(1)}
          description="Current processing speed"
          className="border-purple-500/20 bg-purple-500/10"
          iconClassName="text-purple-500"
        />
      </div>

      <Tabs defaultValue="cameras" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1">
          <TabsTrigger value="cameras" className="gap-2 py-3">
            <Video className="size-4" />
            Cameras
          </TabsTrigger>

          <TabsTrigger value="ai" className="gap-2 py-3">
            <Bot className="size-4" />
            AI Models
          </TabsTrigger>

          <TabsTrigger value="privacy" className="gap-2 py-3">
            <Eye className="size-4" />
            Privacy
          </TabsTrigger>

          <TabsTrigger value="security" className="gap-2 py-3">
            <Shield className="size-4" />
            Security
          </TabsTrigger>

          <TabsTrigger value="users" className="gap-2 py-3">
            <Users className="size-4" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cameras" className="space-y-5 mt-5">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <Card className="xl:col-span-8 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="size-5 text-blue-500" />
                  Add Camera Source
                </CardTitle>
                <CardDescription>
                  Add YouTube live, RTSP camera, local video path or webcam source.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Camera Type</Label>
                    <Select value={type} onValueChange={(value) => {
                      setType(value as CameraType);
                      if (value !== "local") setVideoFile(null);
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="youtube">YouTube Live</SelectItem>
                        <SelectItem value="rtsp">RTSP Camera</SelectItem>
                        <SelectItem value="local">Local Video</SelectItem>
                        <SelectItem value="webcam">Webcam</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Speed Mode</Label>
                    <Select value={speedMode} onValueChange={(value) => setSpeedMode(value as SpeedMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow Accuracy</SelectItem>
                        <SelectItem value="normal">Normal Balanced</SelectItem>
                        <SelectItem value="fast">Fast Performance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Site Name</Label>
                    <Input
                      value={site}
                      onChange={(e) => setSite(e.target.value)}
                      placeholder="Main Entrance, Classroom A, Parking..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  <div className="space-y-2 xl:col-span-4">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Camera ID</Label>
                      <button
                        type="button"
                        onClick={generateId}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        Auto generate
                      </button>
                    </div>

                    <Input
                      value={cameraId}
                      onChange={(e) => setCameraId(normalizeCameraId(e.target.value))}
                      placeholder="main_entrance_01"
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-8">
                    <Label>Camera URL / Local Path</Label>
                    <div className="relative">
                      <Link2 className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder={getCameraPlaceholder(type)}
                        className="pl-10"
                      />
                    </div>
                  </div>


                  {type === "local" && (
                    <div className="space-y-2 xl:col-span-12">
                      <Label>MP4 video upload</Label>
                      <Input
                        type="file"
                        accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mp4,.mov,.avi,.mkv,.webm"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setVideoFile(file);
                          if (file) {
                            const fileSite = file.name.replace(/\.[^.]+$/, "");
                            const nextSite = site.trim() || fileSite;
                            if (!site.trim()) setSite(fileSite);
                            if (!cameraId.trim()) {
                              setCameraId(makeCameraId("local", nextSite, cameras));
                            }
                          }
                        }}
                      />
                      {videoFile && (
                        <p className="text-xs text-muted-foreground">
                          Tanlangan file: {videoFile.name} · {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <formPreview.Icon className="size-6 text-blue-500" />
                      </div>

                      <div>
                        <h3 className="font-semibold">{formPreview.title}</h3>
                        <p className="text-sm text-muted-foreground font-mono">
                          {formPreview.id}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-2xl">
                          {formPreview.url}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{formPreview.type}</Badge>
                      <Badge variant="outline">{formPreview.speedMode}</Badge>
                      <Badge className="bg-green-500/10 text-green-500 border border-green-500/20">
                        enabled
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Camera qo‘shilgandan keyin u Live Surveillance sahifasida ko‘rinadi.
                  </p>

                  <Button onClick={addCamera} disabled={savingCamera} className="gap-2">
                    {savingCamera ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Add Camera
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-4 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-green-500" />
                  Add Camera Guide
                </CardTitle>
                <CardDescription>
                  Correct source format examples.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <GuideItem
                  icon={Youtube}
                  title="YouTube Live"
                  description="Use full YouTube live link. Example: https://www.youtube.com/live/..."
                />

                <GuideItem
                  icon={Wifi}
                  title="RTSP"
                  description="Use rtsp://username:password@ip:port/path format."
                />

                <GuideItem
                  icon={FileVideo}
                  title="Local Video"
                  description="Use full file path. Example: /Users/name/Desktop/video.mp4"
                />

                <GuideItem
                  icon={MonitorPlay}
                  title="Webcam"
                  description="Use camera index such as 0, 1, 2 if backend supports webcam input."
                />
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle>Configured Cameras</CardTitle>
                  <CardDescription>
                    These cameras appear in Live Surveillance.
                  </CardDescription>
                </div>

                <Button variant="outline" onClick={loadCameras}>
                  <RefreshCw className={`size-4 mr-2 ${loadingCameras ? "animate-spin" : ""}`} />
                  Reload
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Camera</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Speed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>People</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>FPS</TableHead>
                      <TableHead>URL / Path</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {loadingCameras && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                          Loading cameras...
                        </TableCell>
                      </TableRow>
                    )}

                    {!loadingCameras &&
                      cameras.map((cam) => {
                        const Icon = getCameraIcon(cam.type);

                        return (
                          <TableRow key={cam.camera_id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                  <Icon className="size-4 text-blue-500" />
                                </div>

                                <div>
                                  <p className="font-mono font-medium">{cam.camera_id}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {cam.enabled === false ? "Disabled" : "Enabled"}
                                  </p>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>{cam.site}</TableCell>

                            <TableCell>
                              <Badge variant="outline">{cam.type || "unknown"}</Badge>
                            </TableCell>

                            <TableCell>
                              <Badge variant="outline">{cam.speed_mode || "normal"}</Badge>
                            </TableCell>

                            <TableCell>
                              <Badge
                                className={
                                  cam.running
                                    ? "bg-green-500 text-white"
                                    : "bg-red-500 text-white"
                                }
                              >
                                {cam.running ? (
                                  <>
                                    <Wifi className="size-3 mr-1" />
                                    Running
                                  </>
                                ) : (
                                  <>
                                    <WifiOff className="size-3 mr-1" />
                                    Offline
                                  </>
                                )}
                              </Badge>
                            </TableCell>

                            <TableCell>{cam.active_people || 0}</TableCell>

                            <TableCell>
                              <Badge
                                className={
                                  Number(cam.risk_score || 0) >= 70
                                    ? "bg-red-500 text-white"
                                    : Number(cam.risk_score || 0) >= 35
                                    ? "bg-yellow-500 text-black"
                                    : "bg-green-500 text-white"
                                }
                              >
                                {cam.risk_score || 0}%
                              </Badge>
                            </TableCell>

                            <TableCell>{Number(cam.fps || 0).toFixed(1)}</TableCell>

                            <TableCell className="max-w-[260px] truncate text-muted-foreground">
                              {cam.url || "N/A"}
                            </TableCell>

                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteCamera(cam.camera_id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}

                    {!loadingCameras && cameras.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No cameras configured. Add your first camera above.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-5 mt-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="size-5 text-purple-500" />
                AI Model Configuration
              </CardTitle>
              <CardDescription>
                Configure detection model, thresholds and processing behaviour.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                <FieldSelect
                  label="Detection Model"
                  value={settings.detection_model}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      detection_model: value,
                    })
                  }
                  options={[
                    ["yolov8n", "YOLOv8n Fast"],
                    ["yolov8s", "YOLOv8s Balanced"],
                    ["yolov8m", "YOLOv8m Accuracy"],
                    ["rtdetr", "RT-DETR Quality"],
                  ]}
                />

                <FieldNumber
                  label="Max People Threshold"
                  value={settings.max_people}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      max_people: value,
                    })
                  }
                  min={1}
                  step={1}
                />

                <FieldNumber
                  label="Risk Threshold"
                  value={settings.risk_threshold}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      risk_threshold: value,
                    })
                  }
                  min={1}
                  max={100}
                  step={1}
                />

                <FieldNumber
                  label="Detection Confidence"
                  value={settings.detection_confidence}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      detection_confidence: value,
                    })
                  }
                  min={0.01}
                  max={1}
                  step={0.01}
                />

                <FieldNumber
                  label="Suspicious Seconds"
                  value={settings.suspicious_seconds}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      suspicious_seconds: value,
                    })
                  }
                  min={1}
                  step={1}
                />

                <div className="space-y-2">
                  <Label>OpenAI API Key</Label>
                  <div className="relative">
                    <KeyRound className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      value={settings.openai_api_key}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          openai_api_key: e.target.value,
                        })
                      }
                      placeholder="sk-..."
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ModelCard title="Performance Mode" value={settings.detection_model} hint="Selected AI model" />
                <ModelCard title="Confidence" value={settings.detection_confidence} hint="Detection threshold" />
                <ModelCard title="Risk Alert" value={`${settings.risk_threshold}%`} hint="Alert trigger level" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-5 mt-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="size-5 text-cyan-500" />
                Privacy & Compliance
              </CardTitle>
              <CardDescription>
                Manage privacy, anonymization and compliance controls.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <SwitchRow
                title="GDPR Compliance Mode"
                description="Enable privacy compliance workflow and data protection mode."
                checked={settings.gdpr_mode}
                onCheckedChange={(value) =>
                  setSettings({
                    ...settings,
                    gdpr_mode: value,
                  })
                }
              />

              <SwitchRow
                title="Face Blurring"
                description="Blur detected face or person regions in monitored streams."
                checked={settings.face_blur}
                onCheckedChange={(value) =>
                  setSettings({
                    ...settings,
                    face_blur: value,
                  })
                }
              />

              <SwitchRow
                title="Privacy Blur"
                description="Apply additional anonymization layer for public camera sources."
                checked={settings.privacy_blur}
                onCheckedChange={(value) =>
                  setSettings({
                    ...settings,
                    privacy_blur: value,
                  })
                }
              />

              <SwitchRow
                title="Auto Recording"
                description="Automatically record important events and suspicious periods."
                checked={settings.auto_recording}
                onCheckedChange={(value) =>
                  setSettings({
                    ...settings,
                    auto_recording: value,
                  })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-5 mt-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5 text-green-500" />
                Security Configuration
              </CardTitle>
              <CardDescription>
                Configure platform access, identity protection and secure access options.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <SwitchRow
                title="Two-Factor Authentication"
                description="Require additional verification for administrator access."
                checked={settings.two_factor}
                onCheckedChange={(value) =>
                  setSettings({
                    ...settings,
                    two_factor: value,
                  })
                }
              />

              <SwitchRow
                title="IP Whitelisting"
                description="Restrict platform access to trusted IP addresses."
                checked={settings.ip_whitelist}
                onCheckedChange={(value) =>
                  setSettings({
                    ...settings,
                    ip_whitelist: value,
                  })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-5 mt-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5 text-blue-500" />
                User Management
              </CardTitle>
              <CardDescription>
                Demo role overview for platform access control.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Permission</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {[
                    ["Admin User", "admin@assbi.com", "Administrator", "Full access"],
                    ["Security Officer", "security@assbi.com", "Security", "Monitoring"],
                    ["BI Analyst", "analyst@assbi.com", "Analyst", "Reports"],
                  ].map((user) => (
                    <TableRow key={user[1]}>
                      <TableCell className="font-medium">{user[0]}</TableCell>
                      <TableCell className="text-muted-foreground">{user[1]}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user[2]}</Badge>
                      </TableCell>
                      <TableCell>{user[3]}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                          Active
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  description,
  className,
  iconClassName,
}: {
  icon: any;
  title: string;
  value: string | number;
  description: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <Icon className={`size-6 mb-3 ${iconClassName || "text-primary"}`} />
        <p className="text-sm text-muted-foreground">{title}</p>
        <h2 className="text-3xl font-semibold">{value}</h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function GuideItem({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <Icon className="size-5 text-blue-500 mt-0.5" />
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ModelCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-muted/20 p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <h3 className="text-2xl font-semibold mt-1">{value}</h3>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border/50 bg-muted/20">
      <div>
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
