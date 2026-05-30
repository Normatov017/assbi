import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Eraser,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { API_BASE as API } from "../../lib/config";

const CHAT_STORAGE_KEY = "assbi_ai_chat_history";

type Role = "assistant" | "user";
type ApiStatus = "checking" | "online" | "offline";

type Message = {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
};

type ExampleQuestion = {
  question: string;
  icon: LucideIcon;
  category: string;
};

type SummaryData = {
  kpis?: {
    active_people?: number;
    total_unique?: number;
    risk_score?: number;
    incidents?: number;
    cameras?: number;
    online_cameras?: number;
    fps?: number;
    quality?: number;
    laptops?: number;
    phones?: number;
    vehicles?: number;
    objects?: number;
  };
  cameras?: Array<{
    camera_id: string;
    site?: string;
    running?: boolean;
    active_people?: number;
    risk_score?: number;
    quality?: number;
    fps?: number;
  }>;
  incidents?: Array<{
    incident_type?: string;
    severity?: string;
    camera_id?: string;
    status?: string;
  }>;
};

const exampleQuestions: ExampleQuestion[] = [
  {
    question: "How many people are detected right now?",
    icon: Users,
    category: "People",
  },
  {
    question: "Which camera has the highest risk score?",
    icon: ShieldAlert,
    category: "Risk",
  },
  {
    question: "How many cameras are online and offline?",
    icon: Camera,
    category: "Cameras",
  },
  {
    question: "Summarize today’s incidents and alerts.",
    icon: AlertTriangle,
    category: "Incidents",
  },
  {
    question: "What is the current stream quality and FPS?",
    icon: Radio,
    category: "Health",
  },
  {
    question: "Give me an operator recommendation for the current situation.",
    icon: Sparkles,
    category: "AI Advice",
  },
];

function nowTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function numberValue(value: unknown) {
  return Number(value || 0);
}

function buildWelcomeMessage(): Message {
  return {
    id: makeId(),
    role: "assistant",
    content:
      "Hello! I am your ASSBI AI Assistant. You can ask me about people count, cameras, risk score, incidents, stream quality, FPS, detected objects and operator recommendations.",
    timestamp: nowTime(),
  };
}

function loadSavedMessages(): Message[] {
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);

    if (!saved) {
      return [buildWelcomeMessage()];
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [buildWelcomeMessage()];
    }

    return parsed
      .filter((item) => {
        return (
          item &&
          typeof item.id === "string" &&
          (item.role === "assistant" || item.role === "user") &&
          typeof item.content === "string" &&
          typeof item.timestamp === "string"
        );
      })
      .slice(-100);
  } catch {
    return [buildWelcomeMessage()];
  }
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-100)));
  } catch {
    // localStorage ishlamasa ham app buzilmasin
  }
}

