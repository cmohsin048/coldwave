import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Waves,
  Target,
  Sparkles,
  ShieldCheck,
  Flame,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Lead Generation",
    href: "/leads",
    body: "Apollo-powered search, bulk enrich, email verification, and dedupe against everyone you've already contacted.",
  },
  {
    icon: Sparkles,
    title: "AI Campaign Designer",
    href: "/designer",
    body: "Describe your ICP and offer — get a multi-step sequence with subject lines, spintax body variants, and branch logic.",
  },
  {
    icon: ShieldCheck,
    title: "Spam Score Engine",
    href: "/deliverability",
    body: "Pre-send SpamAssassin scoring, trigger-word detection, DNS auth (SPF/DKIM/DMARC), and blacklist checks with fix tips.",
  },
  {
    icon: Flame,
    title: "Auto Warmup",
    href: "/warmup",
    body: "Peer-to-peer mailbox warmup with human-like timing and inbox-placement tracking across Gmail, Outlook, and Yahoo.",
  },
  {
    icon: Waves,
    title: "Deliverability-First Sending",
    href: "/campaigns",
    body: "Send from your own connected mailboxes with domain pools, rotation, per-mailbox rate limits, and RFC 8058 unsubscribe.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    href: "/analytics",
    body: "Opens, clicks, replies, bounces, and per-domain health scorecards — funnel conversion at every stage.",
  },
];

export default async function LandingPage() {
  // Signed-in users skip the marketing page.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Waves className="h-6 w-6 text-primary" />
            ColdWave
          </div>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container flex flex-col items-center gap-6 py-24 text-center">
          <Badge variant="secondary">Deliverability-first cold outreach</Badge>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Cold email that actually lands in the inbox.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            ColdWave finds your buyers, writes the sequence, warms your
            mailboxes, checks every message for spam signals, and sends from
            your own domains — compliant with CAN-SPAM and GDPR out of the box.
          </p>
          <div className="flex gap-3">
            <Button size="lg" asChild>
              <Link href="/register">Get started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="container grid gap-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group rounded-lg border bg-card p-6 text-card-foreground transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <f.icon className="mb-4 h-8 w-8 text-primary transition-transform duration-200 group-hover:scale-110" />
              <h3 className="mb-2 font-semibold group-hover:text-primary">
                {f.title}
              </h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Open <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} ColdWave. Send responsibly.
        </div>
      </footer>
    </div>
  );
}
