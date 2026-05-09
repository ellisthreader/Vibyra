type Lang = "English" | "Español" | "Français" | "Deutsch" | "日本語" | "中文" | "Português";

type Dict = Record<string, string>;

const en: Dict = {
  "profile.account": "ACCOUNT",
  "profile.preferences": "PREFERENCES",
  "profile.support": "SUPPORT",
  "profile.row.profileInformation": "Profile information",
  "profile.row.billing": "Billing & subscription",
  "profile.row.usage": "Usage & history",
  "profile.row.refer": "Refer & earn",
  "profile.row.notifications": "Notifications",
  "profile.row.appearance": "Appearance",
  "profile.row.security": "Privacy & security",
  "profile.row.language": "Language",
  "profile.row.help": "Help center",
  "profile.row.contact": "Contact support",
  "profile.row.terms": "Terms of service",
  "profile.row.logout": "Log out",
  "profile.tokensRemaining": "tokens remaining",
  "profile.renewsOn": "Renews on",
  "profile.currentPlan": "Current plan",
  "profile.freeTrial": "Free trial",
  "billing.title": "Pick your plan",
  "billing.tokens": "tokens",
  "billing.manage": "Manage payment & invoices",
  "billing.secure": "Secure payments powered by Stripe",
  "billing.upgrade": "Upgrade",
  "billing.upgradeTo": "Upgrade to",
  "billing.current": "Current",
  "billing.recommended": "Recommended",
  "billing.mostPopular": "Most popular",
  "billing.monthly": "Monthly",
  "billing.annual": "Annual",
  "billing.twoMonthsFree": "2 MONTHS FREE",
  "usage.title": "Usage & history",
  "usage.tokensThisCycle": "Tokens this cycle",
  "usage.resetsMonthly": "resets monthly",
  "usage.recentProjects": "Recent projects",
  "usage.recentChats": "Recent chats",
  "usage.projects": "Projects",
  "usage.messages": "Messages",
  "usage.upgradePlan": "Upgrade plan",
  "usage.managePlan": "Manage plan",
  "usage.noProjects": "No projects yet — start a build to see it here.",
  "usage.noChats": "Your conversations will appear here once you chat with an agent.",
  "usage.active": "active"
};

const es: Dict = {
  "profile.account": "CUENTA",
  "profile.preferences": "PREFERENCIAS",
  "profile.support": "AYUDA",
  "profile.row.profileInformation": "Información del perfil",
  "profile.row.billing": "Facturación y suscripción",
  "profile.row.usage": "Uso e historial",
  "profile.row.refer": "Recomienda y gana",
  "profile.row.notifications": "Notificaciones",
  "profile.row.appearance": "Apariencia",
  "profile.row.security": "Privacidad y seguridad",
  "profile.row.language": "Idioma",
  "profile.row.help": "Centro de ayuda",
  "profile.row.contact": "Contactar soporte",
  "profile.row.terms": "Términos del servicio",
  "profile.row.logout": "Cerrar sesión",
  "profile.tokensRemaining": "fichas restantes",
  "profile.renewsOn": "Se renueva el",
  "profile.currentPlan": "Plan actual",
  "profile.freeTrial": "Prueba gratuita",
  "billing.title": "Elige tu plan",
  "billing.tokens": "fichas",
  "billing.manage": "Gestionar pagos y facturas",
  "billing.secure": "Pagos seguros con Stripe",
  "billing.upgrade": "Mejorar",
  "billing.upgradeTo": "Cambiar a",
  "billing.current": "Actual",
  "billing.recommended": "Recomendado",
  "billing.mostPopular": "Más popular",
  "billing.monthly": "Mensual",
  "billing.annual": "Anual",
  "billing.twoMonthsFree": "2 MESES GRATIS",
  "usage.title": "Uso e historial",
  "usage.tokensThisCycle": "Fichas este ciclo",
  "usage.resetsMonthly": "se renueva mensualmente",
  "usage.recentProjects": "Proyectos recientes",
  "usage.recentChats": "Chats recientes",
  "usage.projects": "Proyectos",
  "usage.messages": "Mensajes",
  "usage.upgradePlan": "Mejorar plan",
  "usage.managePlan": "Gestionar plan",
  "usage.noProjects": "Aún no hay proyectos — empieza una construcción para verla aquí.",
  "usage.noChats": "Tus conversaciones aparecerán aquí cuando hables con un agente.",
  "usage.active": "activos"
};

