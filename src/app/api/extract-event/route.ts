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
  "timezone": "America/New_York"
}

Parsing Rules:
- If a value cannot be found or inferred, use an empty string "" for strings, and false for booleans.
- Dates must be in YYYY-MM-DD format. Assume the current year or next upcoming occurrence if year is omitted.
- Times must be in 24-hour HH:mm format. If no end time, assume 1 hour after start time.
- If only one date is given, use it for both startDate and endDate.
- For timezone, if you detect a specific location or timezone, infer the IANA timezone if possible (e.g. America/Los_Angeles). Otherwise use an empty string.`
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
