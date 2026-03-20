"use client";

import { useState, useEffect } from "react";
import { EventFormData, Reminder, RecurrenceRule, RecurrenceFreq } from "@/types/event";
import { TIMEZONES, detectUserTimezone } from "@/lib/timezones";

const REMINDER_PRESETS = [
  { label: "At time of event", minutes: 0 },
  { label: "5 minutes before", minutes: 5 },
  { label: "10 minutes before", minutes: 10 },
  { label: "15 minutes before", minutes: 15 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "2 hours before", minutes: 120 },
  { label: "1 day before", minutes: 1440 },
  { label: "2 days before", minutes: 2880 },
  { label: "1 week before", minutes: 10080 },
];

const WEEKDAYS = [
  { label: "Mo", value: "MO" },
  { label: "Tu", value: "TU" },
  { label: "We", value: "WE" },
  { label: "Th", value: "TH" },
  { label: "Fr", value: "FR" },
  { label: "Sa", value: "SA" },
  { label: "Su", value: "SU" },
];

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getTimeStr(offsetHours = 0) {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours, 0, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

const defaultForm = (): EventFormData => ({
  title: "",
  description: "",
  location: "",
  startDate: getTodayStr(),
  startTime: getTimeStr(1),
  endDate: getTodayStr(),
  endTime: getTimeStr(2),
  allDay: false,
  timeZone: "UTC",
  url: "",
  notes: "",
  organizer: "",
  organizerEmail: "",
  recurrence: null,
  exDates: [],
  reminders: [],
});

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#d2d2d7] rounded-2xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#f5f5f7] transition-colors"
      >
        <span className="text-[15px] font-semibold text-[#1d1d1f]">{title}</span>
        <svg
          className={`w-4 h-4 text-[#6e6e73] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-[#f0f0f5]">
          {children}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}

function Field({ label, required, error, children, hint }: FieldProps) {
  return (
    <div className="mt-5">
      <label className="block text-[13px] font-medium text-[#6e6e73] mb-1.5">
        {label}{required && <span className="text-[#ff3b30] ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[12px] text-[#8e8e93]">{hint}</p>}
      {error && <p className="mt-1 text-[12px] text-[#ff3b30]">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 text-[14px] text-[#1d1d1f] bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl " +
  "focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent placeholder-[#aeaeb2] " +
  "transition-all";

const textareaCls =
  "w-full px-3 py-2.5 text-[14px] text-[#1d1d1f] bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl " +
  "focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent placeholder-[#aeaeb2] " +
  "transition-all resize-none";

const selectCls =
  "w-full h-10 pl-3 pr-8 text-[14px] text-[#1d1d1f] bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl " +
  "focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent " +
  "transition-all cursor-pointer";

export default function EventForm() {
  const [form, setForm] = useState<EventFormData>(defaultForm);
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormData | "general", string>>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [icsContent, setIcsContent] = useState<string>("");
  const [icsFilename, setIcsFilename] = useState<string>("event.ics");
  const [newExDate, setNewExDate] = useState<string>("");

  useEffect(() => {
    const tz = detectUserTimezone();
    const found = TIMEZONES.find(t => t.value === tz);
    setForm(f => ({ ...f, timeZone: found ? tz : "UTC" }));
  }, []);

  const set = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.startDate) errs.startDate = "Start date is required";
    if (!form.allDay && !form.startTime) errs.startTime = "Start time is required";
    if (!form.endDate) errs.endDate = "End date is required";
    if (!form.allDay && !form.endTime) errs.endTime = "End time is required";

    if (!form.allDay && form.startDate && form.startTime && form.endDate && form.endTime) {
      const start = new Date(`${form.startDate}T${form.startTime}`);
      const end = new Date(`${form.endDate}T${form.endTime}`);
      if (end <= start) errs.endTime = "End must be after start";
    }
    if (form.allDay && form.startDate && form.endDate && form.endDate < form.startDate) {
      errs.endDate = "End date must be on or after start date";
    }

    if (form.url && !/^https?:\/\/.+/.test(form.url)) {
      errs.url = "URL must start with http:// or https://";
    }
    if (form.organizerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.organizerEmail)) {
      errs.organizerEmail = "Invalid email address";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setStatus("loading");
    setIcsContent("");

    try {
      const res = await fetch("/api/generate-ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ general: data.error || "Failed to generate ICS" });
        setStatus("error");
        return;
      }
      setIcsContent(data.icsContent);
      setIcsFilename(data.filename);
      setStatus("success");
    } catch {
      setErrors({ general: "Network error. Please try again." });
      setStatus("error");
    }
  };

  const handleDownload = () => {
    if (!icsContent) return;
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addReminder = (minutes: number) => {
    const label = REMINDER_PRESETS.find(p => p.minutes === minutes)?.label || `${minutes} min before`;
    setForm(f => ({
      ...f,
      reminders: [...f.reminders, { trigger: minutes, description: label }],
    }));
  };

  const removeReminder = (i: number) => {
    setForm(f => ({ ...f, reminders: f.reminders.filter((_, idx) => idx !== i) }));
  };

  const addExDate = () => {
    if (!newExDate) return;
    setForm(f => ({ ...f, exDates: [...f.exDates, newExDate] }));
    setNewExDate("");
  };

  const removeExDate = (i: number) => {
    setForm(f => ({ ...f, exDates: f.exDates.filter((_, idx) => idx !== i) }));
  };

  const setRecurrence = (freq: RecurrenceFreq | null) => {
    if (!freq) {
      set("recurrence", null);
      return;
    }
    set("recurrence", {
      freq,
      interval: 1,
      byDay: [],
      count: undefined,
      until: undefined,
    });
  };

  const updateRecurrence = (patch: Partial<RecurrenceRule>) => {
    if (!form.recurrence) return;
    set("recurrence", { ...form.recurrence, ...patch });
  };

  const toggleByDay = (day: string) => {
    if (!form.recurrence) return;
    const current = form.recurrence.byDay || [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    updateRecurrence({ byDay: next });
  };

  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <Section title="Event Details">
        <Field label="Title" required error={errors.title}>
          <input
            className={`${inputCls} ${errors.title ? "border-[#ff3b30] focus:ring-[#ff3b30]" : ""}`}
            placeholder="Add a title"
            value={form.title}
            onChange={e => set("title", e.target.value)}
          />
        </Field>

        <Field label="Description">
          <textarea
            className={textareaCls}
            rows={3}
            placeholder="Add a description"
            value={form.description}
            onChange={e => set("description", e.target.value)}
          />
        </Field>

        <Field label="Location">
          <input
            className={inputCls}
            placeholder="Add a location or video call link"
            value={form.location}
            onChange={e => set("location", e.target.value)}
          />
        </Field>

        <Field label="URL">
          <input
            className={`${inputCls} ${errors.url ? "border-[#ff3b30] focus:ring-[#ff3b30]" : ""}`}
            placeholder="https://example.com"
            type="url"
            value={form.url}
            onChange={e => set("url", e.target.value)}
          />
          {errors.url && <p className="mt-1 text-[12px] text-[#ff3b30]">{errors.url}</p>}
        </Field>

        <Field label="Notes">
          <textarea
            className={textareaCls}
            rows={2}
            placeholder="Additional notes"
            value={form.notes}
            onChange={e => set("notes", e.target.value)}
          />
        </Field>
      </Section>

      {/* Date & Time */}
      <Section title="Date & Time">
        {/* All-day toggle */}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => set("allDay", !form.allDay)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.allDay ? "bg-[#0071e3]" : "bg-[#d2d2d7]"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                form.allDay ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-[14px] text-[#1d1d1f]">All-day event</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5">
          <Field label="Start Date" required error={errors.startDate}>
            <input
              type="date"
              className={`${inputCls} ${errors.startDate ? "border-[#ff3b30]" : ""}`}
              value={form.startDate}
              onChange={e => set("startDate", e.target.value)}
            />
          </Field>
          {!form.allDay && (
            <Field label="Start Time" required error={errors.startTime}>
              <input
                type="time"
                className={`${inputCls} ${errors.startTime ? "border-[#ff3b30]" : ""}`}
                value={form.startTime}
                onChange={e => set("startTime", e.target.value)}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="End Date" required error={errors.endDate}>
            <input
              type="date"
              className={`${inputCls} ${errors.endDate ? "border-[#ff3b30]" : ""}`}
              value={form.endDate}
              onChange={e => set("endDate", e.target.value)}
              min={form.startDate}
            />
          </Field>
          {!form.allDay && (
            <Field label="End Time" required error={errors.endTime}>
              <input
                type="time"
                className={`${inputCls} ${errors.endTime ? "border-[#ff3b30]" : ""}`}
                value={form.endTime}
                onChange={e => set("endTime", e.target.value)}
              />
            </Field>
          )}
        </div>

        {!form.allDay && (
          <Field label="Time Zone">
            <select
              className={selectCls}
              value={form.timeZone}
              onChange={e => set("timeZone", e.target.value)}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
        )}
      </Section>

      {/* Organizer */}
      <Section title="Organizer" defaultOpen={false}>
        <Field label="Name">
          <input
            className={inputCls}
            placeholder="Organizer name"
            value={form.organizer}
            onChange={e => set("organizer", e.target.value)}
          />
        </Field>
        <Field label="Email" error={errors.organizerEmail}>
          <input
            className={`${inputCls} ${errors.organizerEmail ? "border-[#ff3b30]" : ""}`}
            type="email"
            placeholder="organizer@example.com"
            value={form.organizerEmail}
            onChange={e => set("organizerEmail", e.target.value)}
          />
        </Field>
      </Section>

      {/* Recurrence */}
      <Section title="Recurrence" defaultOpen={false}>
        <Field label="Repeat">
          <select
            className={selectCls}
            value={form.recurrence?.freq ?? ""}
            onChange={e => setRecurrence((e.target.value as RecurrenceFreq) || null)}
          >
            <option value="">Never</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </Field>

        {form.recurrence && (
          <>
            <Field label="Every">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={999}
                  className={`${inputCls} w-24`}
                  value={form.recurrence.interval}
                  onChange={e => updateRecurrence({ interval: Math.max(1, Number(e.target.value)) })}
                />
                <span className="text-[14px] text-[#6e6e73]">
                  {form.recurrence.freq === "DAILY" ? "day(s)" :
                   form.recurrence.freq === "WEEKLY" ? "week(s)" :
                   form.recurrence.freq === "MONTHLY" ? "month(s)" : "year(s)"}
                </span>
              </div>
            </Field>

            {form.recurrence.freq === "WEEKLY" && (
              <Field label="On">
                <div className="flex gap-2 flex-wrap">
                  {WEEKDAYS.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleByDay(d.value)}
                      className={`w-10 h-10 rounded-full text-[13px] font-medium transition-colors ${
                        form.recurrence?.byDay?.includes(d.value)
                          ? "bg-[#0071e3] text-white"
                          : "bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="End after (occurrences)" hint="Leave blank for no limit">
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  placeholder="e.g. 10"
                  value={form.recurrence.count ?? ""}
                  onChange={e => {
                    const v = e.target.value ? Number(e.target.value) : undefined;
                    updateRecurrence({ count: v, until: v ? undefined : form.recurrence?.until });
                  }}
                />
              </Field>
              <Field label="End by date" hint="Overrides occurrence count">
                <input
                  type="date"
                  className={inputCls}
                  value={form.recurrence.until ?? ""}
                  min={form.startDate}
                  onChange={e => {
                    const v = e.target.value || undefined;
                    updateRecurrence({ until: v, count: v ? undefined : form.recurrence?.count });
                  }}
                />
              </Field>
            </div>

            {/* Exclusion dates */}
            <Field label="Exclude Dates" hint="Skip specific dates in the recurrence">
              <div className="flex gap-2">
                <input
                  type="date"
                  className={`${inputCls} flex-1`}
                  value={newExDate}
                  onChange={e => setNewExDate(e.target.value)}
                />
                <button
                  type="button"
                  onClick={addExDate}
                  disabled={!newExDate}
                  className="h-10 px-4 text-[14px] font-medium text-[#0071e3] bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl hover:bg-[#e8e8ed] disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
              {form.exDates.length > 0 && (
                <div className="mt-2 space-y-1">
                  {form.exDates.map((d, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-[#f5f5f7] rounded-lg">
                      <span className="text-[13px] text-[#1d1d1f]">{d}</span>
                      <button
                        type="button"
                        onClick={() => removeExDate(i)}
                        className="text-[#ff3b30] text-[12px] hover:opacity-70"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>
          </>
        )}
      </Section>

      {/* Reminders */}
      <Section title="Reminders" defaultOpen={false}>
        <Field label="Add Reminder">
          <select
            className={selectCls}
            value=""
            onChange={e => {
              if (e.target.value !== "") addReminder(Number(e.target.value));
              e.target.value = "";
            }}
          >
            <option value="">Select a reminder…</option>
            {REMINDER_PRESETS.map(p => (
              <option key={p.minutes} value={p.minutes}>{p.label}</option>
            ))}
          </select>
        </Field>
        {form.reminders.length > 0 && (
          <div className="mt-3 space-y-2">
            {form.reminders.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-[#f5f5f7] rounded-xl border border-[#e5e5ea]">
                <div className="flex items-center gap-2">
                  <span className="text-[16px]">🔔</span>
                  <span className="text-[14px] text-[#1d1d1f]">{r.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeReminder(i)}
                  className="text-[#ff3b30] text-[13px] font-medium hover:opacity-70"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {form.reminders.length === 0 && (
          <p className="mt-3 text-[13px] text-[#aeaeb2]">No reminders added</p>
        )}
      </Section>

      {/* Error */}
      {errors.general && (
        <div className="px-4 py-3 bg-[#fff2f2] border border-[#ffd0d0] rounded-xl text-[14px] text-[#ff3b30]">
          {errors.general}
        </div>
      )}

      {/* Success */}
      {status === "success" && (
        <div className="px-4 py-4 bg-[#f0faf5] border border-[#b8e8d0] rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[20px]">✅</span>
            <span className="text-[15px] font-semibold text-[#1d7a4f]">ICS file ready!</span>
          </div>
          <p className="text-[13px] text-[#3a8f62] mb-3">
            Your calendar file has been generated. Click download to save it, then open it to add to Apple Calendar.
          </p>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1d7a4f] text-white text-[14px] font-medium rounded-xl hover:bg-[#176040] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download {icsFilename}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={status === "loading"}
          className="flex-1 h-12 bg-[#0071e3] text-white text-[15px] font-semibold rounded-2xl hover:bg-[#0077ed] active:scale-[0.99] disabled:opacity-60 transition-all"
        >
          {status === "loading" ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Generating…
            </span>
          ) : "Generate ICS"}
        </button>

        {status === "success" && (
          <button
            type="button"
            onClick={handleDownload}
            className="h-12 px-6 bg-[#f5f5f7] text-[#0071e3] text-[15px] font-semibold rounded-2xl border border-[#d2d2d7] hover:bg-[#e8e8ed] transition-colors"
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
}
