import { EventFormData, Reminder, RecurrenceRule, REMINDER_OPTIONS } from "@/types/event";

const DAY_LABELS: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

function ordinal(value: number): string {
  const abs = Math.abs(value);
  if (abs % 100 >= 11 && abs % 100 <= 13) return `${value}th`;
  const mod = abs % 10;
  if (mod === 1) return `${value}st`;
  if (mod === 2) return `${value}nd`;
  if (mod === 3) return `${value}rd`;
  return `${value}th`;
}

export function formatReminder(minutes: number): string {
  const exact = REMINDER_OPTIONS.find((item) => item.minutes === minutes);
  if (exact) return exact.label;
  if (minutes === 0) return "At time of event";
  if (minutes < 60) return `${minutes} minutes before`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before`;
  }
  return `${minutes} minutes before`;
}

export function summarizeReminders(reminders: Reminder[]): string {
  if (!reminders || reminders.length === 0) return "No reminders";
  return reminders.map((reminder) => formatReminder(reminder.minutes)).join(", ");
}

export function summarizeRecurrence(recurrence: RecurrenceRule): string {
  if (!recurrence.freq) return "Does not repeat";

  const units: Record<NonNullable<RecurrenceRule["freq"]>, string> = {
    DAILY: "day",
    WEEKLY: "week",
    MONTHLY: "month",
    YEARLY: "year",
    "": "event",
  };

  let sentence = recurrence.interval > 1
    ? `Repeats every ${recurrence.interval} ${units[recurrence.freq]}s`
    : `Repeats every ${units[recurrence.freq]}`;

  if (recurrence.freq === "WEEKLY" && recurrence.byDay && recurrence.byDay.length > 0) {
    const days = recurrence.byDay
      .map((day) => DAY_LABELS[day] || day)
      .join(", ");
    sentence += ` on ${days}`;
  }

  if (
    recurrence.freq === "MONTHLY" &&
    recurrence.bySetPos &&
    recurrence.byDay &&
    recurrence.byDay.length === 1
  ) {
    const nth = recurrence.bySetPos === -1 ? "last" : ordinal(recurrence.bySetPos);
    const day = DAY_LABELS[recurrence.byDay[0]] || recurrence.byDay[0];
    sentence += ` on the ${nth} ${day}`;
  } else if (recurrence.freq === "MONTHLY" && recurrence.byMonthDay && recurrence.byMonthDay.length > 0) {
    sentence += ` on day ${recurrence.byMonthDay.join(", ")}`;
  }

  if (recurrence.count) {
    sentence += ` for ${recurrence.count} occurrence${recurrence.count === 1 ? "" : "s"}`;
  } else if (recurrence.until) {
    const untilText = new Date(`${recurrence.until}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    sentence += ` until ${untilText}`;
  }

  return sentence;
}

export function summarizeEventPreview(event: EventFormData): string[] {
  const rows: string[] = [];
  rows.push(event.title || "Untitled event");
  rows.push(event.location || "No location");
  rows.push(event.url || "No meeting link");
  rows.push(summarizeReminders(event.reminders));
  rows.push(summarizeRecurrence(event.recurrence));
  return rows;
}

