import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Cpu, RefreshCw, Upload, Zap } from "lucide-react";

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

type FineTuneStatus = {
  ok: boolean;
  current_model: string;
  resolved_model: string;
  models: DetectionModel[];
  training_dir: string;
};

export default function FineTuning() {
  const [status, setStatus] = useState<FineTuneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingModel, setSavingModel] = useState("");
  const [uploading, setUploading] = useState(false);
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

  useEffect(() => {
    loadStatus();
  }, []);

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
