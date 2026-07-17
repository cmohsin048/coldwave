import Link from "next/link";
import { Waves } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-xl font-bold"
      >
        <Waves className="h-7 w-7 text-primary" />
        ColdWave
      </Link>
      {children}
    </div>
  );
}
