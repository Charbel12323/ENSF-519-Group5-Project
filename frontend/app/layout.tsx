import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";


export const metadata: Metadata = {
  title: "Boardly - Team Kanban",
  description: "A simple Kanban board for organizing team work",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
