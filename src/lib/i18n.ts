export type Locale = "en" | "ar";

const EN = {
  start: "Start",
  search: "Search",
  connections: "Connections",
  settings: "Settings",
  workstation: "Workstation",
  localOnly: "Local only",
  providers: "Model providers",
  local: "This PC",
  cloud: "Cloud companies",
  scm: "Source control",
  connect: "Connect",
  disconnect: "Disconnect",
  probe: "Probe",
  ready: "Ready",
  disconnected: "Disconnected",
  language: "Language",
  theme: "Theme",
  pearlDark: "Pearl dark",
  pearlLight: "Pearl light",
  actionCenter: "Action center",
  windowsAgent: "Intelligence Editor",
};

const AR: Record<keyof typeof EN, string> = {
  start: "ابدأ",
  search: "بحث",
  connections: "الاتصالات",
  settings: "الإعدادات",
  workstation: "محطة العمل",
  localOnly: "محلي فقط",
  providers: "محركات النماذج",
  local: "هذا الجهاز",
  cloud: "شركات السحابة",
  scm: "إدارة المصدر",
  connect: "ربط",
  disconnect: "قطع",
  probe: "فحص",
  ready: "جاهز",
  disconnected: "غير متصل",
  language: "اللغة",
  theme: "السمة",
  pearlDark: "لؤلؤة داكنة",
  pearlLight: "لؤلؤة فاتحة",
  actionCenter: "مركز الإجراءات",
  windowsAgent: "محرر الذكاء",
};

export function t(locale: Locale, key: keyof typeof EN): string {
  return (locale === "ar" ? AR : EN)[key];
}
