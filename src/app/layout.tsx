import type { Metadata } from "next";
import { DM_Sans, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Neon - Video Review Studio",
  description: "A simple, beautiful tool for reviewing videos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Hardcode the "dark" class on HTML so Shadcn UI components adopt it securely.
  return (
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${bricolage.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans">
        {children}
      </body>
    </html>
  );
}
