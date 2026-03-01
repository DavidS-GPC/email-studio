function parseLocalDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  return {
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
  };
}

function getTimeZoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(at);

  const zonePart = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  if (zonePart === "GMT" || zonePart === "UTC") {
    return 0;
  }

  const match = zonePart.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unsupported time zone offset format: ${zonePart}`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] || "0", 10);
  return sign * (hours * 60 + minutes) * 60_000;
}

export function localDateTimeInZoneToUtc(localDateTime: string, timeZone: string): Date {
  const parsed = parseLocalDateTime(localDateTime);
  if (!parsed) {
    throw new Error("Invalid local datetime format");
  }

  const baseUtcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0, 0);

  const firstOffset = getTimeZoneOffsetMs(timeZone, new Date(baseUtcMs));
  const firstGuessMs = baseUtcMs - firstOffset;

  const secondOffset = getTimeZoneOffsetMs(timeZone, new Date(firstGuessMs));
  return new Date(baseUtcMs - secondOffset);
}

export function formatInTimeZone(isoValue: string | null, timeZone: string): string {
  if (!isoValue) {
    return "";
  }

  const value = new Date(isoValue);
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
