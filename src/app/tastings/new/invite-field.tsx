"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { searchPeople, type PersonSearchResult } from "./people-search";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

/**
 * The invite list's typed entry (spec §2.3 item 10, create step 3): one
 * "Name, or an email address" field. Text containing "@" behaves as a plain
 * email chip, as it always has; anything else of 2+ characters searches
 * People, debounced 250ms, and picking a result adds their email exactly as
 * typing it would. The legacy "Invite a friend" combobox (`friends`) is kept
 * only for `host-controls.tsx`'s running-tasting invite form, which has no
 * friend list of its own nearby — the create sheet's own friend chips/rows
 * (invite-step.tsx) cover that there, so it omits `friends` entirely.
 */
export function InviteField({
  friends,
  onChange,
  defaultEmails,
  chosenEmails = [],
}: {
  /** Present only for callers with no friend list of their own on screen
      (host-controls.tsx). Omitted, the legacy friend combobox never renders. */
  friends?: { id: string; display_name: string; email: string }[];
  /** Called with the whole list whenever an address is added or removed, so
      a parent can count typed invites (the create sheet's "N invited"). */
  onChange?: (emails: string[]) => void;
  /** The list to start from — a parent that holds the typed addresses passes
      them back when this field remounts (the create sheet's step changes). */
  defaultEmails?: string[];
  /** Every email already on the invite list elsewhere (friend chips, e.g.) —
      excluded from the People search and treated as already-added if
      retyped ("excluding the caller and anyone already chosen"). */
  chosenEmails?: string[];
}) {
  const [emails, setEmails] = useState<string[]>(() => defaultEmails ?? []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friendPick, setFriendPick] = useState("");
  const emailInputId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // Every profile a search has ever turned up this session, so a person
  // already added (via search or a friend chip) can be excluded by id, not
  // just re-added and rejected as a duplicate.
  const pickedIdsRef = useRef(new Map<string, string>());

  const friendOptions = (friends ?? [])
    .filter((f) => !emails.includes(f.email))
    .map((f) => ({ id: f.email, name: `${f.display_name} (${f.email})` }));

  // One place that changes the list, so the parent hears every add and remove.
  function commit(next: string[]) {
    setEmails(next);
    onChange?.(next);
  }

  function addEmail(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (emails.includes(email) || chosenEmails.includes(email)) {
      setError("Already added.");
      return;
    }
    commit([...emails, email]);
    setQuery("");
    setResults([]);
    setSearched(false);
    setError(null);
  }

  function pick(person: PersonSearchResult) {
    pickedIdsRef.current.set(person.email.toLowerCase(), person.id);
    addEmail(person.email);
  }

  const trimmed = query.trim();
  const isEmailLike = trimmed.includes("@");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const requestId = ++requestIdRef.current;
    // Every branch's setState runs inside the timeout callback, never
    // synchronously in the effect body — the "too short to search" branch
    // still clears through one so react-hooks/set-state-in-effect stays
    // satisfied, at the cost of one imperceptible tick.
    if (isEmailLike || trimmed.length < MIN_QUERY_LENGTH) {
      debounceRef.current = setTimeout(() => {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setSearched(false);
      }, 0);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
    debounceRef.current = setTimeout(() => {
      const alreadyChosenIds = [...pickedIdsRef.current.entries()]
        .filter(([email]) => chosenEmails.includes(email) || emails.includes(email))
        .map(([, id]) => id);
      searchPeople(trimmed, alreadyChosenIds)
        .then((found) => {
          if (requestId !== requestIdRef.current) return;
          for (const p of found) pickedIdsRef.current.set(p.email.toLowerCase(), p.id);
          setResults(found);
          setSearched(true);
        })
        .catch(() => {
          if (requestId === requestIdRef.current) {
            setResults([]);
            setSearched(true);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chosenEmails/emails only narrow the exclude list, not when a search fires
  }, [trimmed, isEmailLike]);

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="emails" value={emails.join("\n")} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={emailInputId}>Name, or an email address</Label>
        <div className="flex gap-2">
          <Input
            id={emailInputId}
            type="text"
            placeholder="Name, or name@example.com"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isEmailLike) {
                e.preventDefault();
                addEmail(query);
              }
            }}
          />
          {isEmailLike ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => addEmail(query)}
            >
              Add
            </Button>
          ) : null}
        </div>
        {!isEmailLike && trimmed.length >= MIN_QUERY_LENGTH ? (
          results.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-[9px] border border-border bg-card px-[10px] py-[7px] text-left transition-colors hover:border-gold md:min-h-0"
                  >
                    <Avatar src={p.avatar_url} name={p.display_name} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-medium">{p.display_name}</span>
                      <span className="truncate text-[11.5px] text-muted-foreground">
                        {p.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : searched ? (
            // (spec copy)
            <p className="text-[12.5px] text-muted-foreground">
              No one on Blindr by that name — type their email instead.
            </p>
          ) : null
        ) : null}
      </div>

      {friends !== undefined ? (
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
              <a href="/community" className="font-medium text-primary transition-colors hover:text-primary/80">
                browse People
              </a>{" "}
              to add some, then they&apos;ll show up here.
            </p>
          )}
        </div>
      ) : null}

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
                onClick={() => commit(emails.filter((e) => e !== email))}
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
