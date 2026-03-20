"use client";

import { useState, useCallback } from "react";
import { EventFormData, Reminder, TIMEZONES, REMINDER_OPTIONS } from "@/types/event";

const DAYS_OF_WEEK = [
  { label: "Mon", value: "MO" },
  { label: "Tue", value: "TU" },
  { label: "Wed", value: "WE" },
  { label: "Thu", value: "TH" },
  { label: "Fri", value: "FR" },
  { label: "Sat", value: "SA" },
  { label: "Sun", value: "SU" },
];

function getDefaultDates() {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    startDate: fmt(now),
    startTime: fmtTime(now),
    endDate: fmt(later),
    endTime: fmtTime(later),
  };
}

const defaultDates = getDefaultDates();

const defaultForm: EventFormData = {
  title: "",
  description: "",
  location: "",
  url: "",
  notes: "",
  organizer: "",
  organizerEmail: "",
  startDate: defaultDates.startDate,
  startTime: defaultDates.startTime,
  endDate: defaultDates.endDate,
  endTime: defaultDates.endTime,
  allDay: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  reminders: [],
  recurrence: { freq: "", interval: 1, byDay: [] },
  exdates: [],
};

type Status = { type: "success" | "error"; message: string } | null;

export default function ICSForm() {
  const [form, setForm] = useState<EventFormData>(defaultForm);
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(false);
  const [newExdate, setNewExdate] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiFile, setAiFile] = useState<File | null>(null);

  const set = useCallback(<K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addReminder = () => {
    const id = Math.random().toString(36).slice(2);
    set("reminders", [...form.reminders, { id, minutes: 15 }]);
  };

  const updateReminder = (id: string, minutes: number) => {
    set("reminders", form.reminders.map((r) => (r.id === id ? { ...r, minutes } : r)));
  };

  const removeReminder = (id: string) => {
    set("reminders", form.reminders.filter((r) => r.id !== id));
  };

  const addExdate = () => {
    if (newExdate && !form.exdates.includes(newExdate)) {
      set("exdates", [...form.exdates, newExdate]);
      setNewExdate("");
    }
  };

  const removeExdate = (d: string) => {
    set("exdates", form.exdates.filter((e) => e !== d));
  };

  const toggleByDay = (day: string) => {
    const curr = form.recurrence.byDay || [];
    const updated = curr.includes(day) ? curr.filter((d) => d !== day) : [...curr, day];
    set("recurrence", { ...form.recurrence, byDay: updated });
  };

  const handleSubmit = async () => {
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch("/api/generate-ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus({ type: "error", message: err.error || "Something went wrong" });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : "event.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus({ type: "success", message: "Your .ics file has been downloaded. Open it to add to Apple Calendar." });
    } catch {
      setStatus({ type: "error", message: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleAIExtract = async () => {
    if (!aiText && !aiFile) return;
    setAiLoading(true);
    setAiError("");
    
    try {
      const formData = new FormData();
      if (aiText) formData.append("text", aiText);
      if (aiFile) formData.append("image", aiFile);
      
      const res = await fetch("/api/extract-event", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.raw || "Failed to extract event");
      
      const extracted = data.data;
      setForm(prev => {
        const next = { ...prev };
        if (extracted.title) next.title = extracted.title;
        if (extracted.description) next.description = extracted.description;
        if (extracted.location) next.location = extracted.location;
        if (extracted.url) next.url = extracted.url;
        if (extracted.startDate) next.startDate = extracted.startDate;
        if (extracted.startTime) next.startTime = extracted.startTime;
        if (extracted.endDate) next.endDate = extracted.endDate;
        if (extracted.endTime) next.endTime = extracted.endTime;
        if (extracted.timezone) next.timezone = extracted.timezone;
        if (extracted.organizer) next.organizer = extracted.organizer;
        if (extracted.organizerEmail) next.organizerEmail = extracted.organizerEmail;
        if (extracted.allDay === true) next.allDay = true;
        return next;
      });
      setAiText("");
      setAiFile(null);
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all";
  const labelCls = "block text-[13px] font-500 text-gray-500 mb-1.5 uppercase tracking-wide";

  return (
    <div className="min-h-screen bg-[#f5f5f7] py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-sm border border-gray-100 mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="6" width="22" height="19" rx="3" fill="#f5f5f7" stroke="#d1d1d6" strokeWidth="1.5"/>
              <rect x="3" y="6" width="22" height="7" rx="3" fill="#007AFF"/>
              <rect x="3" y="10" width="22" height="3" fill="#007AFF"/>
              <circle cx="9" cy="19" r="1.5" fill="#007AFF"/>
              <circle cx="14" cy="19" r="1.5" fill="#007AFF"/>
              <circle cx="19" cy="19" r="1.5" fill="#d1d1d6"/>
              <rect x="8" y="3" width="2.5" height="5" rx="1.25" fill="#8e8e93"/>
              <rect x="17.5" y="3" width="2.5" height="5" rx="1.25" fill="#8e8e93"/>
            </svg>
          </div>
          <h1 className="text-[28px] font-[600] text-gray-900 tracking-tight">ICS Generator</h1>
          <p className="text-[15px] text-gray-500 mt-1">Create Apple Calendar-compatible events in seconds</p>
        </div>

        {/* AI Magic Section */}
        <div className="bg-gradient-to-br from-[#f0f7ff] to-[#e6f0ff] rounded-3xl shadow-sm border border-[#cedef7] overflow-hidden mb-8 p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[20px]">✨</span>
            <h2 className="text-[15px] font-[600] text-blue-900 tracking-tight">Auto-fill with AI</h2>
          </div>
          <p className="text-[13px] text-blue-700 mb-4">
            Upload a flyer, invitation image, or paste an email to automatically fill out the event details.
          </p>
          
          <div className="space-y-3">
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-blue-200 bg-white/70 backdrop-blur-sm text-[14px] text-gray-800 placeholder-blue-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
              rows={2}
              placeholder="Paste event text here..."
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              disabled={aiLoading}
            />
            
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setAiFile(e.target.files?.[0] || null)}
                className="text-[13px] font-[500] text-blue-800 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[13px] file:font-[600] file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 transition-colors cursor-pointer"
                disabled={aiLoading}
              />
              <div className="flex-1"></div>
              <button
                type="button"
                onClick={handleAIExtract}
                disabled={aiLoading || (!aiText && !aiFile)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[14px] font-[600] hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Extracting...
                  </>
                ) : (
                  "Auto-fill"
                )}
              </button>
            </div>
            
            {aiError && (
              <p className="text-[13px] text-red-500 font-medium mt-2">{aiError}</p>
            )}
            {aiFile && (
              <p className="text-[12px] text-blue-600 mt-1">Image selected: {aiFile.name}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Section: Event Details */}
          <div className="px-6 pt-6 pb-5 border-b border-gray-50">
            <h2 className="text-[11px] font-[600] text-gray-400 uppercase tracking-widest mb-4">Event Details</h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Title <span className="text-red-400">*</span></label>
                <input className={inputCls} placeholder="Meeting with team" value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea className={inputCls + " resize-none"} rows={3} placeholder="What's this event about?" value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Location</label>
                  <input className={inputCls} placeholder="Conference Room A" value={form.location} onChange={(e) => set("location", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>URL</label>
                  <input className={inputCls} placeholder="https://zoom.us/j/..." value={form.url} onChange={(e) => set("url", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Date & Time */}
          <div className="px-6 py-5 border-b border-gray-50">
            <h2 className="text-[11px] font-[600] text-gray-400 uppercase tracking-widest mb-4">Date & Time</h2>

            {/* All Day Toggle */}
            <div className="flex items-center justify-between mb-4 bg-gray-50 rounded-2xl px-4 py-3">
              <div>
                <p className="text-[14px] font-[500] text-gray-800">All-day event</p>
                <p className="text-[12px] text-gray-400">No specific start or end time</p>
              </div>
              <button
                type="button"
                onClick={() => set("allDay", !form.allDay)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${form.allDay ? "bg-blue-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.allDay ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>Start Date <span className="text-red-400">*</span></label>
                <input type="date" className={inputCls} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </div>
              {!form.allDay && (
                <div>
                  <label className={labelCls}>Start Time <span className="text-red-400">*</span></label>
                  <input type="time" className={inputCls} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>End Date <span className="text-red-400">*</span></label>
                <input type="date" className={inputCls} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
              </div>
              {!form.allDay && (
                <div>
                  <label className={labelCls}>End Time <span className="text-red-400">*</span></label>
                  <input type="time" className={inputCls} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>Time Zone</label>
              <select className={inputCls} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section: Reminders */}
          <div className="px-6 py-5 border-b border-gray-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-[600] text-gray-400 uppercase tracking-widest">Reminders</h2>
              <button type="button" onClick={addReminder} className="flex items-center gap-1.5 text-[13px] text-blue-500 font-[500] hover:text-blue-600 transition-colors">
                <span className="text-[18px] leading-none">+</span> Add Reminder
              </button>
            </div>
            {form.reminders.length === 0 && (
              <p className="text-[13px] text-gray-400 text-center py-3">No reminders set</p>
            )}
            <div className="space-y-2">
              {form.reminders.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <select
                    className={inputCls + " flex-1"}
                    value={r.minutes}
                    onChange={(e) => updateReminder(r.id, parseInt(e.target.value))}
                  >
                    {REMINDER_OPTIONS.map((o) => (
                      <option key={o.minutes} value={o.minutes}>{o.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeReminder(r.id)} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors text-[18px] leading-none">
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Recurrence */}
          <div className="px-6 py-5 border-b border-gray-50">
            <h2 className="text-[11px] font-[600] text-gray-400 uppercase tracking-widest mb-4">Recurrence</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Repeat</label>
                <select
                  className={inputCls}
                  value={form.recurrence.freq}
                  onChange={(e) => set("recurrence", { ...form.recurrence, freq: e.target.value as EventFormData["recurrence"]["freq"] })}
                >
                  <option value="">Does not repeat</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              {form.recurrence.freq && (
                <>
                  <div>
                    <label className={labelCls}>Every</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        className={inputCls + " w-24"}
                        value={form.recurrence.interval}
                        onChange={(e) => set("recurrence", { ...form.recurrence, interval: Math.max(1, parseInt(e.target.value) || 1) })}
                      />
                      <span className="text-[14px] text-gray-500">
                        {form.recurrence.freq === "DAILY" ? "day(s)" : form.recurrence.freq === "WEEKLY" ? "week(s)" : form.recurrence.freq === "MONTHLY" ? "month(s)" : "year(s)"}
                      </span>
                    </div>
                  </div>

                  {form.recurrence.freq === "WEEKLY" && (
                    <div>
                      <label className={labelCls}>On days</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAYS_OF_WEEK.map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleByDay(d.value)}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-[500] transition-colors ${
                              (form.recurrence.byDay || []).includes(d.value)
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>End after (occurrences)</label>
                      <input
                        type="number"
                        min={1}
                        placeholder="Unlimited"
                        className={inputCls}
                        value={form.recurrence.count || ""}
                        onChange={(e) => set("recurrence", { ...form.recurrence, count: e.target.value ? parseInt(e.target.value) : undefined, until: undefined })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>End by date</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={form.recurrence.until || ""}
                        onChange={(e) => set("recurrence", { ...form.recurrence, until: e.target.value, count: undefined })}
                      />
                    </div>
                  </div>

                  {/* Exclusion Dates */}
                  <div>
                    <label className={labelCls}>Exclude dates (exceptions)</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="date"
                        className={inputCls + " flex-1"}
                        value={newExdate}
                        onChange={(e) => setNewExdate(e.target.value)}
                      />
                      <button type="button" onClick={addExdate} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-[500] hover:bg-gray-200 transition-colors flex-shrink-0">
                        Add
                      </button>
                    </div>
                    {form.exdates.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {form.exdates.map((d) => (
                          <span key={d} className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-700 text-[12px] rounded-lg font-[500]">
                            {d}
                            <button type="button" onClick={() => removeExdate(d)} className="text-orange-400 hover:text-orange-600">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section: Advanced (collapsible) */}
          <div className="px-6 py-5 border-b border-gray-50">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-left"
            >
              <h2 className="text-[11px] font-[600] text-gray-400 uppercase tracking-widest">Advanced Options</h2>
              <span className={`text-gray-400 transition-transform ${showAdvanced ? "rotate-180" : ""} text-[10px]`}>▼</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className={labelCls}>Notes / Internal comment</label>
                  <textarea className={inputCls + " resize-none"} rows={2} placeholder="Internal notes (not visible in Apple Calendar UI)" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Organizer Name</label>
                    <input className={inputCls} placeholder="Jane Smith" value={form.organizer} onChange={(e) => set("organizer", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Organizer Email</label>
                    <input type="email" className={inputCls} placeholder="jane@example.com" value={form.organizerEmail} onChange={(e) => set("organizerEmail", e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Status Message */}
          {status && (
            <div className={`mx-6 mt-5 px-4 py-3 rounded-2xl text-[14px] font-[500] ${
              status.type === "success"
                ? "bg-green-50 text-green-700 border border-green-100"
                : "bg-red-50 text-red-600 border border-red-100"
            }`}>
              {status.type === "success" && <span className="mr-1.5">✓</span>}
              {status.type === "error" && <span className="mr-1.5">⚠</span>}
              {status.message}
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !form.title.trim()}
              className="w-full py-3.5 rounded-2xl bg-blue-500 text-white text-[16px] font-[600] hover:bg-blue-600 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1v9M5 7l3 3 3-3M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Generate & Download .ics
                </>
              )}
            </button>
            <p className="text-center text-[12px] text-gray-400 mt-3">
              Compatible with Apple Calendar, Google Calendar, Outlook, and more
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[12px] text-gray-400 mt-6">
          Generates RFC 5545-compliant .ics files · Works with iPhone, Mac & iPad
        </p>
      </div>
    </div>
  );
}
