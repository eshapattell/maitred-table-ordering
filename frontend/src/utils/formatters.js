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

export const formatClock = (isoString) => {
  if (
    isoString === null ||
    isoString === undefined ||
    isoString === "" ||
    typeof isoString === "boolean" ||
    (typeof isoString !== "string" && typeof isoString !== "number" && !(isoString instanceof Date))
  ) {
    return "";
  }
  const date = isoString instanceof Date ? isoString : new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

