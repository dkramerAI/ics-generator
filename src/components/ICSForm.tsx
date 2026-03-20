"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { EventFormData, Reminder, TIMEZONES, REMINDER_OPTIONS } from "@/types/event";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, MapPin, Clock, Plus, X, Wand2, 
  Image as ImageIcon, Link2, FileText, Settings, 
  ChevronDown, Download, AlertCircle, CalendarDays, KeySquare, 
  User, CheckCircle2, ChevronRight, Mail
} from "lucide-react";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAYS_OF_WEEK = [
  { label: "M", value: "MO" }, { label: "T", value: "TU" },
  { label: "W", value: "WE" }, { label: "T", value: "TH" },
  { label: "F", value: "FR" }, { label: "S", value: "SA" },
  { label: "S", value: "SU" },
];

function getDefaultDates() {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    startDate: fmt(now), startTime: fmtTime(now),
    endDate: fmt(later), endTime: fmtTime(later),
  };
}

const defaultDates = getDefaultDates();

const defaultForm: EventFormData = {
  title: "", description: "", location: "", url: "", notes: "", organizer: "", organizerEmail: "",
  startDate: defaultDates.startDate, startTime: defaultDates.startTime, endDate: defaultDates.endDate,
  endTime: defaultDates.endTime, allDay: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  reminders: [], recurrence: { freq: "", interval: 1, byDay: [] }, exdates: [],
};

const inputStyles = "w-full bg-white/40 border border-white/50 backdrop-blur-xl rounded-2xl px-4 py-3.5 text-[15px] font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400/50 focus:bg-white/80 transition-all duration-300 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.02)]";
const labelStyles = "block text-[13px] font-semibold text-slate-500 mb-2 uppercase tracking-wide ml-1";
const cardStyles = "bg-white/60 border border-white/60 backdrop-blur-2xl rounded-[32px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.8)]";

