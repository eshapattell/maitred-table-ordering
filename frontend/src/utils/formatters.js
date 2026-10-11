// formatters.js: Currency and number formatting utilities
export const formatPrice = (n) => {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
};
