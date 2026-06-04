import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Command,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MonitorDot,
  Moon,
  ScanSearch,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  TrendingUp,
  User,
  Users,
  Video,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { API_BASE } from "../lib/config";
import { LanguageSwitcher, useI18n } from "../lib/i18n";

type NavItem = {
  name: string;
  labelKey: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  group: "core" | "intelligence" | "system";
};

type NotificationType = "critical" | "warning" | "info" | "success";

type NotificationItem = {
  id: string;
  title: string;
  text: string;
  time: string;
  type: NotificationType;
  icon: LucideIcon;
  path: string;
  read: boolean;
};

const navigation: NavItem[] = [
  {
    name: "Dashboard",
    labelKey: "nav.dashboard",
    path: "/",
    icon: LayoutDashboard,
    group: "core",
  },
  {
    name: "Live Surveillance",
    labelKey: "nav.live",
    path: "/surveillance",
    icon: Video,
    badge: "LIVE",
    group: "core",
  },
  {
    name: "Crowd Analytics",
    labelKey: "nav.crowd",
    path: "/crowd",
    icon: Users,
    group: "intelligence",
  },
  {
    name: "Object Detection",
    labelKey: "nav.objects",
    path: "/objects",
    icon: ScanSearch,
    group: "intelligence",
  },
  {
    name: "Fine-tuning",
    labelKey: "nav.fineTuning",
    path: "/fine-tuning",
    icon: BrainCircuit,
    group: "intelligence",
  },
  {
    name: "Anomaly Detection",
    labelKey: "nav.anomalies",
    path: "/anomalies",
    icon: AlertTriangle,
    badge: "3",
    group: "intelligence",
  },
  {
    name: "Predictive Analytics",
    labelKey: "nav.predictive",
    path: "/predictive",
    icon: TrendingUp,
    group: "intelligence",
  },
  {
    name: "Reports",
    labelKey: "nav.reports",
    path: "/reports",
    icon: FileText,
    group: "system",
  },
  {
    name: "Evaluation & Governance",
    labelKey: "nav.evaluation",
    path: "/evaluation",
    icon: ShieldCheck,
    group: "system",
  },
  {
    name: "AI Chatbot",
    labelKey: "nav.chatbot",
    path: "/chatbot",
    icon: MessageSquare,
    group: "system",
  },
  {
    name: "Settings",
    labelKey: "nav.settings",
    path: "/settings",
    icon: Settings,
    group: "system",
  },
];

const initialNotifications: NotificationItem[] = [
  {
    id: "critical-alert",
    title: "layout.criticalAlert",
    text: "layout.criticalAlertText",
    time: "2 minutes ago",
    type: "critical",
    icon: AlertTriangle,
    path: "/anomalies",
    read: false,
  },
  {
    id: "camera-offline",
    title: "layout.cameraOffline",
    text: "layout.cameraOfflineText",
    time: "15 minutes ago",
    type: "warning",
    icon: Camera,
    path: "/surveillance",
    read: false,
  },
  {
    id: "system-update",
    title: "layout.systemUpdate",
    text: "layout.systemUpdateText",
    time: "1 hour ago",
    type: "info",
    icon: Activity,
    path: "/",
    read: false,
  },
];

function getGroupTitleKey(group: NavItem["group"]) {
  if (group === "core") return "layout.monitoring";
  if (group === "intelligence") return "layout.intelligence";
  return "layout.platform";
}

function isRouteActive(currentPath: string, itemPath: string) {
  if (itemPath === "/") return currentPath === "/";
  return currentPath.startsWith(itemPath);
}

