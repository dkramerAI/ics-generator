import { EventFormData, RecurrenceRule } from "@/types/event";
import { addMinutes } from "@/lib/time";

type EventField =
  | "title"
  | "description"
  | "location"
  | "url"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "allDay"
  | "timezone"
  | "recurrence";

type FieldConfidence = Partial<Record<EventField, number>>;

interface TimeParse {
  startTime: string;
  endTime: string;
  confidence: number;
}

const WEEKDAYS: Array<{ name: string; short: string; code: string; index: number }> = [
  { name: "monday", short: "mon", code: "MO", index: 1 },
  { name: "tuesday", short: "tue", code: "TU", index: 2 },
  { name: "wednesday", short: "wed", code: "WE", index: 3 },
  { name: "thursday", short: "thu", code: "TH", index: 4 },
  { name: "friday", short: "fri", code: "FR", index: 5 },
  { name: "saturday", short: "sat", code: "SA", index: 6 },
  { name: "sunday", short: "sun", code: "SU", index: 0 },
];

const MONTH_LOOKUP: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const TIMEZONE_BY_ABBREVIATION: Record<string, string> = {
  UTC: "UTC",
  GMT: "UTC",
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  AKST: "America/Anchorage",
  HST: "Pacific/Honolulu",
  IST: "Asia/Kolkata",
};

const AMBIGUOUS_ABBREVIATIONS = new Set(["CST", "IST", "MST", "BST", "AST"]);

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hourTo24(rawHour: string, rawMinute: string | undefined, meridiem?: string): string {
  let hour = parseInt(rawHour, 10);
  const minute = parseInt(rawMinute || "0", 10);

  if (meridiem) {
    const mer = meridiem.toLowerCase();
    if (mer === "pm" && hour < 12) hour += 12;
    if (mer === "am" && hour === 12) hour = 0;
  }

  if (!meridiem && hour >= 0 && hour <= 23) {
    return `${pad(hour)}:${pad(minute)}`;
  }

  return `${pad(Math.max(0, Math.min(23, hour)))}:${pad(Math.max(0, Math.min(59, minute)))}`;
}

function nextWeekday(from: Date, targetWeekday: number): Date {
  const next = new Date(from);
  next.setHours(0, 0, 0, 0);
  const current = next.getDay();
  const delta = (targetWeekday - current + 7) % 7 || 7;
  next.setDate(next.getDate() + delta);
  return next;
}

function parseTimezone(input: string): { timezone?: string; warning?: string; confidence: number } {
  const upper = input.toUpperCase();
  const matches = upper.match(/\b[A-Z]{2,4}\b/g) || [];
  for (const token of matches) {
    const timezone = TIMEZONE_BY_ABBREVIATION[token];
    if (!timezone) continue;
    if (AMBIGUOUS_ABBREVIATIONS.has(token)) {
      return {
        timezone,
        warning: `${token} can be ambiguous. Verify the timezone before exporting.`,
        confidence: 0.5,
      };
    }
    return { timezone, confidence: 0.9 };
  }
  return { confidence: 0.45 };
}

