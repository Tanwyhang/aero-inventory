export type TutorialLessonId = "stock" | "partner" | "restock" | "skus" | "reports" | "roles";
export type TutorialAction = "point" | "click" | "type" | "scroll";

export type TutorialStep = {
  title: string;
  body: string;
  target: string;
  action?: TutorialAction;
  value?: string;
  duration?: number;
};

export type TutorialLesson = {
  id: TutorialLessonId;
  label: string;
  description: string;
  role: "all" | "admin" | "staff";
  steps: TutorialStep[];
};

export const tutorialLessons: TutorialLesson[] = [
  {
    id: "stock",
    label: "Stock",
    description: "Search products, read parent bundles, and adjust child SKU stock safely.",
    role: "all",
    steps: [
      { title: "Start with Stock", body: "This is the main warehouse dashboard. Staff and admins both use it for daily stock counts.", target: '[data-tutorial="nav-stock"]', action: "point" },
      { title: "Search any SKU", body: "Type a product, variant, category, or SKU. Related child variations stay bundled under the parent.", target: '[data-tutorial="stock-search"]', action: "type", value: "Whiskas", duration: 2600 },
      { title: "Parent bundle", body: "The parent card summarizes the product family. Total stock and low-stock totals are shown once, instead of scattered rows.", target: '[data-tutorial="stock-group"]', action: "point" },
      { title: "Child SKU actions", body: "Each variation remains individually adjustable. Use plus or minus on the exact child SKU you counted.", target: '[data-tutorial="stock-group"] button[aria-label^="Add stock"]', action: "click" },
      { title: "Low filter", body: "Use Low or Out to focus only on urgent inventory. Parent bundles appear if any child SKU needs attention.", target: '[data-tutorial="stock-filter-low"]', action: "click" },
    ],
  },
  {
    id: "partner",
    label: "Partner Share",
    description: "Prepare share sheets, edit share quantities, and export partner-ready lists.",
    role: "all",
    steps: [
      { title: "Partner Share", body: "Use this tab when another partner shop needs a controlled product quantity list.", target: '[data-tutorial="nav-partner"]', action: "point" },
      { title: "Find sheets", body: "Search by partner, shop, date, or status to find the right sheet quickly.", target: '[data-tutorial="partner-search"]', action: "type", value: "Whisker", duration: 2200 },
      { title: "Current sheet", body: "The selected sheet shows status, source shop, date, product count, and the partner-ready product table.", target: '[data-tutorial="partner-sheet"]', action: "point" },
      { title: "Share quantity", body: "Change only the share quantity for the product being sent. The tutorial types into demo data only.", target: '[data-tutorial="partner-share-qty"]', action: "type", value: "8", duration: 1800 },
      { title: "Export or WhatsApp", body: "Admins can copy a WhatsApp message or export Excel after checking the quantities.", target: '[data-tutorial="partner-sheet"] button', action: "point" },
    ],
  },
  {
    id: "restock",
    label: "Restock",
    description: "Follow up low-stock requests with suppliers and close the operational loop.",
    role: "admin",
    steps: [
      { title: "Restock queue", body: "Admins use this queue to contact suppliers and record what happened next.", target: '[data-tutorial="nav-restock"]', action: "point" },
      { title: "Open request", body: "Each request shows product, SKU, current quantity, low-stock threshold, and who requested it.", target: '[data-tutorial="restock-request"]', action: "point" },
      { title: "Contact supplier", body: "Use WhatsApp when a supplier phone number is available. The tutorial only points here; it does not send messages.", target: '[data-tutorial="restock-request"] a, [data-tutorial="restock-request"] button', action: "click" },
      { title: "Advance status", body: "After contacting the supplier, mark the request ordered, resolved, or discard it when no longer needed.", target: '[data-tutorial="restock-request"] button[aria-label], [data-tutorial="restock-request"] button', action: "point" },
    ],
  },
  {
    id: "skus",
    label: "SKUs",
    description: "Create products, add variation types, and keep SKU metadata tidy.",
    role: "admin",
    steps: [
      { title: "SKU manager", body: "Admins maintain the source product catalog here. Staff use Stock, but SKU structure is owned here.", target: '[data-tutorial="nav-skus"]', action: "point" },
      { title: "Search catalog", body: "Search name, variant, SKU, category, or supplier to find a product before editing.", target: '[data-tutorial="sku-search"]', action: "type", value: "Whiskas", duration: 2500 },
      { title: "Grouped variations", body: "This parent-plus-child layout is the same concept used in Stock, so the warehouse view stays clean.", target: '[data-tutorial="sku-group"]', action: "point" },
      { title: "Add a type", body: "Use Type to add another variation under the same parent product instead of creating a scattered duplicate.", target: '[data-tutorial="sku-add-type"]', action: "click" },
      { title: "Add SKU", body: "Use Add SKU for a new standalone product or to start a new product family with types.", target: '[data-tutorial="sku-add"]', action: "point" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    description: "Read stock movements, restock activity, and audit records.",
    role: "admin",
    steps: [
      { title: "Reports", body: "Reports are admin-only and show operational history for stock and restock workflows.", target: '[data-tutorial="nav-reports"]', action: "point" },
      { title: "Movement trend", body: "The chart summarizes recent stock movement volume so spikes are easy to spot.", target: '[data-tutorial="reports-chart"]', action: "point" },
      { title: "Movement cards", body: "Open movement, restock, or audit cards to inspect exactly what changed and who did it.", target: '[data-tutorial="reports-lists"]', action: "click" },
    ],
  },
  {
    id: "roles",
    label: "Admin vs Staff",
    description: "Understand who can see suppliers, manage SKUs, and update stock.",
    role: "all",
    steps: [
      { title: "Role badge", body: "Admin view includes supplier contact actions, SKU management, restock, and reports. Staff-safe view hides admin-only controls.", target: '[data-tutorial="role-badge"]', action: "point" },
      { title: "Staff tabs", body: "Staff focus on Stock and Partner Share. Admins get the full operations suite.", target: '[data-tutorial="nav-stock"]', action: "point" },
      { title: "Training is safe", body: "This embedded tutorial uses demo data and blocked clicks. Nothing in production inventory is changed here.", target: '[data-tutorial="tutorial-safety"]', action: "point" },
    ],
  },
];

export function getLesson(id: string | null | undefined, role: "admin" | "staff") {
  const lessons = tutorialLessons.filter((lesson) => lesson.role === "all" || lesson.role === role);
  return lessons.find((lesson) => lesson.id === id) ?? lessons[0];
}

export function getVisibleLessons(role: "admin" | "staff") {
  return tutorialLessons.filter((lesson) => lesson.role === "all" || lesson.role === role);
}
