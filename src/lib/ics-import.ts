import { EventFormData, RecurrenceRule } from "@/types/event";
import { formatDateToParts } from "@/lib/time";

interface ParsedLine {
  key: string;
  params: Record<string, string>;
  value: string;
}

export interface ParsedICSResult {
  events: Partial<EventFormData>[];
  errors: string[];
}

function unfoldICS(icsText: string): string[] {
  const raw = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if (!line) continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseLine(line: string): ParsedLine | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) return null;
  const left = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [rawKey, ...paramTokens] = left.split(";");
  const params: Record<string, string> = {};

  for (const token of paramTokens) {
    const [paramKey, ...paramValue] = token.split("=");
    if (!paramKey || paramValue.length === 0) continue;
    params[paramKey.toUpperCase()] = paramValue.join("=");
  }

  return {
    key: rawKey.toUpperCase(),
    params,
    value,
  };
}

function unescapeICSText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function yyyymmddToDate(value: string): string | null {
  const cleaned = value.slice(0, 8);
  if (!/^\d{8}$/.test(cleaned)) return null;
  const year = cleaned.slice(0, 4);
  const month = cleaned.slice(4, 6);
  const day = cleaned.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function parseIcsDateTime(value: string, timezone: string): { date: string; time: string; timezone?: string } | null {
  const cleaned = value.trim();
  if (!/^\d{8}T\d{6}Z?$/.test(cleaned)) return null;
  const year = cleaned.slice(0, 4);
  const month = cleaned.slice(4, 6);
  const day = cleaned.slice(6, 8);
  const hour = cleaned.slice(9, 11);
  const minute = cleaned.slice(11, 13);
  const second = cleaned.slice(13, 15);
  const withZulu = cleaned.endsWith("Z");

  if (withZulu) {
    const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    const converted = formatDateToParts(utcDate, "UTC");
    return { ...converted, timezone: "UTC" };
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    timezone: timezone || undefined,
  };
}

function parseDurationMinutes(trigger: string): number | null {
  if (trigger === "PT0S") return 0;
  const normalized = trigger.trim();
  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");
  const match = unsigned.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseInt(match[4] || "0", 10);
  const totalMinutes = days * 1440 + hours * 60 + minutes + Math.round(seconds / 60);
  return sign < 0 ? totalMinutes : Math.max(0, totalMinutes);
}

function parseRRule(value: string): RecurrenceRule {
  const recurrence: RecurrenceRule = { freq: "", interval: 1, byDay: [] };
  const pairs = value.split(";");
  for (const pair of pairs) {
    const [rawKey, rawValue] = pair.split("=");
    const key = rawKey?.toUpperCase();
    if (!key || !rawValue) continue;
    if (key === "FREQ") {
      if (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rawValue.toUpperCase())) {
        recurrence.freq = rawValue.toUpperCase() as RecurrenceRule["freq"];
      }
    }
    if (key === "INTERVAL") recurrence.interval = Math.max(1, parseInt(rawValue, 10) || 1);
    if (key === "COUNT") recurrence.count = Math.max(1, parseInt(rawValue, 10) || 1);
    if (key === "UNTIL") {
      const untilDate = yyyymmddToDate(rawValue);
      if (untilDate) recurrence.until = untilDate;
    }
    if (key === "BYDAY") recurrence.byDay = rawValue.split(",").filter(Boolean);
    if (key === "BYMONTHDAY") {
      recurrence.byMonthDay = rawValue
        .split(",")
        .map((item) => parseInt(item, 10))
        .filter((item) => Number.isFinite(item));
    }
    if (key === "BYSETPOS") {
      const bySetPos = parseInt(rawValue, 10);
      if (Number.isFinite(bySetPos)) recurrence.bySetPos = bySetPos;
    }
  }
  return recurrence;
}