function parseRecurrence(input: string): { recurrence: RecurrenceRule; confidence: number } {
  const text = input.toLowerCase();
  const recurrence: RecurrenceRule = { freq: "", interval: 1, byDay: [] };
  let confidence = 0.45;

  const nthWeekday = text.match(
    /\b(first|second|third|fourth|last|[1-5](?:st|nd|rd|th))\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+of\s+(?:the\s+)?month\b/i,
  );
  if (nthWeekday) {
    const nthLookup: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      last: -1,
    };
    const rawPosition = nthWeekday[1].toLowerCase();
    const position = nthLookup[rawPosition] || parseInt(rawPosition, 10) || 1;
    const day = WEEKDAYS.find((weekday) => weekday.name === nthWeekday[2].toLowerCase());
    recurrence.freq = "MONTHLY";
    recurrence.byDay = day ? [day.code] : [];
    recurrence.bySetPos = position;
    confidence = 0.92;
    return { recurrence, confidence };
  }

  const explicitInterval = text.match(/\bevery\s+(\d+)\s*(day|week|month|year)s?\b/i);
  if (explicitInterval) {
    const interval = parseInt(explicitInterval[1], 10);
    const unit = explicitInterval[2].toLowerCase();
    recurrence.interval = Math.max(1, interval);
    recurrence.freq =
      unit === "day" ? "DAILY" :
      unit === "week" ? "WEEKLY" :
      unit === "month" ? "MONTHLY" : "YEARLY";
    confidence = 0.9;
  }

  if (!recurrence.freq) {
    if (/\bdaily\b|\bevery day\b/i.test(text)) {
      recurrence.freq = "DAILY";
      confidence = 0.9;
    } else if (/\bweekly\b|\bevery week\b/i.test(text)) {
      recurrence.freq = "WEEKLY";
      confidence = 0.86;
    } else if (/\bmonthly\b|\bevery month\b/i.test(text)) {
      recurrence.freq = "MONTHLY";
      confidence = 0.86;
    } else if (/\byearly\b|\bannually\b|\bevery year\b/i.test(text)) {
      recurrence.freq = "YEARLY";
      confidence = 0.84;
    }
  }

  const allMentionedWeekdays = WEEKDAYS.filter((day) => {
    const pattern = new RegExp(`\\b${day.name}\\b|\\b${day.short}\\b`, "i");
    return pattern.test(text);
  });

  if (allMentionedWeekdays.length > 0) {
    recurrence.byDay = allMentionedWeekdays.map((day) => day.code);
    if (!recurrence.freq) recurrence.freq = "WEEKLY";
    confidence = Math.max(confidence, 0.88);
  }

  const countMatch = text.match(/\b(?:for|after)\s+(\d+)\s+(?:occurrences?|times?)\b/i);
  if (countMatch) {
    recurrence.count = parseInt(countMatch[1], 10);
  }

  return { recurrence, confidence };
}

function parseDate(input: string, now: Date, recurrence: RecurrenceRule): { date: string; confidence: number } {
  const text = input.toLowerCase();

  if (/\btomorrow\b/i.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return { date: formatDate(date), confidence: 0.94 };
  }
  if (/\btoday\b|\btonight\b/i.test(text)) {
    return { date: formatDate(now), confidence: 0.92 };
  }

  const monthDay = text.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i,
  );
  if (monthDay) {
    const month = MONTH_LOOKUP[monthDay[1].toLowerCase()];
    const day = parseInt(monthDay[2], 10);
    let year = monthDay[3] ? parseInt(monthDay[3], 10) : now.getFullYear();
    let parsed = new Date(year, month, day);
    if (!monthDay[3] && parsed < now) {
      year += 1;
      parsed = new Date(year, month, day);
    }
    return { date: formatDate(parsed), confidence: 0.95 };
  }

  const numericDate = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numericDate) {
    const month = parseInt(numericDate[1], 10) - 1;
    const day = parseInt(numericDate[2], 10);
    let year = numericDate[3] ? parseInt(numericDate[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    let parsed = new Date(year, month, day);
    if (!numericDate[3] && parsed < now) {
      parsed = new Date(year + 1, month, day);
    }
    return { date: formatDate(parsed), confidence: 0.9 };
  }

  const weekdayMatch = WEEKDAYS.find((weekday) => {
    const pattern = new RegExp(`\\b(next\\s+)?${weekday.name}\\b|\\b(next\\s+)?${weekday.short}\\b`, "i");
    return pattern.test(text);
  });
  if (weekdayMatch) {
    const next = nextWeekday(now, weekdayMatch.index);
    return { date: formatDate(next), confidence: 0.88 };
  }

  if (recurrence.freq === "WEEKLY" && recurrence.byDay && recurrence.byDay.length > 0) {
    const first = recurrence.byDay[0];
    const day = WEEKDAYS.find((weekday) => weekday.code === first);
    if (day) {
      const next = nextWeekday(now, day.index);
      return { date: formatDate(next), confidence: 0.84 };
    }
  }

  return { date: formatDate(now), confidence: 0.55 };
}

function parseTime(input: string, startDate: string): TimeParse {
  const text = input.toLowerCase();

  if (/\ball day\b/i.test(text)) {
    return { startTime: "09:00", endTime: "10:00", confidence: 0.88 };
  }

  const range = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );
  if (range) {
    const startMeridiem = range[3] || range[6];
    const startTime = hourTo24(range[1], range[2], startMeridiem || undefined);
    const endTime = hourTo24(range[4], range[5], range[6]);
    return { startTime, endTime, confidence: 0.95 };
  }

  const explicitSingle = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (explicitSingle) {
    const startTime = hourTo24(explicitSingle[1], explicitSingle[2], explicitSingle[3]);
    const plusHour = addMinutes(startDate, startTime, 60);
    return { startTime, endTime: plusHour.time, confidence: 0.87 };
  }

  const militaryTime = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (militaryTime) {
    const startTime = `${pad(parseInt(militaryTime[1], 10))}:${militaryTime[2]}`;
    const plusHour = addMinutes(startDate, startTime, 60);
    return { startTime, endTime: plusHour.time, confidence: 0.82 };
  }

  if (/\bmorning\b/i.test(text)) {
    return { startTime: "09:00", endTime: "10:00", confidence: 0.64 };
  }
  if (/\bafternoon\b/i.test(text)) {
    return { startTime: "13:00", endTime: "14:00", confidence: 0.64 };
  }
  if (/\bevening\b|\bnight\b/i.test(text)) {
    return { startTime: "18:00", endTime: "19:00", confidence: 0.64 };
  }

  return { startTime: "09:00", endTime: "10:00", confidence: 0.4 };
}

