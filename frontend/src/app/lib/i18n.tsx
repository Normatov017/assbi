import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  "common.issue": { uz: "Muammo", ru: "Проблема", en: "Issue" },
  "common.check": { uz: "Tekshirish", ru: "Проверить", en: "Check" },
  "common.stable": { uz: "Barqaror", ru: "Стабильно", en: "Stable" },
  "common.live": { uz: "Jonli", ru: "Live", en: "Live" },
  "common.today": { uz: "Bugun", ru: "Сегодня", en: "Today" },
  "common.week": { uz: "Hafta", ru: "Неделя", en: "Week" },
  "common.low": { uz: "Past", ru: "Низкий", en: "Low" },
  "common.medium": { uz: "O‘rtacha", ru: "Средний", en: "Medium" },
  "common.high": { uz: "Yuqori", ru: "Высокий", en: "High" },
  "common.risk": { uz: "Risk", ru: "Риск", en: "Risk" },
  "common.quality": { uz: "Sifat", ru: "Качество", en: "Quality" },
  "common.status": { uz: "Holat", ru: "Статус", en: "Status" },
  "common.camera": { uz: "Kamera", ru: "Камера", en: "Camera" },
  "common.people": { uz: "Odamlar", ru: "Люди", en: "People" },
  "common.objects": { uz: "Obyektlar", ru: "Объекты", en: "Objects" },
  "common.obj": { uz: "Obj", ru: "Объ", en: "Obj" },
  "common.source": { uz: "Manba", ru: "Источник", en: "Source" },
  "common.type": { uz: "Tur", ru: "Тип", en: "Type" },
  "common.severity": { uz: "Daraja", ru: "Важность", en: "Severity" },
  "common.message": { uz: "Xabar", ru: "Сообщение", en: "Message" },
  "common.name": { uz: "Nomi", ru: "Имя", en: "Name" },
  "common.filter": { uz: "Filter", ru: "Фильтр", en: "Filter" },
  "common.sort": { uz: "Saralash", ru: "Сортировка", en: "Sort" },
  "common.yes": { uz: "Ha", ru: "Да", en: "Yes" },
  "common.no": { uz: "Yo‘q", ru: "Нет", en: "No" },
  "common.selected": { uz: "Tanlangan", ru: "Выбрано", en: "Selected" },
  "common.allCameras": { uz: "Barcha kameralar", ru: "Все камеры", en: "All Cameras" },
  "common.highRisk": { uz: "Yuqori risk", ru: "Высокий риск", en: "High Risk" },
  "common.lowQuality": { uz: "Past sifat", ru: "Низкое качество", en: "Low Quality" },
  "common.activeCameras": { uz: "Faol kameralar", ru: "Активные камеры", en: "Active cameras" },
  "common.needAttention": { uz: "E’tibor kerak", ru: "Требует внимания", en: "Need attention" },
  "common.minutesAgo": { uz: "min oldin", ru: "мин назад", en: "min ago" },
  "common.now": { uz: "hozir", ru: "сейчас", en: "now" },
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
  "layout.lightMode": { uz: "Light rejim", ru: "Светлая тема", en: "Light mode" },
  "layout.darkMode": { uz: "Dark rejim", ru: "Темная тема", en: "Dark mode" },
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
  "layout.workspace": {
    uz: "Korxona monitoring muhiti",
    ru: "Рабочая среда мониторинга",
    en: "Enterprise monitoring workspace",
  },
  "layout.aiAssistant": { uz: "AI yordamchi", ru: "AI ассистент", en: "AI Assistant" },
  "layout.readyForAnalysis": { uz: "Tahlilga tayyor", ru: "Готов к анализу", en: "Ready for analysis" },
  "layout.criticalAlert": { uz: "Kritik ogohlantirish", ru: "Критическое уведомление", en: "Critical Alert" },
  "layout.criticalAlertText": {
    uz: "Anomaliya monitoring markazida yuqori risk aniqlandi.",
    ru: "В центре мониторинга аномалий обнаружен высокий риск.",
    en: "High risk detected in anomaly monitoring center.",
  },
  "layout.cameraOffline": { uz: "Kamera offline", ru: "Камера офлайн", en: "Camera Offline" },
  "layout.cameraOfflineText": {
    uz: "Bitta kamera manbasi javob bermayapti.",
    ru: "Один источник камеры не отвечает.",
    en: "One camera source is not responding.",
  },
  "layout.systemUpdate": { uz: "Tizim yangilandi", ru: "Обновление системы", en: "System Update" },
  "layout.systemUpdateText": {
    uz: "AI analitika xulosasi muvaffaqiyatli yangilandi.",
    ru: "Сводка AI-аналитики успешно обновлена.",
    en: "AI analytics summary refreshed successfully.",
  },
  "nav.dashboard": { uz: "Dashboard", ru: "Панель", en: "Dashboard" },
  "nav.live": { uz: "Live kuzatuv", ru: "Live наблюдение", en: "Live Surveillance" },
  "nav.crowd": { uz: "Odamlar analitikasi", ru: "Аналитика толпы", en: "Crowd Analytics" },
  "nav.objects": { uz: "Object detection", ru: "Детекция объектов", en: "Object Detection" },
  "nav.fineTuning": { uz: "Fine-tuning", ru: "Fine-tuning", en: "Fine-tuning" },
  "nav.anomalies": { uz: "Anomaliya detection", ru: "Детекция аномалий", en: "Anomaly Detection" },
  "nav.predictive": { uz: "Prognoz analitika", ru: "Прогнозная аналитика", en: "Predictive Analytics" },
  "nav.reports": { uz: "Hisobotlar", ru: "Отчеты", en: "Reports" },
  "nav.chatbot": { uz: "AI chatbot", ru: "AI чатбот", en: "AI Chatbot" },
  "nav.evaluation": { uz: "Baholash va nazorat", ru: "Оценка и контроль", en: "Evaluation & Governance" },
  "nav.settings": { uz: "Sozlamalar", ru: "Настройки", en: "Settings" },
  "dashboard.title": { uz: "ASSBI Ultra boshqaruv paneli", ru: "Панель ASSBI Ultra", en: "ASSBI Ultra Dashboard" },
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
  "dashboard.deviceAwareness": { uz: "Qurilmalar nazorati", ru: "Контроль устройств", en: "Device Awareness" },
  "dashboard.combinedScore": {
    uz: "Uptime, sifat, FPS va risk umumiy balli",
    ru: "Общий балл uptime, качества, FPS и риска",
    en: "Combined uptime, quality, FPS and risk score",
  },
  "dashboard.camerasOnlineHint": { uz: "kamera online", ru: "камер онлайн", en: "cameras online" },
  "dashboard.lowerRiskHint": {
    uz: "Qiymat yuqori bo‘lsa, operatsion risk pastroq bo‘ladi",
    ru: "Чем выше значение, тем ниже операционный риск",
    en: "Higher value means lower operational risk",
  },
  "dashboard.apiError": { uz: "API xatosi", ru: "Ошибка API", en: "API Error" },
  "dashboard.backendError": {
    uz: "Backend API bilan ulanishda muammo yuz berdi.",
    ru: "Возникла проблема подключения к Backend API.",
    en: "There was a problem connecting to the Backend API.",
  },
  "dashboard.activePeople": { uz: "Faol odamlar", ru: "Активные люди", en: "Active People" },
  "dashboard.noCameraHealth": { uz: "Kamera holati ma’lumoti mavjud emas.", ru: "Данных о состоянии камер пока нет.", en: "Camera health data is not available yet." },
  "dashboard.noObjectData": { uz: "Obyekt ma’lumoti hali mavjud emas.", ru: "Данных об объектах пока нет.", en: "Object data is not available yet." },
  "dashboard.liveCameraOperations": { uz: "Live kamera amaliyotlari", ru: "Операции live-камер", en: "Live Camera Operations" },
  "dashboard.noCameraOperations": { uz: "Kamera amaliyotlari ma’lumoti mavjud emas.", ru: "Данных по операциям камер пока нет.", en: "Camera operations data is not available yet." },
  "dashboard.systemHealthOverview": { uz: "Tizim holati nazorati", ru: "Обзор состояния системы", en: "System Health Overview" },
  "dashboard.backendApi": { uz: "Backend API", ru: "Backend API", en: "Backend API" },
  "dashboard.cameraConnectivity": { uz: "Kamera ulanishi", ru: "Подключение камер", en: "Camera Connectivity" },
  "dashboard.averageStreamQuality": { uz: "O‘rtacha stream sifati", ru: "Среднее качество потока", en: "Average Stream Quality" },
  "dashboard.averageFps": { uz: "O‘rtacha FPS", ru: "Средний FPS", en: "Average FPS" },
  "dashboard.highRiskCameras": { uz: "Yuqori riskli kameralar", ru: "Камеры высокого риска", en: "High Risk Cameras" },
  "dashboard.operationalRecommendation": { uz: "Operatsion tavsiya", ru: "Операционная рекомендация", en: "Operational Recommendation" },
  "dashboard.offlineRecommendation": {
    uz: "Ba’zi kameralar offline. Kamera manbasi, RTSP link yoki backend detector processni tekshiring.",
    ru: "Некоторые камеры офлайн. Проверьте источник камеры, RTSP-ссылку или процесс detector.",
    en: "Some cameras are offline. Check camera source, RTSP link or backend detector process.",
  },
  "dashboard.highRiskRecommendation": {
    uz: "Yuqori risk aniqlandi. Live kamera va hodisalar jadvalini darhol tekshiring.",
    ru: "Обнаружен высокий риск. Срочно проверьте live-камеру и таблицу инцидентов.",
    en: "High risk detected. Review live camera and incident table immediately.",
  },
  "dashboard.lowQualityRecommendation": {
    uz: "Stream sifati past. Video manbasi, tarmoq yoki detection intervalni tekshiring.",
    ru: "Качество потока низкое. Проверьте источник видео, сеть или интервал detection.",
    en: "Stream quality is low. Check video source, network or detection interval.",
  },
  "dashboard.stableRecommendation": {
    uz: "Barcha asosiy platforma signallari barqaror. Oddiy monitoringni davom ettiring.",
    ru: "Все основные сигналы платформы стабильны. Продолжайте обычный мониторинг.",
    en: "All major platform signals look stable. Continue normal monitoring.",
  },
  "dashboard.recentIncidents": { uz: "So‘nggi hodisalar", ru: "Последние инциденты", en: "Recent Incidents" },
  "dashboard.noIncidents": { uz: "Hozircha hodisa yo‘q", ru: "Инцидентов пока нет", en: "No incidents yet" },
  "dashboard.unknown": { uz: "Noma’lum", ru: "Неизвестно", en: "Unknown" },
  "dashboard.noMessage": { uz: "Xabar yo‘q", ru: "Нет сообщения", en: "No message" },
  "dashboard.aiExecutiveSummary": { uz: "AI boshqaruv xulosasi", ru: "Исполнительная AI-сводка", en: "AI Executive Summary" },
  "dashboard.busiest": { uz: "Eng gavjum", ru: "Самая загруженная", en: "Busiest" },
  "dashboard.highestRisk": { uz: "Eng yuqori risk", ru: "Самый высокий риск", en: "Highest Risk" },
  "dashboard.riskLeaderboard": { uz: "Risk reytingi", ru: "Рейтинг риска", en: "Risk Leaderboard" },
  "dashboard.noCameraData": { uz: "Kamera ma’lumoti mavjud emas", ru: "Данных камер пока нет", en: "No camera data available" },
  "dashboard.laptops": { uz: "Noutbuklar", ru: "Ноутбуки", en: "Laptops" },
  "dashboard.phones": { uz: "Telefonlar", ru: "Телефоны", en: "Phones" },
  "dashboard.vehicles": { uz: "Transportlar", ru: "Транспорт", en: "Vehicles" },
  "dashboard.otherObjects": { uz: "Boshqa obyektlar", ru: "Другие объекты", en: "Other Objects" },
  "dashboard.objectsIncluded": { uz: "Telefonlar, noutbuklar, transportlar", ru: "Телефоны, ноутбуки, транспорт", en: "Phones, laptops, vehicles" },
  "dashboard.recentEventCases": { uz: "So‘nggi hodisa holatlari", ru: "Последние события", en: "Recent event cases" },
  "dashboard.detectionSpeed": { uz: "Detection tezligi", ru: "Скорость detection", en: "Detection speed" },
  "dashboard.backendIssueTitle": { uz: "Backend ulanish muammosi", ru: "Проблема подключения Backend", en: "Backend connection issue" },
  "dashboard.backendIssueText": {
    uz: "API offline holatda. Camera API, detector process va database yozuvlarini tekshirish kerak.",
    ru: "API офлайн. Нужно проверить Camera API, процесс detector и записи базы данных.",
    en: "API is offline. Check Camera API, detector process and database records.",
  },
  "dashboard.highRiskTitle": { uz: "Yuqori risk monitoringi kerak", ru: "Нужен мониторинг высокого риска", en: "High risk monitoring required" },
  "dashboard.highRiskText": {
    uz: "Risk baland. Operator live kamera, hodisalar jurnali va alert response jarayonini darhol tekshirishi kerak.",
    ru: "Риск высокий. Оператору нужно срочно проверить live-камеру, журнал инцидентов и процесс реакции.",
    en: "Risk is high. The operator should immediately review live camera, incident log and alert response workflow.",
  },
  "dashboard.connectivityIssueTitle": { uz: "Kamera ulanish muammosi", ru: "Проблема подключения камеры", en: "Camera connectivity issue" },
  "dashboard.connectivityIssueText": {
    uz: "Ba’zi kameralar offline. RTSP URL, YouTube stream, local video path yoki backend detector processni tekshiring.",
    ru: "Некоторые камеры офлайн. Проверьте RTSP URL, YouTube stream, local video path или backend detector.",
    en: "Some cameras are offline. Check RTSP URL, YouTube stream, local video path or backend detector process.",
  },
  "dashboard.qualityIssueTitle": { uz: "Stream sifati e’tibor talab qiladi", ru: "Качество потока требует внимания", en: "Stream quality needs attention" },
  "dashboard.qualityIssueText": {
    uz: "Kamera sifati past. Network, video source yoki detection interval optimizatsiya qilinishi kerak.",
    ru: "Качество камеры низкое. Нужно оптимизировать сеть, видеоисточник или интервал detection.",
    en: "Camera quality is low. Network, video source or detection interval should be optimized.",
  },
  "dashboard.systemStableTitle": { uz: "Tizim barqaror", ru: "Система стабильна", en: "System stable" },
  "dashboard.systemStableText": {
    uz: "Platforma barqaror. Live monitoring, odamlarni tracking qilish, kamera holati va BI analitika normal ishlayapti.",
    ru: "Платформа стабильна. Live monitoring, tracking людей, состояние камер и BI-аналитика работают нормально.",
    en: "Platform is stable. Live monitoring, people tracking, camera health and BI analytics are operating normally.",
  },
  "live.title": { uz: "Kamera operator ish joyi", ru: "Рабочее место оператора камер", en: "Camera Operator Workspace" },
  "live.subtitle": {
    uz: "Operatorlar uchun live kamera, manba holati, frame diagnostika va har bir kamera bo‘yicha obyekt ko‘rinishi.",
    ru: "Live-камера, состояние источника, диагностика кадров и видимость объектов по каждой камере для операторов.",
    en: "Live camera feed, source health, frame diagnostics and per-camera object visibility for operators.",
  },
  "live.monitoringActive": { uz: "Monitoring faol", ru: "Мониторинг активен", en: "Monitoring Active" },
  "live.monitoringPaused": { uz: "Monitoring pauzada", ru: "Мониторинг на паузе", en: "Monitoring Paused" },
  "live.pauseMonitoring": { uz: "Monitoringni pauza qilish", ru: "Поставить мониторинг на паузу", en: "Pause Monitoring" },
  "live.startMonitoring": { uz: "Monitoringni boshlash", ru: "Запустить мониторинг", en: "Start Monitoring" },
  "live.snapshot": { uz: "Snapshot", ru: "Снимок", en: "Snapshot" },
  "live.cameraReport": { uz: "Kamera hisoboti", ru: "Отчет по камерам", en: "Camera Report" },
  "live.cameraApiError": { uz: "Kamera API xatosi", ru: "Ошибка Camera API", en: "Camera API Error" },
  "live.cameraApiErrorText": {
    uz: "Camera API bilan ulanishda muammo yuz berdi.",
    ru: "Возникла проблема подключения к Camera API.",
    en: "There was a problem connecting to the Camera API.",
  },
  "live.selectedCamera": { uz: "Tanlangan kamera", ru: "Выбранная камера", en: "Selected Camera" },
  "live.noCameraSelected": { uz: "Kamera tanlanmagan", ru: "Камера не выбрана", en: "No camera selected" },
  "live.cameraId": { uz: "Kamera ID", ru: "ID камеры", en: "Camera ID" },
  "live.selectCamera": { uz: "Kamera tanlang", ru: "Выберите камеру", en: "Select a camera" },
  "live.source": { uz: "manba", ru: "источник", en: "source" },
  "live.refreshed": { uz: "yangilandi", ru: "обновлено", en: "refreshed" },
  "live.focusView": { uz: "Katta ko‘rish", ru: "Фокусный вид", en: "Focus View" },
  "live.livePeople": { uz: "Live odamlar", ru: "Люди сейчас", en: "Live People" },
  "live.todayVisitors": { uz: "Bugungi kirganlar", ru: "Посетители сегодня", en: "Today Visitors" },
  "live.totalUnique": { uz: "Umumiy unique", ru: "Всего уникальных", en: "Total Unique" },
  "live.noFrame": { uz: "Frame yo‘q", ru: "Нет кадра", en: "No frame" },
  "live.originalAvailable": { uz: "Original", ru: "Оригинал", en: "Original" },
  "live.frameUnavailable": { uz: "Kamera frame mavjud emas", ru: "Кадр камеры недоступен", en: "Camera frame not available" },
  "live.frameUnavailableHint": {
    uz: "RTSP kamera shu tarmoqdan ochilayotganini, URL/parol to‘g‘riligini va detector frame olayotganini tekshiring.",
    ru: "Проверьте доступность RTSP-камеры из этой сети, корректность URL/пароля и получение кадров detector process-ом.",
    en: "Check that the RTSP camera is reachable from this network, the URL/password are correct, and the detector is receiving frames.",
  },
  "live.liveStream": { uz: "Live stream", ru: "Live stream", en: "Live Stream" },
  "live.today": { uz: "Bugun", ru: "Сегодня", en: "Today" },
  "live.total": { uz: "Umumiy", ru: "Всего", en: "Total" },
  "live.cameraDiagnostics": { uz: "Kamera diagnostikasi", ru: "Диагностика камеры", en: "Camera Diagnostics" },
  "live.streamQuality": { uz: "Stream sifati", ru: "Качество потока", en: "Stream Quality" },
  "live.riskLevel": { uz: "Risk darajasi", ru: "Уровень риска", en: "Risk Level" },
  "live.fpsEfficiency": { uz: "FPS samaradorligi", ru: "Эффективность FPS", en: "FPS Efficiency" },
  "live.cameraType": { uz: "Kamera turi", ru: "Тип камеры", en: "Camera Type" },
  "live.speedMode": { uz: "Tezlik rejimi", ru: "Режим скорости", en: "Speed Mode" },
  "live.enabled": { uz: "Yoqilgan", ru: "Включено", en: "Enabled" },
  "live.cameraEvents": { uz: "Kamera hodisalari", ru: "События камеры", en: "Camera Events" },
  "live.noCameraEvents": { uz: "Kamera hodisasi mavjud emas.", ru: "Событий камеры пока нет.", en: "No camera events yet." },
  "live.cameraOperationsTable": { uz: "Kamera amaliyotlari jadvali", ru: "Таблица операций камер", en: "Camera Operations Table" },
  "live.cameraNotFound": { uz: "Kamera topilmadi.", ru: "Камера не найдена.", en: "Camera not found." },
  "live.cameraFilters": { uz: "Kamera filterlari", ru: "Фильтры камер", en: "Camera Filters" },
  "live.searchPlaceholder": { uz: "Kamera, site yoki type qidirish...", ru: "Поиск камеры, площадки или типа...", en: "Search camera, site or type..." },
  "live.filteredResult": { uz: "Filter natijasi", ru: "Результат фильтра", en: "Filtered Result" },
  "live.currentFilterResult": { uz: "Joriy qidiruv / filter / saralash natijasi", ru: "Текущий результат поиска / фильтра / сортировки", en: "Current search / filter / sort result" },
  "live.cameraList": { uz: "Kamera ro‘yxati", ru: "Список камер", en: "Camera List" },
  "live.aiCameraInsight": { uz: "AI kamera xulosasi", ru: "AI-анализ камеры", en: "AI Camera Insight" },
  "live.selectedFps": { uz: "Tanlangan FPS", ru: "Выбранный FPS", en: "Selected FPS" },
  "live.selectedQuality": { uz: "Tanlangan sifat", ru: "Выбранное качество", en: "Selected Quality" },
  "live.selectedRisk": { uz: "Tanlangan risk", ru: "Выбранный риск", en: "Selected Risk" },
  "live.selectedObjects": { uz: "Tanlangan obyektlar", ru: "Выбранные объекты", en: "Selected Objects" },
  "live.noLiveStream": { uz: "Live stream mavjud emas", ru: "Live stream недоступен", en: "No live stream available" },
  "live.apiOfflineTitle": { uz: "Kamera API offline", ru: "Camera API офлайн", en: "Camera API offline" },
  "live.apiOfflineText": { uz: "Backend camera endpoint javob bermayapti. api_server.py va detector processni tekshiring.", ru: "Backend endpoint камер не отвечает. Проверьте api_server.py и процесс detector.", en: "Backend camera endpoint is not responding. Check api_server.py and detector process." },
  "live.noDataText": { uz: "Monitoring uchun kamera qo‘shish yoki camera API dan ma’lumot olish kerak.", ru: "Нужно добавить камеру для мониторинга или получить данные из Camera API.", en: "Add a camera for monitoring or get data from the Camera API." },
  "live.selectedOfflineTitle": { uz: "Tanlangan kamera offline", ru: "Выбранная камера офлайн", en: "Selected camera offline" },
  "live.selectedOfflineText": { uz: "Kamera stream ishlamayapti. Source URL, local path yoki detector processni tekshiring.", ru: "Поток камеры не работает. Проверьте Source URL, local path или detector process.", en: "Camera stream is not working. Check Source URL, local path or detector process." },
  "live.selectedRiskTitle": { uz: "Tanlangan kamera e’tibor talab qiladi", ru: "Выбранная камера требует внимания", en: "Selected camera needs attention" },
  "live.selectedRiskText": { uz: "Ushbu kamerada risk yuqori. Live feed, object overlay va anomaly eventlarni tekshirish kerak.", ru: "На этой камере высокий риск. Проверьте live feed, object overlay и anomaly events.", en: "This camera has high risk. Review live feed, object overlay and anomaly events." },
  "live.streamQualityIssueTitle": { uz: "Stream sifati muammosi", ru: "Проблема качества потока", en: "Stream quality issue" },
  "live.streamQualityIssueText": { uz: "Video sifati past. Network, source resolution yoki detect intervalni optimizatsiya qiling.", ru: "Качество видео низкое. Оптимизируйте сеть, разрешение источника или интервал detect.", en: "Video quality is low. Optimize network, source resolution or detect interval." },
  "live.monitoringStableTitle": { uz: "Kamera monitoringi barqaror", ru: "Мониторинг камеры стабилен", en: "Camera monitoring stable" },
  "live.monitoringStableText": { uz: "Tanlangan kamera normal ishlayapti. FPS, sifat va risk nazorat ostida.", ru: "Выбранная камера работает нормально. FPS, качество и риск под контролем.", en: "Selected camera is operating normally. FPS, quality and risk are under control." },
  "live.eventCameraOffline": { uz: "Kamera offline", ru: "Камера офлайн", en: "Camera Offline" },
  "live.eventCameraOfflineText": { uz: "stream javob bermayapti.", ru: "поток не отвечает.", en: "stream is not responding." },
  "live.eventHighRisk": { uz: "Yuqori riskli kamera", ru: "Камера высокого риска", en: "High Risk Camera" },
  "live.eventRiskScore": { uz: "Risk ball", ru: "Оценка риска", en: "Risk score" },
  "live.eventLowQuality": { uz: "Stream sifati past", ru: "Низкое качество потока", en: "Low Stream Quality" },
  "live.eventQualityText": { uz: "Video manbasini tekshirish kerak.", ru: "Нужно проверить источник видео.", en: "Video source needs to be checked." },
  "live.eventLowFps": { uz: "FPS past", ru: "Низкий FPS", en: "Low FPS" },
  "live.eventFpsText": { uz: "Processing sekinlashgan.", ru: "Обработка замедлилась.", en: "Processing slowed down." },
  "live.eventStableText": { uz: "Hamma asosiy kamera signallari normal holatda.", ru: "Все основные сигналы камер в норме.", en: "All main camera signals are normal." },
};

