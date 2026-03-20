import { NextRequest, NextResponse } from "next/server";
import { generateICS } from "@/lib/ics";
import { EventFormData } from "@/types/event";

export async function POST(req: NextRequest) {
  try {
    const rawData = await req.json();
    const dataArray: EventFormData[] = Array.isArray(rawData) ? rawData : [rawData];

    for (let i = 0; i < dataArray.length; i++) {
      const data = dataArray[i];
      if (!data.title?.trim()) {
        return NextResponse.json({ error: `Title is required (Event ${i + 1})` }, { status: 400 });
      }
      if (!data.startDate) {
        return NextResponse.json({ error: `Start date is required (Event ${i + 1})` }, { status: 400 });
      }
      if (!data.endDate) {
        return NextResponse.json({ error: `End date is required (Event ${i + 1})` }, { status: 400 });
      }
      if (!data.allDay) {
        if (!data.startTime) return NextResponse.json({ error: `Start time is required (Event ${i + 1})` }, { status: 400 });
        if (!data.endTime) return NextResponse.json({ error: `End time is required (Event ${i + 1})` }, { status: 400 });

        const start = new Date(`${data.startDate}T${data.startTime}`);
        const end = new Date(`${data.endDate}T${data.endTime}`);
        if (end <= start) {
          return NextResponse.json({ error: `End date/time must be after start (Event ${i + 1})` }, { status: 400 });
        }
      } else {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        if (end < start) {
          return NextResponse.json({ error: `End date must be on or after start (Event ${i + 1})` }, { status: 400 });
        }
      }
    }

    const icsContent = generateICS(dataArray);
    const filename = dataArray.length === 1
      ? `${dataArray[0].title.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50)}.ics`
      : `Event_Pack_${Date.now()}.ics`;

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to generate ICS file" }, { status: 500 });
  }
}
