import { useMemo, useState } from "react";
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

interface LoginScreenProps {
  onLogin: () => void;
}

type RoleType = "admin" | "security" | "analyst" | "manager";

type DemoRole = {
  value: RoleType;
  label: string;
  email: string;
  password: string;
  description: string;
  icon: LucideIcon;
};

const demoRoles: DemoRole[] = [
  {
    value: "admin",
    label: "Admin",
    email: "admin@assbi.com",
    password: "admin123",
    description: "Full platform access",
    icon: Shield,
  },
  {
    value: "security",
    label: "Security Officer",
    email: "security@assbi.com",
    password: "security123",
    description: "Live surveillance and alerts",
    icon: Camera,
  },
  {
    value: "analyst",
    label: "BI Analyst",
    email: "analyst@assbi.com",
    password: "analyst123",
    description: "Reports and analytics",
    icon: BarChart3,
  },
  {
    value: "manager",
    label: "Manager",
    email: "manager@assbi.com",
    password: "manager123",
    description: "Executive dashboard",
    icon: Users,
  },
];

function getRoleData(role: string) {
  return demoRoles.find((item) => item.value === role) || demoRoles[0];
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState("admin@assbi.com");
  const [password, setPassword] = useState("admin123");
  const [role, setRole] = useState<RoleType>("admin");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedRole = useMemo(() => getRoleData(role), [role]);

  const formQuality = useMemo(() => {
    let score = 0;

    if (email.includes("@")) score += 35;
    if (password.length >= 6) score += 35;
    if (role) score += 20;
    if (rememberMe) score += 10;

    return score;
  }, [email, password, role, rememberMe]);

  function handleRoleChange(value: string) {
    const nextRole = value as RoleType;
    const roleData = getRoleData(nextRole);

    setRole(nextRole);
    setEmail(roleData.email);
    setPassword(roleData.password);
    setError("");
  }

  function fillDemo(roleValue: RoleType) {
    const roleData = getRoleData(roleValue);

    setRole(roleData.value);
    setEmail(roleData.email);
    setPassword(roleData.password);
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
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      onLogin();
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

      <div className="relative z-10 min-h-screen grid grid-cols-1 xl:grid-cols-12">
        <div className="hidden xl:flex xl:col-span-7 flex-col justify-between p-10 2xl:p-14">
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

          <div className="max-w-3xl space-y-8">
            <div className="space-y-5">
              <Badge className="bg-green-500/15 text-green-400 border border-green-500/25">
                <Wifi className="size-3.5 mr-1" />
                Secure Monitoring Workspace
              </Badge>

              <h2 className="text-5xl 2xl:text-6xl font-semibold tracking-tight text-white leading-tight">
                Enterprise AI surveillance dashboard for real-time decisions.
              </h2>

              <p className="text-lg text-white/65 max-w-2xl">
                Monitor cameras, detect objects, analyze risk, track people flow
                and generate BI reports from one secure platform.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-2xl">
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

          <div className="grid grid-cols-4 gap-4 max-w-3xl">
            <MiniStatus icon={Activity} label="System" value="Operational" />
            <MiniStatus icon={MonitorDot} label="Mode" value="24/7 Live" />
            <MiniStatus icon={Zap} label="AI Engine" value="Ready" />
            <MiniStatus icon={Fingerprint} label="Access" value="Secured" />
          </div>
        </div>

        <div className="xl:col-span-5 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-10">
          <div className="w-full max-w-[520px] space-y-5">
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
              <CardHeader className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-3xl bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      Welcome Back
                    </CardTitle>
                    <CardDescription className="text-base mt-2">
                      Sign in to access your security command center.
                    </CardDescription>
                  </div>

                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                    <Lock className="size-6 text-blue-500" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <LoginTrustCard icon={ShieldCheck} label="Encrypted" />
                  <LoginTrustCard icon={UserCog} label="RBAC" />
                  <LoginTrustCard icon={Activity} label="Audit Log" />
                </div>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleLogin} className="space-y-5">
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
                      <SelectTrigger
                        id="role"
                        className="bg-background/50 border-border/50 h-11"
                      >
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

                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <selectedRole.icon className="size-5 text-blue-500" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold">{selectedRole.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedRole.description}
                        </p>
                      </div>

                      <Badge className="ml-auto bg-green-500/10 text-green-500 border border-green-500/20">
                        Demo
                      </Badge>
                    </div>
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
                        placeholder="admin@assbi.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 bg-background/50 border-border/50 h-11"
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
                        className="pl-10 pr-10 bg-background/50 border-border/50 h-11"
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

                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>Login readiness</span>
                      <span>{formQuality}%</span>
                    </div>

                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${formQuality}%` }}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/20"
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

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {demoRoles.map((item) => {
                      const Icon = item.icon;
                      const active = role === item.value;

                      return (
                        <button
                          type="button"
                          key={item.value}
                          onClick={() => fillDemo(item.value)}
                          className={`rounded-xl border p-3 text-left transition ${
                            active
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-border/50 bg-muted/20 hover:border-blue-500/50"
                          }`}
                        >
                          <Icon className="size-4 text-blue-500 mb-2" />
                          <p className="text-xs font-medium">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {item.email}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                    <span>Secured by AI-powered authentication</span>
                    <span>v2.4.1</span>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="size-5 text-cyan-400 mt-0.5" />

                <div>
                  <p className="text-sm font-medium text-white">
                    Demo access enabled
                  </p>
                  <p className="text-xs text-white/55 mt-1">
                    Select any role card to auto-fill login credentials for
                    presentation and testing mode.
                  </p>
                </div>
              </div>
            </div>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <Icon className="size-6 text-blue-400 mb-4" />
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
      <Icon className="size-5 text-green-400 mb-3" />
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