function deriveTitle(input: string): { title: string; confidence: number } {
  const raw = input
    .replace(/\b(?:today|tomorrow|tonight|next)\b/gi, " ")
    .replace(/\b(?:at|on|from|to|until|every|each|weekly|monthly|daily|yearly)\b/gi, " ")
    .replace(
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi,
      " ",
    )
    .replace(
      /\b(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/gi,
      " ",
    )
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, " ")
    .replace(/\b[A-Z]{2,4}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, "")
    .trim();

  if (raw.length > 0) {
    return { title: raw, confidence: raw.length >= 4 ? 0.82 : 0.65 };
  }

  const fallback = input.trim().split(/\s+/).slice(0, 4).join(" ");
  return { title: fallback || "New Event", confidence: 0.45 };
}

export interface NaturalLanguageParseResult {
  partial: Partial<EventFormData>;
  confidence: number;
  fields: FieldConfidence;
  lowConfidenceFields: EventField[];
  timezoneWarning?: string;
}

export function parseNaturalLanguageEvent(input: string, now: Date = new Date()): NaturalLanguageParseResult {
  const normalized = input.trim();
  const fields: FieldConfidence = {};
  const partial: Partial<EventFormData> = {};

  const recurrenceResult = parseRecurrence(normalized);
  if (recurrenceResult.recurrence.freq) {
    partial.recurrence = recurrenceResult.recurrence;
    fields.recurrence = recurrenceResult.confidence;
  }

  const dateResult = parseDate(normalized, now, recurrenceResult.recurrence);
  partial.startDate = dateResult.date;
  partial.endDate = dateResult.date;
  fields.startDate = dateResult.confidence;
  fields.endDate = dateResult.confidence;

  const timeResult = parseTime(normalized, dateResult.date);
  partial.startTime = timeResult.startTime;
  partial.endTime = timeResult.endTime;
  partial.allDay = /\ball day\b/i.test(normalized);
  fields.startTime = timeResult.confidence;
  fields.endTime = timeResult.confidence;
  fields.allDay = partial.allDay ? 0.9 : timeResult.confidence;

  const titleResult = deriveTitle(input);
  partial.title = titleResult.title;
  fields.title = titleResult.confidence;

  const timezoneResult = parseTimezone(input);
  if (timezoneResult.timezone) {
    partial.timezone = timezoneResult.timezone;
    fields.timezone = timezoneResult.confidence;
  }

  const confidenceValues = Object.values(fields);
  const confidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0.5;

  const lowConfidenceFields = Object.entries(fields)
    .filter(([, value]) => (value || 0) < 0.66)
    .map(([key]) => key as EventField);

  return {
    partial,
    confidence,
    fields,
    lowConfidenceFields,
    timezoneWarning: timezoneResult.warning,
  };
}

