import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Cpu, FolderOpen, ImageUp, Play, RefreshCw, Terminal, Upload, Zap } from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Progress } from "../ui/progress";
import { API_BASE as API } from "../../lib/config";

type DetectionModel = {
  id: string;
  name: string;
  type: "builtin" | "custom";
  path: string;
  size_mb?: number;
  updated_at?: string;
};

type DatasetSplitStatus = { images: number; labels: number };

type DatasetStatus = {
  path: string;
  data_yaml: string;
  exists: boolean;
  data_yaml_exists: boolean;
  classes: string[];
  splits: Record<"train" | "valid" | "test", DatasetSplitStatus>;
  total_images: number;
  total_labels: number;
  ready: boolean;
};

type TrainingStatus = {
  running: boolean;
  state: string;
  message: string;
  model?: string;
  epochs?: number;
  imgsz?: number;
  batch?: number;
  run_name?: string;
  best_model?: string;
  best_model_exists?: boolean;
  log_file?: string;
  log_tail?: string;
  updated_at?: string;
};

type FineTuneStatus = {
  ok: boolean;
  current_model: string;
  resolved_model: string;
  models: DetectionModel[];
  training_dir: string;
  dataset?: DatasetStatus;
  training?: TrainingStatus;
};

type TestImageResult = {
  ok: boolean;
  model: string;
  counts: Record<string, number>;
  total: number;
  annotated_url: string;
};

