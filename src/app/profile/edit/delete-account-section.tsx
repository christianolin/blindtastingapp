"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { isDeleteConfirmed, type DeleteAccountState } from "@/lib/account/delete-account";
import {
  CONFIRM_INPUT_LABEL,
  DELETE_CANCEL_LABEL,
  DELETE_DIALOG_TITLE,
  DELETE_PENDING_LABEL,
  DELETE_SECTION_BUTTON,
  DELETE_SECTION_LINE,
  DELETE_SECTION_TITLE,
  DELETE_SUBMIT_LABEL,
  DELETED_LIST_HEADING,
  DELETED_LIST_ITEMS,
  KEPT_LIST_HEADING,
  KEPT_LIST_ITEMS,
} from "@/lib/account/delete-copy";
import { deleteAccount } from "./delete-account-actions";

// "Delete account" on Profile & settings (account-deletion spec §5.2): its own
// card, never part of the profile form. The dialog lists what goes and what
// stays, and "Delete my account" only enables for the exact word DELETE (D3);
// the server action checks the word again.
//
// Focus: Base UI moves focus to the first tabbable element on a mouse or
// keyboard open — the confirmation field, since the lists hold nothing
// tabbable — and to the popup itself on a touch open, so the phone keyboard
// does not cover the lists before they are read. Escape, the backdrop and
// Cancel close it and return focus to the trigger, except while the delete
// is running.

const CONFIRM_ID = "delete-confirmation";
const ERROR_ID = "delete-confirmation-error";
const DELETED_HEADING_ID = "delete-account-deleted-heading";
const KEPT_HEADING_ID = "delete-account-kept-heading";

// 44 px on phones, the component's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Incremented per open: the form remounts, so the typed value and the last
  // error never survive a close.
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    // Mid-delete, Escape, the backdrop and Cancel cannot close it.
    if (!next && pending) return;
    if (next) setFormKey((k) => k + 1);
    setOpen(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{DELETE_SECTION_TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted-foreground">{DELETE_SECTION_LINE}</p>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          {/* Button is the render target and composed with nothing else, so
              nativeButton stays at its default (CLAUDE.md, Base UI). The
              dark: pair keeps the outline variant's dark border and hover
              from winning over the destructive tint. */}
          <DialogTrigger
            render={
              <Button
                variant="outline"
                className={`${TAP} border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive aria-expanded:text-destructive dark:border-destructive/50 dark:hover:bg-destructive/20`}
              />
            }
          >
            {DELETE_SECTION_BUTTON}
          </DialogTrigger>
          {/* No corner X: its icon button is under 44 px on a phone, and
              Cancel is the one full-size way out. */}
          <DialogContent
            showCloseButton={false}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>{DELETE_DIALOG_TITLE}</DialogTitle>
            </DialogHeader>
            <DialogDescription
              render={<div />}
              className="flex flex-col gap-3 text-sm text-foreground"
            >
              <div className="flex flex-col gap-1">
                <p id={DELETED_HEADING_ID} className="font-medium">
                  {DELETED_LIST_HEADING}
                </p>
                <ul
                  aria-labelledby={DELETED_HEADING_ID}
                  className="list-disc space-y-0.5 pl-5 text-muted-foreground"
                >
                  {DELETED_LIST_ITEMS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-1">
                <p id={KEPT_HEADING_ID} className="font-medium">
                  {KEPT_LIST_HEADING}
                </p>
                <ul
                  aria-labelledby={KEPT_HEADING_ID}
                  className="list-disc space-y-0.5 pl-5 text-muted-foreground"
                >
                  {KEPT_LIST_ITEMS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </DialogDescription>
            <DeleteAccountForm key={formKey} onPendingChange={setPending} />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function DeleteAccountForm({
  onPendingChange,
}: {
  onPendingChange: (pending: boolean) => void;
}) {
  // Controlled, so the button can follow it keystroke by keystroke. A
  // controlled input keeps its value through React's post-action form reset
  // (React mirrors the value into the input's default), so after an error
  // the field and the button still agree.
  const [value, setValue] = useState("");
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccount,
    null,
  );

  // The dialog root sits above this keyed form; it needs `pending` to refuse
  // a close mid-delete.
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={CONFIRM_ID}>{CONFIRM_INPUT_LABEL}</Label>
        <Input
          id={CONFIRM_ID}
          name="confirmation"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={state?.error ? ERROR_ID : undefined}
          className="min-h-11 md:pointer-fine:min-h-8"
        />
        {state?.error ? (
          <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" className={TAP} />}
          disabled={pending}
        >
          {DELETE_CANCEL_LABEL}
        </DialogClose>
        <Button
          type="submit"
          variant="destructive"
          className={TAP}
          disabled={pending || !isDeleteConfirmed(value)}
        >
          {pending ? (
            <>
              <WineGlassLoader /> {DELETE_PENDING_LABEL}
            </>
          ) : (
            DELETE_SUBMIT_LABEL
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