const fr: Dict = {
  "profile.account": "COMPTE",
  "profile.preferences": "PRÉFÉRENCES",
  "profile.support": "ASSISTANCE",
  "profile.row.profileInformation": "Informations du profil",
  "profile.row.billing": "Facturation et abonnement",
  "profile.row.usage": "Utilisation et historique",
  "profile.row.refer": "Parrainez et gagnez",
  "profile.row.notifications": "Notifications",
  "profile.row.appearance": "Apparence",
  "profile.row.security": "Confidentialité et sécurité",
  "profile.row.language": "Langue",
  "profile.row.help": "Centre d'aide",
  "profile.row.contact": "Contacter le support",
  "profile.row.terms": "Conditions d'utilisation",
  "profile.row.logout": "Se déconnecter",
  "profile.tokensRemaining": "jetons restants",
  "profile.renewsOn": "Renouvelé le",
  "profile.currentPlan": "Plan actuel",
  "profile.freeTrial": "Essai gratuit",
  "billing.title": "Choisissez votre plan",
  "billing.tokens": "jetons",
  "billing.manage": "Gérer paiements et factures",
  "billing.secure": "Paiements sécurisés via Stripe",
  "billing.upgrade": "Améliorer",
  "billing.upgradeTo": "Passer à",
  "billing.current": "Actuel",
  "billing.recommended": "Recommandé",
  "billing.mostPopular": "Plus populaire",
  "billing.monthly": "Mensuel",
  "billing.annual": "Annuel",
  "billing.twoMonthsFree": "2 MOIS OFFERTS",
  "usage.title": "Utilisation et historique",
  "usage.tokensThisCycle": "Jetons ce cycle",
  "usage.resetsMonthly": "réinitialisé chaque mois",
  "usage.recentProjects": "Projets récents",
  "usage.recentChats": "Discussions récentes",
  "usage.projects": "Projets",
  "usage.messages": "Messages",
  "usage.upgradePlan": "Améliorer le plan",
  "usage.managePlan": "Gérer le plan",
  "usage.noProjects": "Pas encore de projets — lancez une construction pour la voir ici.",
  "usage.noChats": "Vos conversations apparaîtront ici dès que vous discuterez avec un agent.",
  "usage.active": "actives"
};

const de: Dict = {
  "profile.account": "KONTO",
  "profile.preferences": "EINSTELLUNGEN",
  "profile.support": "HILFE",
  "profile.row.profileInformation": "Profilinformationen",
  "profile.row.billing": "Abrechnung & Abonnement",
  "profile.row.usage": "Nutzung & Verlauf",
  "profile.row.refer": "Empfehlen & verdienen",
  "profile.row.notifications": "Benachrichtigungen",
  "profile.row.appearance": "Erscheinungsbild",
  "profile.row.security": "Datenschutz & Sicherheit",
  "profile.row.language": "Sprache",
  "profile.row.help": "Hilfecenter",
  "profile.row.contact": "Support kontaktieren",
  "profile.row.terms": "Nutzungsbedingungen",
  "profile.row.logout": "Abmelden",
  "profile.tokensRemaining": "Tokens übrig",
  "profile.renewsOn": "Verlängert am",
  "profile.currentPlan": "Aktueller Plan",
  "profile.freeTrial": "Kostenlose Testphase",
  "billing.title": "Wähle deinen Plan",
  "billing.tokens": "Tokens",
  "billing.manage": "Zahlungen & Rechnungen verwalten",
  "billing.secure": "Sichere Zahlungen über Stripe",
  "billing.upgrade": "Upgrade",
  "billing.upgradeTo": "Wechseln zu",
  "billing.current": "Aktuell",
  "billing.recommended": "Empfohlen",
  "billing.mostPopular": "Am beliebtesten",
  "billing.monthly": "Monatlich",
  "billing.annual": "Jährlich",
  "billing.twoMonthsFree": "2 MONATE GRATIS",
  "usage.title": "Nutzung & Verlauf",
  "usage.tokensThisCycle": "Tokens in diesem Zyklus",
  "usage.resetsMonthly": "monatliche Erneuerung",
  "usage.recentProjects": "Letzte Projekte",
  "usage.recentChats": "Letzte Chats",
  "usage.projects": "Projekte",
  "usage.messages": "Nachrichten",
  "usage.upgradePlan": "Plan upgraden",
  "usage.managePlan": "Plan verwalten",
  "usage.noProjects": "Noch keine Projekte — starte einen Build, um ihn hier zu sehen.",
  "usage.noChats": "Deine Unterhaltungen erscheinen hier, sobald du mit einem Agenten chattest.",
  "usage.active": "aktiv"
};

