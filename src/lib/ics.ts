import { EventFormData } from "@/types/event";

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.substring(0, 75));
  let i = 75;
  while (i < line.length) {
    chunks.push(" " + line.substring(i, i + 74));
    i += 74;
  }
  return chunks.join("\r\n");
}

function formatDateTimeWithTZ(dateStr: string, timeStr: string, timezone: string): string {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  if (timezone === "UTC") {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return (
      dt.getUTCFullYear().toString() +
      pad(dt.getUTCMonth() + 1) +
      pad(dt.getUTCDate()) +
      "T" +
      pad(dt.getUTCHours()) +
      pad(dt.getUTCMinutes()) +
      pad(dt.getUTCSeconds()) +
      "Z"
    );
  }
  // For non-UTC timezones use TZID format
  const pad = (n: number) => n.toString().padStart(2, "0");
  const localDt = new Date(`${dateStr}T${timeStr}:00`);
  return (
    localDt.getFullYear().toString() +
    pad(localDt.getMonth() + 1) +
    pad(localDt.getDate()) +
    "T" +
    pad(localDt.getHours()) +
    pad(localDt.getMinutes()) +
    pad(localDt.getSeconds())
  );
}

function formatAllDay(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function formatDtstamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "T" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) +
    "Z"
  );
}

function generateUID(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${timestamp}-${random}@ics-generator.app`;
}

function buildRRule(recurrence: EventFormData["recurrence"]): string {
  if (!recurrence.freq) return "";
  const parts: string[] = [`FREQ=${recurrence.freq}`];
  if (recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.byDay && recurrence.byDay.length > 0) {
    parts.push(`BYDAY=${recurrence.byDay.join(",")}`);
  }
  if (recurrence.count && recurrence.count > 0) {
    parts.push(`COUNT=${recurrence.count}`);
  } else if (recurrence.until) {
    parts.push(`UNTIL=${formatAllDay(recurrence.until)}T000000Z`);
  }
  return `RRULE:${parts.join(";")}`;
}

function buildValarm(minutes: number, uid: string): string[] {
  const lines: string[] = [];
  lines.push("BEGIN:VALARM");
  lines.push("ACTION:DISPLAY");
  if (minutes === 0) {
    lines.push("TRIGGER:PT0S");
  } else {
    lines.push(`TRIGGER:-PT${minutes}M`);
  }
  lines.push(`DESCRIPTION:Reminder`);
  lines.push(`UID:${uid}-alarm-${minutes}`);
  lines.push("END:VALARM");
  return lines;
}

export function generateICS(data: EventFormData | EventFormData[]): string {
  const events = Array.isArray(data) ? data : [data];
  if (events.length === 0) return "";

  const lines: string[] = [];

  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//ICS Generator//Apple Calendar Compatible//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  
  if (events.length === 1) {
    const safeTitle = escapeICSText(events[0].title || "Event");
    lines.push(`X-WR-CALNAME:${safeTitle}`);
    lines.push(`X-WR-TIMEZONE:${events[0].timezone}`);
  } else {
    lines.push("X-WR-CALNAME:Event Pack");
  }

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");

    const uid = generateUID();
    lines.push(`UID:${uid}`);
    const dtstamp = formatDtstamp();
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`CREATED:${dtstamp}`);
    lines.push(`LAST-MODIFIED:${dtstamp}`);

    // DTSTART / DTEND
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatAllDay(ev.startDate)}`);
      // For all-day, DTEND is exclusive (next day)
      const endDateObj = new Date(ev.endDate + "T00:00:00");
      endDateObj.setDate(endDateObj.getDate() + 1);
      const pad = (n: number) => n.toString().padStart(2, "0");
      const nextDay = `${endDateObj.getFullYear()}${pad(endDateObj.getMonth() + 1)}${pad(endDateObj.getDate())}`;
      lines.push(`DTEND;VALUE=DATE:${nextDay}`);
    } else {
      if (ev.timezone === "UTC") {
        lines.push(`DTSTART:${formatDateTimeWithTZ(ev.startDate, ev.startTime, ev.timezone)}`);
        lines.push(`DTEND:${formatDateTimeWithTZ(ev.endDate, ev.endTime, ev.timezone)}`);
      } else {
        lines.push(`DTSTART;TZID=${ev.timezone}:${formatDateTimeWithTZ(ev.startDate, ev.startTime, ev.timezone)}`);
        lines.push(`DTEND;TZID=${ev.timezone}:${formatDateTimeWithTZ(ev.endDate, ev.endTime, ev.timezone)}`);
      }
    }

    lines.push(foldLine(`SUMMARY:${escapeICSText(ev.title)}`));

    if (ev.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeICSText(ev.description)}`));
    }

    if (ev.location) {
      lines.push(foldLine(`LOCATION:${escapeICSText(ev.location)}`));
    }

    if (ev.url) {
      lines.push(foldLine(`URL:${ev.url}`));
    }

    if (ev.notes) {
      lines.push(foldLine(`COMMENT:${escapeICSText(ev.notes)}`));
    }

    if (ev.organizer && ev.organizerEmail) {
      lines.push(foldLine(`ORGANIZER;CN=${escapeICSText(ev.organizer)}:MAILTO:${ev.organizerEmail}`));
    } else if (ev.organizer) {
      lines.push(foldLine(`ORGANIZER;CN=${escapeICSText(ev.organizer)}:MAILTO:noreply@ics-generator.app`));
    }

    // RRULE
    if (ev.recurrence.freq) {
      const rrule = buildRRule(ev.recurrence);
      if (rrule) lines.push(foldLine(rrule));
    }

    // EXDATE
    if (ev.exdates && ev.exdates.length > 0) {
      const validExdates = ev.exdates.filter((d) => d.trim() !== "");
      if (validExdates.length > 0) {
        if (ev.allDay) {
          lines.push(`EXDATE;VALUE=DATE:${validExdates.map((d) => formatAllDay(d)).join(",")}`);
        } else {
          if (ev.timezone === "UTC") {
            lines.push(`EXDATE:${validExdates.map((d) => formatDateTimeWithTZ(d, ev.startTime, ev.timezone)).join(",")}`);
          } else {
            lines.push(`EXDATE;TZID=${ev.timezone}:${validExdates.map((d) => formatDateTimeWithTZ(d, ev.startTime, ev.timezone)).join(",")}`);
          }
        }
      }
    }

    lines.push("CLASS:PUBLIC");
    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:OPAQUE");
    lines.push("SEQUENCE:0");

    // VALARM blocks
    for (const reminder of ev.reminders) {
      const alarmLines = buildValarm(reminder.minutes, uid);
      lines.push(...alarmLines);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