function buildFallbackAnswer(question: string, summary: SummaryData | null) {
  const q = question.toLowerCase();
  const kpis = summary?.kpis || {};
  const cameras = summary?.cameras || [];
  const incidents = summary?.incidents || [];

  const totalCameras = numberValue(kpis.cameras || cameras.length);
  const onlineCameras =
    numberValue(kpis.online_cameras) ||
    cameras.filter((cam) => cam.running).length;
  const offlineCameras = Math.max(0, totalCameras - onlineCameras);

  const highestRiskCamera =
    cameras.length > 0
      ? [...cameras].sort(
          (a, b) => numberValue(b.risk_score) - numberValue(a.risk_score)
        )[0]
      : null;

  if (q.includes("people") || q.includes("person")) {
    return `Current active people: ${numberValue(
      kpis.active_people
    )}. Total unique people: ${numberValue(kpis.total_unique)}.`;
  }

  if (q.includes("risk")) {
    return `Current platform risk score is ${numberValue(
      kpis.risk_score
    ).toFixed(0)}%. Highest risk camera: ${
      highestRiskCamera?.site || highestRiskCamera?.camera_id || "N/A"
    }.`;
  }

  if (q.includes("camera") || q.includes("online") || q.includes("offline")) {
    return `Camera status: ${onlineCameras} online and ${offlineCameras} offline. Total configured cameras: ${totalCameras}.`;
  }

  if (q.includes("incident") || q.includes("alert")) {
    return `Current incident count: ${numberValue(
      kpis.incidents || incidents.length
    )}. Open incidents should be reviewed from the Anomaly Detection page.`;
  }

  if (q.includes("quality") || q.includes("fps") || q.includes("stream")) {
    return `Current stream quality: ${numberValue(
      kpis.quality
    ).toFixed(0)}%. Processing FPS: ${numberValue(kpis.fps).toFixed(1)}.`;
  }

  if (q.includes("object") || q.includes("laptop") || q.includes("phone")) {
    return `Detected objects summary: laptops ${numberValue(
      kpis.laptops
    )}, phones ${numberValue(kpis.phones)}, vehicles ${numberValue(
      kpis.vehicles
    )}, other objects ${numberValue(kpis.objects)}.`;
  }

  if (
    q.includes("recommend") ||
    q.includes("advice") ||
    q.includes("what should")
  ) {
    const risk = numberValue(kpis.risk_score);

    if (offlineCameras > 0) {
      return "Recommendation: Some cameras are offline. Check camera source links, backend detector process and camera configuration first.";
    }

    if (risk >= 70) {
      return "Recommendation: High risk is detected. Open Live Surveillance, review the highest-risk camera and check Anomaly Detection incidents.";
    }

    return "Recommendation: System looks stable. Continue normal monitoring and keep camera quality/FPS under observation.";
  }

  return "I can answer questions about people count, cameras, incidents, risk, stream quality, FPS and detected objects. Try asking: “Which camera has the highest risk?”";
}