const ja: Dict = {
  "profile.account": "アカウント",
  "profile.preferences": "設定",
  "profile.support": "サポート",
  "profile.row.profileInformation": "プロフィール情報",
  "profile.row.billing": "請求とサブスクリプション",
  "profile.row.usage": "使用状況と履歴",
  "profile.row.refer": "友達紹介",
  "profile.row.notifications": "通知",
  "profile.row.appearance": "外観",
  "profile.row.security": "プライバシーとセキュリティ",
  "profile.row.language": "言語",
  "profile.row.help": "ヘルプセンター",
  "profile.row.contact": "サポートに連絡",
  "profile.row.terms": "利用規約",
  "profile.row.logout": "ログアウト",
  "profile.tokensRemaining": "残りトークン",
  "profile.renewsOn": "更新日",
  "profile.currentPlan": "現在のプラン",
  "profile.freeTrial": "無料トライアル",
  "billing.title": "プランを選択",
  "billing.tokens": "トークン",
  "billing.manage": "支払い・請求書を管理",
  "billing.secure": "Stripeによる安全な決済",
  "billing.upgrade": "アップグレード",
  "billing.upgradeTo": "アップグレード:",
  "billing.current": "現在",
  "billing.recommended": "おすすめ",
  "billing.mostPopular": "人気No.1",
  "billing.monthly": "月額",
  "billing.annual": "年額",
  "billing.twoMonthsFree": "2ヶ月分無料",
  "usage.title": "使用状況と履歴",
  "usage.tokensThisCycle": "今期のトークン",
  "usage.resetsMonthly": "毎月リセット",
  "usage.recentProjects": "最近のプロジェクト",
  "usage.recentChats": "最近のチャット",
  "usage.projects": "プロジェクト",
  "usage.messages": "メッセージ",
  "usage.upgradePlan": "プランをアップグレード",
  "usage.managePlan": "プランを管理",
  "usage.noProjects": "プロジェクトがまだありません — ビルドを開始して表示します。",
  "usage.noChats": "エージェントと会話するとここに表示されます。",
  "usage.active": "アクティブ"
};

const zh: Dict = {
  "profile.account": "账户",
  "profile.preferences": "偏好设置",
  "profile.support": "支持",
  "profile.row.profileInformation": "个人资料",
  "profile.row.billing": "账单与订阅",
  "profile.row.usage": "使用情况与历史",
  "profile.row.refer": "推荐获奖",
  "profile.row.notifications": "通知",
  "profile.row.appearance": "外观",
  "profile.row.security": "隐私与安全",
  "profile.row.language": "语言",
  "profile.row.help": "帮助中心",
  "profile.row.contact": "联系客服",
  "profile.row.terms": "服务条款",
  "profile.row.logout": "退出登录",
  "profile.tokensRemaining": "剩余代币",
  "profile.renewsOn": "续订日",
  "profile.currentPlan": "当前套餐",
  "profile.freeTrial": "免费试用",
  "billing.title": "选择套餐",
  "billing.tokens": "代币",
  "billing.manage": "管理付款和发票",
  "billing.secure": "由 Stripe 提供安全支付",
  "billing.upgrade": "升级",
  "billing.upgradeTo": "升级到",
  "billing.current": "当前",
  "billing.recommended": "推荐",
  "billing.mostPopular": "最受欢迎",
  "billing.monthly": "月付",
  "billing.annual": "年付",
  "billing.twoMonthsFree": "免费2个月",
  "usage.title": "使用情况与历史",
  "usage.tokensThisCycle": "本周期代币",
  "usage.resetsMonthly": "每月重置",
  "usage.recentProjects": "最近项目",
  "usage.recentChats": "最近对话",
  "usage.projects": "项目",
  "usage.messages": "消息",
  "usage.upgradePlan": "升级套餐",
  "usage.managePlan": "管理套餐",
  "usage.noProjects": "暂无项目 — 开始构建后将显示在此处。",
  "usage.noChats": "与代理对话后，您的会话将显示在此处。",
  "usage.active": "活跃"
};

