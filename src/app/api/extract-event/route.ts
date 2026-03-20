import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY environment variable is missing." }, { status: 500 });
    }

    const formData = await req.formData();
    const text = formData.get("text") as string | null;
    const file = formData.get("image") as File | null;

    if (!text && !file) {
      return NextResponse.json({ error: "Please provide either text or an image to extract from." }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const parts: any[] = [];

    parts.push({
      text: `Extract the event details from the provided content. Return ONLY a JSON object exactly matching this schema:
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
    });

    if (text) {
      parts.push({ text: "Text to parse: " + text });
    }

    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    }

    const result = await model.generateContent(parts);
    const responseText = result.response.text();

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
