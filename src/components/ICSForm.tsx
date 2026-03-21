"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { EventFormData, Reminder, TIMEZONES, REMINDER_OPTIONS } from "@/types/event";
import { summarizeRecurrence, summarizeReminders } from "@/lib/event-format";
import { parseICSContent } from "@/lib/ics-import";
import { formatDisplayDateTime } from "@/lib/time";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  MapPin,
  Clock,
  Plus,
  X,
  Wand2,
  Image as ImageIcon,
  Link2,
  FileText,
  Settings,
  ChevronDown,
  Download,
  AlertCircle,
  CalendarDays,
  User,
  CheckCircle2,
  ChevronRight,
  Mail,
  Sparkles,
  Loader2,
  Save,
  ListChecks,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAYS_OF_WEEK = [
  { label: "M", value: "MO", full: "Monday" },
  { label: "T", value: "TU", full: "Tuesday" },
  { label: "W", value: "WE", full: "Wednesday" },
  { label: "T", value: "TH", full: "Thursday" },
  { label: "F", value: "FR", full: "Friday" },
  { label: "S", value: "SA", full: "Saturday" },
  { label: "S", value: "SU", full: "Sunday" },
];

const NTH_OPTIONS = [
  { label: "1st", value: 1 },
  { label: "2nd", value: 2 },
  { label: "3rd", value: 3 },
  { label: "4th", value: 4 },
  { label: "Last", value: -1 },
];

const STANDARD_REMINDER_PRESET = [60, 1440];

type InsightSource = "manual" | "ai" | "import" | "template";
type UiTheme = "previous" | "current";

const UI_THEME_STYLES: Record<
  UiTheme,
  {
    pageGradient: string;
    blobOne: string;
    blobTwo: string;
    blobThree: string;
    extractorIconGradient: string;
    primaryButtonGradient: string;
    progressGradient: string;
  }
> = {
  previous: {
    pageGradient:
      "from-indigo-50/50 via-slate-50 to-rose-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950",
    blobOne: "bg-indigo-200 dark:bg-indigo-900",
    blobTwo: "bg-purple-200 dark:bg-purple-900",
    blobThree: "bg-rose-200 dark:bg-rose-900",
    extractorIconGradient: "from-indigo-500 to-purple-600",
    primaryButtonGradient: "from-indigo-600 to-purple-600",
    progressGradient: "from-indigo-500 to-purple-500",
  },
  current: {
    pageGradient:
      "from-indigo-50/50 via-slate-50 to-rose-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950",
    blobOne: "bg-indigo-200 dark:bg-indigo-900",
    blobTwo: "bg-rose-200 dark:bg-sky-900",
    blobThree: "bg-cyan-200 dark:bg-purple-900",
    extractorIconGradient: "from-indigo-500 to-sky-600",
    primaryButtonGradient: "from-indigo-600 to-sky-600",
    progressGradient: "from-indigo-500 to-sky-500",
  },
};

type InsightField =
  | "title"
  | "description"
  | "location"
  | "url"
  | "notes"
  | "organizer"
  | "organizerEmail"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "allDay"
  | "timezone"
  | "reminders"
  | "recurrence"
  | "exdates";

interface EventInsight {
  source: InsightSource;
  highlightedFields: InsightField[];
  lowConfidenceFields: InsightField[];
  confidenceByField: Partial<Record<InsightField, number>>;
  timezoneWarning?: string;
  overallConfidence?: number;
}

interface EventTemplate {
  id: string;
  name: string;
  title: string;
  location: string;
  timezone: string;
  reminders: number[];
}

interface ApplyMetadata {
  source: InsightSource;
  confidenceByField?: Partial<Record<InsightField, number>>;
  lowConfidenceFields?: InsightField[];
  timezoneWarning?: string;
  overallConfidence?: number;
}

interface ExtractedAIEvent {
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
  recurrence?: EventFormData["recurrence"];
  reminders?: Array<{ minutes?: number }>;
  confidence?: {
    overall?: number;
    fields?: Record<string, number>;
    needsReview?: string[];
    notes?: string[];
    timezoneWarning?: string;
  };
}

const inputStyles =
  "w-full bg-white/40 dark:bg-slate-900/40 border border-white/50 dark:border-slate-700/60 backdrop-blur-xl rounded-2xl px-4 py-3.5 text-[15px] font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400/50 focus:bg-white/80 dark:focus:bg-slate-900/80 transition-all duration-300 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.02)]";
const labelStyles =
  "block text-[13px] font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide ml-1";
const cardStyles =
  "bg-white/60 dark:bg-slate-900/55 border border-white/60 dark:border-slate-700/60 backdrop-blur-2xl rounded-[32px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.8)]";

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

function buildBlankInsight(): EventInsight {
  return {
    source: "manual",
    highlightedFields: [],
    lowConfidenceFields: [],
    confidenceByField: {},
  };
}

function makeReminder(minutes: number): Reminder {
  return { id: Math.random().toString(36).slice(2), minutes };
}

function timezoneToLocationFallback(timezone: string): string {
  const city = timezone?.split("/")[1] || "";
  return city.replace(/_/g, " ").trim();
}

function createDefaultEvent(
  defaultTimezone?: string,
  defaultReminderMinutes: number[] = [],
  defaultLocation?: string,
): EventFormData {
  const dates = getDefaultDates();
  return {
    title: "",
    description: "",
    location: defaultLocation || "",
    url: "",
    notes: "",
    organizer: "",
    organizerEmail: "",
    startDate: dates.startDate,
    startTime: dates.startTime,
    endDate: dates.endDate,
    endTime: dates.endTime,
    allDay: false,
    timezone: defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    reminders: defaultReminderMinutes.map((minutes) => makeReminder(minutes)),
    recurrence: { freq: "", interval: 1, byDay: [] },
    exdates: [],
  };
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 60) || "event";
}

function normalizeAIEvent(input: ExtractedAIEvent): Partial<EventFormData> {
  const partial: Partial<EventFormData> = {};

  if (input.title) partial.title = input.title;
  if (input.description) partial.description = input.description;
  if (input.location) partial.location = input.location;
  if (input.url) partial.url = input.url;
  if (input.organizer) partial.organizer = input.organizer;
  if (input.organizerEmail) partial.organizerEmail = input.organizerEmail;
  if (input.startDate) partial.startDate = input.startDate;
  if (input.startTime) partial.startTime = input.startTime;
  if (input.endDate) partial.endDate = input.endDate;
  if (input.endTime) partial.endTime = input.endTime;
  if (input.timezone) partial.timezone = input.timezone;
  if (input.allDay === true) partial.allDay = true;

  if (input.recurrence?.freq) {
    partial.recurrence = {
      freq: input.recurrence.freq,
      interval: input.recurrence.interval || 1,
      byDay: input.recurrence.byDay || [],
      byMonthDay: input.recurrence.byMonthDay || undefined,
      bySetPos: input.recurrence.bySetPos || undefined,
      count: input.recurrence.count || undefined,
      until: input.recurrence.until || undefined,
    };
  }

  if (Array.isArray(input.reminders) && input.reminders.length > 0) {
    partial.reminders = input.reminders.map((reminder) => makeReminder(reminder.minutes || 15));
  }

  return partial;
}

