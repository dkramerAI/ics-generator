import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "ICS Generator — Apple Calendar Events",
  description: "Create and download .ics calendar files compatible with Apple Calendar, Google Calendar, and Outlook.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-center" richColors theme="light" />
      </body>
    </html>
  );
}
