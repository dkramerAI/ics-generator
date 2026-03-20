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
    const file = formData.get("image") as File | null;

    if (!text && !file) {
      return NextResponse.json({ error: "Please provide either text or an image to extract from." }, { status: 400 });
    }

    const now = new Date();
    const messages: any[] = [
      {
        role: "system",
        content: `Extract the event details from the provided content. Return ONLY a JSON object exactly matching this schema:
{
  "title": "Event name",
  "description": "Details or description about the event",
  "location": "Physical address or video call link",
  "url": "Website or joining URL (starts with http)",
  "organizer": "Name of the host or organizer",
  "organizerEmail": "Email of the organizer if present",
  "startDate": "YYYY-MM-DD",
  "startTime": "HH:mm",
  "endDate": "YYYY-MM-DD",
  "endTime": "HH:mm",
  "allDay": false,
  "timezone": "America/New_York",
  "reminders": [
    { "minutes": 15 }
  ]
}

Parsing Rules:
- **EXTREMELY IMPORTANT**: Think like an executive assistant. Deduce exactly what is meant even if ambiguously stated.
- **CURRENT DATE/TIME CONTEXT**: The current date and time right now is ${now.toISOString()} (UTC). You MUST use this exact moment as "today" or "now" to correctly calculate relative dates like "tomorrow", "tonight", "this weekend", or "next Friday".
- If a value cannot be found or inferred, use an empty string "" for strings, and false for booleans.
- Dates must be in YYYY-MM-DD format. If a year is omitted (e.g., "Friday, October 12th"), calculate the closest UPCOMING occurrence of that date from the current date context.
- Times must be in 24-hour HH:mm format. 
- **Duration/End Time**: If an end time is not explicitly stated, calculate a logical end time based on the event context. (e.g., A "Dinner" is usually 2 hours, a "Quick sync" is 30 mins, a "Concert" is 3 hours). If completely unknown, default to 1 hour after start time.
- If only one date is given, use it for both startDate and endDate.
- **Timezone Inference**: If a physical location or city is provided (like "San Francisco" or "London"), you MUST output the exact IANA Timezone string for that location (e.g., "America/Los_Angeles" or "Europe/London"). If absolute certainty is impossible, leave as an empty string.
- **Reminders/Alerts**: If the text specifies an alert or reminder like "remind me 1 hour before", parse that strictly into minutes (e.g. 60) and insert into the reminders array.
- Automatically format URLs properly (ensure they start with http/https).`
      }
    ];

    const userContent: any[] = [];

    if (text) {
      userContent.push({ type: "text", text: "Text to parse:\n" + text });
    }

    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      const dataUri = `data:${file.type};base64,${base64Data}`;
      
      userContent.push({
        type: "image_url",
        image_url: {
          url: dataUri,
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
