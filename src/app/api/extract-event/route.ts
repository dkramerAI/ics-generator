import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

type ConfidenceField =
  | "title"
  | "description"
  | "location"
  | "url"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "timezone"
  | "organizer"
  | "organizerEmail"
  | "recurrence"
  | "reminders";

interface ExtractedReminderRaw {
  minutes?: number;
}

interface ExtractedRecurrenceRaw {
  freq?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "";
  interval?: number;
  byDay?: string[];
  byMonthDay?: number[];
  bySetPos?: number;
  count?: number;
  until?: string;
}

interface ExtractedConfidenceRaw {
  overall?: number;
  fields?: Partial<Record<ConfidenceField, number>>;
  needsReview?: string[];
  notes?: string[];
  timezoneWarning?: string;
}

interface ExtractedEventRaw {
  title?: string;
  description?: string;
  location?: string;
  url?: string;
  organizer?: string;
  organizerEmail?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  allDay?: boolean;
  timezone?: string;
  recurrence?: ExtractedRecurrenceRaw;
  reminders?: ExtractedReminderRaw[];
  confidence?: ExtractedConfidenceRaw;
}

interface ExtractResponseRaw {
  events?: ExtractedEventRaw[];
}

function clampConfidence(value: number | undefined, fallback = 0.55): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function normalizeDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return "";
}

function normalizeTime(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfidence(event: ExtractedEventRaw): Required<ExtractedConfidenceRaw> {
  const fields: Partial<Record<ConfidenceField, number>> = {
    title: event.title ? 0.86 : 0.35,
    description: event.description ? 0.78 : 0.45,
    location: event.location ? 0.76 : 0.45,
    url: event.url ? 0.82 : 0.45,
    startDate: event.startDate ? 0.9 : 0.35,
    startTime: event.startTime ? 0.84 : 0.4,
    endDate: event.endDate ? 0.86 : 0.4,
    endTime: event.endTime ? 0.78 : 0.45,
    timezone: event.timezone ? 0.8 : 0.5,
    organizer: event.organizer ? 0.7 : 0.5,
    organizerEmail: event.organizerEmail ? 0.7 : 0.5,
    recurrence: event.recurrence?.freq ? 0.82 : 0.55,
    reminders: Array.isArray(event.reminders) && event.reminders.length > 0 ? 0.8 : 0.55,
  };

  const incoming = event.confidence?.fields || {};
  const merged: Partial<Record<ConfidenceField, number>> = {};
  for (const key of Object.keys(fields) as ConfidenceField[]) {
    merged[key] = clampConfidence(incoming[key], fields[key]);
  }

  const values = Object.values(merged).filter((value): value is number => typeof value === "number");
  const overall = clampConfidence(event.confidence?.overall, values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));

  const needsReview = (event.confidence?.needsReview || [])
    .filter((field) => typeof field === "string")
    .concat(
      (Object.entries(merged)
        .filter(([, value]) => (value || 0) < 0.66)
        .map(([field]) => field) as string[]),
    );

  return {
    overall,
    fields: merged,
    needsReview: Array.from(new Set(needsReview)),
    notes: (event.confidence?.notes || []).filter((note) => typeof note === "string"),
    timezoneWarning: normalizeString(event.confidence?.timezoneWarning),
  };
}

