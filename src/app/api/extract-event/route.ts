import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY environment variable is missing." }, { status: 500 });
    }

    const formData = await req.formData();
    const text = formData.get("text") as string | null;
    const files = formData.getAll("images") as File[];
    const localDate = formData.get("localDate") as string || new Date().toString();
    const localTimezone = formData.get("localTimezone") as string || "UTC";

    if (!text && files.length === 0) {
      return NextResponse.json({ error: "Please provide either text or images to extract from." }, { status: 400 });
    }

    const messages: any[] = [
      {
        role: "system",
        content: `Extract the event details from the provided content. IF THERE ARE MULTIPLE EVENTS, EXTRACT ALL OF THEM into an array. Return ONLY a JSON object exactly matching this schema:
{
  "events": [
    {
      "title": "Event name",
      "description": "Details or description about the event",
      "location": "Physical address or zoom link",
      "url": "Meeting link or website",
      "organizer": "Name of the host or organizer",
      "organizerEmail": "Email of the organizer if present",
      "startDate": "YYYY-MM-DD",
      "startTime": "HH:mm",
      "endDate": "YYYY-MM-DD",
      "endTime": "HH:mm",
      "allDay": false
    }
  ]
}

Parsing Rules:
- **EXTREMELY IMPORTANT**: Think like an executive assistant. Deduce exactly what is meant even if ambiguously stated.
- **ARRAY PROCESSING**: If the text contains multiple distinct events, appointments, shifts, or dates, you MUST process every single one and output them as separate objects inside the \`events\` array. Do NOT combine them into one long string.
- **RELATIVE DATE ANCHORING**: The User's absolute current exact local date/time is: \`${localDate}\`. The User's exact local timezone is \`${localTimezone}\`. You **MUST** use this precise timestamp as "Right Now / Today" so that references like "tomorrow", "tonight", "this weekend", or "next Friday" are calculated with mathematical perfection relative to their actual local reality, NOT UTC server time.
- If a value cannot be found or inferred, use an empty string "" for strings, and false for booleans.
- Dates must be in YYYY-MM-DD format. If a year is omitted (e.g., "Friday, October 12th"), calculate the closest UPCOMING occurrence of that date from the current date context.
- Times must be in 24-hour HH:mm format. 
- **Duration/End Time**: If an end time is not explicitly stated, calculate a logical end time based on the event context. (e.g., A "Dinner" is usually 2 hours, a "Quick sync" is 30 mins, a "Concert" is 3 hours). If completely unknown, default to 1 hour after start time.
- If only one date is given, use it for both startDate and endDate.
- **Timezone Inference**: DO NOT include a \`timezone\` field UNLESS a physical location, city, or explicit timezone is mentioned in the prompt (e.g., "PST" or "London"). If mentioned, output the exact IANA Timezone string (e.g., "America/Los_Angeles" or "Europe/London"). If no location/timezone is implied, STRICTLY OMIT the \`timezone\` field entirely so the user's local device timezone is preserved.
- **Reminders/Alerts**: DO NOT include a \`reminders\` field array UNLESS the text explicitly requests a specific alert/reminder (e.g., "remind me 1 hour before"). If explicitly requested, insert a reminders array containing exact integers like \`"reminders": [{ "minutes": 60 }]\`. If no alert is explicitly specified in the text, STRICTLY OMIT the \`reminders\` field entirely so the user's saved default alarms are not erased!
- Automatically format URLs properly (ensure they start with http/https).
- **IMAGE INTELLIGENCE**: If interpreting images, carefully scan all visual text, tiny footnotes, and visual formatting. Deduce context from flyer graphics or screenshot UI patterns.`
      }
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
          detail: "high"
        },
      });
    }

    messages.push({
      role: "user",
      content: userContent,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content || "{}";

    try {
      const parsed = JSON.parse(responseText);
      return NextResponse.json({ data: parsed });
    } catch (e) {
      return NextResponse.json({ error: "Failed to parse AI response as JSON.", raw: responseText }, { status: 500 });
    }

  } catch (error: any) {
    console.error("AI Extraction error:", error);
    return NextResponse.json({ error: error.message || "Something went wrong during AI extraction." }, { status: 500 });
  }
}
