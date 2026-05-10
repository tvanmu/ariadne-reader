export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getRecentLocalDateKeys(dayCount: number, endDate = new Date()): string[] {
  const safeDayCount = Math.max(Math.floor(dayCount), 0);
  const dates: string[] = [];

  for (let dayOffset = safeDayCount - 1; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    date.setDate(date.getDate() - dayOffset);
    dates.push(getLocalDateKey(date));
  }

  return dates;
}