export default function ICSForm() {
  const [events, setEvents] = useState<EventFormData[]>([defaultForm]);
  const [activeIndex, setActiveIndex] = useState(0);
  const form = events[activeIndex];

  const [loading, setLoading] = useState(false);
  const [newExdate, setNewExdate] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [defaultReminders, setDefaultReminders] = useState<number[]>([]);
  const [defaultTimezone, setDefaultTimezone] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem("ics_defaults");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.timezone) {
          setDefaultTimezone(parsed.timezone);
          setEvents(prev => prev.map(p => ({ ...p, timezone: parsed.timezone })));
        }
        if (Array.isArray(parsed.reminders)) {
          setDefaultReminders(parsed.reminders);
          setEvents(prev => prev.map(p => ({
            ...p,
            reminders: parsed.reminders.map((mins: number) => ({ id: Math.random().toString(36).slice(2), minutes: mins }))
          })));
        }
        return;
      } catch (e) {}
    }
    const initialDefaults = [60, 1440];
    setDefaultReminders(initialDefaults);
    setEvents(prev => prev.map(p => ({
      ...p,
      reminders: initialDefaults.map((mins) => ({ id: Math.random().toString(36).slice(2), minutes: mins }))
    })));
  }, []);

  const saveDefaults = (reminders: number[], tz: string = defaultTimezone) => {
    setDefaultReminders(reminders);
    setDefaultTimezone(tz);
    localStorage.setItem("ics_defaults", JSON.stringify({ reminders, timezone: tz }));
    toast.success("Default settings saved successfully!", { duration: 2000 });
  };

  // AI Extraction State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setEvents((prev) => {
      const next = [...prev];
      next[activeIndex] = { ...next[activeIndex], [key]: value };
      return next;
    });
  }, [activeIndex]);

  const handleAIExtract = async () => {
    if (!aiText && aiFiles.length === 0) return;
    setAiLoading(true);

    try {
      const formData = new FormData();
      if (aiText) formData.append("text", aiText);
      aiFiles.forEach(f => formData.append("images", f));
      
      const res = await fetch("/api/extract-event", {
        method: "POST", body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extract event");

      const aiEvents = data.data.events;
      if (Array.isArray(aiEvents) && aiEvents.length > 0) {
        setEvents(prev => {
          const base = prev[0];
          return aiEvents.map((ext: any) => {
            const next = { ...base };
            if (ext.title) next.title = ext.title;
            if (ext.description) next.description = ext.description;
            if (ext.location) next.location = ext.location;
            if (ext.url) next.url = ext.url;
            if (ext.startDate) next.startDate = ext.startDate;
            if (ext.startTime) next.startTime = ext.startTime;
            if (ext.endDate) next.endDate = ext.endDate;
            if (ext.endTime) next.endTime = ext.endTime;
            if (ext.timezone) next.timezone = ext.timezone;
            if (ext.organizer) next.organizer = ext.organizer;
            if (ext.organizerEmail) next.organizerEmail = ext.organizerEmail;
            if (ext.allDay === true) next.allDay = true;
            
            if (ext.reminders && Array.isArray(ext.reminders) && ext.reminders.length > 0) {
              next.reminders = ext.reminders.map((r: any) => ({
                id: Math.random().toString(36).slice(2),
                minutes: r.minutes || 15
              }));
            }
            return next;
          });
        });
        setActiveIndex(0);
        toast.success(`Synthesized ${aiEvents.length} distinct events!`, {
          icon: "✨", duration: 3000,
        });
      } else {
        toast.error("No events could be deciphered.");
      }
      setAiText("");
      setAiFiles([]);
    } catch (err: any) {
      toast.error(err.message, { icon: <AlertCircle className="w-5 h-5 text-red-500" /> });
    } finally {
      setAiLoading(false);
    }
  };

  const addReminder = () => {
    const id = Math.random().toString(36).slice(2);
    set("reminders", [...form.reminders, { id, minutes: 15 }]);
  };

  const removeReminder = (id: string) => set("reminders", form.reminders.filter((r) => r.id !== id));

  const handleSubmit = async () => {
    const invalidIndex = events.findIndex(e => !e.title?.trim());
    if (invalidIndex !== -1) {
      setActiveIndex(invalidIndex);
      toast.error(
        events.length > 1 
          ? `Event ${invalidIndex + 1} is missing a title!` 
          : "Event title is required!"
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/generate-ics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(events),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Generation failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.title.replace(/\\s+/g, "_") || "event"}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      toast.success("Calendar perfectly generated!", {
        description: "Open the file to instantly add it to your calendar.",
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/50 via-slate-50 to-rose-50/30 py-12 px-5 sm:px-8 font-sans antialiased text-slate-800 relative z-0 selection:bg-indigo-200">
      <div className="absolute inset-0 z-[-1] overflow-hidden opacity-40 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
        <div className="absolute top-40 -left-20 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-40 right-20 w-80 h-80 bg-rose-200 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="text-center mb-12 relative"
        >
          <button 
            type="button"
            onClick={() => setShowSettings(true)}
            className="absolute top-0 right-0 p-3 rounded-[20px] bg-white/40 border border-white/60 hover:bg-white text-slate-400 hover:text-indigo-600 transition-all shadow-sm hover:shadow-md active:scale-95"
            title="Global Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div className="inline-flex items-center justify-center p-4 rounded-3xl bg-white/60 shadow-[0_8px_16px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,1)] border border-white/50 backdrop-blur-xl mb-6 mt-4 md:mt-0">
            <CalendarDays className="w-10 h-10 text-indigo-600 stroke-[1.5]" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-indigo-900 via-slate-800 to-indigo-800 pb-2">
            ICS Foundry
          </h1>
          <p className="text-[16px] text-slate-500 font-medium max-w-sm mx-auto mt-2 tracking-wide leading-relaxed">
            The most sophisticated and accurate event generator online, powered by advanced AI extraction.
          </p>
        </motion.div>

        {/* AI Magic Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }}
          className={cn(cardStyles, "p-1.5 bg-gradient-to-br from-white/90 to-white/40")}
        >
          <div className="rounded-[28px] bg-indigo-50/40 p-6 md:p-8 backdrop-blur-sm border border-indigo-100/50">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
                <Wand2 className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-[17px] font-bold text-indigo-950 tracking-tight">AI Event Extraction</h2>
            </div>
            <p className="text-[14px] text-indigo-900/70 font-medium mb-6 leading-relaxed">
              Upload an invitation image or paste the email contents, and our autonomous assistant will magically construct your perfectly formatted event instantly.
            </p>
            
            <div className="space-y-4">
              <div className="relative group">
                <textarea
                  className={cn(inputStyles, "bg-white/80 focus:bg-white resize-none min-h-[96px]")}
                  placeholder="Paste meeting details, email threads, or garbled notes here..."
                  value={aiText} onChange={(e) => setAiText(e.target.value)} disabled={aiLoading}
                />
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <input
                  type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple
                  onChange={(e) => {
                    if (e.target.files) setAiFiles(Array.from(e.target.files));
                  }}
                />
                <button
                  type="button" disabled={aiLoading} onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-white/80 border border-indigo-100 text-indigo-700 font-semibold text-[14px] hover:bg-white hover:border-indigo-200 hover:shadow-sm transition-all shadow-[inset_0_2px_4px_rgba(255,255,255,0.5)] active:scale-[0.98]"
                >
                  <ImageIcon className="w-4 h-4" />
                  {aiFiles.length > 0 ? `${aiFiles.length} Images Selected` : "Attach Images"}
                </button>
                <button
                  type="button" onClick={handleAIExtract} disabled={aiLoading || (!aiText && aiFiles.length === 0)}
                  className="flex-[1.5] flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-semibold text-[15px] hover:shadow-lg hover:shadow-indigo-500/30 transition-all shadow-[inset_0_1px_rgba(255,255,255,0.2)] active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
                >
                  {aiLoading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 1 }}>
                      <Wand2 className="w-4 h-4 text-indigo-100" />
                    </motion.div>
                  ) : <Wand2 className="w-4 h-4" />}
                  {aiLoading ? "Synthesizing..." : "Auto-Fill Event"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Form Container */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}
          className={cardStyles}
        >
          {/* Tab Bar */}
          <div className="flex items-center gap-2 p-4 border-b border-indigo-100/50 overflow-x-auto no-scrollbar bg-white/40 backdrop-blur-md">
            {events.map((ev, idx) => (
              <button
                key={idx} type="button" onClick={() => setActiveIndex(idx)}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-[14px] font-bold transition-all whitespace-nowrap",
                  activeIndex === idx ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" : "bg-white/50 text-slate-600 hover:bg-white border border-slate-100"
                )}
              >
                {ev.title || `Pending Event ${idx + 1}`}
              </button>
            ))}
            <button
              type="button" onClick={() => {
                setEvents(prev => [...prev, { ...defaultForm, reminders: defaultReminders.map(m => ({ id: Math.random().toString(36).slice(2), minutes: m })), timezone: defaultTimezone || defaultForm.timezone }]);
                setActiveIndex(events.length);
              }}
              className="p-2.5 rounded-xl bg-white/40 text-indigo-600 hover:bg-white hover:text-indigo-700 transition-all border border-indigo-100 flex items-center justify-center min-w-[40px] ml-1 group"
              title="Add another event"
            >
              <Plus className="w-4 h-4" />
            </button>
            {events.length > 1 && (
              <button
               type="button" onClick={() => {
                 setEvents(prev => prev.filter((_, i) => i !== activeIndex));
                 setActiveIndex(Math.max(0, activeIndex - 1));
               }}
               className="p-2.5 ml-auto rounded-xl bg-rose-50/40 text-rose-500 hover:bg-rose-100 transition-all border border-rose-100 flex items-center justify-center min-w-[40px]"
               title="Remove current event"
              >
               <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Main Content */}
          <div className="p-6 md:p-10 space-y-12">
            
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-slate-400 stroke-[1.5]" />
                <h3 className="text-xl font-bold text-slate-800 tracking-tight">Core Details</h3>
              </div>
              <div className="space-y-5">
                <div>
                  <label className={labelStyles}>Event Title <span className="text-indigo-500">*</span></label>
                  <input className={inputStyles} placeholder="Type event title here..." value={form.title} onChange={(e) => set("title", e.target.value)} />
                </div>
                <div>
                  <label className={labelStyles}>Description</label>
                  <textarea className={cn(inputStyles, "resize-none h-28")} placeholder="What's this event about?" value={form.description} onChange={(e) => set("description", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className={labelStyles}>Location</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input className={cn(inputStyles, "pl-11")} placeholder="123 Apple Park Way" value={form.location} onChange={(e) => set("location", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelStyles}>Meeting URL</label>
                    <div className="relative">
                      <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input className={cn(inputStyles, "pl-11")} placeholder="https://zoom.us/j/..." value={form.url} onChange={(e) => set("url", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent opacity-60"></div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-6 h-6 text-slate-400 stroke-[1.5]" />
                  <h3 className="text-xl font-bold text-slate-800 tracking-tight">Time Logistics</h3>
                </div>
                <button
                  type="button" onClick={() => set("allDay", !form.allDay)}
                  className="flex items-center gap-2 group"
                >
                  <span className="text-[13px] font-semibold text-slate-500 group-hover:text-slate-700 transition-colors uppercase tracking-wide">All Day</span>
                  <div className={cn("w-12 h-6 rounded-full p-1 transition-colors duration-300", form.allDay ? "bg-indigo-500" : "bg-slate-200")}>
                    <motion.div layout transition={{ type: "spring", stiffness: 700, damping: 30 }} className="w-4 h-4 bg-white rounded-full shadow-sm" style={{ x: form.allDay ? 24 : 0 }} />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-5">
                  <div>
                    <label className={labelStyles}>Start Date</label>
                    <input type="date" className={inputStyles} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                  </div>
                  <AnimatePresence>
                    {!form.allDay && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <label className={labelStyles}>Start Time</label>
                        <input type="time" className={inputStyles} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className={labelStyles}>End Date</label>
                    <input type="date" className={inputStyles} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
                  </div>
                  <AnimatePresence>
                    {!form.allDay && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <label className={labelStyles}>End Time</label>
                        <input type="time" className={inputStyles} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="pt-2">
                <label className={labelStyles}>Time Zone Configuration</label>
                <div className="relative">
                  <select className={cn(inputStyles, "appearance-none pr-12 cursor-pointer")} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    <option value="">Floating (Resolves to user's device)</option>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent opacity-60"></div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-slate-400 stroke-[1.5]" />
                  <h3 className="text-xl font-bold text-slate-800 tracking-tight">Reminders</h3>
                </div>
                <button type="button" onClick={addReminder} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <AnimatePresence>
                {form.reminders.length === 0 ? (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[14px] text-slate-400 font-medium py-2">
                    No alarms established for this event.
                  </motion.p>
                ) : (
                  <motion.div className="space-y-3">
                    {form.reminders.map((r) => (
                      <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <select
                            className={cn(inputStyles, "appearance-none pr-10 bg-white/60 cursor-pointer py-2.5")}
                            value={r.minutes} onChange={(e) => {
                              set("reminders", form.reminders.map((ro) => ro.id === r.id ? { ...ro, minutes: parseInt(e.target.value) } : ro));
                            }}
                          >
                            {REMINDER_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                        <button type="button" onClick={() => removeReminder(r.id)} className="p-3 rounded-xl bg-rose-50/50 text-rose-500 hover:bg-rose-100 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent opacity-60"></div>

            {/* Advanced Settings Toggle */}
            <div className="pt-2">
              <button
                type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-[15px] font-bold text-slate-700">Advanced Metadata & Recurrence</span>
                </div>
                <motion.div animate={{ rotate: showAdvanced ? 90 : 0 }} className="text-slate-400">
                  <ChevronRight className="w-5 h-5" />
                </motion.div>
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-6 space-y-8 px-2"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className={labelStyles}>Organizer / Host</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input className={cn(inputStyles, "pl-11")} placeholder="Full Name" value={form.organizer} onChange={(e) => set("organizer", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className={labelStyles}>Organizer Email</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input type="email" className={cn(inputStyles, "pl-11")} placeholder="host@apple.com" value={form.organizerEmail} onChange={(e) => set("organizerEmail", e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className={labelStyles}>Global Internal Notes</label>
                      <textarea className={cn(inputStyles, "resize-none h-20")} placeholder="These act as a COMMENT header inside the actual ICS file." value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                    </div>

                    <div className="p-6 rounded-2xl bg-indigo-50/50 border border-indigo-100/50 space-y-6">
                      <h4 className="text-[15px] font-bold text-indigo-900">Recurrence Configuration</h4>
                      <div>
                        <label className={labelStyles}>Frequency</label>
                        <select
                          className={cn(inputStyles, "appearance-none bg-white")}
                          value={form.recurrence.freq}
                          onChange={(e) => set("recurrence", { ...form.recurrence, freq: e.target.value as any })}
                        >
                          <option value="">Never Patterned</option>
                          <option value="DAILY">Daily Continual</option>
                          <option value="WEEKLY">Weekly Routine</option>
                          <option value="MONTHLY">Monthly Refresh</option>
                          <option value="YEARLY">Annual Cycle</option>
                        </select>
                      </div>

                      {form.recurrence.freq && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                          {form.recurrence.freq === "WEEKLY" && (
                            <div>
                              <label className={labelStyles}>On specific days</label>
                              <div className="flex flex-wrap gap-2">
                                {DAYS_OF_WEEK.map((d) => (
                                  <button
                                    key={d.value} type="button"
                                    onClick={() => {
                                      const curr = form.recurrence.byDay || [];
                                      const updated = curr.includes(d.value) ? curr.filter(x => x !== d.value) : [...curr, d.value];
                                      set("recurrence", { ...form.recurrence, byDay: updated });
                                    }}
                                    className={cn("w-10 h-10 rounded-xl font-bold text-[13px] transition-all", 
                                      (form.recurrence.byDay || []).includes(d.value) ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "bg-white text-slate-500 hover:bg-indigo-50"
                                    )}
                                  >
                                    {d.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-5">
                            <div>
                              <label className={labelStyles}>End Criteria (Cycles)</label>
                              <input type="number" min={1} placeholder="Infinite" className={cn(inputStyles, "bg-white")} value={form.recurrence.count || ""} onChange={(e) => set("recurrence", { ...form.recurrence, count: parseInt(e.target.value) || undefined, until: undefined })} />
                            </div>
                            <div>
                              <label className={labelStyles}>Or End Date Boundary</label>
                              <input type="date" className={cn(inputStyles, "bg-white")} value={form.recurrence.until || ""} onChange={(e) => set("recurrence", { ...form.recurrence, until: e.target.value, count: undefined })} />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Footer Action */}
          <div className="bg-slate-50/80 p-6 md:p-8 md:px-10 border-t border-slate-100/60 sticky bottom-0 backdrop-blur-3xl z-10 flex flex-col sm:flex-row items-center justify-between gap-5">
            <p className="text-[13px] font-medium text-slate-400">
              Generates high-precision strict RFC 5545 payloads.
            </p>
            <button
              type="button" onClick={handleSubmit} disabled={loading}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-900 text-white text-[15px] font-bold hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/10 active:scale-[0.98] disabled:opacity-60 disabled:scale-100 transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 1 }} className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-white" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 opacity-90" />
                  Generate Calendar Pack
                </>
              )}
            </button>
          </div>
        </motion.div>
          {/* Settings Modal */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
              >
                <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-white/60 relative z-10"
                >
                  <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-indigo-50 rounded-xl">
                      <Settings className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight">Global Settings</h3>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className={labelStyles}>Default Time Zone</label>
                      <div className="relative">
                        <select 
                          className={cn(inputStyles, "appearance-none pr-12 cursor-pointer bg-white/60 py-2.5")} 
                          value={defaultTimezone} 
                          onChange={(e) => saveDefaults(defaultReminders, e.target.value)}
                        >
                          <option value="">Floating (Resolves to user's device)</option>
                          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className={labelStyles}>Default Alarms (Applied to new events)</label>
                      <div className="space-y-3 mt-3">
                        {defaultReminders.map((mins, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <select
                              className={cn(inputStyles, "bg-white/60 py-2.5")}
                              value={mins}
                              onChange={(e) => {
                                const newReminders = [...defaultReminders];
                                newReminders[i] = parseInt(e.target.value);
                                saveDefaults(newReminders, defaultTimezone);
                              }}
                            >
                              {REMINDER_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
                            </select>
                            <button 
                              onClick={() => {
                                const newReminders = defaultReminders.filter((_, idx) => idx !== i);
                                saveDefaults(newReminders, defaultTimezone);
                              }}
                              className="p-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => saveDefaults([...defaultReminders, 15], defaultTimezone)}
                        className="mt-4 flex items-center gap-2 text-[13px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add Default Alarm
                      </button>
                    </div>
                    
                    <div className="pt-6 border-t border-slate-100">
                      <button 
                        onClick={() => setShowSettings(false)}
                        className="w-full py-3.5 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all active:scale-[0.98]"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

      </div>
    </div>
  );
}