const languageNames: Record<Language, string> = {
  uz: "UZ",
  ru: "RU",
  en: "EN",
};

const bridgeTranslations: Record<string, Record<Language, string>> = {
  "Latest trend peak": { uz: "Oxirgi trend cho‘qqisi", ru: "Последний пик тренда", en: "Latest trend peak" },
  "Across cameras": { uz: "Kameralar bo‘yicha", ru: "По камерам", en: "Across cameras" },
  "Heat Level": { uz: "Zichlik darajasi", ru: "Уровень плотности", en: "Heat Level" },
  "AI density status": { uz: "AI zichlik holati", ru: "Статус плотности AI", en: "AI density status" },
  "Busiest Camera": { uz: "Eng gavjum kamera", ru: "Самая загруженная камера", en: "Busiest Camera" },
  "Highest Risk Camera": { uz: "Eng yuqori riskli kamera", ru: "Камера с самым высоким риском", en: "Highest Risk Camera" },
  "AI Crowd Insight": { uz: "AI odamlar oqimi xulosasi", ru: "AI-анализ толпы", en: "AI Crowd Insight" },
  "Recommended Action": { uz: "Tavsiya etilgan amal", ru: "Рекомендуемое действие", en: "Recommended Action" },
  "Crowd Analytics": { uz: "Odamlar analitikasi", ru: "Аналитика толпы", en: "Crowd Analytics" },
  "Live Crowd Analytics": { uz: "Live odamlar analitikasi", ru: "Live аналитика толпы", en: "Live Crowd Analytics" },
  "People Flow": { uz: "Odamlar oqimi", ru: "Поток людей", en: "People Flow" },
  "Crowd Heatmap": { uz: "Odamlar zichlik xaritasi", ru: "Тепловая карта толпы", en: "Crowd Heatmap" },
  "Camera Crowd Table": { uz: "Kamera odamlar jadvali", ru: "Таблица толпы по камерам", en: "Camera Crowd Table" },
  "Crowd Forecast": { uz: "Odamlar oqimi prognozi", ru: "Прогноз толпы", en: "Crowd Forecast" },
  "Reports Warning": { uz: "Hisobot ogohlantirishi", ru: "Предупреждение отчетов", en: "Reports Warning" },
  "Reports Center": { uz: "Hisobotlar markazi", ru: "Центр отчетов", en: "Reports Center" },
  "BI Reports & Evidence": { uz: "BI hisobotlar va dalillar", ru: "BI-отчеты и доказательства", en: "BI Reports & Evidence" },
  "Report Filters": { uz: "Hisobot filterlari", ru: "Фильтры отчета", en: "Report Filters" },
  "Report Catalog": { uz: "Hisobot katalogi", ru: "Каталог отчетов", en: "Report Catalog" },
  "Report Preview": { uz: "Hisobot preview", ru: "Предпросмотр отчета", en: "Report Preview" },
  "Camera Performance Report": { uz: "Kamera ishlashi hisoboti", ru: "Отчет производительности камер", en: "Camera Performance Report" },
  "Incident Evidence Report": { uz: "Hodisa dalillari hisoboti", ru: "Отчет доказательств инцидентов", en: "Incident Evidence Report" },
  "Start Date": { uz: "Boshlanish sanasi", ru: "Дата начала", en: "Start Date" },
  "End Date": { uz: "Tugash sanasi", ru: "Дата окончания", en: "End Date" },
  "Report Type": { uz: "Hisobot turi", ru: "Тип отчета", en: "Report Type" },
  "All Data": { uz: "Barcha ma’lumotlar", ru: "Все данные", en: "All Data" },
  "Filtered BI Excel Report": { uz: "Filterlangan BI Excel hisoboti", ru: "Фильтрованный BI Excel отчет", en: "Filtered BI Excel Report" },
  "Executive PDF Report": { uz: "Rahbariyat uchun PDF hisobot", ru: "PDF отчет для руководства", en: "Executive PDF Report" },
  "Analytics CSV Export": { uz: "Analitika CSV eksporti", ru: "Экспорт аналитики CSV", en: "Analytics CSV Export" },
  "Incidents Excel Report": { uz: "Hodisalar Excel hisoboti", ru: "Excel отчет инцидентов", en: "Incidents Excel Report" },
  "Incidents CSV Export": { uz: "Hodisalar CSV eksporti", ru: "CSV экспорт инцидентов", en: "Incidents CSV Export" },
  "Forecast Report": { uz: "Prognoz hisoboti", ru: "Отчет прогноза", en: "Forecast Report" },
  "Report data warning": { uz: "Hisobot ma’lumoti ogohlantirishi", ru: "Предупреждение данных отчета", en: "Report data warning" },
  "Custom report filter applied": { uz: "Custom hisobot filteri qo‘llandi", ru: "Применен пользовательский фильтр отчета", en: "Custom report filter applied" },
  "Executive attention required": { uz: "Rahbariyat e’tibori kerak", ru: "Требуется внимание руководства", en: "Executive attention required" },
  "Camera coverage issue": { uz: "Kamera qamrovi muammosi", ru: "Проблема покрытия камер", en: "Camera coverage issue" },
  "Reporting data is ready": { uz: "Hisobot ma’lumotlari tayyor", ru: "Данные отчетов готовы", en: "Reporting data is ready" },
  "Custom camera, date range and report type filter bilan Excel export.": {
    uz: "Kamera, sana oralig‘i va hisobot turi filteri bilan Excel eksport.",
    ru: "Экспорт Excel с фильтром камеры, диапазона дат и типа отчета.",
    en: "Custom camera, date range and report type filter with Excel export.",
  },
  "Management-ready summary with incidents and AI recommendation.": {
    uz: "Hodisalar va AI tavsiyasi bilan rahbariyatga tayyor xulosa.",
    ru: "Готовая для руководства сводка с инцидентами и AI-рекомендацией.",
    en: "Management-ready summary with incidents and AI recommendation.",
  },
  "Raw filtered analytics data for Power BI or external analysis.": {
    uz: "Power BI yoki tashqi tahlil uchun xom filterlangan analitika ma’lumotlari.",
    ru: "Сырые отфильтрованные аналитические данные для Power BI или внешнего анализа.",
    en: "Raw filtered analytics data for Power BI or external analysis.",
  },
  "Camera and date filtered incident evidence export.": {
    uz: "Kamera va sana bo‘yicha filterlangan hodisa dalillari eksporti.",
    ru: "Экспорт доказательств инцидентов с фильтром камеры и даты.",
    en: "Camera and date filtered incident evidence export.",
  },
  "Lightweight incident export for filtered review.": {
    uz: "Filterlangan ko‘rib chiqish uchun yengil hodisa eksporti.",
    ru: "Легкий экспорт инцидентов для фильтрованного просмотра.",
    en: "Lightweight incident export for filtered review.",
  },
  "Predictive analytics report with filtered planning context.": {
    uz: "Filterlangan rejalashtirish konteksti bilan prognoz analitika hisoboti.",
    ru: "Отчет прогнозной аналитики с фильтрованным контекстом планирования.",
    en: "Predictive analytics report with filtered planning context.",
  },
  "People Analytics": { uz: "Odamlar analitikasi", ru: "Аналитика людей", en: "People Analytics" },
  "Object Detection": { uz: "Obyekt aniqlash", ru: "Детекция объектов", en: "Object Detection" },
  "Incidents": { uz: "Hodisalar", ru: "Инциденты", en: "Incidents" },
  "Forecast": { uz: "Prognoz", ru: "Прогноз", en: "Forecast" },
  "Reports": { uz: "Hisobotlar", ru: "Отчеты", en: "Reports" },
  "High Alerts": { uz: "Yuqori alertlar", ru: "Высокие alert", en: "High Alerts" },
  "Date Range": { uz: "Sana oralig‘i", ru: "Диапазон дат", en: "Date Range" },
  "Report Note": { uz: "Hisobot izohi", ru: "Примечание отчета", en: "Report Note" },
  "Time": { uz: "Vaqt", ru: "Время", en: "Time" },
  "Incident": { uz: "Hodisa", ru: "Инцидент", en: "Incident" },
  "Description": { uz: "Tavsif", ru: "Описание", en: "Description" },
  "Now": { uz: "Hozir", ru: "Сейчас", en: "Now" },
  "Peak": { uz: "Cho‘qqi", ru: "Пик", en: "Peak" },
  "Confidence": { uz: "Ishonchlilik", ru: "Уверенность", en: "Confidence" },
  "Actual": { uz: "Haqiqiy", ru: "Факт", en: "Actual" },
  "Predicted": { uz: "Prognoz", ru: "Прогноз", en: "Predicted" },
  "Lower": { uz: "Pastki", ru: "Нижний", en: "Lower" },
  "Upper": { uz: "Yuqori", ru: "Верхний", en: "Upper" },
  "Camera Type": { uz: "Kamera turi", ru: "Тип камеры", en: "Camera Type" },
  "Settings": { uz: "Sozlamalar", ru: "Настройки", en: "Settings" },
  "Platform Settings": { uz: "Platforma sozlamalari", ru: "Настройки платформы", en: "Platform Settings" },
  "Camera Configuration": { uz: "Kamera konfiguratsiyasi", ru: "Конфигурация камер", en: "Camera Configuration" },
  "Add Camera": { uz: "Kamera qo‘shish", ru: "Добавить камеру", en: "Add Camera" },
  "Update Camera": { uz: "Kamerani yangilash", ru: "Обновить камеру", en: "Update Camera" },
  "Remove": { uz: "O‘chirish", ru: "Удалить", en: "Remove" },
  "Start": { uz: "Boshlash", ru: "Запустить", en: "Start" },
  "Stop": { uz: "To‘xtatish", ru: "Остановить", en: "Stop" },
  "System Configuration": { uz: "Tizim konfiguratsiyasi", ru: "Конфигурация системы", en: "System Configuration" },
  "Detection Settings": { uz: "Detection sozlamalari", ru: "Настройки detection", en: "Detection Settings" },
  "Notification Settings": { uz: "Bildirishnoma sozlamalari", ru: "Настройки уведомлений", en: "Notification Settings" },
  "User Management": { uz: "Foydalanuvchilar boshqaruvi", ru: "Управление пользователями", en: "User Management" },
  "Speed Mode": { uz: "Tezlik rejimi", ru: "Режим скорости", en: "Speed Mode" },
  "Site Name": { uz: "Joy nomi", ru: "Название объекта", en: "Site Name" },
  "Camera ID": { uz: "Kamera ID", ru: "ID камеры", en: "Camera ID" },
  "Camera URL / Local Path": { uz: "Kamera URL / lokal path", ru: "URL камеры / локальный путь", en: "Camera URL / Local Path" },
  "Configured Cameras": { uz: "Sozlangan kameralar", ru: "Настроенные камеры", en: "Configured Cameras" },
  "Speed": { uz: "Tezlik", ru: "Скорость", en: "Speed" },
  "URL / Path": { uz: "URL / path", ru: "URL / путь", en: "URL / Path" },
  "Action": { uz: "Amal", ru: "Действие", en: "Action" },
  "Detection Model": { uz: "Detection modeli", ru: "Модель detection", en: "Detection Model" },
  "Max People Threshold": { uz: "Maksimal odam chegarasi", ru: "Макс. порог людей", en: "Max People Threshold" },
  "Risk Threshold": { uz: "Risk chegarasi", ru: "Порог риска", en: "Risk Threshold" },
  "Detection Confidence": { uz: "Detection ishonchliligi", ru: "Уверенность detection", en: "Detection Confidence" },
  "Suspicious Seconds": { uz: "Shubhali sekundlar", ru: "Секунды подозрения", en: "Suspicious Seconds" },
  "OpenAI API Key": { uz: "OpenAI API kaliti", ru: "Ключ OpenAI API", en: "OpenAI API Key" },
  "Name": { uz: "Nomi", ru: "Имя", en: "Name" },
  "Email": { uz: "Email", ru: "Email", en: "Email" },
  "Role": { uz: "Rol", ru: "Роль", en: "Role" },
  "Permission": { uz: "Ruxsat", ru: "Разрешение", en: "Permission" },
  "Saved messages": { uz: "Saqlangan xabarlar", ru: "Сохраненные сообщения", en: "Saved messages" },
  "AI Chatbot": { uz: "AI chatbot", ru: "AI чатбот", en: "AI Chatbot" },
  "AI Assistant": { uz: "AI yordamchi", ru: "AI ассистент", en: "AI Assistant" },
  "Assistant Console": { uz: "Yordamchi konsoli", ru: "Консоль ассистента", en: "Assistant Console" },
  "Chat History": { uz: "Chat tarixi", ru: "История чата", en: "Chat History" },
  "Knowledge Context": { uz: "Bilim konteksti", ru: "Контекст знаний", en: "Knowledge Context" },
  "Live DB": { uz: "Live DB", ru: "Live БД", en: "Live DB" },
  "Checking": { uz: "Tekshirilmoqda", ru: "Проверка", en: "Checking" },
  "Fallback Mode": { uz: "Fallback rejimi", ru: "Режим fallback", en: "Fallback Mode" },
  "Storage": { uz: "Saqlash joyi", ru: "Хранилище", en: "Storage" },
  "Local Browser": { uz: "Lokal brauzer", ru: "Локальный браузер", en: "Local Browser" },
  "Press Enter to send, Shift + Enter for new line": {
    uz: "Yuborish uchun Enter, yangi qator uchun Shift + Enter",
    ru: "Enter для отправки, Shift + Enter для новой строки",
    en: "Press Enter to send, Shift + Enter for new line",
  },
  "Ask about people, risk, incidents, cameras, objects, FPS...": {
    uz: "Odamlar, risk, hodisalar, kameralar, obyektlar, FPS haqida so‘rang...",
    ru: "Спросите о людях, риске, инцидентах, камерах, объектах, FPS...",
    en: "Ask about people, risk, incidents, cameras, objects, FPS...",
  },
  "Has Objects": { uz: "Obyekti bor", ru: "Есть объекты", en: "Has Objects" },
  "Object Detection Center": { uz: "Obyekt aniqlash markazi", ru: "Центр детекции объектов", en: "Object Detection Center" },
  "Object Detection Stable": { uz: "Obyekt aniqlash barqaror", ru: "Детекция объектов стабильна", en: "Object Detection Stable" },
  "Objects Detected": { uz: "Aniqlangan obyektlar", ru: "Объекты обнаружены", en: "Objects Detected" },
  "Laptop Detected": { uz: "Noutbuk aniqlandi", ru: "Ноутбук обнаружен", en: "Laptop Detected" },
  "Phone Detected": { uz: "Telefon aniqlandi", ru: "Телефон обнаружен", en: "Phone Detected" },
  "Vehicle Detected": { uz: "Transport aniqlandi", ru: "Транспорт обнаружен", en: "Vehicle Detected" },
  "Object API issue": { uz: "Obyekt API muammosi", ru: "Проблема Object API", en: "Object API issue" },
  "No object activity": { uz: "Obyekt faolligi yo‘q", ru: "Нет активности объектов", en: "No object activity" },
  "Vehicle objects detected": { uz: "Transport obyektlari aniqlandi", ru: "Обнаружены транспортные объекты", en: "Vehicle objects detected" },
  "Phone activity visible": { uz: "Telefon faolligi ko‘rinmoqda", ru: "Видна активность телефонов", en: "Phone activity visible" },
  "Object detection active": { uz: "Obyekt aniqlash faol", ru: "Детекция объектов активна", en: "Object detection active" },
  "Object Summary": { uz: "Obyektlar xulosasi", ru: "Сводка объектов", en: "Object Summary" },
  "Object Events": { uz: "Obyekt hodisalari", ru: "События объектов", en: "Object Events" },
  "Object Camera Table": { uz: "Obyektlar kamera jadvali", ru: "Таблица объектов по камерам", en: "Object Camera Table" },
  "Object Filters": { uz: "Obyekt filterlari", ru: "Фильтры объектов", en: "Object Filters" },
  "Filtered Cameras": { uz: "Filterlangan kameralar", ru: "Отфильтрованные камеры", en: "Filtered Cameras" },
  "All Objects": { uz: "Barcha obyektlar", ru: "Все объекты", en: "All Objects" },
  "Avg FPS": { uz: "O‘rtacha FPS", ru: "Средний FPS", en: "Avg FPS" },
  "Avg Quality": { uz: "O‘rtacha sifat", ru: "Среднее качество", en: "Avg Quality" },
  "Active People": { uz: "Faol odamlar", ru: "Активные люди", en: "Active People" },
  "Total Unique": { uz: "Umumiy unique", ru: "Всего уникальных", en: "Total Unique" },
  "Cameras Online": { uz: "Online kameralar", ru: "Камеры онлайн", en: "Cameras Online" },
  "Risk Score": { uz: "Risk balli", ru: "Оценка риска", en: "Risk Score" },
  "Processing FPS": { uz: "Processing FPS", ru: "FPS обработки", en: "Processing FPS" },
  "Data Quality": { uz: "Ma’lumot sifati", ru: "Качество данных", en: "Data Quality" },
  "Anomaly Detection": { uz: "Anomaliya aniqlash", ru: "Детекция аномалий", en: "Anomaly Detection" },
  "Anomaly Detection Center": { uz: "Anomaliya aniqlash markazi", ru: "Центр детекции аномалий", en: "Anomaly Detection Center" },
  "Backend connection issue": { uz: "Backend ulanish muammosi", ru: "Проблема подключения Backend", en: "Backend connection issue" },
  "High risk monitoring required": { uz: "Yuqori risk monitoringi kerak", ru: "Нужен мониторинг высокого риска", en: "High risk monitoring required" },
  "Camera connectivity issue": { uz: "Kamera ulanish muammosi", ru: "Проблема подключения камеры", en: "Camera connectivity issue" },
  "Stream quality needs attention": { uz: "Stream sifati e’tibor talab qiladi", ru: "Качество потока требует внимания", en: "Stream quality needs attention" },
  "System stable": { uz: "Tizim barqaror", ru: "Система стабильна", en: "System stable" },
  "AI Executive Summary": { uz: "AI boshqaruv xulosasi", ru: "Исполнительная AI-сводка", en: "AI Executive Summary" },
  "Platform Control Score": { uz: "Platforma nazorat balli", ru: "Контрольная оценка платформы", en: "Platform Control Score" },
  "Device Awareness": { uz: "Qurilmalar nazorati", ru: "Контроль устройств", en: "Device Awareness" },
  "Camera Health": { uz: "Kamera holati", ru: "Состояние камер", en: "Camera Health" },
  "Object Breakdown": { uz: "Obyektlar taqsimoti", ru: "Разбивка объектов", en: "Object Breakdown" },
  "System Health Overview": { uz: "Tizim holati nazorati", ru: "Обзор состояния системы", en: "System Health Overview" },
  "Operational Recommendation": { uz: "Operatsion tavsiya", ru: "Операционная рекомендация", en: "Operational Recommendation" },
  "Recent Incidents": { uz: "So‘nggi hodisalar", ru: "Последние инциденты", en: "Recent Incidents" },
  "Risk Leaderboard": { uz: "Risk reytingi", ru: "Рейтинг риска", en: "Risk Leaderboard" },
  "Stream Quality": { uz: "Stream sifati", ru: "Качество потока", en: "Stream Quality" },
  "Risk Level": { uz: "Risk darajasi", ru: "Уровень риска", en: "Risk Level" },
  "Average Stream Quality": { uz: "O‘rtacha stream sifati", ru: "Среднее качество потока", en: "Average Stream Quality" },
  "Average FPS": { uz: "O‘rtacha FPS", ru: "Средний FPS", en: "Average FPS" },
  "High Risk Cameras": { uz: "Yuqori riskli kameralar", ru: "Камеры высокого риска", en: "High Risk Cameras" },
  "FPS Efficiency": { uz: "FPS samaradorligi", ru: "Эффективность FPS", en: "FPS Efficiency" },
  "Other": { uz: "Boshqa", ru: "Другое", en: "Other" },
  "Total": { uz: "Umumiy", ru: "Всего", en: "Total" },
  "Vehicle Warning": { uz: "Transport ogohlantirishi", ru: "Предупреждение транспорта", en: "Vehicle Warning" },
  "Laptop/Phone": { uz: "Noutbuk/telefon", ru: "Ноутбук/телефон", en: "Laptop/Phone" },
  "Recommendation": { uz: "Tavsiya", ru: "Рекомендация", en: "Recommendation" },
  "Predictive Analytics": { uz: "Prognoz analitika", ru: "Прогнозная аналитика", en: "Predictive Analytics" },
  "Predictive Analytics Center": { uz: "Prognoz analitika markazi", ru: "Центр прогнозной аналитики", en: "Predictive Analytics Center" },
  "Forecast Overview": { uz: "Prognoz sharhi", ru: "Обзор прогноза", en: "Forecast Overview" },
  "Forecast Table": { uz: "Prognoz jadvali", ru: "Таблица прогноза", en: "Forecast Table" },
  "Fallback forecast ishlayapti": { uz: "Fallback prognoz ishlayapti", ru: "Fallback прогноз работает", en: "Fallback forecast is running" },
  "Forecast coverage pastroq": { uz: "Prognoz qamrovi pastroq", ru: "Покрытие прогноза ниже", en: "Forecast coverage is lower" },
  "High future risk": { uz: "Kelajakdagi risk yuqori", ru: "Высокий будущий риск", en: "High future risk" },
  "Crowd increase expected": { uz: "Odamlar soni oshishi kutilmoqda", ru: "Ожидается рост толпы", en: "Crowd increase expected" },
  "Forecast stable": { uz: "Prognoz barqaror", ru: "Прогноз стабилен", en: "Forecast stable" },
  "Evaluation & Governance": { uz: "Baholash va nazorat", ru: "Оценка и контроль", en: "Evaluation & Governance" },
  "AI-BI pipeline evaluation, compliance, audit, visitor flow and alert workflow in one evidence center.": {
    uz: "AI-BI pipeline baholash, compliance, audit, visitor flow va alert workflow bir evidence markazida.",
    ru: "Оценка AI-BI pipeline, compliance, audit, visitor flow и alert workflow в одном центре доказательств.",
    en: "AI-BI pipeline evaluation, compliance, audit, visitor flow and alert workflow in one evidence center.",
  },
  "Model Evaluation": { uz: "Model baholash", ru: "Оценка модели", en: "Model Evaluation" },
  "Estimated Precision": { uz: "Taxminiy precision", ru: "Оценочная precision", en: "Estimated Precision" },
  "Estimated Recall": { uz: "Taxminiy recall", ru: "Оценочная recall", en: "Estimated Recall" },
  "Scalability Score": { uz: "Scalability balli", ru: "Оценка масштабируемости", en: "Scalability Score" },
  "Veracity Score": { uz: "Veracity balli", ru: "Оценка достоверности", en: "Veracity Score" },
  "Pipeline Architecture": { uz: "Pipeline arxitekturasi", ru: "Архитектура pipeline", en: "Pipeline Architecture" },
  "Data Model": { uz: "Data modeli", ru: "Модель данных", en: "Data Model" },
  "Storage Strategy": { uz: "Storage strategiyasi", ru: "Стратегия хранения", en: "Storage Strategy" },
  "Visitor Entry / Exit": { uz: "Visitor kirish / chiqish", ru: "Вход / выход посетителей", en: "Visitor Entry / Exit" },
  "Entries": { uz: "Kirishlar", ru: "Входы", en: "Entries" },
  "Exits": { uz: "Chiqishlar", ru: "Выходы", en: "Exits" },
  "Current Inside": { uz: "Hozir ichkarida", ru: "Сейчас внутри", en: "Current Inside" },
  "Peak Occupancy": { uz: "Peak bandlik", ru: "Пиковая занятость", en: "Peak Occupancy" },
  "Privacy & Compliance": { uz: "Maxfiylik va compliance", ru: "Приватность и compliance", en: "Privacy & Compliance" },
  "Audit Log": { uz: "Audit log", ru: "Журнал аудита", en: "Audit Log" },
  "Alert Workflow": { uz: "Alert workflow", ru: "Workflow alert", en: "Alert Workflow" },
  "Assigned To": { uz: "Biriktirilgan", ru: "Назначено", en: "Assigned To" },
  "Operator Note": { uz: "Operator izohi", ru: "Заметка оператора", en: "Operator Note" },
  "Resolved At": { uz: "Yopilgan vaqt", ru: "Время закрытия", en: "Resolved At" },
  "Mark Resolved": { uz: "Resolved qilish", ru: "Отметить решенным", en: "Mark Resolved" },
  "Open Alerts": { uz: "Ochiq alertlar", ru: "Открытые alert", en: "Open Alerts" },
  "Resolved Alerts": { uz: "Yopilgan alertlar", ru: "Решенные alert", en: "Resolved Alerts" },
  "Controls": { uz: "Nazoratlar", ru: "Контроли", en: "Controls" },
  "Enabled": { uz: "Yoqilgan", ru: "Включено", en: "Enabled" },
  "Evidence": { uz: "Dalil", ru: "Доказательство", en: "Evidence" },
  "Data Inventory": { uz: "Data inventar", ru: "Инвентарь данных", en: "Data Inventory" },
  "Recommendations": { uz: "Tavsiyalar", ru: "Рекомендации", en: "Recommendations" },
  "Workflow updated": { uz: "Workflow yangilandi", ru: "Workflow обновлен", en: "Workflow updated" },
  "Quality": { uz: "Sifat", ru: "Качество", en: "Quality" },
  "Risk": { uz: "Risk", ru: "Риск", en: "Risk" },
  "People": { uz: "Odamlar", ru: "Люди", en: "People" },
  "Objects": { uz: "Obyektlar", ru: "Объекты", en: "Objects" },
  "Camera": { uz: "Kamera", ru: "Камера", en: "Camera" },
  "Status": { uz: "Holat", ru: "Статус", en: "Status" },
  "Source": { uz: "Manba", ru: "Источник", en: "Source" },
  "Filter": { uz: "Filter", ru: "Фильтр", en: "Filter" },
  "Sort": { uz: "Saralash", ru: "Сортировка", en: "Sort" },
  "All Cameras": { uz: "Barcha kameralar", ru: "Все камеры", en: "All Cameras" },
  "Online": { uz: "Online", ru: "Онлайн", en: "Online" },
  "Offline": { uz: "Offline", ru: "Офлайн", en: "Offline" },
  "High Risk": { uz: "Yuqori risk", ru: "Высокий риск", en: "High Risk" },
  "Low Quality": { uz: "Past sifat", ru: "Низкое качество", en: "Low Quality" },
};

const textOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Record<string, string>>();

function translateBridgeValue(value: string, language: Language) {
  const normalized = value.trim();
  if (!normalized) return value;
  const exact = bridgeTranslations[normalized]?.[language];
  if (exact) return value.replace(normalized, exact);

  let output = value;
  const phrases = Object.keys(bridgeTranslations).sort((a, b) => b.length - a.length);
  phrases.forEach((phrase) => {
    const translated = bridgeTranslations[phrase]?.[language];
    if (!translated || translated === phrase || !output.includes(phrase)) return;
    output = output.split(phrase).join(translated);
  });

  return output;
}

function applyDomBridge(language: Language) {
  if (typeof document === "undefined") return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  textNodes.forEach((node) => {
    const original = textOriginals.get(node) || node.nodeValue || "";
    const translated = translateBridgeValue(original, language);
    if (translated !== original || textOriginals.has(node)) {
      textOriginals.set(node, original);
      if (node.nodeValue !== translated) {
        node.nodeValue = translated;
      }
    }
  });

  document.querySelectorAll<HTMLElement>("[placeholder], [title], [aria-label]").forEach((element) => {
    ["placeholder", "title", "aria-label"].forEach((attr) => {
      const value = element.getAttribute(attr);
      if (!value) return;

      const saved = attrOriginals.get(element) || {};
      const original = saved[attr] || value;
      const translated = translateBridgeValue(original, language);

      if (translated !== original || saved[attr]) {
        attrOriginals.set(element, { ...saved, [attr]: original });
        if (element.getAttribute(attr) !== translated) {
          element.setAttribute(attr, translated);
        }
      }
    });
  });
}

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

  useEffect(() => {
    const run = () => applyDomBridge(language);
    run();
    const timer = window.setTimeout(run, 0);
    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"],
    });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [language]);

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