export default function AIChatbot() {
  const [messages, setMessages] = useState<Message[]>(() =>
    loadSavedMessages()
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [copiedId, setCopiedId] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const systemStatus = useMemo(() => {
    if (apiStatus === "online") {
      return {
        label: "Live DB",
        className: "bg-green-500 text-white",
        icon: Wifi,
      };
    }

    if (apiStatus === "checking") {
      return {
        label: "Checking",
        className: "bg-yellow-500 text-black",
        icon: Radio,
      };
    }

    return {
      label: "Fallback Mode",
      className: "bg-red-500 text-white",
      icon: WifiOff,
    };
  }, [apiStatus]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/summary`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Summary API ${res.status}`);
      }

      const data = await res.json();

      setSummary(data || {});
      setApiStatus("online");
    } catch (error) {
      console.error("AI Chatbot summary error:", error);
      setApiStatus("offline");
    }
  }, []);

  useEffect(() => {
    loadSummary();

    const timer = window.setInterval(loadSummary, 5000);

    return () => window.clearInterval(timer);
  }, [loadSummary]);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

  async function handleSend(customText?: string) {
    const userText = (customText || input).trim();

    if (!userText || loading) return;

    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content: userText,
      timestamp: nowTime(),
    };

    setMessages((prev) => [...prev, userMessage].slice(-100));
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userText,
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat API ${res.status}`);
      }

      const data = await res.json();

      const assistantMessage: Message = {
        id: makeId(),
        role: "assistant",
        content:
          data.reply || data.answer || buildFallbackAnswer(userText, summary),
        timestamp: nowTime(),
      };

      setMessages((prev) => [...prev, assistantMessage].slice(-100));
      setApiStatus("online");
    } catch (error) {
      console.error("AI Chat API error:", error);

      const assistantMessage: Message = {
        id: makeId(),
        role: "assistant",
        content: buildFallbackAnswer(userText, summary),
        timestamp: nowTime(),
      };

      setMessages((prev) => [...prev, assistantMessage].slice(-100));
      setApiStatus("offline");
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    const freshMessages = [buildWelcomeMessage()];

    setMessages(freshMessages);
    setInput("");
    setCopiedId("");

    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      setCopiedId("");
    }
  }

  const StatusIcon = systemStatus.icon;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold text-foreground">
              AI Chatbot Assistant
            </h1>

            <Badge className={systemStatus.className}>
              <StatusIcon className="size-3.5 mr-1" />
              {systemStatus.label}
            </Badge>

            <Badge variant="outline">
              <Clock className="size-3.5 mr-1" />
              {new Date().toLocaleTimeString()}
            </Badge>

            <Badge variant="outline">{messages.length} saved messages</Badge>
          </div>

          <p className="text-muted-foreground max-w-3xl">
            Ask natural language questions about surveillance analytics, camera
            health, incidents, objects and operational risk. Chat history is
            saved locally like a simple Telegram-style conversation.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={loadSummary}>
            <RefreshCw className="size-4 mr-2" />
            Refresh Context
          </Button>

          <Button variant="outline" onClick={clearChat}>
            <Eraser className="size-4 mr-2" />
            Clear Chat
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <Card className="xl:col-span-9 border-border/50 overflow-hidden">
          <CardHeader className="border-b border-border/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-5 text-blue-500" />
                ASSBI AI Assistant
              </CardTitle>

              <div className="flex flex-wrap gap-2">
                <Badge className={systemStatus.className}>
                  {systemStatus.label}
                </Badge>

                <Badge variant="outline">{messages.length} messages</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-[620px]">
              <div className="p-5 space-y-5">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex gap-3 max-w-[88%] ${
                        message.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${
                          message.role === "user"
                            ? "bg-blue-500 text-white"
                            : "bg-purple-500/10 border border-purple-500/20 text-purple-500"
                        }`}
                      >
                        {message.role === "user" ? (
                          <Users className="size-4" />
                        ) : (
                          <Bot className="size-4" />
                        )}
                      </div>

                      <div
                        className={`rounded-2xl px-4 py-3 border ${
                          message.role === "user"
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-muted/40 text-foreground border-border/50"
                        }`}
                      >
                        <p className="whitespace-pre-line text-sm leading-relaxed">
                          {message.content}
                        </p>

                        <div className="flex items-center justify-between gap-3 mt-3">
                          <p className="text-xs opacity-70">
                            {message.timestamp}
                          </p>

                          {message.role === "assistant" && (
                            <button
                              type="button"
                              onClick={() => copyMessage(message)}
                              className="text-xs opacity-70 hover:opacity-100 flex items-center gap-1"
                            >
                              {copiedId === message.id ? (
                                <>
                                  <CheckCircle2 className="size-3" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3" />
                                  Copy
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[80%]">
                      <div className="size-9 rounded-xl flex items-center justify-center shrink-0 bg-purple-500/10 border border-purple-500/20 text-purple-500">
                        <Bot className="size-4" />
                      </div>

                      <div className="rounded-2xl px-4 py-3 border bg-muted/40 border-border/50">
                        <div className="flex items-center gap-2 text-sm">
                          <RefreshCw className="size-4 animate-spin text-blue-500" />
                          Thinking with live surveillance context...
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border/50 p-4 space-y-3">
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about people, risk, incidents, cameras, objects, FPS..."
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 pr-14 outline-none focus:ring-2 focus:ring-blue-500/30"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />

                <Button
                  size="icon"
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  className="absolute right-3 bottom-3"
                >
                  <Send className="size-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Press Enter to send, Shift + Enter for new line</span>
                <span>{input.length}/1000</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="xl:col-span-3 space-y-5">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-purple-500" />
                Suggested Questions
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {exampleQuestions.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.question}
                    onClick={() => handleSend(item.question)}
                    disabled={loading}
                    className="w-full text-left p-4 rounded-xl border border-border/50 hover:border-blue-500/50 hover:bg-blue-500/10 transition disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className="size-4 text-blue-500" />
                      <Badge variant="outline">{item.category}</Badge>
                    </div>

                    <p className="text-sm leading-relaxed">{item.question}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-5 text-blue-500" />
                Chat Memory
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Saved messages</p>
                <p className="text-3xl font-semibold mt-1">{messages.length}</p>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Storage</p>
                <p className="font-semibold mt-1">Local Browser</p>
                <p className="text-xs text-muted-foreground mt-1">
                  History remains after refresh until Clear Chat is pressed.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
