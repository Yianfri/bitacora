export function dateLabel(value: string, long = false): string {
  const [year, month, day] = value.split('-').map(Number);
  // Noon in local time preserves a calendar date; it is never parsed as a UTC instant.
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' as const } : {}),
  }).format(new Date(year, month - 1, day, 12));
}
export function money(value: number | null): string {
  return value === null
    ? 'Sin estimar'
    : new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }).format(value);
}
export function distance(value: number | null): string {
  return value === null
    ? 'Sin estimar'
    : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(value) + ' km';
}