export function parseICSContent(icsText: string): ParsedICSResult {
  const lines = unfoldICS(icsText);
  const errors: string[] = [];
  const events: Partial<EventFormData>[] = [];
  let calendarTimezone = "";
  let currentEvent: Partial<EventFormData> | null = null;
  let currentEventTimezone = "";
  let allDayStart = false;
  let allDayEnd = false;
  let dtStartDate = "";
  let dtEndDate = "";

  const pushCurrentEvent = () => {
    if (!currentEvent) return;
    if (allDayStart) {
      currentEvent.allDay = true;
      currentEvent.startTime = "00:00";
      currentEvent.endTime = "00:00";
      currentEvent.startDate = dtStartDate || currentEvent.startDate || "";
      if (dtEndDate) {
        const end = new Date(`${dtEndDate}T00:00:00`);
        end.setDate(end.getDate() - 1);
        currentEvent.endDate = `${end.getFullYear()}-${(end.getMonth() + 1).toString().padStart(2, "0")}-${end.getDate().toString().padStart(2, "0")}`;
      } else {
        currentEvent.endDate = currentEvent.startDate;
      }
    } else {
      currentEvent.allDay = false;
      currentEvent.startDate = currentEvent.startDate || "";
      currentEvent.endDate = currentEvent.endDate || currentEvent.startDate;
      currentEvent.startTime = currentEvent.startTime || "09:00";
      currentEvent.endTime = currentEvent.endTime || currentEvent.startTime;
    }
    if (!currentEvent.timezone && currentEventTimezone) currentEvent.timezone = currentEventTimezone;
    if (!currentEvent.timezone && calendarTimezone) currentEvent.timezone = calendarTimezone;
    if (!currentEvent.recurrence) currentEvent.recurrence = { freq: "", interval: 1, byDay: [] };
    if (!currentEvent.reminders) currentEvent.reminders = [];
    if (!currentEvent.exdates) currentEvent.exdates = [];
    events.push(currentEvent);
  };

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { key, params, value } = parsed;

    if (key === "X-WR-TIMEZONE") {
      calendarTimezone = value.trim();
      continue;
    }

    if (key === "BEGIN" && value === "VEVENT") {
      currentEvent = {
        title: "",
        description: "",
        location: "",
        url: "",
        notes: "",
        organizer: "",
        organizerEmail: "",
        recurrence: { freq: "", interval: 1, byDay: [] },
        reminders: [],
        exdates: [],
      };
      currentEventTimezone = "";
      allDayStart = false;
      allDayEnd = false;
      dtStartDate = "";
      dtEndDate = "";
      continue;
    }

    if (key === "END" && value === "VEVENT") {
      pushCurrentEvent();
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    if (key === "SUMMARY") currentEvent.title = unescapeICSText(value);
    if (key === "DESCRIPTION") currentEvent.description = unescapeICSText(value);
    if (key === "LOCATION") currentEvent.location = unescapeICSText(value);
    if (key === "URL") currentEvent.url = value.trim();
    if (key === "COMMENT") currentEvent.notes = unescapeICSText(value);
    if (key === "ORGANIZER") {
      const organizerEmail = value.replace(/^MAILTO:/i, "").trim();
      currentEvent.organizerEmail = organizerEmail;
      if (params.CN) currentEvent.organizer = unescapeICSText(params.CN.replace(/^"|"$/g, ""));
    }

    if (key === "DTSTART") {
      const tzid = params.TZID || "";
      if (tzid) currentEventTimezone = tzid;
      if (params.VALUE === "DATE" || /^\d{8}$/.test(value.trim())) {
        const date = yyyymmddToDate(value.trim());
        if (date) {
          dtStartDate = date;
          currentEvent.startDate = date;
          allDayStart = true;
        }
      } else {
        const parsedDateTime = parseIcsDateTime(value, tzid || calendarTimezone);
        if (parsedDateTime) {
          currentEvent.startDate = parsedDateTime.date;
          currentEvent.startTime = parsedDateTime.time;
          if (parsedDateTime.timezone) currentEvent.timezone = parsedDateTime.timezone;
        }
      }
    }

    if (key === "DTEND") {
      const tzid = params.TZID || "";
      if (tzid) currentEventTimezone = tzid;
      if (params.VALUE === "DATE" || /^\d{8}$/.test(value.trim())) {
        const date = yyyymmddToDate(value.trim());
        if (date) {
          dtEndDate = date;
          currentEvent.endDate = date;
          allDayEnd = true;
        }
      } else {
        const parsedDateTime = parseIcsDateTime(value, tzid || calendarTimezone);
        if (parsedDateTime) {
          currentEvent.endDate = parsedDateTime.date;
          currentEvent.endTime = parsedDateTime.time;
          if (parsedDateTime.timezone) currentEvent.timezone = parsedDateTime.timezone;
        }
      }
    }

    if (key === "RRULE") {
      currentEvent.recurrence = parseRRule(value);
    }

    if (key === "EXDATE") {
      const candidates = value.split(",");
      const exdates = candidates
        .map((candidate) => yyyymmddToDate(candidate) || parseIcsDateTime(candidate, params.TZID || "")?.date || "")
        .filter((candidate) => candidate.length > 0);
      currentEvent.exdates = [...(currentEvent.exdates || []), ...exdates];
    }

    if (key === "TRIGGER") {
      const minutes = parseDurationMinutes(value);
      if (minutes !== null) {
        const reminders = currentEvent.reminders || [];
        reminders.push({
          id: Math.random().toString(36).slice(2),
          minutes,
        });
        currentEvent.reminders = reminders;
      }
    }
  }

  if (events.length === 0) {
    errors.push("No VEVENT blocks were found in this ICS file.");
  }

  if (allDayStart && !allDayEnd) {
    errors.push("Imported all-day event is missing DTEND; using DTSTART for both dates.");
  }

  return { events, errors };
}