function buildEventFromPartial(
  partial: Partial<EventFormData>,
  defaultTimezone?: string,
  defaultReminderMinutes: number[] = [],
  defaultLocation?: string,
): EventFormData {
  const base = createDefaultEvent(defaultTimezone, defaultReminderMinutes, defaultLocation);

  return {
    ...base,
    ...partial,
    reminders:
      partial.reminders && partial.reminders.length > 0
        ? partial.reminders.map((reminder) => ({ id: reminder.id || Math.random().toString(36).slice(2), minutes: reminder.minutes }))
        : base.reminders,
    recurrence: {
      ...base.recurrence,
      ...(partial.recurrence || {}),
    },
    exdates: partial.exdates || [],
  };
}

function confidenceTone(value?: number): string {
  if (typeof value !== "number") return "text-slate-400 dark:text-slate-500";
  if (value >= 0.85) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 0.66) return "text-amber-600 dark:text-amber-400";
  return "text-rose-500 dark:text-rose-400";
}

export default function ICSForm() {
  const [events, setEvents] = useState<EventFormData[]>([createDefaultEvent()]);
  const [eventInsights, setEventInsights] = useState<EventInsight[]>([buildBlankInsight()]);
  const [editedFields, setEditedFields] = useState<Array<Record<string, boolean>>>([{}]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAdvancedRecurrence, setShowAdvancedRecurrence] = useState(false);
  const [newExdate, setNewExdate] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [defaultReminders, setDefaultReminders] = useState<number[]>([]);
  const [defaultTimezone, setDefaultTimezone] = useState<string>("");
  const [defaultLocation, setDefaultLocation] = useState<string>("");
  const [uiTheme, setUiTheme] = useState<UiTheme>("previous");

  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState({ percent: 0, label: "" });
  const [aiText, setAiText] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const form = events[activeIndex] || events[0];
  const insight = eventInsights[activeIndex] || buildBlankInsight();
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const themeStyles = UI_THEME_STYLES[uiTheme];

  useEffect(() => {
    const savedTheme = localStorage.getItem("ics_ui_theme");
    if (savedTheme === "previous" || savedTheme === "current") {
      setUiTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    const savedDefaults = localStorage.getItem("ics_defaults");
    const detectedTimezone = deviceTimezone;
    const detectedLocation = timezoneToLocationFallback(detectedTimezone);
    if (savedDefaults) {
      try {
        const parsed = JSON.parse(savedDefaults);
        const reminders = Array.isArray(parsed.reminders) ? parsed.reminders : STANDARD_REMINDER_PRESET;
        const timezone = typeof parsed.timezone === "string" && parsed.timezone ? parsed.timezone : detectedTimezone;
        const location = typeof parsed.location === "string" && parsed.location ? parsed.location : detectedLocation;
        setDefaultReminders(reminders);
        setDefaultTimezone(timezone);
        setDefaultLocation(location);
        setEvents((prev) =>
          prev.map((event) => ({
            ...event,
            timezone: timezone || event.timezone,
            location: event.location || location,
            reminders: reminders.map((minutes: number) => makeReminder(minutes)),
          })),
        );
      } catch {
        setDefaultReminders(STANDARD_REMINDER_PRESET);
        setDefaultTimezone(detectedTimezone);
        setDefaultLocation(detectedLocation);
      }
    } else {
      setDefaultReminders(STANDARD_REMINDER_PRESET);
      setDefaultTimezone(detectedTimezone);
      setDefaultLocation(detectedLocation);
      setEvents((prev) =>
        prev.map((event) => ({
          ...event,
          timezone: event.timezone || detectedTimezone,
          location: event.location || detectedLocation,
          reminders: STANDARD_REMINDER_PRESET.map((minutes) => makeReminder(minutes)),
        })),
      );
    }
  }, [deviceTimezone]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let ignore = false;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (ignore) return;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
          );
          if (!response.ok) return;
          const data = await response.json();
          const address = data?.address || {};
          const city = address.city || address.town || address.village || address.hamlet || address.county || "";
          const state = address.state || address.region || "";
          const country = address.country_code ? String(address.country_code).toUpperCase() : address.country || "";
          const location = [city, state || country].filter(Boolean).join(", ").trim();
          if (!location) return;

          setDefaultLocation((prev) => prev || location);
          setEvents((prev) =>
            prev.map((event) => ({
              ...event,
              location: event.location || location,
            })),
          );
        } catch {
          // Ignore geolocation lookup failures and keep fallback location.
        }
      },
      () => {
        // Ignore denied location permissions and keep fallback location.
      },
      { timeout: 7000, maximumAge: 300000 },
    );

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const savedTemplates = localStorage.getItem("ics_templates");
    if (!savedTemplates) return;
    try {
      const parsed = JSON.parse(savedTemplates);
      if (Array.isArray(parsed)) {
        setTemplates(parsed.filter((template) => template && template.id && template.name));
      }
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (!aiLoading) {
      setAiProgress({ percent: 0, label: "" });
      return;
    }

    const phases = [
      "Reading text and image context...",
      "Extracting event details...",
      "Estimating time, timezone, and recurrence...",
      "Scoring field confidence...",
    ];

    let tick = 0;
    setAiProgress({ percent: 12, label: phases[0] });

    const timer = setInterval(() => {
      tick += 1;
      const phaseIndex = Math.min(phases.length - 1, Math.floor(tick / 3));
      const percent = Math.min(94, 12 + tick * 6);
      setAiProgress({ percent, label: phases[phaseIndex] });
    }, 320);

    return () => clearInterval(timer);
  }, [aiLoading]);

  useEffect(() => {
    if (events.length === eventInsights.length && events.length === editedFields.length) return;

    setEventInsights((prev) => {
      const next = [...prev];
      while (next.length < events.length) next.push(buildBlankInsight());
      return next.slice(0, events.length);
    });

    setEditedFields((prev) => {
      const next = [...prev];
      while (next.length < events.length) next.push({});
      return next.slice(0, events.length);
    });

    if (activeIndex > events.length - 1) {
      setActiveIndex(Math.max(0, events.length - 1));
    }
  }, [events.length, eventInsights.length, editedFields.length, activeIndex]);

  const saveDefaults = (
    reminders: number[],
    timezone: string = defaultTimezone,
    location: string = defaultLocation,
  ) => {
    setDefaultReminders(reminders);
    setDefaultTimezone(timezone);
    setDefaultLocation(location);
    localStorage.setItem("ics_defaults", JSON.stringify({ reminders, timezone, location }));
    toast.success("Default settings saved.");
  };

  const saveTheme = (theme: UiTheme) => {
    setUiTheme(theme);
    localStorage.setItem("ics_ui_theme", theme);
  };

  const saveTemplatesToStorage = (nextTemplates: EventTemplate[]) => {
    setTemplates(nextTemplates);
    localStorage.setItem("ics_templates", JSON.stringify(nextTemplates));
  };

  const markFieldEdited = useCallback((index: number, field: InsightField) => {
    setEditedFields((prev) => {
      const next = [...prev];
      next[index] = { ...(next[index] || {}), [field]: true };
      return next;
    });

    setEventInsights((prev) => {
      const next = [...prev];
      const curr = next[index] || buildBlankInsight();
      next[index] = {
        ...curr,
        highlightedFields: curr.highlightedFields.filter((item) => item !== field),
        lowConfidenceFields: curr.lowConfidenceFields.filter((item) => item !== field),
      };
      return next;
    });
  }, []);

  const setField = useCallback(
    <K extends keyof EventFormData>(key: K, value: EventFormData[K], options?: { markEdited?: boolean }) => {
      setEvents((prev) => {
        const next = [...prev];
        next[activeIndex] = { ...next[activeIndex], [key]: value };
        return next;
      });

      if (options?.markEdited !== false) {
        markFieldEdited(activeIndex, key as InsightField);
      }
    },
    [activeIndex, markFieldEdited],
  );

  const applyPartialToEvent = useCallback(
    (
      index: number,
      partial: Partial<EventFormData>,
      metadata: ApplyMetadata,
      options?: { force?: boolean },
    ): InsightField[] => {
      const incomingFields = (Object.entries(partial) as Array<[InsightField, EventFormData[keyof EventFormData]]>).filter(
        ([, value]) => {
          if (value === undefined || value === null) return false;
          if (typeof value === "string") return value.trim().length > 0;
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "object") return Object.keys(value).length > 0;
          return true;
        },
      );

      if (incomingFields.length === 0) return [];

      const edited = editedFields[index] || {};
      const current = events[index];
      const conflicts = incomingFields
        .filter(([field, value]) => edited[field] && JSON.stringify(current?.[field as keyof EventFormData]) !== JSON.stringify(value))
        .map(([field]) => field);

      let allowedFields = incomingFields.map(([field]) => field);

      if (conflicts.length > 0 && !options?.force) {
        const shouldOverride = window.confirm(
          `These fields were manually edited and will be overwritten: ${conflicts.join(", ")}. Continue?`,
        );
        if (!shouldOverride) {
          allowedFields = allowedFields.filter((field) => !conflicts.includes(field));
        }
      }

      if (allowedFields.length === 0) return [];

      setEvents((prev) => {
        const next = [...prev];
        const target = { ...next[index] };

        for (const field of allowedFields) {
          const value = partial[field];
          if (value === undefined) continue;
          (target[field as keyof EventFormData] as unknown) = value;
        }

        next[index] = target;
        return next;
      });

      setEventInsights((prev) => {
        const next = [...prev];
        const curr = next[index] || buildBlankInsight();
        const newLowConfidence = (metadata.lowConfidenceFields || []).filter((field) => allowedFields.includes(field));

        next[index] = {
          ...curr,
          source: metadata.source,
          highlightedFields: Array.from(new Set<InsightField>([...curr.highlightedFields, ...allowedFields])),
          lowConfidenceFields: Array.from(new Set<InsightField>([...curr.lowConfidenceFields, ...newLowConfidence])),
          confidenceByField: {
            ...curr.confidenceByField,
            ...(metadata.confidenceByField || {}),
          },
          timezoneWarning: metadata.timezoneWarning || curr.timezoneWarning,
          overallConfidence: metadata.overallConfidence ?? curr.overallConfidence,
        };

        return next;
      });

      return allowedFields;
    },
    [editedFields, events],
  );

  const appendEvent = useCallback(
    (partial?: Partial<EventFormData>, metadata?: ApplyMetadata) => {
      const newEvent = buildEventFromPartial(
        partial || {},
        defaultTimezone || undefined,
        defaultReminders,
        defaultLocation || undefined,
      );
      const newInsight: EventInsight = {
        ...buildBlankInsight(),
        source: metadata?.source || "manual",
        highlightedFields: Object.keys(partial || {}) as InsightField[],
        lowConfidenceFields: metadata?.lowConfidenceFields || [],
        confidenceByField: metadata?.confidenceByField || {},
        timezoneWarning: metadata?.timezoneWarning,
        overallConfidence: metadata?.overallConfidence,
      };

      setEvents((prev) => [...prev, newEvent]);
      setEditedFields((prev) => [...prev, {}]);
      setEventInsights((prev) => [...prev, newInsight]);
    },
    [defaultTimezone, defaultReminders, defaultLocation],
  );

  const removeEvent = (index: number) => {
    if (events.length === 1) return;

    setEvents((prev) => prev.filter((_, i) => i !== index));
    setEditedFields((prev) => prev.filter((_, i) => i !== index));
    setEventInsights((prev) => prev.filter((_, i) => i !== index));

    setActiveIndex((prev) => {
      if (prev === index) return Math.max(0, index - 1);
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  const addReminder = () => {
    setField("reminders", [...form.reminders, makeReminder(15)]);
  };

  const removeReminder = (id: string) => {
    setField(
      "reminders",
      form.reminders.filter((reminder) => reminder.id !== id),
    );
  };

  const applyReminderPreset = (minutes: number[]) => {
    setField(
      "reminders",
      minutes.map((value) => makeReminder(value)),
    );

    setEventInsights((prev) => {
      const next = [...prev];
      const curr = next[activeIndex] || buildBlankInsight();
      next[activeIndex] = {
        ...curr,
        highlightedFields: Array.from(new Set<InsightField>([...curr.highlightedFields, "reminders"])),
      };
      return next;
    });
  };

  const setRecurrence = (updater: Partial<EventFormData["recurrence"]>) => {
    setField("recurrence", {
      ...form.recurrence,
      ...updater,
    });
  };

  const addExdate = () => {
    if (!newExdate) return;
    if (form.exdates.includes(newExdate)) {
      toast.info("This exclusion date already exists.");
      return;
    }
    setField("exdates", [...form.exdates, newExdate]);
    setNewExdate("");
  };

  const removeExdate = (value: string) => {
    setField(
      "exdates",
      form.exdates.filter((item) => item !== value),
    );
  };

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    const partial: Partial<EventFormData> = {
      title: template.title,
      location: template.location,
      timezone: template.timezone,
      reminders: template.reminders.map((minutes) => makeReminder(minutes)),
    };

    const applied = applyPartialToEvent(activeIndex, partial, {
      source: "template",
      confidenceByField: {
        title: 1,
        location: 1,
        timezone: 1,
        reminders: 1,
      },
    });

    if (applied.length > 0) {
      toast.success(`Applied template: ${template.name}`);
    }
  };

  const saveCurrentAsTemplate = () => {
    const suggested = form.title?.trim() || "New Template";
    const name = window.prompt("Template name", suggested);
    if (!name) return;

    const template: EventTemplate = {
      id: Math.random().toString(36).slice(2),
      name: name.trim(),
      title: form.title,
      location: form.location,
      timezone: form.timezone,
      reminders: form.reminders.map((item) => item.minutes),
    };

    const next = [template, ...templates].slice(0, 20);
    saveTemplatesToStorage(next);
    setSelectedTemplateId(template.id);
    toast.success("Template saved.");
  };

  const handleAIExtract = async () => {
    if (!aiText && aiFiles.length === 0) return;
    setAiLoading(true);

    try {
      const requestData = new FormData();
      if (aiText) requestData.append("text", aiText);
      aiFiles.forEach((file) => requestData.append("images", file));
      requestData.append("localDate", new Date().toString());
      requestData.append("localTimezone", deviceTimezone);

      const response = await fetch("/api/extract-event", {
        method: "POST",
        body: requestData,
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to extract event data.");

      const aiEvents: ExtractedAIEvent[] = payload?.data?.events || [];
      if (!Array.isArray(aiEvents) || aiEvents.length === 0) {
        toast.error("No events were detected.");
        return;
      }

      let appliedCount = 0;
      let createdCount = 0;

      aiEvents.forEach((rawEvent, index) => {
        const partial = normalizeAIEvent(rawEvent);
        const confidenceByField: Partial<Record<InsightField, number>> = {};
        if (rawEvent.confidence?.fields) {
          for (const [key, value] of Object.entries(rawEvent.confidence.fields)) {
            confidenceByField[key as InsightField] = value;
          }
        }

        const metadata: ApplyMetadata = {
          source: "ai",
          confidenceByField,
          lowConfidenceFields: (rawEvent.confidence?.needsReview || []) as InsightField[],
          timezoneWarning: rawEvent.confidence?.timezoneWarning,
          overallConfidence: rawEvent.confidence?.overall,
        };

        if (index === 0) {
          const applied = applyPartialToEvent(activeIndex, partial, metadata);
          if (applied.length > 0) appliedCount += 1;
        } else {
          appendEvent(partial, metadata);
          createdCount += 1;
        }
      });

      setAiProgress({ percent: 100, label: "Done" });
      setAiText("");
      setAiFiles([]);

      toast.success(
        createdCount > 0
          ? `Auto-fill complete. Updated current event and added ${createdCount} pending events.`
          : `Auto-fill complete for ${Math.max(appliedCount, 1)} event.`,
        { icon: "✨" },
      );
    } catch (error: any) {
      toast.error(error.message || "Extraction failed.", {
        icon: <AlertCircle className="w-5 h-5 text-rose-500" />,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleImportICS = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = parseICSContent(content);

      if (parsed.events.length === 0) {
        toast.error(parsed.errors[0] || "Could not find events in that ICS file.");
        return;
      }

      const currentIsMostlyEmpty =
        !form.title &&
        !form.description &&
        !form.location &&
        !form.url &&
        Object.keys(editedFields[activeIndex] || {}).length === 0;

      parsed.events.forEach((partial, idx) => {
        if (idx === 0 && currentIsMostlyEmpty) {
          applyPartialToEvent(activeIndex, partial, {
            source: "import",
            confidenceByField: {
              title: 1,
              description: 1,
              location: 1,
              url: 1,
              startDate: 1,
              startTime: 1,
              endDate: 1,
              endTime: 1,
              timezone: 1,
              reminders: 1,
              recurrence: 1,
            },
          }, { force: true });
        } else {
          appendEvent(partial, {
            source: "import",
            confidenceByField: {
              title: 1,
              description: 1,
              location: 1,
              url: 1,
              startDate: 1,
              startTime: 1,
              endDate: 1,
              endTime: 1,
              timezone: 1,
              reminders: 1,
              recurrence: 1,
            },
          });
        }
      });

      if (parsed.errors.length > 0) {
        toast.warning(`Imported with notes: ${parsed.errors[0]}`);
      } else {
        toast.success(`Imported ${parsed.events.length} event${parsed.events.length === 1 ? "" : "s"}.`);
      }
    } catch {
      toast.error("Failed to import the ICS file.");
    } finally {
      event.target.value = "";
    }
  };

  const downloadEvents = async (items: EventFormData[], filenameHint: string) => {
    const response = await fetch("/api/generate-ics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Generation failed" }));
      throw new Error(errorBody.error || "Generation failed");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFilename(filenameHint)}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    const invalidIndex = events.findIndex((event) => !event.title?.trim());
    if (invalidIndex !== -1) {
      setActiveIndex(invalidIndex);
      toast.error(
        events.length > 1
          ? `Event ${invalidIndex + 1} is missing a title.`
          : "Event title is required.",
      );
      return;
    }

    setLoading(true);
    try {
      await downloadEvents(
        events,
        events.length === 1 ? events[0].title || "event" : `Event_Pack_${Date.now()}`,
      );
      toast.success("Calendar pack generated successfully.", {
        description: events.length > 1 ? "All pending events were bundled into one ICS file." : undefined,
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to generate ICS.");
    } finally {
      setLoading(false);
    }
  };

  const timezoneHelperText = useMemo(() => {
    if (!form) return "";
    if (form.allDay) return "All-day events are interpreted as date-based entries in calendar apps.";
    if (!form.startDate || !form.startTime) return "";

    const sourceTimezone = form.timezone || deviceTimezone;
    try {
      const converted = formatDisplayDateTime(form.startDate, form.startTime, sourceTimezone, deviceTimezone);
      return `This event will appear as ${converted} on your device (${deviceTimezone}).`;
    } catch {
      return "Verify timezone conversion before exporting.";
    }
  }, [form, deviceTimezone]);

  const previewDateLine = useMemo(() => {
    if (!form) return "";
    if (form.allDay) {
      const start = new Date(`${form.startDate}T00:00:00`);
      const end = new Date(`${form.endDate}T00:00:00`);
      const startText = start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const endText = end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return startText === endText ? `${startText} (All day)` : `${startText} - ${endText} (All day)`;
    }

    const sourceTimezone = form.timezone || deviceTimezone;
    const startText = formatDisplayDateTime(form.startDate, form.startTime, sourceTimezone, sourceTimezone);
    const endText = formatDisplayDateTime(form.endDate, form.endTime, sourceTimezone, sourceTimezone);
    return `${startText} - ${endText}`;
  }, [form, deviceTimezone]);

  const reminderSummary = useMemo(() => summarizeReminders(form?.reminders || []), [form?.reminders]);
  const recurrenceSummary = useMemo(() => summarizeRecurrence(form?.recurrence || { freq: "", interval: 1, byDay: [] }), [form?.recurrence]);

  const getFieldClass = (field: InsightField) => {
    const highlighted = insight.highlightedFields.includes(field);
    const lowConfidence = insight.lowConfidenceFields.includes(field);
    return cn(
      highlighted && "border-indigo-300/70 bg-indigo-50/40 dark:bg-indigo-500/10",
      lowConfidence && "border-amber-300/80 bg-amber-50/40 dark:bg-amber-500/10",
    );
  };

  const renderLabel = (label: string, field: InsightField, required = false) => {
    const confidence = insight.confidenceByField[field];
    const lowConfidence = insight.lowConfidenceFields.includes(field);

    return (
      <label className={labelStyles}>
        <span className="inline-flex items-center gap-2">
          {label}
          {required && <span className="text-indigo-500">*</span>}
          {typeof confidence === "number" && (
            <span className={cn("text-[11px] font-bold normal-case tracking-normal", confidenceTone(confidence))}>
              {Math.round(confidence * 100)}%
            </span>
          )}
          {lowConfidence && (
            <span className="text-[11px] font-bold normal-case tracking-normal text-amber-600 dark:text-amber-400">
              Review
            </span>
          )}
        </span>
      </label>
    );
  };

  const recurrenceMonthlyMode =
    form?.recurrence.bySetPos && form.recurrence.byDay && form.recurrence.byDay.length === 1
      ? "nth"
      : "monthDay";

  return (
    <div
      className={cn(
        "min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] py-10 px-5 sm:px-8 font-sans antialiased text-slate-800 dark:text-slate-100 relative z-0 selection:bg-indigo-200",
        themeStyles.pageGradient,
      )}
    >
      <div className="absolute inset-0 z-[-1] overflow-hidden opacity-40 pointer-events-none">
        <div
          className={cn(
            "absolute -top-40 -right-40 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob",
            themeStyles.blobOne,
          )}
        />
        <div
          className={cn(
            "absolute top-40 -left-20 w-72 h-72 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000",
            themeStyles.blobTwo,
          )}
        />
        <div
          className={cn(
            "absolute -bottom-40 right-20 w-80 h-80 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000",
            themeStyles.blobThree,
          )}
        />
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6 relative"
        >
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="absolute top-0 right-0 p-3 rounded-[20px] bg-white/40 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all shadow-sm hover:shadow-md active:scale-95"
            title="Global Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center justify-center p-4 rounded-3xl bg-white/60 dark:bg-slate-800/70 shadow-[0_8px_16px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,1)] border border-white/50 dark:border-slate-700/80 backdrop-blur-xl mb-6 mt-4 md:mt-0">
            <CalendarDays className="w-10 h-10 text-indigo-600 dark:text-indigo-300 stroke-[1.5]" />
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-indigo-900 via-slate-800 to-indigo-800 dark:from-slate-100 dark:via-slate-300 dark:to-indigo-300 pb-2">
            ICS Foundry
          </h1>
          <p className="text-[16px] text-slate-500 dark:text-slate-300 font-medium max-w-xl mx-auto mt-2 tracking-wide leading-relaxed">
            AI-assisted event extraction with premium editing controls, live preview, and RFC 5545-safe exports.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className={cn(cardStyles, "p-1.5 bg-gradient-to-br from-white/90 to-white/40 dark:from-slate-900/70 dark:to-slate-900/30")}
            >
              <div className="rounded-[28px] bg-indigo-50/40 dark:bg-slate-900/60 p-6 md:p-8 backdrop-blur-sm border border-indigo-100/50 dark:border-slate-700/60 space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2.5 bg-gradient-to-br rounded-xl shadow-lg shadow-indigo-500/20", themeStyles.extractorIconGradient)}>
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-[17px] font-bold text-indigo-950 dark:text-slate-100 tracking-tight">AI Event Extraction</h2>
                </div>

                <div className="space-y-4">
                  <div className="relative group">
                    <textarea
                      className={cn(inputStyles, "bg-white/80 dark:bg-slate-900/60 focus:bg-white dark:focus:bg-slate-900 resize-none min-h-[96px]")}
                      placeholder="Paste meeting details, email content, or event flyer text..."
                      value={aiText}
                      onChange={(event) => setAiText(event.target.value)}
                      disabled={aiLoading}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        if (event.target.files) setAiFiles(Array.from(event.target.files));
                      }}
                    />

                    <input
                      type="file"
                      ref={importInputRef}
                      className="hidden"
                      accept=".ics,text/calendar"
                      onChange={handleImportICS}
                    />

                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-white/80 dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 font-semibold text-[14px] hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-[0.98]"
                    >
                      <ImageIcon className="w-4 h-4" />
                      {aiFiles.length > 0 ? `${aiFiles.length} image${aiFiles.length === 1 ? "" : "s"}` : "Attach Images"}
                    </button>

                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-white/80 dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 font-semibold text-[14px] hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-[0.98]"
                    >
                      <FileText className="w-4 h-4" />
                      Import .ics
                    </button>

                    <button
                      type="button"
                      onClick={handleAIExtract}
                      disabled={aiLoading || (!aiText && aiFiles.length === 0)}
                      className={cn(
                        "flex-[1.3] flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-br text-white font-semibold text-[15px] hover:shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-[0.98] disabled:opacity-50",
                        themeStyles.primaryButtonGradient,
                      )}
                    >
                      {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {aiLoading ? "Extracting..." : "Auto-Fill Event"}
                    </button>
                  </div>

                  <AnimatePresence>
                    {aiLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="space-y-2"
                      >
                        <div className="h-2 rounded-full bg-indigo-100 dark:bg-slate-700 overflow-hidden">
                          <motion.div className={cn("h-full bg-gradient-to-r", themeStyles.progressGradient)} style={{ width: `${aiProgress.percent}%` }} />
                        </div>
                        <p className="text-[12px] text-indigo-800 dark:text-indigo-300 font-medium">{aiProgress.label}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className={cardStyles}
            >
              <div className="flex items-center gap-2 p-4 border-b border-indigo-100/50 dark:border-slate-700/60 overflow-x-auto no-scrollbar bg-white/40 dark:bg-slate-900/40 backdrop-blur-md">
                {events.map((event, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-[14px] font-bold transition-all whitespace-nowrap",
                      activeIndex === idx
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                        : "bg-white/50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700",
                    )}
                  >
                    {event.title || `Pending Event ${idx + 1}`}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    appendEvent();
                    setActiveIndex(events.length);
                  }}
                  className="p-2.5 rounded-xl bg-white/40 dark:bg-slate-800/60 text-indigo-600 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-700 transition-all border border-indigo-100 dark:border-slate-700 flex items-center justify-center min-w-[40px] ml-1"
                  title="Add another event"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {events.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEvent(activeIndex)}
                    className="p-2.5 ml-auto rounded-xl bg-rose-50/40 dark:bg-rose-500/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/30 transition-all border border-rose-100 dark:border-rose-500/30 flex items-center justify-center min-w-[40px]"
                    title="Remove current event"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-6 md:p-10 space-y-12">
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <FileText className="w-6 h-6 text-slate-400 dark:text-slate-300 stroke-[1.5]" />
                      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Core Details</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        className={cn(inputStyles, "py-2.5 text-[13px] min-w-[170px]")}
                        value={selectedTemplateId}
                        onChange={(event) => applyTemplate(event.target.value)}
                      >
                        <option value="">Use Template</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={saveCurrentAsTemplate}
                        className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-all"
                      >
                        <Save className="w-4 h-4" /> Save as Template
                      </button>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      {renderLabel("Event Title", "title", true)}
                      <input
                        className={cn(inputStyles, getFieldClass("title"))}
                        placeholder="Type event title here..."
                        value={form.title}
                        onChange={(event) => setField("title", event.target.value)}
                      />
                    </div>

                    <div>
                      {renderLabel("Description", "description")}
                      <textarea
                        className={cn(inputStyles, "resize-none h-28", getFieldClass("description"))}
                        placeholder="What's this event about?"
                        value={form.description}
                        onChange={(event) => setField("description", event.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        {renderLabel("Location", "location")}
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            className={cn(inputStyles, "pl-11", getFieldClass("location"))}
                            placeholder="123 Apple Park Way"
                            value={form.location}
                            onChange={(event) => setField("location", event.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        {renderLabel("Meeting URL", "url")}
                        <div className="relative">
                          <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            className={cn(inputStyles, "pl-11", getFieldClass("url"))}
                            placeholder="https://zoom.us/j/..."
                            value={form.url}
                            onChange={(event) => setField("url", event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent opacity-60" />

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="w-6 h-6 text-slate-400 dark:text-slate-300 stroke-[1.5]" />
                      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Time Logistics</h3>
                    </div>

                    <button type="button" onClick={() => setField("allDay", !form.allDay)} className="flex items-center gap-2 group">
                      <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">All Day</span>
                      <div className={cn("w-12 h-6 rounded-full p-1 transition-colors duration-300", form.allDay ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700")}>
                        <motion.div
                          layout
                          transition={{ type: "spring", stiffness: 700, damping: 30 }}
                          className="w-4 h-4 bg-white rounded-full shadow-sm"
                          style={{ x: form.allDay ? 24 : 0 }}
                        />
                      </div>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-5">
                      <div>
                        {renderLabel("Start Date", "startDate")}
                        <input
                          type="date"
                          className={cn(inputStyles, getFieldClass("startDate"))}
                          value={form.startDate}
                          onChange={(event) => setField("startDate", event.target.value)}
                        />
                      </div>

                      <AnimatePresence>
                        {!form.allDay && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            {renderLabel("Start Time", "startTime")}
                            <input
                              type="time"
                              className={cn(inputStyles, getFieldClass("startTime"))}
                              value={form.startTime}
                              onChange={(event) => setField("startTime", event.target.value)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="space-y-5">
                      <div>
                        {renderLabel("End Date", "endDate")}
                        <input
                          type="date"
                          className={cn(inputStyles, getFieldClass("endDate"))}
                          value={form.endDate}
                          onChange={(event) => setField("endDate", event.target.value)}
                        />
                      </div>

                      <AnimatePresence>
                        {!form.allDay && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            {renderLabel("End Time", "endTime")}
                            <input
                              type="time"
                              className={cn(inputStyles, getFieldClass("endTime"))}
                              value={form.endTime}
                              onChange={(event) => setField("endTime", event.target.value)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="pt-2">
                    {renderLabel("Time Zone Configuration", "timezone")}
                    <div className="relative">
                      <select
                        className={cn(inputStyles, "appearance-none pr-12 cursor-pointer", getFieldClass("timezone"))}
                        value={form.timezone}
                        onChange={(event) => setField("timezone", event.target.value)}
                      >
                        <option value="">Floating (Resolves to device timezone)</option>
                        {TIMEZONES.map((timezone) => (
                          <option key={timezone} value={timezone}>
                            {timezone}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {timezoneHelperText && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-300 mt-2">{timezoneHelperText}</p>
                    )}
                    {insight.timezoneWarning && (
                      <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-1">{insight.timezoneWarning}</p>
                    )}
                  </div>
                </div>

                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent opacity-60" />

                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-6 h-6 text-slate-400 dark:text-slate-300 stroke-[1.5]" />
                      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Reminders</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => applyReminderPreset(STANDARD_REMINDER_PRESET)}
                        className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[12px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-500/30 transition-colors"
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setField("reminders", [])}
                        className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[12px] font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={addReminder}
                        className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[13px] text-slate-500 dark:text-slate-300">{reminderSummary}</p>

                  <AnimatePresence>
                    {form.reminders.length === 0 ? (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[14px] text-slate-400 font-medium py-2"
                      >
                        No alarms established for this event.
                      </motion.p>
                    ) : (
                      <motion.div className="space-y-3">
                        {form.reminders.map((reminder) => (
                          <motion.div
                            key={reminder.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex items-center gap-3"
                          >
                            <div className="relative flex-1">
                              <select
                                className={cn(inputStyles, "appearance-none pr-10 bg-white/60 dark:bg-slate-800/70 cursor-pointer py-2.5")}
                                value={reminder.minutes}
                                onChange={(event) => {
                                  setField(
                                    "reminders",
                                    form.reminders.map((item) =>
                                      item.id === reminder.id
                                        ? { ...item, minutes: parseInt(event.target.value, 10) }
                                        : item,
                                    ),
                                  );
                                }}
                              >
                                {REMINDER_OPTIONS.map((option) => (
                                  <option key={option.minutes} value={option.minutes}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeReminder(reminder.id)}
                              className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-500/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/30 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent opacity-60" />

                <div className="pt-2 space-y-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Settings className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      <span className="text-[15px] font-bold text-slate-700 dark:text-slate-200">Advanced Metadata & Recurrence</span>
                    </div>
                    <motion.div animate={{ rotate: showAdvanced ? 90 : 0 }} className="text-slate-400">
                      <ChevronRight className="w-5 h-5" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-8 px-2"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            {renderLabel("Organizer / Host", "organizer")}
                            <div className="relative">
                              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input
                                className={cn(inputStyles, "pl-11", getFieldClass("organizer"))}
                                placeholder="Full Name"
                                value={form.organizer}
                                onChange={(event) => setField("organizer", event.target.value)}
                              />
                            </div>
                          </div>

                          <div>
                            {renderLabel("Organizer Email", "organizerEmail")}
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input
                                type="email"
                                className={cn(inputStyles, "pl-11", getFieldClass("organizerEmail"))}
                                placeholder="host@apple.com"
                                value={form.organizerEmail}
                                onChange={(event) => setField("organizerEmail", event.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          {renderLabel("Global Internal Notes", "notes")}
                          <textarea
                            className={cn(inputStyles, "resize-none h-20", getFieldClass("notes"))}
                            placeholder="Stored as COMMENT in the generated ICS."
                            value={form.notes}
                            onChange={(event) => setField("notes", event.target.value)}
                          />
                        </div>

                        <div className="p-6 rounded-2xl bg-indigo-50/50 dark:bg-slate-800/80 border border-indigo-100/50 dark:border-slate-700/70 space-y-6">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <h4 className="text-[15px] font-bold text-indigo-900 dark:text-slate-100">Recurrence Configuration</h4>
                            {form.recurrence.freq && (
                              <span className="text-[12px] text-indigo-700 dark:text-indigo-300 font-medium">{recurrenceSummary}</span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                              <label className={labelStyles}>Frequency</label>
                              <select
                                className={cn(inputStyles, "appearance-none bg-white dark:bg-slate-900")}
                                value={form.recurrence.freq}
                                onChange={(event) => {
                                  const freq = event.target.value as EventFormData["recurrence"]["freq"];
                                  setRecurrence({
                                    freq,
                                    interval: 1,
                                    byDay: [],
                                    byMonthDay: undefined,
                                    bySetPos: undefined,
                                    count: undefined,
                                    until: undefined,
                                  });
                                }}
                              >
                                <option value="">Never Patterned</option>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="YEARLY">Yearly</option>
                              </select>
                            </div>

                            {form.recurrence.freq && (
                              <div>
                                <label className={labelStyles}>Every</label>
                                <input
                                  type="number"
                                  min={1}
                                  className={cn(inputStyles, "bg-white dark:bg-slate-900")}
                                  value={form.recurrence.interval || 1}
                                  onChange={(event) =>
                                    setRecurrence({ interval: Math.max(1, parseInt(event.target.value, 10) || 1) })
                                  }
                                />
                              </div>
                            )}
                          </div>

                          {form.recurrence.freq && (
                            <div className="space-y-4">
                              <button
                                type="button"
                                onClick={() => setShowAdvancedRecurrence((prev) => !prev)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold bg-white/80 dark:bg-slate-900/70 border border-indigo-100 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-900 transition-all"
                              >
                                <ListChecks className="w-4 h-4" />
                                {showAdvancedRecurrence ? "Hide Advanced Recurrence" : "Advanced Recurrence"}
                              </button>

                              <AnimatePresence>
                                {showAdvancedRecurrence && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden space-y-4"
                                  >
                                    {(form.recurrence.freq === "WEEKLY" || form.recurrence.freq === "MONTHLY") && (
                                      <div>
                                        <label className={labelStyles}>Specific weekdays</label>
                                        <div className="flex flex-wrap gap-2">
                                          {DAYS_OF_WEEK.map((day) => (
                                            <button
                                              key={day.value}
                                              type="button"
                                              onClick={() => {
                                                const current = form.recurrence.byDay || [];
                                                const next = current.includes(day.value)
                                                  ? current.filter((item) => item !== day.value)
                                                  : [...current, day.value];
                                                setRecurrence({ byDay: next });
                                              }}
                                              className={cn(
                                                "w-10 h-10 rounded-xl font-bold text-[13px] transition-all",
                                                (form.recurrence.byDay || []).includes(day.value)
                                                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                                                  : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800",
                                              )}
                                              title={day.full}
                                            >
                                              {day.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {form.recurrence.freq === "MONTHLY" && (
                                      <div className="space-y-3 p-4 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-indigo-100 dark:border-slate-700">
                                        <div className="flex gap-2 flex-wrap">
                                          <button
                                            type="button"
                                            onClick={() => setRecurrence({ bySetPos: undefined, byMonthDay: [new Date(form.startDate).getDate()] })}
                                            className={cn(
                                              "px-3 py-2 text-[12px] rounded-lg font-semibold border",
                                              recurrenceMonthlyMode === "monthDay"
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
                                            )}
                                          >
                                            Day of month
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setRecurrence({ bySetPos: 1, byDay: [form.recurrence.byDay?.[0] || "MO"], byMonthDay: undefined })}
                                            className={cn(
                                              "px-3 py-2 text-[12px] rounded-lg font-semibold border",
                                              recurrenceMonthlyMode === "nth"
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
                                            )}
                                          >
                                            Nth weekday
                                          </button>
                                        </div>

                                        {recurrenceMonthlyMode === "monthDay" ? (
                                          <div>
                                            <label className={labelStyles}>Day number (1-31)</label>
                                            <input
                                              type="number"
                                              min={1}
                                              max={31}
                                              className={cn(inputStyles, "bg-white dark:bg-slate-900")}
                                              value={form.recurrence.byMonthDay?.[0] || ""}
                                              onChange={(event) => {
                                                const value = Math.max(1, Math.min(31, parseInt(event.target.value, 10) || 1));
                                                setRecurrence({ byMonthDay: [value], bySetPos: undefined });
                                              }}
                                            />
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-2 gap-3">
                                            <div>
                                              <label className={labelStyles}>Occurrence</label>
                                              <select
                                                className={cn(inputStyles, "bg-white dark:bg-slate-900")}
                                                value={form.recurrence.bySetPos || 1}
                                                onChange={(event) =>
                                                  setRecurrence({ bySetPos: parseInt(event.target.value, 10) || 1 })
                                                }
                                              >
                                                {NTH_OPTIONS.map((option) => (
                                                  <option key={option.value} value={option.value}>
                                                    {option.label}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>

                                            <div>
                                              <label className={labelStyles}>Weekday</label>
                                              <select
                                                className={cn(inputStyles, "bg-white dark:bg-slate-900")}
                                                value={form.recurrence.byDay?.[0] || "MO"}
                                                onChange={(event) => setRecurrence({ byDay: [event.target.value], byMonthDay: undefined })}
                                              >
                                                {DAYS_OF_WEEK.map((day) => (
                                                  <option key={day.value} value={day.value}>
                                                    {day.full}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                      <div>
                                        <label className={labelStyles}>End after occurrences</label>
                                        <input
                                          type="number"
                                          min={1}
                                          placeholder="Infinite"
                                          className={cn(inputStyles, "bg-white dark:bg-slate-900")}
                                          value={form.recurrence.count || ""}
                                          onChange={(event) =>
                                            setRecurrence({
                                              count: parseInt(event.target.value, 10) || undefined,
                                              until: undefined,
                                            })
                                          }
                                        />
                                      </div>

                                      <div>
                                        <label className={labelStyles}>Or end date</label>
                                        <input
                                          type="date"
                                          className={cn(inputStyles, "bg-white dark:bg-slate-900")}
                                          value={form.recurrence.until || ""}
                                          onChange={(event) =>
                                            setRecurrence({
                                              until: event.target.value || undefined,
                                              count: undefined,
                                            })
                                          }
                                        />
                                      </div>
                                    </div>

                                    <div className="space-y-3">
                                      <label className={labelStyles}>Exclusions</label>
                                      <div className="flex gap-2">
                                        <input
                                          type="date"
                                          className={cn(inputStyles, "bg-white dark:bg-slate-900")}
                                          value={newExdate}
                                          onChange={(event) => setNewExdate(event.target.value)}
                                        />
                                        <button
                                          type="button"
                                          onClick={addExdate}
                                          className="px-4 py-3 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-800 transition-all"
                                        >
                                          Add
                                        </button>
                                      </div>
                                      {form.exdates.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                          {form.exdates.map((value) => (
                                            <button
                                              key={value}
                                              type="button"
                                              onClick={() => removeExdate(value)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-[12px] font-medium"
                                            >
                                              {value}
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="bg-slate-50/80 dark:bg-slate-900/80 p-6 md:p-8 md:px-10 border-t border-slate-100/60 dark:border-slate-700/60 sticky bottom-0 backdrop-blur-3xl z-10 flex flex-col sm:flex-row items-center justify-between gap-5">
                <p className="text-[13px] font-medium text-slate-400 dark:text-slate-300">Generates strict RFC 5545 payloads.</p>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-900 text-white text-[15px] font-bold hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60 transition-all flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
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
          </div>

          <div className="space-y-6 xl:sticky xl:top-6">
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, duration: 0.45 }}
              className={cn(cardStyles, "p-5")}
            >
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100">Pending Events</h3>
              </div>

              <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                {events.map((event, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-xl border p-3 transition-all",
                      idx === activeIndex
                        ? "bg-indigo-50/70 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-400/40"
                        : "bg-white/70 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700",
                    )}
                  >
                    <button type="button" onClick={() => setActiveIndex(idx)} className="w-full text-left">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {event.title || `Pending Event ${idx + 1}`}
                      </p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-300 mt-0.5 truncate">
                        {event.startDate} {event.allDay ? "All day" : event.startTime}
                      </p>
                    </button>

                    <div className="mt-2 flex items-center justify-between">
                      <span className={cn("text-[11px] font-semibold", confidenceTone(eventInsights[idx]?.overallConfidence))}>
                        {typeof eventInsights[idx]?.overallConfidence === "number"
                          ? `${Math.round((eventInsights[idx]?.overallConfidence || 0) * 100)}% confidence`
                          : "Manual"}
                      </span>
                      {events.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEvent(idx)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35, duration: 0.45 }}
              className={cn(cardStyles, "p-5")}
            >
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100">Live Preview</h3>
              </div>

              <div className="space-y-4 text-[13px]">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Title</p>
                  <p className="text-slate-800 dark:text-slate-100 font-semibold">{form.title || "Untitled Event"}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Date & Time</p>
                  <p className="text-slate-700 dark:text-slate-200">{previewDateLine}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Timezone</p>
                  <p className="text-slate-700 dark:text-slate-200">{form.timezone || "Floating"}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Location</p>
                  <p className="text-slate-700 dark:text-slate-200">{form.location || "No location"}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Meeting Link</p>
                  <p className="text-slate-700 dark:text-slate-200 break-all">{form.url || "No link"}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Reminders</p>
                  <p className="text-slate-700 dark:text-slate-200">{reminderSummary}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Recurrence</p>
                  <p className="text-slate-700 dark:text-slate-200">{recurrenceSummary}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          >
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-white/60 dark:border-slate-700/60 relative z-10"
            >
              <button
                onClick={() => setShowSettings(false)}
                className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/20 rounded-xl">
                  <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Global Settings</h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className={labelStyles}>Theme</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => saveTheme("previous")}
                      className={cn(
                        "px-3 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors",
                        uiTheme === "previous"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700",
                      )}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => saveTheme("current")}
                      className={cn(
                        "px-3 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors",
                        uiTheme === "current"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700",
                      )}
                    >
                      Current
                    </button>
                  </div>
                  <p className="text-[12px] text-slate-500 dark:text-slate-300">
                    Default starts on Previous theme.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className={labelStyles}>Default Time Zone</label>
                  <div className="relative">
                    <select
                      className={cn(inputStyles, "appearance-none pr-12 cursor-pointer bg-white/60 dark:bg-slate-800/70 py-2.5")}
                      value={defaultTimezone}
                      onChange={(event) => saveDefaults(defaultReminders, event.target.value)}
                    >
                      <option value="">Floating (Resolves to user's device)</option>
                      {TIMEZONES.map((timezone) => (
                        <option key={timezone} value={timezone}>
                          {timezone}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className={labelStyles}>Default Location</label>
                  <input
                    className={cn(inputStyles, "bg-white/60 dark:bg-slate-800/70")}
                    placeholder="Auto-detected from your device location"
                    value={defaultLocation}
                    onChange={(event) => saveDefaults(defaultReminders, defaultTimezone, event.target.value)}
                  />
                  <p className="text-[12px] text-slate-500 dark:text-slate-300">
                    Used for new events when location is empty.
                  </p>
                </div>

                <div className="pt-2">
                  <label className={labelStyles}>Default Alarms (new events)</label>
                  <div className="space-y-3 mt-3">
                    {defaultReminders.map((minutes, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <select
                          className={cn(inputStyles, "bg-white/60 dark:bg-slate-800/70 py-2.5")}
                          value={minutes}
                          onChange={(event) => {
                            const next = [...defaultReminders];
                            next[idx] = parseInt(event.target.value, 10);
                            saveDefaults(next, defaultTimezone);
                          }}
                        >
                          {REMINDER_OPTIONS.map((option) => (
                            <option key={option.minutes} value={option.minutes}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const next = defaultReminders.filter((_, reminderIndex) => reminderIndex !== idx);
                            saveDefaults(next, defaultTimezone);
                          }}
                          className="p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/20 rounded-xl transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => saveDefaults([...defaultReminders, 15], defaultTimezone)}
                    className="mt-4 flex items-center gap-2 text-[13px] font-bold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 px-4 py-2 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Default Alarm
                  </button>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
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
  );
}
