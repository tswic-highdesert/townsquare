/** Format a date for display */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a date and time for display */
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Format just the time */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Severity badge colors */
export function severityColor(severity: string): string {
  switch (severity) {
    case "emergency":
      return "bg-red-700 text-white";
    case "urgent":
      return "bg-orange-600 text-white";
    case "warning":
      return "bg-amber-500 text-white";
    case "info":
    default:
      return "bg-sky-100 text-sky-800";
  }
}

/** Item type display label */
export function typeLabel(type: string): string {
  switch (type) {
    case "event":
      return "Event";
    case "notice":
      return "Notice";
    case "business":
      return "Business";
    case "story":
      return "Story";
    default:
      return type;
  }
}

/** Item type badge color */
export function typeColor(type: string): string {
  switch (type) {
    case "event":
      return "bg-emerald-100 text-emerald-800";
    case "notice":
      return "bg-amber-100 text-amber-800";
    case "business":
      return "bg-blue-100 text-blue-800";
    case "story":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/** Escape XML entities */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
