import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Language = "uz" | "ru" | "en";

type Dictionary = Record<string, Record<Language, string>>;

const LANG_KEY = "assbi_language";

const dictionary: Dictionary = {
  "common.checkingSession": {
    uz: "Xavfsiz sessiya tekshirilmoqda...",
    ru: "Проверка защищенной сессии...",
    en: "Checking secure session...",
  },
  "common.refresh": { uz: "Yangilash", ru: "Обновить", en: "Refresh" },
  "common.online": { uz: "Online", ru: "Онлайн", en: "Online" },
  "common.offline": { uz: "Offline", ru: "Офлайн", en: "Offline" },
  "common.good": { uz: "Yaxshi", ru: "Хорошо", en: "Good" },
  "common.live": { uz: "Jonli", ru: "Live", en: "Live" },
  "common.search": {
    uz: "Kamera, hisobot, alert qidirish...",
    ru: "Поиск камер, отчетов, уведомлений...",
    en: "Search cameras, reports, alerts...",
  },
  "brand.subtitle": {
    uz: "AI kuzatuv va BI",
    ru: "AI наблюдение и BI",
    en: "AI Surveillance & BI",
  },
  "layout.systemHealth": {
    uz: "Tizim holati",
    ru: "Состояние системы",
    en: "System Health",
  },
  "layout.operational": { uz: "Ishlayapti", ru: "Работает", en: "Operational" },
  "layout.monitoring": { uz: "Monitoring", ru: "Мониторинг", en: "Monitoring" },
  "layout.intelligence": { uz: "Analitika", ru: "Аналитика", en: "Intelligence" },
  "layout.platform": { uz: "Platforma", ru: "Платформа", en: "Platform" },
  "layout.allSystems": {
    uz: "Barcha tizimlar ishlayapti",
    ru: "Все системы работают",
    en: "All Systems Operational",
  },
  "layout.adminUser": { uz: "Admin foydalanuvchi", ru: "Администратор", en: "Admin User" },
  "layout.administrator": { uz: "Administrator", ru: "Администратор", en: "Administrator" },
  "layout.notifications": { uz: "Bildirishnomalar", ru: "Уведомления", en: "Notifications" },
  "layout.profile": { uz: "Profil", ru: "Профиль", en: "Profile" },
  "layout.settings": { uz: "Sozlamalar", ru: "Настройки", en: "Settings" },
  "layout.security": { uz: "Xavfsizlik", ru: "Безопасность", en: "Security" },
  "layout.session": { uz: "Sessiya", ru: "Сессия", en: "Session" },
  "layout.activeAccess": {
    uz: "Faol administrator kirishi",
    ru: "Активный доступ администратора",
    en: "Active administrator access",
  },
  "layout.logout": { uz: "Chiqish", ru: "Выйти", en: "Logout" },
  "nav.dashboard": { uz: "Dashboard", ru: "Панель", en: "Dashboard" },
  "nav.live": { uz: "Live kuzatuv", ru: "Live наблюдение", en: "Live Surveillance" },
  "nav.crowd": { uz: "Odamlar analitikasi", ru: "Аналитика толпы", en: "Crowd Analytics" },
  "nav.objects": { uz: "Object detection", ru: "Детекция объектов", en: "Object Detection" },
  "nav.anomalies": { uz: "Anomaliya detection", ru: "Детекция аномалий", en: "Anomaly Detection" },
  "nav.predictive": { uz: "Prognoz analitika", ru: "Прогнозная аналитика", en: "Predictive Analytics" },
  "nav.reports": { uz: "Hisobotlar", ru: "Отчеты", en: "Reports" },
  "nav.chatbot": { uz: "AI chatbot", ru: "AI чатбот", en: "AI Chatbot" },
  "nav.settings": { uz: "Sozlamalar", ru: "Настройки", en: "Settings" },
  "dashboard.title": { uz: "ASSBI Ultra Dashboard", ru: "ASSBI Ultra Панель", en: "ASSBI Ultra Dashboard" },
  "dashboard.subtitle": {
    uz: "Kameralar, risk, odamlar oqimi va AI monitoring holatini bir joyda boshqaring.",
    ru: "Управляйте камерами, рисками, потоком людей и AI-мониторингом в одном месте.",
    en: "Manage cameras, risk, people flow and AI monitoring health in one place.",
  },
  "dashboard.livePeople": { uz: "Live odamlar", ru: "Людей сейчас", en: "Live People" },
  "dashboard.todayVisitors": { uz: "Bugungi kirganlar", ru: "Посетители сегодня", en: "Today Visitors" },
  "dashboard.totalUnique": { uz: "Umumiy unique", ru: "Всего уникальных", en: "Total Unique" },
  "dashboard.camerasOnline": { uz: "Online kameralar", ru: "Камеры онлайн", en: "Cameras Online" },
  "dashboard.riskScore": { uz: "Risk ball", ru: "Оценка риска", en: "Risk Score" },
  "dashboard.objects": { uz: "Obyektlar", ru: "Объекты", en: "Objects" },
  "dashboard.incidents": { uz: "Hodisalar", ru: "Инциденты", en: "Incidents" },
  "dashboard.processingFps": { uz: "Processing FPS", ru: "FPS обработки", en: "Processing FPS" },
  "dashboard.dataQuality": { uz: "Data sifati", ru: "Качество данных", en: "Data Quality" },
  "dashboard.currentLive": { uz: "Hozirgi live son", ru: "Текущее live число", en: "Current live count" },
  "dashboard.enteredToday": { uz: "Bugun kirganlar", ru: "Вошли сегодня", en: "Entered today" },
  "dashboard.seenSinceStart": {
    uz: "Detector boshlangandan beri",
    ru: "С запуска детектора",
    en: "Seen since detector start",
  },
  "dashboard.needAttention": { uz: "e'tibor kerak", ru: "требуют внимания", en: "need attention" },
  "dashboard.peopleTrend": {
    uz: "Odamlar, risk va sifat trendi",
    ru: "Тренд людей, риска и качества",
    en: "People, Risk & Quality Trend",
  },
  "dashboard.peopleTrendDesc": {
    uz: "Odamlar oqimi, operatsion risk va stream sifati asosiy trendi.",
    ru: "Основной тренд потока людей, операционного риска и качества потока.",
    en: "Main trend line for people flow, operational risk and stream quality.",
  },
  "dashboard.platformScore": { uz: "Platforma balli", ru: "Оценка платформы", en: "Platform Score" },
  "dashboard.uptimeScore": { uz: "Uptime ball", ru: "Оценка uptime", en: "Uptime Score" },
  "dashboard.riskControl": { uz: "Risk nazorati", ru: "Контроль риска", en: "Risk Control" },
  "dashboard.platformControlScore": {
    uz: "Platforma nazorat balli",
    ru: "Контрольная оценка платформы",
    en: "Platform Control Score",
  },
  "dashboard.operationalScore": { uz: "Operatsion ball", ru: "Операционная оценка", en: "Operational score" },
  "dashboard.cameraHealth": { uz: "Kamera holati", ru: "Состояние камер", en: "Camera Health" },
  "dashboard.objectBreakdown": { uz: "Obyektlar taqsimoti", ru: "Разбивка объектов", en: "Object Breakdown" },
  "dashboard.postureAnalytics": { uz: "Holat analitikasi", ru: "Аналитика поз", en: "Posture Analytics" },
  "dashboard.deviceAwareness": { uz: "Qurilmalar nazorati", ru: "Контроль устройств", en: "Device Awareness" },
};

const languageNames: Record<Language, string> = {
  uz: "UZ",
  ru: "RU",
  en: "EN",
};

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
  languageNames: Record<Language, string>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): Language {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "uz" || saved === "ru" || saved === "en") return saved;
  return "uz";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const value = useMemo<I18nContextValue>(() => {
    function setLanguage(nextLanguage: Language) {
      localStorage.setItem(LANG_KEY, nextLanguage);
      setLanguageState(nextLanguage);
    }

    function t(key: string) {
      return dictionary[key]?.[language] || dictionary[key]?.en || key;
    }

    return { language, setLanguage, t, languageNames };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage, languageNames } = useI18n();

  return (
    <div className="flex items-center rounded-xl border border-border/50 bg-background/60 p-1">
      {(["uz", "ru", "en"] as Language[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition ${
            language === item
              ? "bg-blue-500 text-white"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          {languageNames[item]}
        </button>
      ))}
    </div>
  );
}
