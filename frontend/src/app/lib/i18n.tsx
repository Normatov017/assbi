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
  "nav.anomalies": { uz: "Anomaliya detection", ru: "Детекция аномалий", en: "Anomaly Detection" },
  "nav.predictive": { uz: "Prognoz analitika", ru: "Прогнозная аналитика", en: "Predictive Analytics" },
  "nav.reports": { uz: "Hisobotlar", ru: "Отчеты", en: "Reports" },
  "nav.chatbot": { uz: "AI chatbot", ru: "AI чатбот", en: "AI Chatbot" },
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
  "dashboard.postureAnalytics": { uz: "Holat analitikasi", ru: "Аналитика поз", en: "Posture Analytics" },
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
  "dashboard.postureNoData": { uz: "Holat ma’lumoti hali mavjud emas.", ru: "Данных о позах пока нет.", en: "Posture data is not available yet." },
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
  "live.standing": { uz: "Tik turgan", ru: "Стоят", en: "Standing" },
  "live.sitting": { uz: "O‘tirgan", ru: "Сидят", en: "Sitting" },
  "live.frameUnavailable": { uz: "Kamera frame mavjud emas", ru: "Кадр камеры недоступен", en: "Camera frame not available" },
  "live.frameUnavailableHint": {
    uz: "Camera API ishlayotganini va frame_url qaytayotganini tekshiring.",
    ru: "Проверьте, что Camera API работает и возвращает frame_url.",
    en: "Check that Camera API is running and returning frame_url.",
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
  "Reports Warning": { uz: "Hisobot ogohlantirishi", ru: "Предупреждение отчетов", en: "Reports Warning" },
  "Start Date": { uz: "Boshlanish sanasi", ru: "Дата начала", en: "Start Date" },
  "End Date": { uz: "Tugash sanasi", ru: "Дата окончания", en: "End Date" },
  "Report Type": { uz: "Hisobot turi", ru: "Тип отчета", en: "Report Type" },
  "All Data": { uz: "Barcha ma’lumotlar", ru: "Все данные", en: "All Data" },
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
  "Filtered Cameras": { uz: "Filterlangan kameralar", ru: "Отфильтрованные камеры", en: "Filtered Cameras" },
  "All Objects": { uz: "Barcha obyektlar", ru: "Все объекты", en: "All Objects" },
  "Avg FPS": { uz: "O‘rtacha FPS", ru: "Средний FPS", en: "Avg FPS" },
  "Avg Quality": { uz: "O‘rtacha sifat", ru: "Среднее качество", en: "Avg Quality" },
  "Other": { uz: "Boshqa", ru: "Другое", en: "Other" },
  "Total": { uz: "Umumiy", ru: "Всего", en: "Total" },
  "Vehicle Warning": { uz: "Transport ogohlantirishi", ru: "Предупреждение транспорта", en: "Vehicle Warning" },
  "Laptop/Phone": { uz: "Noutbuk/telefon", ru: "Ноутбук/телефон", en: "Laptop/Phone" },
  "Recommendation": { uz: "Tavsiya", ru: "Рекомендация", en: "Recommendation" },
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
  const translated = bridgeTranslations[normalized]?.[language];
  if (!translated) return value;
  return value.replace(normalized, translated);
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
