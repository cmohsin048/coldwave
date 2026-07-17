"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, UserPlus, Copy, Trash2, Check } from "lucide-react";
import { inviteMember, revokeInvitation, removeMember } from "./actions";

interface MemberRow {
  membershipId: string;
  name: string | null;
  email: string | null;
  role: string;
  isSelf: boolean;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
}

export function TeamCard({
  members,
  invites,
  canManage,
  appUrl,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  canManage: boolean;
  appUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function invite() {
    setError(null);
    startTransition(async () => {
      const res = await inviteMember({ email, role });
      if (res.ok) {
        setLastInviteUrl(res.data.inviteUrl);
        setEmail("");
      } else setError(res.error);
    });
  }

  function copy(url: string, key: string) {
    void navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            {canManage && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.membershipId}>
              <TableCell>
                <div className="font-medium">
                  {m.name ?? m.email}
                  {m.isSelf && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </TableCell>
              <TableCell>
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {m.role}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell>
                  {m.role !== "owner" && !m.isSelf && (
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await removeMember({
                            membershipId: m.membershipId,
                          });
                          if (!res.ok) setError(res.error);
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pending invitations</p>
          {invites.map((inv) => {
            const url = `${appUrl}/invite/${inv.token}`;
            return (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{inv.email}</span>{" "}
                  <span className="text-muted-foreground">
                    as {inv.role} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copy(url, inv.id)}
                      title="Copy invite link"
                    >
                      {copied === inv.id ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await revokeInvitation({
                            invitationId: inv.id,
                          });
                          if (!res.ok) setError(res.error);
                        })
                      }
                      title="Revoke invitation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Invite a teammate</p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "member" | "admin")}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={invite} disabled={pending || !email}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Invite
            </Button>
          </div>
          {lastInviteUrl && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <span className="truncate">{lastInviteUrl}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => copy(lastInviteUrl, "new")}
              >
                {copied === "new" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Share the link with your teammate — they sign in (or register) with
            the invited email and accept.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
