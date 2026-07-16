"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferenceCombobox } from "@/components/reference-combobox";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteField({
  friends,
}: {
  friends: { id: string; display_name: string; email: string }[];
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [friendPick, setFriendPick] = useState("");
  const emailInputId = useId();

  const friendOptions = friends
    .filter((f) => !emails.includes(f.email))
    .map((f) => ({ id: f.email, name: `${f.display_name} (${f.email})` }));

  function addEmail(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (emails.includes(email)) {
      setError("Already added.");
      return;
    }
    setEmails((list) => [...list, email]);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="emails" value={emails.join("\n")} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={emailInputId}>Invite by email</Label>
        <div className="flex gap-2">
          <Input
            id={emailInputId}
            type="email"
            placeholder="name@example.com"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail(draft);
                setDraft("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              addEmail(draft);
              setDraft("");
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Invite a friend</Label>
        {friends.length > 0 ? (
          <ReferenceCombobox
            formFieldName="__friend_pick"
            options={friendOptions}
            value={friendPick}
            onValueChange={(id) => {
              if (id) {
                addEmail(id);
                setFriendPick("");
              }
            }}
            placeholder="Choose a friend"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t added any friends yet —{" "}
            <a href="/people" className="underline underline-offset-4">
              browse People
            </a>{" "}
            to add some, then they&apos;ll show up here.
          </p>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {emails.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {emails.map((email) => (
            <li
              key={email}
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
            >
              {email}
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() =>
                  setEmails((list) => list.filter((e) => e !== email))
                }
                className="text-secondary-foreground/70 hover:text-secondary-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
