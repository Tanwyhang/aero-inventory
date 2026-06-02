export const STOCK_ADJUSTMENT_REASONS = [
  "Returned",
  "New Products",
  "Stock Adjustment",
  "Transfer",
  "Others",
  "Excel Import",
  "Warehouse Transfer",
] as const;

export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export const DEFAULT_STOCK_ADJUSTMENT_REASON: StockAdjustmentReason = "Stock Adjustment";
