/**
 * Formats event start and end time consistently according to the design system:
 * Example: "Sat 18 Oct, 2:00-4:00 PM"
 */
export function formatEventDate(startStr?: string | null, endStr?: string | null): string {
  if (!startStr) return 'Date TBD';
  const start = new Date(startStr);
  if (isNaN(start.getTime())) return 'Invalid date';

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[start.getDay()];
  const dateNum = start.getDate();
  const monthName = months[start.getMonth()];

  const formatTime = (d: Date) => {
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    const minStr = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`;
    return { time: `${hours}${minStr}`, ampm };
  };

  const startTimeObj = formatTime(start);

  if (!endStr) {
    return `${dayName} ${dateNum} ${monthName}, ${startTimeObj.time} ${startTimeObj.ampm}`;
  }

  const end = new Date(endStr);
  if (isNaN(end.getTime())) {
    return `${dayName} ${dateNum} ${monthName}, ${startTimeObj.time} ${startTimeObj.ampm}`;
  }

  // Same day?
  const isSameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const endTimeObj = formatTime(end);

  if (isSameDay) {
    if (startTimeObj.ampm === endTimeObj.ampm) {
      return `${dayName} ${dateNum} ${monthName}, ${startTimeObj.time}–${endTimeObj.time} ${endTimeObj.ampm}`;
    } else {
      return `${dayName} ${dateNum} ${monthName}, ${startTimeObj.time} ${startTimeObj.ampm} – ${endTimeObj.time} ${endTimeObj.ampm}`;
    }
  }

  const endDayName = days[end.getDay()];
  const endDateNum = end.getDate();
  const endMonthName = months[end.getMonth()];

  return `${dayName} ${dateNum} ${monthName}, ${startTimeObj.time} ${startTimeObj.ampm} – ${endDayName} ${endDateNum} ${endMonthName}, ${endTimeObj.time} ${endTimeObj.ampm}`;
}

/**
 * Consistently format hall name and capacity:
 * Example: "Acharya Hall (Cap: 250)"
 */
export function formatHall(name?: string | null, capacity?: number | null): string {
  if (!name) return 'Venue TBD';
  if (capacity !== undefined && capacity !== null && capacity > 0) {
    return `${name} (Cap: ${capacity})`;
  }
  return name;
}

/**
 * Format standard date timestamps (e.g. created_at, decided_at)
 */
export function formatSimpleDate(dStr?: string | null): string {
  if (!dStr) return '—';
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minStr = minutes.toString().padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minStr} ${ampm}`;
}
