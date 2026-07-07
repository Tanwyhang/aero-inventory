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
      { title: "Stock movement modal", body: "The modal shows current stock, after-stock, reason, and the calculated movement before anything is saved.", target: '[data-tutorial="stock-modal"]', action: "point" },
      { title: "Type counted stock", body: "Staff enter the real shelf count. Aero calculates whether it is an add or deduct movement.", target: '[data-tutorial="stock-modal-quantity"]', action: "type", value: "45", duration: 1800 },
      { title: "Review before confirm", body: "This is the final production action. In the tutorial we point at it only, so no real stock changes are saved.", target: '[data-tutorial="stock-modal-confirm"]', action: "point" },
      { title: "Close and continue", body: "After learning the movement form, close it and continue navigating the stock page.", target: '[aria-label="Close stock movement"]', action: "click" },
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
      { title: "New partner modal", body: "Use New Partner when a shop or reseller should receive share sheets regularly.", target: '[data-tutorial="partner-new-partner"]', action: "click" },
      { title: "Partner details", body: "Enter partner name, contact, phone, and notes so future sheets are quick to prepare.", target: '[data-tutorial="partner-modal-name"]', action: "type", value: "Demo Pet Partner", duration: 1800 },
      { title: "Review partner", body: "Partner saves are reviewed before recording, just like stock and SKU changes.", target: '[data-tutorial="partner-modal-review"]', action: "click" },
      { title: "Partner confirmation", body: "The confirmation sheet is where admins double-check the partner record before saving.", target: '[data-tutorial="confirmation-sheet"]', action: "point" },
      { title: "Close partner confirmation", body: "Close this training confirmation to continue the next modal flow.", target: '[aria-label="Close confirmation"]', action: "click" },
      { title: "Close partner form", body: "The guide closes the modal so you can learn the sheet flow next.", target: '[aria-label="Close partner form"]', action: "click" },
      { title: "New sheet modal", body: "New Sheet starts a fresh partner share list for a partner, location, and date.", target: '[data-tutorial="partner-new-sheet"]', action: "click" },
      { title: "Sheet date", body: "The date controls which day this partner share sheet belongs to.", target: '[data-tutorial="partner-modal-date"]', action: "point" },
      { title: "Review sheet", body: "Review opens a confirmation sheet before the new sheet is saved.", target: '[data-tutorial="partner-modal-review"]', action: "click" },
      { title: "Sheet confirmation", body: "The confirmation shows partner, shop, date, and approving user so the admin can catch mistakes.", target: '[data-tutorial="confirmation-sheet"]', action: "point" },
      { title: "Back to sheet", body: "Close confirmation and return to the sheet before adding products.", target: '[aria-label="Close confirmation"]', action: "click" },
      { title: "Close sheet form", body: "Close the sheet form when you only wanted to learn the flow.", target: '[aria-label="Close partner form"]', action: "click" },
      { title: "Add product modal", body: "Admins can open Add Product to browse every active SKU for this location without typing first.", target: '[data-tutorial="partner-add-product"]', action: "click" },
      { title: "Search products", body: "Search narrows the visible SKU list in real time when the sheet has many items.", target: '[data-tutorial="partner-modal-product-search"]', action: "type", value: "Whiskas", duration: 1800 },
      { title: "Quick-add list", body: "Every matching SKU stays visible in the scrollable list below the search bar so admins can add products fast.", target: '[data-tutorial="partner-modal-product-list"]', action: "point" },
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
      { title: "Contact supplier", body: "Use WhatsApp when a supplier phone number is available. The tutorial only points here; it does not send messages.", target: '[data-tutorial="restock-request"] a, [data-tutorial="restock-request"] button', action: "point" },
      { title: "Advance status", body: "After contacting the supplier, mark the request ordered, resolved, or discard it when no longer needed.", target: '[data-tutorial="restock-status-action"]', action: "click" },
      { title: "Confirm status change", body: "The confirmation sheet records the product, SKU, old status, new status, and requested quantity for audit trail.", target: '[data-tutorial="confirmation-sheet"]', action: "point" },
    ],
  },
  {
    id: "skus",
    label: "SKUs",
    description: "Create products, add variation types, and keep SKU metadata tidy.",
    role: "admin",
    steps: [
      { title: "SKU manager", body: "Admins maintain the source product catalog here. Staff use Stock, but SKU structure is owned here.", target: '[data-tutorial="nav-skus"]', action: "point" },
      { title: "Add SKU modal", body: "Use Add SKU for a brand new product or to start a new product family.", target: '[data-tutorial="sku-add"]', action: "click" },
      { title: "Product name", body: "Every SKU starts with a clear product name, category, supplier, price, and stock rules.", target: '[data-tutorial="sku-modal-name"]', action: "type", value: "Training Dental Chews", duration: 1900 },
      { title: "Review SKU", body: "The Review button opens a confirmation sheet before catalog changes are saved.", target: '[data-tutorial="sku-modal-review"]', action: "click" },
      { title: "SKU confirmation", body: "Admins confirm product, supplier, stock rules, and starting stock before saving.", target: '[data-tutorial="confirmation-sheet"]', action: "point" },
      { title: "Close confirmation", body: "Close the training confirmation to continue learning variation groups.", target: '[aria-label="Close confirmation"]', action: "click" },
      { title: "Close SKU form", body: "The guide closes the add form so the grouped SKU example is visible again.", target: '[aria-label="Close SKU form"]', action: "click" },
      { title: "Search catalog", body: "Search name, variant, SKU, category, or supplier to find a product before editing.", target: '[data-tutorial="sku-search"]', action: "type", value: "Whiskas", duration: 2500 },
      { title: "Grouped variations", body: "This parent-plus-child layout is the same concept used in Stock, so the warehouse view stays clean.", target: '[data-tutorial="sku-group"]', action: "point" },
      { title: "Add a type", body: "Use Type to add another variation under the same parent product instead of creating a scattered duplicate.", target: '[data-tutorial="sku-add-type"]', action: "click" },
      { title: "Add Types modal", body: "This modal inherits the main SKU information and asks only for the new type details.", target: '[data-tutorial="sku-modal"]', action: "point" },
      { title: "Type name", body: "Name the new variation clearly, for example a flavor, pack size, scent, or weight.", target: '[data-tutorial="sku-type-name"]', action: "type", value: "Beef 12x85g", duration: 1800 },
      { title: "Review SKU types", body: "Review opens a confirmation sheet before the SKU type is created.", target: '[data-tutorial="sku-modal-review"]', action: "click" },
      { title: "SKU confirmation", body: "Admins check every SKU, stock rule, supplier, and price before saving catalog changes.", target: '[data-tutorial="confirmation-sheet"]', action: "point" },
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
      { title: "Movement cards", body: "Open movement, restock, or audit cards to inspect exactly what changed and who did it.", target: '[data-tutorial="reports-movements-card"]', action: "click" },
      { title: "Report records modal", body: "The records modal lists every matching activity. Tap a row to see the full audit details.", target: '[data-tutorial="reports-modal"]', action: "point" },
      { title: "Open a detail", body: "Each record opens a detail modal with IDs, quantities, user, warehouse, and notes.", target: '[data-tutorial="reports-modal"] button', action: "click" },
      { title: "Report detail modal", body: "Use this modal when someone asks who changed stock, what changed, and why.", target: '[data-tutorial="reports-detail-modal"]', action: "point" },
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
