import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Hidden Figures — Congressional Voting Records",
    template: "%s · Hidden Figures",
  },
  description:
    "Search any member of the U.S. Congress and see how they voted. Every roll call, every member, updated daily.",
  openGraph: {
    title: "Hidden Figures — Congressional Voting Records",
    description:
      "How did your representatives actually vote? Search any member of Congress or any bill.",
    siteName: "Hidden Figures",
    type: "website",
  },
};

const navLinks = [
  { href: "/members", label: "Members", live: true },
  { href: "/bills", label: "Bills", live: true },
  { href: "/about", label: "About", live: true },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <div className="h-1 bg-flag-red" />
        <header className="bg-flag-blue text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight">
                Hidden Figures
              </span>
              <span className="hidden text-xs font-medium uppercase tracking-widest text-blue-200 sm:inline">
                Congressional voting records
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm font-medium">
              {navLinks.map((link) =>
                link.live ? (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-blue-100 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <span
                    key={link.href}
                    className="cursor-default text-blue-300/60"
                    title="Coming soon"
                  >
                    {link.label}
                  </span>
                ),
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-flag-blue-soft">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <p className="font-bold text-flag-blue">Hidden Figures</p>
                <p className="mt-2 text-sm text-gray-600">
                  Independent and nonpartisan congressional voting records.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Explore
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-flag-blue">
                  <li>
                    <Link href="/members" className="hover:underline">
                      Members
                    </Link>
                  </li>
                  <li>
                    <Link href="/bills" className="hover:underline">
                      Votes &amp; legislation
                    </Link>
                  </li>
                  <li>
                    <Link href="/about" className="hover:underline">
                      About &amp; methodology
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Data sources
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-flag-blue">
                  <li>
                    <a
                      href="https://clerk.house.gov/Votes"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      U.S. House Clerk
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.senate.gov/legislative/votes_new.htm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      U.S. Senate
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.congress.gov"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      Library of Congress
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://github.com/unitedstates/congress-legislators"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      unitedstates project
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <p className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500">
              Not affiliated with any government body. Official records are
              linked above.
            </p>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