export default function FineTuning() {
  const [status, setStatus] = useState<FineTuneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingModel, setSavingModel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [testingImage, setTestingImage] = useState(false);
  const [testResult, setTestResult] = useState<TestImageResult | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [startingTraining, setStartingTraining] = useState(false);
  const [trainModel, setTrainModel] = useState("yolo11m.pt");
  const [trainEpochs, setTrainEpochs] = useState(80);
  const [trainBatch, setTrainBatch] = useState(8);
  const [trainImgSize, setTrainImgSize] = useState(640);
  const [trainName, setTrainName] = useState("assbi_custom_person_vehicle_object");
  const [message, setMessage] = useState("");

  const activeModel = useMemo(
    () => status?.models.find((item) => item.id === status.current_model),
    [status]
  );

  async function loadStatus() {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/fine-tuning/status`, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Fine-tuning status API error");
      setStatus(data);
      if (data.training) setTraining(data.training);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fine-tuning status yuklanmadi.");
    } finally {
      setLoading(false);
    }
  }

  async function selectModel(model: string) {
    try {
      setSavingModel(model);
      const res = await fetch(`${API}/api/fine-tuning/select`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Model tanlanmadi.");
      setMessage(`${model} aktiv model qilindi. Kamerani restart qilinganda shu model ishlaydi.`);
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Model tanlashda xato.");
    } finally {
      setSavingModel("");
    }
  }

  async function uploadModel(file?: File) {
    if (!file) return;
    if (!file.name.endsWith(".pt")) {
      setMessage("Faqat YOLO .pt model fayl yuklanadi.");
      return;
    }

    try {
      setUploading(true);
      const form = new FormData();
      form.append("model", file);
      const res = await fetch(`${API}/api/fine-tuning/model`, { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Model yuklanmadi.");
      setMessage(`${file.name} yuklandi va aktiv model qilindi.`);
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Model upload xatosi.");
    } finally {
      setUploading(false);
    }
  }



  async function loadTrainingStatus() {
    try {
      const res = await fetch(`${API}/api/fine-tuning/train/status`, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Training status API error");
      setTraining(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Training status yuklanmadi.");
    }
  }

  async function startTraining() {
    try {
      setStartingTraining(true);
      const res = await fetch(`${API}/api/fine-tuning/train`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: "datasets/custom_assbi_yolo/data.yaml",
          model: trainModel,
          epochs: trainEpochs,
          imgsz: trainImgSize,
          batch: trainBatch,
          name: trainName,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data?.message || "Training boshlanmadi.");
      setTraining(data);
      setMessage("Training boshlandi. Tugaganda models/best.pt chiqadi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Training start xatosi.");
    } finally {
      setStartingTraining(false);
    }
  }


  async function testImage(file?: File) {
    if (!file) return;
    if (!/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
      setMessage("Test uchun JPG, PNG yoki WEBP rasm yuklang.");
      return;
    }

    try {
      setTestingImage(true);
      setTestResult(null);
      const form = new FormData();
      form.append("image", file);
      form.append("conf", "0.25");
      const res = await fetch(`${API}/api/fine-tuning/test-image`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data?.message || "Test image ishlamadi.");
      setTestResult(data);
      setMessage(`${file.name} test qilindi: ${data.total} ta detection.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test image xatosi.");
    } finally {
      setTestingImage(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!training?.running) return;
    const timer = window.setInterval(() => {
      loadTrainingStatus();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [training?.running]);

  const dataset = status?.dataset;
  const trainingState = training || status?.training;
  const trainingProgress = trainingState?.state === "completed" ? 100 : trainingState?.running ? 65 : trainingState?.state === "failed" ? 15 : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg border bg-card text-blue-600">
              <BrainCircuit className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">Fine-tuning</h1>
              <p className="text-sm text-muted-foreground">YOLO custom model registry va detector model selection.</p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={loadStatus} disabled={loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
          Yangilash
        </Button>
      </div>

      {message ? (
        <div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">{message}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4 text-blue-600" />
            Fine-tuning qanday ishlaydi
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="font-medium text-foreground">1. Model tayyorlash</p>
            <p className="mt-1">YOLO trainingdan chiqqan <span className="font-mono">best.pt</span> model sizning custom/fine-tuned modelingiz bo‘ladi.</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="font-medium text-foreground">2. Upload/select</p>
            <p className="mt-1">Shu sahifada <span className="font-mono">best.pt</span> ni yuklang yoki ro‘yxatdan aktiv model qilib tanlang.</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="font-medium text-foreground">3. Test image</p>
            <p className="mt-1">Rasm yuklab, model odam/obyektlarni qanday topayotganini live kameraga ulashdan oldin tekshiring.</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="font-medium text-foreground">4. Live detection</p>
            <p className="mt-1">Aktiv model kamera detector restart bo‘lganda RTSP/YouTube/MP4 detectionda ishlatiladi.</p>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="size-4 text-green-600" />
            UI orqali YOLO training
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Dataset</p>
              <p className="mt-1 font-medium">{dataset?.ready ? "Tayyor" : "Rasm/label kerak"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{dataset?.total_images || 0} images · {dataset?.total_labels || 0} labels</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Classlar</p>
              <p className="mt-1 font-medium">{dataset?.classes?.join(", ") || "person, vehicle, object"}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Natija</p>
              <p className="mt-1 break-all font-mono text-xs">{trainingState?.best_model || "models/best.pt"}</p>
              {trainingState?.best_model_exists ? <Badge className="mt-2 bg-green-600 text-white">best.pt bor</Badge> : null}
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="mt-1 font-medium">{trainingState?.running ? "Training ishlayapti" : trainingState?.state || "idle"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{trainingState?.updated_at || "-"}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Base model</p>
              <Input value={trainModel} onChange={(event) => setTrainModel(event.target.value)} placeholder="yolo11m.pt" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Epochs</p>
              <Input type="number" min={1} max={300} value={trainEpochs} onChange={(event) => setTrainEpochs(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Batch</p>
              <Input type="number" min={1} max={64} value={trainBatch} onChange={(event) => setTrainBatch(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Image size</p>
              <Input type="number" min={320} max={1280} value={trainImgSize} onChange={(event) => setTrainImgSize(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Run name</p>
              <Input value={trainName} onChange={(event) => setTrainName(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground">
                Training API qayerda ishlayotgan bo‘lsa, o‘sha machine’da yuradi. Tugaganda <span className="font-mono">models/best.pt</span> chiqadi.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadTrainingStatus}>
                  <RefreshCw className="mr-2 size-4" />
                  Status
                </Button>
                <Button onClick={startTraining} disabled={startingTraining || Boolean(trainingState?.running) || !dataset?.ready}>
                  <Play className="mr-2 size-4" />
                  {startingTraining ? "Boshlanmoqda..." : "Train boshlash"}
                </Button>
              </div>
            </div>
            <Progress value={trainingProgress} />
            <p className="text-xs text-muted-foreground">{trainingState?.message || "Datasetni joylang va Train boshlash tugmasini bosing."}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {(["train", "valid", "test"] as const).map((split) => (
              <div key={split} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <FolderOpen className="size-4 text-blue-600" />
                  {split}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{dataset?.splits?.[split]?.images || 0} images · {dataset?.splits?.[split]?.labels || 0} labels</p>
              </div>
            ))}
          </div>

          {trainingState?.log_tail ? (
            <div className="rounded-md border bg-black p-3 text-xs text-green-200">
              <div className="mb-2 flex items-center gap-2 text-white">
                <Terminal className="size-4" />
                Training log
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap">{trainingState.log_tail}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>


      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="size-4" />
              Model ro‘yxati
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(status?.models || []).map((model) => {
              const active = model.id === status?.current_model;
              return (
                <div key={model.id} className="flex items-center justify-between gap-4 rounded-md border p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{model.name}</p>
                      <Badge variant={model.type === "custom" ? "default" : "secondary"}>{model.type}</Badge>
                      {active ? <Badge className="bg-green-600 text-white">Aktiv</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{model.path}</p>
                    {model.size_mb ? <p className="mt-1 text-xs text-muted-foreground">{model.size_mb} MB · {model.updated_at}</p> : null}
                  </div>
                  <Button size="sm" variant={active ? "outline" : "default"} disabled={active || savingModel === model.id} onClick={() => selectModel(model.id)}>
                    {active ? <CheckCircle2 className="mr-2 size-4" /> : <Zap className="mr-2 size-4" />}
                    {active ? "Tanlangan" : "Tanlash"}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aktiv model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-2xl font-semibold">{activeModel?.name || status?.current_model || "-"}</div>
              <p className="break-all text-xs text-muted-foreground">{status?.resolved_model || "Model status yuklanmoqda"}</p>
              <Progress value={activeModel?.type === "custom" ? 100 : 55} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="size-4" />
                Fine-tuned model upload
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" accept=".pt" disabled={uploading} onChange={(event) => uploadModel(event.target.files?.[0])} />
              <p className="text-xs text-muted-foreground">Ultralytics YOLO trainingdan chiqqan `best.pt` faylni yuklang. Uploaddan keyin model avtomatik aktiv bo‘ladi.</p>
              {uploading ? <p className="text-sm text-muted-foreground">Yuklanmoqda...</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