function normalizeEvent(raw: ExtractedEventRaw): ExtractedEventRaw {
  const recurrence = raw.recurrence?.freq
    ? {
        freq: raw.recurrence.freq,
        interval: Math.max(1, raw.recurrence.interval || 1),
        byDay: Array.isArray(raw.recurrence.byDay) ? raw.recurrence.byDay : [],
        byMonthDay: Array.isArray(raw.recurrence.byMonthDay)
          ? raw.recurrence.byMonthDay.filter((value) => Number.isFinite(value)).map((value) => Number(value))
          : undefined,
        bySetPos: typeof raw.recurrence.bySetPos === "number" ? raw.recurrence.bySetPos : undefined,
        count: typeof raw.recurrence.count === "number" && raw.recurrence.count > 0 ? raw.recurrence.count : undefined,
        until: normalizeDate(raw.recurrence.until),
      }
    : undefined;

  const reminders = Array.isArray(raw.reminders)
    ? raw.reminders
        .map((reminder) => ({ minutes: Math.max(0, Math.floor(reminder.minutes || 0)) }))
        .filter((reminder) => Number.isFinite(reminder.minutes))
    : undefined;

  const normalized: ExtractedEventRaw = {
    title: normalizeString(raw.title),
    description: normalizeString(raw.description),
    location: normalizeString(raw.location),
    url: normalizeString(raw.url),
    organizer: normalizeString(raw.organizer),
    organizerEmail: normalizeString(raw.organizerEmail),
    startDate: normalizeDate(raw.startDate),
    startTime: normalizeTime(raw.startTime),
    endDate: normalizeDate(raw.endDate),
    endTime: normalizeTime(raw.endTime),
    allDay: raw.allDay === true,
    timezone: normalizeString(raw.timezone),
    recurrence,
    reminders,
  };

  normalized.confidence = normalizeConfidence(normalized);
  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY environment variable is missing." }, { status: 500 });
    }

    const formData = await req.formData();
    const text = formData.get("text") as string | null;
    const files = formData.getAll("images") as File[];
    const localDate = (formData.get("localDate") as string) || new Date().toString();
    const localTimezone = (formData.get("localTimezone") as string) || "UTC";

    if (!text && files.length === 0) {
      return NextResponse.json({ error: "Please provide either text or images to extract from." }, { status: 400 });
    }

    const messages: any[] = [
      {
        role: "system",
        content: `Extract event details from the provided text/images.
Return ONLY JSON with this exact top-level schema:
{
  "events": [
    {
      "title": "",
      "description": "",
      "location": "",
      "url": "",
      "organizer": "",
      "organizerEmail": "",
      "startDate": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endDate": "YYYY-MM-DD",
      "endTime": "HH:mm",
      "allDay": false,
      "timezone": "America/New_York",
      "recurrence": {
        "freq": "DAILY|WEEKLY|MONTHLY|YEARLY",
        "interval": 1,
        "byDay": ["MO"],
        "byMonthDay": [15],
        "bySetPos": 3,
        "count": 10,
        "until": "YYYY-MM-DD"
      },
      "reminders": [{ "minutes": 60 }],
      "confidence": {
        "overall": 0.0,
        "fields": {
          "title": 0.0,
          "description": 0.0,
          "location": 0.0,
          "url": 0.0,
          "startDate": 0.0,
          "startTime": 0.0,
          "endDate": 0.0,
          "endTime": 0.0,
          "timezone": 0.0,
          "organizer": 0.0,
          "organizerEmail": 0.0,
          "recurrence": 0.0,
          "reminders": 0.0
        },
        "needsReview": ["title"],
        "notes": ["string"],
        "timezoneWarning": "string"
      }
    }
  ]
}

Rules:
- Extract ALL distinct events into the events array.
- If the content indicates recurrence, output ONE event with recurrence instead of duplicates.
- Anchor relative dates/times to the user's local context:
  local datetime: ${localDate}
  local timezone: ${localTimezone}
- If a field is unknown, use empty string for text or false for allDay.
- Use 24-hour HH:mm time format.
- If end time is missing, infer a practical end time.
- Only include timezone if explicitly implied (location or timezone token).
- If timezone abbreviation is ambiguous (like CST), set confidence.timezoneWarning.
- Only include reminders if explicitly requested.
- Keep URLs valid with http/https.
- Keep confidence values between 0 and 1 and mark low-confidence fields in needsReview.`,
      },
    ];

    const userContent: any[] = [];

    if (text) {
      userContent.push({ type: "text", text: "Text to parse:\n" + text });
    }

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      const dataUri = `data:${file.type};base64,${base64Data}`;

      userContent.push({
        type: "image_url",
        image_url: {
          url: dataUri,
          detail: "high",
        },
      });
    }

    messages.push({ role: "user", content: userContent });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content || "{}";

    try {
      const parsed: ExtractResponseRaw = JSON.parse(responseText);
      const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];
      const normalizedEvents = rawEvents.map((event) => normalizeEvent(event));

      return NextResponse.json({
        data: {
          events: normalizedEvents,
          meta: {
            eventCount: normalizedEvents.length,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response as JSON.", raw: responseText }, { status: 500 });
    }
  } catch (error: any) {
    console.error("AI Extraction error:", error);
    return NextResponse.json({ error: error.message || "Something went wrong during AI extraction." }, { status: 500 });
  }
}
