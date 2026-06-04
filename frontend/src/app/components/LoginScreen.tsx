import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Camera,
  Eye,
  EyeOff,
  Fingerprint,
  Lock,
  Mail,
  MonitorDot,
  Shield,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { API_BASE } from "../lib/config";

interface LoginScreenProps {
  onLogin: (user?: unknown) => void;
}

type RoleType = "admin" | "security" | "analyst" | "manager";

type DemoRole = {
  value: RoleType;
  label: string;
  description: string;
  icon: LucideIcon;
};

const demoRoles: DemoRole[] = [
  {
    value: "admin",
    label: "Admin",
    description: "Full platform access",
    icon: Shield,
  },
  {
    value: "security",
    label: "Security Officer",
    description: "Live surveillance and alerts",
    icon: Camera,
  },
  {
    value: "analyst",
    label: "BI Analyst",
    description: "Reports and analytics",
    icon: BarChart3,
  },
  {
    value: "manager",
    label: "Manager",
    description: "Executive dashboard",
    icon: Users,
  },
];

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleType>("admin");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  function handleRoleChange(value: string) {
    const nextRole = value as RoleType;
    setRole(nextRole);
    setError("");
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email address kiritilishi kerak.");
      return;
    }

    if (!email.includes("@")) {
      setError("Email formati noto‘g‘ri.");
      return;
    }

    if (!password.trim()) {
      setError("Password kiritilishi kerak.");
      return;
    }

    if (password.length < 6) {
      setError("Password kamida 6 ta belgidan iborat bo‘lishi kerak.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          role,
          remember_me: rememberMe,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.message || "Email yoki password noto'g'ri.");
        return;
      }

      if (data.token) {
        localStorage.setItem("assbi_token", data.token);
      }

      onLogin(data.user);
    } catch {
      setError("Server bilan bog'lanib bo'lmadi. Internet yoki domenni tekshiring.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#070b1f] text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.20),transparent_32%),radial-gradient(circle_at_bottom,rgba(6,182,212,0.14),transparent_35%)]" />

      <div className="absolute inset-0 opacity-[0.14] bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <div className="absolute -top-32 -left-32 size-96 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-purple-500/20 blur-3xl" />

      <div className="relative z-10 h-screen grid grid-cols-1 xl:grid-cols-12">
        <div className="hidden xl:flex xl:col-span-7 flex-col justify-between p-8 2xl:p-10">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/25">
              <Shield className="size-7 text-white" />
            </div>

            <div>
              <h1 className="text-xl font-semibold text-white">
                ASSBI Platform
              </h1>
              <p className="text-sm text-white/60">
                AI Smart Surveillance & Business Intelligence
              </p>
            </div>
          </div>

          <div className="max-w-3xl space-y-6">
            <div className="space-y-4">
              <Badge className="bg-green-500/15 text-green-400 border border-green-500/25">
                <Wifi className="size-3.5 mr-1" />
                Secure Monitoring Workspace
              </Badge>

              <h2 className="text-4xl 2xl:text-5xl font-semibold tracking-tight text-white leading-tight max-w-3xl">
                Enterprise AI surveillance dashboard for real-time decisions.
              </h2>

              <p className="text-base text-white/65 max-w-2xl">
                Monitor cameras, detect objects, analyze risk, track people flow
                and generate BI reports from one secure platform.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-2xl">
              <FeatureCard
                icon={Camera}
                title="Live Monitoring"
                description="Multi-camera video intelligence"
              />

              <FeatureCard
                icon={Sparkles}
                title="AI Risk Scoring"
                description="Automated risk and event detection"
              />

              <FeatureCard
                icon={BarChart3}
                title="BI Analytics"
                description="Reports, trends and KPI dashboards"
              />

              <FeatureCard
                icon={ShieldCheck}
                title="Privacy Ready"
                description="Role-based access and audit control"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 max-w-3xl">
            <MiniStatus icon={Activity} label="System" value="Operational" />
            <MiniStatus icon={MonitorDot} label="Mode" value="24/7 Live" />
            <MiniStatus icon={Zap} label="AI Engine" value="Ready" />
            <MiniStatus icon={Fingerprint} label="Access" value="Secured" />
          </div>
        </div>

        <div className="xl:col-span-5 h-screen flex items-center justify-center p-4 sm:p-5 lg:p-8">
          <div className="w-full max-w-[500px]">
            <div className="xl:hidden text-center space-y-3 mb-6">
              <div className="mx-auto w-fit p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/25">
                <Shield className="size-8 text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-semibold text-white">
                  ASSBI Platform
                </h1>
                <p className="text-sm text-white/60">AI Surveillance & BI</p>
              </div>
            </div>

            <Card className="backdrop-blur-2xl bg-card/70 border-white/10 shadow-2xl shadow-black/30">
              <CardHeader className="space-y-3 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      Welcome Back
                    </CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Sign in to access your security command center.
                    </CardDescription>
                  </div>

                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <Lock className="size-5 text-blue-500" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <LoginTrustCard icon={ShieldCheck} label="Encrypted" />
                  <LoginTrustCard icon={UserCog} label="RBAC" />
                  <LoginTrustCard icon={Activity} label="Audit Log" />
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  {error && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 flex items-start gap-3">
                      <AlertTriangle className="size-5 text-red-500 mt-0.5" />
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="role" className="text-foreground/90">
                      User Role
                    </Label>

                    <Select value={role} onValueChange={handleRoleChange}>
                      <SelectTrigger id="role" className="bg-background/50 border-border/50 h-10">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {demoRoles.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>


                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground/90">
                      Email Address
                    </Label>

                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />

                      <Input
                        id="email"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 bg-background/50 border-border/50 h-10"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground/90">
                      Password
                    </Label>

                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />

                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 bg-background/50 border-border/50 h-10"
                        autoComplete="current-password"
                        required
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={rememberMe}
                        onCheckedChange={setRememberMe}
                      />
                      <span className="text-sm text-muted-foreground">
                        Remember me
                      </span>
                    </label>

                    <button
                      type="button"
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-10 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/20"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Activity className="size-4 mr-2 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4 mr-2" />
                        Sign In to Dashboard
                      </>
                    )}
                  </Button>


                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                    <span>Secured by AI-powered authentication</span>
                    <span>v2.4.1</span>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="absolute bottom-5 left-0 right-0 text-center text-xs text-white/40 pointer-events-none">
          Privacy compliant • Role-based access • Real-time AI monitoring
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
      <Icon className="size-5 text-blue-400 mb-3" />
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-sm text-white/55 mt-1">{description}</p>
    </div>
  );
}

function MiniStatus({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-3">
      <Icon className="size-4 text-green-400 mb-2" />
      <p className="text-xs text-white/45">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function LoginTrustCard({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-center">
      <Icon className="size-4 text-blue-500 mx-auto mb-1" />
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
