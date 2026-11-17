/** Parse calendar wall time using its IANA zone, defaulting to our community.
 * DATE values represent local midnight. DTEND remains exclusive, as in iCal.
 * UTC values bypass zone conversion. Never use the server's local timezone.
 */
export function parseICalDate(value: string, timeZone = "America/Chicago"): string {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!match) throw new RangeError(`Invalid iCal date: ${value}`);
  const [, year, month, day, hour = "00", minute = "00", second = "00", utc] = match;
  const wallTime = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const expected = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  if (new Date(wallTime).toISOString().slice(0, 19) !== expected) {
    throw new RangeError(`Invalid iCal date: ${value}`);
  }
  if (utc) return new Date(wallTime).toISOString();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let instant = wallTime;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const adjustment = wallTime - represented;
    if (adjustment === 0) return new Date(instant).toISOString();
    instant += adjustment;
  }
  // A nonexistent spring-forward wall time must not silently become another time.
  throw new RangeError(`Nonexistent iCal wall time in ${timeZone}: ${value}`);
}
