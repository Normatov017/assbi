import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSearch,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import { API_BASE } from "../../lib/config";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type AnyRecord = Record<string, any>;

function numberValue(value: unknown) {
  return Number(value || 0);
}

function formatPercent(value: unknown) {
  return `${numberValue(value).toFixed(0)}%`;
}

function statusClass(enabled: boolean) {
  return enabled ? "bg-green-500 text-white" : "bg-yellow-500 text-black";
}

async function getJson(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

export default function GovernanceEvaluation() {
  const [evaluation, setEvaluation] = useState<AnyRecord | null>(null);
  const [pipeline, setPipeline] = useState<AnyRecord | null>(null);
  const [compliance, setCompliance] = useState<AnyRecord | null>(null);
  const [visitors, setVisitors] = useState<AnyRecord | null>(null);
  const [incidents, setIncidents] = useState<AnyRecord[]>([]);
  const [audit, setAudit] = useState<AnyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setError("");

      const [nextEvaluation, nextPipeline, nextCompliance, nextVisitors, nextIncidents, nextAudit] =
        await Promise.all([
          getJson("/api/evaluation"),
          getJson("/api/pipeline"),
          getJson("/api/compliance"),
          getJson("/api/visitors"),
          getJson("/api/incidents?limit=50"),
          getJson("/api/audit?limit=80"),
        ]);

      setEvaluation(nextEvaluation);
      setPipeline(nextPipeline);
      setCompliance(nextCompliance);
      setVisitors(nextVisitors);
      setIncidents(Array.isArray(nextIncidents) ? nextIncidents : []);
      setAudit(Array.isArray(nextAudit) ? nextAudit : []);
    } catch (err) {
      console.error("Evaluation governance load failed:", err);
      setError("Evaluation and governance data could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 8000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const workflowStats = useMemo(() => {
    const open = incidents.filter((item) => !["Resolved", "Closed"].includes(String(item.status || ""))).length;
    return {
      open,
      resolved: Math.max(0, incidents.length - open),
    };
  }, [incidents]);

  async function markResolved(incidentId: number) {
    await fetch(`${API_BASE}/api/incidents/${incidentId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Resolved",
        operator_note: "Workflow updated from Evaluation & Governance page.",
      }),
    });
    await loadData();
  }

  const summary = evaluation?.summary || {};
  const visitorSummary = visitors?.summary || {};
  const inventory = compliance?.data_inventory || {};

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Evaluation & Governance</h1>
          <p className="text-muted-foreground max-w-4xl mt-2">
            AI-BI pipeline evaluation, compliance, audit, visitor flow and alert workflow in one evidence center.
          </p>
        </div>

        <Button variant="outline" onClick={loadData} disabled={isRefreshing}>
          <RefreshCw className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={FileSearch} label="Estimated Precision" value={formatPercent(summary.estimated_precision)} hint="Operational model estimate" />
        <MetricCard icon={CheckCircle2} label="Estimated Recall" value={formatPercent(summary.estimated_recall)} hint="People/object visibility estimate" />
        <MetricCard icon={GitBranch} label="Scalability Score" value={formatPercent(summary.scalability_score)} hint={`${summary.records || 0} analytics records`} />
        <MetricCard icon={Database} label="Veracity Score" value={formatPercent(summary.veracity_score)} hint={`Q ${formatPercent(summary.data_quality)} / FPS ${summary.avg_fps || 0}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 space-y-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5 text-blue-500" />
                Model Evaluation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(evaluation?.metrics || []).map((item: AnyRecord) => (
                  <div key={item.name} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">{item.name}</p>
                    <p className="text-2xl font-semibold mt-1">{item.value}</p>
                    <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="font-semibold mb-2">Recommendations</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {(evaluation?.recommendations || []).map((item: string) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="size-5 text-cyan-500" />
                Pipeline Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(pipeline?.nodes || []).map((node: AnyRecord, index: number) => (
                  <div key={node.id} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                    <Badge variant="outline" className="mb-3">{index + 1}</Badge>
                    <p className="font-semibold">{node.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{node.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-5 text-emerald-500" />
                Data Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Purpose</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pipeline?.data_model || []).map((item: AnyRecord) => (
                      <TableRow key={item.table}>
                        <TableCell className="font-mono">{item.table}</TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell className="text-muted-foreground">{item.purpose}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-amber-500" />
                Alert Workflow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <MetricCard icon={AlertTriangle} label="Open Alerts" value={workflowStats.open} hint="Needs operator action" compact />
                <MetricCard icon={CheckCircle2} label="Resolved Alerts" value={workflowStats.resolved} hint="Closed workflow items" compact />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Camera</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No incidents yet</TableCell>
                      </TableRow>
                    ) : (
                      incidents.slice(0, 12).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.incident_type || "Incident"}</TableCell>
                          <TableCell className="font-mono">{item.camera_id}</TableCell>
                          <TableCell>{item.severity}</TableCell>
                          <TableCell><Badge variant="outline">{item.status || "Open"}</Badge></TableCell>
                          <TableCell>{item.assigned_to || "Unassigned"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={["Resolved", "Closed"].includes(String(item.status || ""))}
                              onClick={() => markResolved(Number(item.id))}
                            >
                              Mark Resolved
                            </Button>
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

        <div className="xl:col-span-4 space-y-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5 text-purple-500" />
                Visitor Entry / Exit
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MiniStat label="Entries" value={visitorSummary.entries || 0} />
              <MiniStat label="Exits" value={visitorSummary.exits || 0} />
              <MiniStat label="Current Inside" value={visitorSummary.current_inside || 0} />
              <MiniStat label="Peak Occupancy" value={visitorSummary.peak_occupancy || 0} />
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-green-500" />
                Privacy & Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(compliance?.controls || []).map((item: AnyRecord) => (
                <div key={item.name} className="rounded-xl border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{item.name}</p>
                    <Badge className={statusClass(Boolean(item.enabled))}>{item.enabled ? "Enabled" : "Check"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{item.evidence}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-5 text-blue-500" />
                Data Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {Object.entries(inventory).map(([key, value]) => (
                <MiniStat key={key} label={key.replaceAll("_", " ")} value={String(value)} />
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="size-5 text-orange-500" />
                Audit Log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[520px] overflow-y-auto">
              {audit.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No audit records yet</div>
              ) : (
                audit.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{item.action}</p>
                      <span className="text-xs text-muted-foreground">{item.timestamp}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.username}</p>
                    {item.details && <p className="text-xs text-muted-foreground mt-1">{item.details}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  compact = false,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  hint: string;
  compact?: boolean;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className={compact ? "p-4" : "p-5"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={compact ? "text-2xl font-semibold mt-1" : "text-3xl font-semibold mt-1"}>{value}</p>
            <p className="text-xs text-muted-foreground mt-2">{hint}</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Icon className="size-5 text-blue-500" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground capitalize">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}