const pt: Dict = {
  "profile.account": "CONTA",
  "profile.preferences": "PREFERÊNCIAS",
  "profile.support": "AJUDA",
  "profile.row.profileInformation": "Informações do perfil",
  "profile.row.billing": "Faturação e subscrição",
  "profile.row.usage": "Utilização e histórico",
  "profile.row.refer": "Indique e ganhe",
  "profile.row.notifications": "Notificações",
  "profile.row.appearance": "Aparência",
  "profile.row.security": "Privacidade e segurança",
  "profile.row.language": "Idioma",
  "profile.row.help": "Centro de ajuda",
  "profile.row.contact": "Contactar suporte",
  "profile.row.terms": "Termos de serviço",
  "profile.row.logout": "Terminar sessão",
  "profile.tokensRemaining": "tokens restantes",
  "profile.renewsOn": "Renova a",
  "profile.currentPlan": "Plano atual",
  "profile.freeTrial": "Teste gratuito",
  "billing.title": "Escolha o seu plano",
  "billing.tokens": "tokens",
  "billing.manage": "Gerir pagamentos e faturas",
  "billing.secure": "Pagamentos seguros via Stripe",
  "billing.upgrade": "Atualizar",
  "billing.upgradeTo": "Mudar para",
  "billing.current": "Atual",
  "billing.recommended": "Recomendado",
  "billing.mostPopular": "Mais popular",
  "billing.monthly": "Mensal",
  "billing.annual": "Anual",
  "billing.twoMonthsFree": "2 MESES GRÁTIS",
  "usage.title": "Utilização e histórico",
  "usage.tokensThisCycle": "Tokens deste ciclo",
  "usage.resetsMonthly": "renova mensalmente",
  "usage.recentProjects": "Projetos recentes",
  "usage.recentChats": "Conversas recentes",
  "usage.projects": "Projetos",
  "usage.messages": "Mensagens",
  "usage.upgradePlan": "Atualizar plano",
  "usage.managePlan": "Gerir plano",
  "usage.noProjects": "Ainda sem projetos — inicie uma construção para ver aqui.",
  "usage.noChats": "As suas conversas aparecerão aqui assim que falar com um agente.",
  "usage.active": "ativos"
};

const TRANSLATIONS: Record<Lang, Dict> = {
  English: en,
  "Español": es,
  "Français": fr,
  "Deutsch": de,
  "日本語": ja,
  "中文": zh,
  "Português": pt
};

export function translate(language: string, key: string): string {
  const dict = (TRANSLATIONS as Record<string, Dict>)[language] ?? en;
  return dict[key] ?? en[key] ?? key;
}

const MONTHS_LONG: Record<Lang, string[]> = {
  English: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  "Español": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  "Français": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  "Deutsch": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
  "日本語": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  "中文": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  "Português": ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
};

export function localizedDate(language: string, date: Date): string {
  const lang = (language as Lang) in MONTHS_LONG ? (language as Lang) : "English";
  const months = MONTHS_LONG[lang];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  switch (lang) {
    case "English": return `${m} ${d}, ${y}`;
    case "Español": return `${d} de ${m} de ${y}`;
    case "Français": return `${d} ${m} ${y}`;
    case "Deutsch": return `${d}. ${m} ${y}`;
    case "日本語": return `${y}年${date.getMonth() + 1}月${d}日`;
    case "中文": return `${y}年${date.getMonth() + 1}月${d}日`;
    case "Português": return `${d} de ${m} de ${y}`;
  }
}

const NUMBER_SEPARATORS: Record<Lang, string> = {
  English: ",",
  "Español": ".",
  "Français": " ",
  "Deutsch": ".",
  "日本語": ",",
  "中文": ",",
  "Português": " "
};

export function localizedNumber(language: string, value: number): string {
  const lang = (language as Lang) in NUMBER_SEPARATORS ? (language as Lang) : "English";
  const sep = NUMBER_SEPARATORS[lang];
  const isNegative = value < 0;
  const abs = Math.abs(Math.round(value));
  const str = abs.toString();
  let out = "";
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += sep;
    out += str[i];
  }
  return isNegative ? `-${out}` : out;
}