function notificationStyle(type: NotificationType) {
  if (type === "critical") {
    return {
      card: "bg-red-500/10 border-red-500/25 hover:bg-red-500/15",
      icon: "text-red-500",
      title: "text-red-500",
    };
  }

  if (type === "warning") {
    return {
      card: "bg-yellow-500/10 border-yellow-500/25 hover:bg-yellow-500/15",
      icon: "text-yellow-500",
      title: "text-yellow-500",
    };
  }

  if (type === "success") {
    return {
      card: "bg-green-500/10 border-green-500/25 hover:bg-green-500/15",
      icon: "text-green-500",
      title: "text-green-500",
    };
  }

  return {
    card: "bg-blue-500/10 border-blue-500/25 hover:bg-blue-500/15",
    icon: "text-blue-500",
    title: "text-blue-500",
  };
}

function clearLoginStorage() {
  try {
    localStorage.removeItem("assbi_user");
    localStorage.removeItem("assbi_auth");
    localStorage.removeItem("assbi_token");
    localStorage.removeItem("auth_token");
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

export default function DashboardLayout() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("assbi_theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [now, setNow] = useState(new Date());

  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notificationRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("assbi_theme", theme);
    } catch {
      // ignore storage failures
    }
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      const clickedNotification =
        notificationRef.current && notificationRef.current.contains(target);

      const clickedProfile =
        profileRef.current && profileRef.current.contains(target);

      if (!clickedNotification) {
        setNotificationsOpen(false);
      }

      if (!clickedProfile) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const unreadNotifications = useMemo(() => {
    return notifications.filter((item) => !item.read).length;
  }, [notifications]);

  const groupedNavigation = useMemo(() => {
    return navigation.reduce<Record<NavItem["group"], NavItem[]>>(
      (groups, item) => {
        groups[item.group].push(item);
        return groups;
      },
      {
        core: [],
        intelligence: [],
        system: [],
      }
    );
  }, []);

  const currentPage = useMemo(() => {
    return (
      navigation.find((item) => isRouteActive(location.pathname, item.path)) ||
      navigation[0]
    );
  }, [location.pathname]);

  const CurrentPageIcon = currentPage.icon;

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const query = searchValue.trim().toLowerCase();

    if (!query) return;

    if (query.includes("setting")) {
      navigate("/settings");
    } else if (query.includes("live") || query.includes("camera")) {
      navigate("/surveillance");
    } else if (query.includes("report")) {
      navigate("/reports");
    } else if (query.includes("anomaly") || query.includes("alert")) {
      navigate("/anomalies");
    } else if (query.includes("object")) {
      navigate("/objects");
    } else if (query.includes("crowd")) {
      navigate("/crowd");
    } else if (query.includes("chat") || query.includes("assistant")) {
      navigate("/chatbot");
    } else if (query.includes("predict")) {
      navigate("/predictive");
    } else {
      navigate("/");
    }

    setSearchValue("");
  }

  function openNotification(item: NotificationItem) {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === item.id
          ? {
              ...notification,
              read: true,
            }
          : notification
      )
    );

    setNotificationsOpen(false);
    navigate(item.path);
  }

  function markAllNotificationsRead() {
    setNotifications((prev) =>
      prev.map((item) => ({
        ...item,
        read: true,
      }))
    );
  }

  function clearNotifications() {
    setNotifications([]);
    setNotificationsOpen(false);
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Clear local state even when the network request fails.
    }

    clearLoginStorage();
    window.location.reload();
  }

  const sidebar = (
    <aside
      className={`${
        sidebarOpen ? "w-72" : "w-20"
      } h-full flex-shrink-0 bg-card/95 text-foreground backdrop-blur-xl border-r border-border/50 flex flex-col transition-all duration-300`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-border/50">
        {sidebarOpen ? (
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 min-w-0 text-left"
          >
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20">
              <Shield className="size-5 text-white" />
            </div>

            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">
                ASSBI Platform
              </h1>
              <p className="text-[10px] text-muted-foreground truncate">
                {t("brand.subtitle")}
              </p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 mx-auto shadow-lg shadow-blue-500/20"
          >
            <Shield className="size-5 text-white" />
          </button>
        )}
      </div>

      <div className="px-3 py-4 border-b border-border/50">
        {sidebarOpen ? (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("layout.systemHealth")}</p>
                <p className="text-sm font-semibold text-green-500">
                  {t("layout.operational")}
                </p>
              </div>

              <div className="p-2 rounded-xl bg-green-500/10">
                <Wifi className="size-4 text-green-500 animate-pulse" />
              </div>
            </div>

            <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-[92%] rounded-full bg-green-500" />
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
              <Wifi className="size-4 text-green-500 animate-pulse" />
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
        {(Object.keys(groupedNavigation) as NavItem["group"][]).map((group) => (
          <div key={group} className="space-y-1">
            {sidebarOpen && (
              <p className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t(getGroupTitleKey(group))}
              </p>
            )}

            {groupedNavigation[group].map((item) => {
              const isActive = isRouteActive(location.pathname, item.path);
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={!sidebarOpen ? t(item.labelKey) : undefined}
                  className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-white/80" />
                  )}

                  <Icon className="size-5 flex-shrink-0" />

                  {sidebarOpen && (
                    <>
                      <span className="text-sm truncate flex-1 text-left">
                        {t(item.labelKey)}
                      </span>

                      {item.badge && (
                        <Badge
                          className={
                            item.badge === "LIVE"
                              ? "bg-red-500 text-white text-[10px]"
                              : "bg-yellow-500 text-black text-[10px]"
                          }
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border/50 space-y-3">
        {sidebarOpen && (
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <Bot className="size-4 text-blue-500" />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {t("layout.aiAssistant")}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {t("layout.readyForAnalysis")}
                </p>
              </div>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-full justify-center text-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {sidebarOpen ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      <div className="hidden lg:block h-full">{sidebar}</div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileSidebarOpen(false)}
          />

          <div className="absolute left-0 top-0 h-full">
            <aside className="w-72 h-full bg-card text-foreground border-r border-border/50 flex flex-col">
              <div className="h-16 flex items-center justify-between px-4 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                    <Shield className="size-5 text-white" />
                  </div>

                  <div>
                    <h1 className="text-sm font-semibold text-foreground">
                      ASSBI Platform
                    </h1>
                    <p className="text-[10px] text-muted-foreground">
                      {t("brand.subtitle")}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <X className="size-5" />
                </Button>
              </div>

              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navigation.map((item) => {
                  const isActive = isRouteActive(location.pathname, item.path);
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <Icon className="size-5" />
                      <span className="text-sm">{t(item.labelKey)}</span>

                      {item.badge && (
                        <Badge
                          className={
                            item.badge === "LIVE"
                              ? "ml-auto bg-red-500 text-white text-[10px]"
                              : "ml-auto bg-yellow-500 text-black text-[10px]"
                          }
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="h-16 bg-card/95 text-foreground backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="size-5" />
            </Button>

            <div className="hidden md:flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <CurrentPageIcon className="size-5 text-blue-500" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {t(currentPage.labelKey)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {t("layout.workspace")}
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSearchSubmit}
              className="relative w-full max-w-xl ml-0 md:ml-4"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />

              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder={t("common.search")}
                className="pl-10 pr-10 bg-background/60 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground"
              />

              <Command className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hidden lg:block" />
            </form>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
              <Activity className="size-3 text-green-500 animate-pulse" />
              <span className="text-xs text-green-500 font-medium">
                {t("layout.allSystems")}
              </span>
            </div>

            <div className="hidden 2xl:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/50 bg-muted/20">
              <MonitorDot className="size-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">
                24/7 Monitoring
              </span>
            </div>

            <LanguageSwitcher />

            <Button
              variant="outline"
              size="icon"
              title={theme === "dark" ? t("layout.lightMode") : t("layout.darkMode")}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="border-border/50 bg-muted/20 text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <div className="text-sm text-muted-foreground hidden xl:block min-w-[210px] text-right">
              {now.toLocaleDateString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              ,{" "}
              {now.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>

            <div className="relative" ref={notificationRef}>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setProfileOpen(false);
                }}
              >
                <Bell className="size-5" />

                {unreadNotifications > 0 && (
                  <Badge className="absolute -top-1 -right-1 size-5 flex items-center justify-center p-0 bg-red-500 text-white text-[10px]">
                    {unreadNotifications}
                  </Badge>
                )}
              </Button>

              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-[9999] w-96 rounded-2xl border border-border/60 bg-card text-foreground shadow-2xl p-3">
                  <div className="flex items-center justify-between gap-3 px-2 pb-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {t("layout.notifications")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {unreadNotifications} unread alerts
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={markAllNotificationsRead}
                      className="text-foreground"
                    >
                      Mark read
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground">
                        <CheckCircle2 className="size-8 mx-auto mb-2 text-green-500" />
                        <p className="text-sm font-medium text-foreground">
                          No notifications
                        </p>
                        <p className="text-xs mt-1 text-muted-foreground">
                          Everything looks clear.
                        </p>
                      </div>
                    ) : (
                      notifications.map((item) => {
                        const Icon = item.icon;
                        const styles = notificationStyle(item.type);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openNotification(item)}
                            className={`w-full text-left p-3 rounded-xl border transition ${styles.card}`}
                          >
                            <div className="flex items-start gap-3">
                              <Icon
                                className={`size-4 mt-0.5 ${styles.icon}`}
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <p
                                    className={`text-sm font-medium ${styles.title}`}
                                  >
                                    {t(item.title)}
                                  </p>

                                  {!item.read && (
                                    <span className="size-2 rounded-full bg-red-500 flex-shrink-0" />
                                  )}
                                </div>

                                <p className="text-xs text-muted-foreground mt-1">
                                  {t(item.text)}
                                </p>

                                <p className="text-[10px] text-muted-foreground mt-2">
                                  {item.time}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-border/50">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigate("/anomalies");
                        setNotificationsOpen(false);
                      }}
                      className="text-foreground"
                    >
                      View alerts
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearNotifications}
                      className="text-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={profileRef}>
              <Button
                variant="ghost"
                className="gap-2 px-2 lg:px-3 text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setProfileOpen((prev) => !prev);
                  setNotificationsOpen(false);
                }}
              >
                <Avatar className="size-8">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                    AD
                  </AvatarFallback>
                </Avatar>

                <div className="text-left hidden lg:block">
                  <p className="text-sm font-medium text-foreground">
                    {t("layout.adminUser")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("layout.administrator")}
                  </p>
                </div>
              </Button>

              {profileOpen && (
                <div className="absolute right-0 top-12 z-[9999] w-72 rounded-2xl border border-border/60 bg-card text-foreground shadow-2xl p-3">
                  <div className="flex items-center gap-3 p-2">
                    <Avatar className="size-11">
                      <AvatarImage src="" />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm">
                        AD
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <p className="font-semibold truncate text-foreground">
                        {t("layout.adminUser")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        admin@assbi.local
                      </p>
                    </div>
                  </div>

                  <div className="my-3 border-t border-border/50" />

                  <button
                    onClick={() => {
                      navigate("/settings");
                      setProfileOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground hover:bg-accent hover:text-accent-foreground text-left transition"
                  >
                    <User className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{t("layout.profile")}</span>
                  </button>

                  <button
                    onClick={() => {
                      navigate("/settings");
                      setProfileOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground hover:bg-accent hover:text-accent-foreground text-left transition"
                  >
                    <Settings className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{t("layout.settings")}</span>
                  </button>

                  <button
                    onClick={() => {
                      navigate("/settings");
                      setProfileOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground hover:bg-accent hover:text-accent-foreground text-left transition"
                  >
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{t("layout.security")}</span>
                  </button>

                  <div className="my-3 border-t border-border/50" />

                  <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-3 mb-3">
                    <p className="text-xs text-muted-foreground">{t("layout.session")}</p>
                    <p className="text-sm font-semibold text-green-500">
                      {t("layout.activeAccess")}
                    </p>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 text-left transition"
                  >
                    <LogOut className="size-4" />
                    <span className="text-sm font-medium">{t("layout.logout")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_30%)]">
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
