import { redirect } from "next/navigation";
import { Wine } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ActionButtonClient } from "@/components/overview/action-button-client";
import { createClient } from "@/lib/supabase/server";
import { makeT } from "@/lib/wset/i18n";
import { getNotesArchive } from "./notes-data";
import { NotesList } from "./notes-list";
import { NOTES_LANG, notesStats, statsLine } from "./notes-search";

const t = makeT(NOTES_LANG);

// Tasting notes — every WSET note you have written, under Taste (Taste & Rate
// ledger R4, T7/T7b). The header stats and the Taste & rate launcher, then a
// page-level search, the filter chips and the notes grouped by month. The app
// header keeps its own global search; this page never re-scopes it. The
// launcher goes through useTasteLauncher (ActionButtonClient launch
// "taste-rate"), never the add-wine sheet's destination literal.
export default async function TastingNotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, rows] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    getNotesArchive(user.id),
  ]);
  const stats = notesStats(rows);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={profile?.display_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        title={t("tasting_notes")}
      />
      <main className="flex w-full flex-1 flex-col gap-3 p-[14px] md:gap-4 md:p-8">
        {/* On phones the top bar already names the page, so the h1 is
            visually hidden and the short stats line shares a row with
            "+ Note"; from md up it is the pillar pages' Cormorant h1 with the
            long stats line and "Taste & rate a wine" on the right. */}
        <header className="flex items-start justify-between gap-3 max-md:items-center">
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold tracking-tight max-md:sr-only">
              {t("tasting_notes")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground max-md:mt-0 max-md:text-[12.5px] max-md:leading-snug">
              <span className="max-md:hidden">{statsLine(t, stats, NOTES_LANG, "long")}</span>
              <span className="md:hidden">{statsLine(t, stats, NOTES_LANG, "short")}</span>
            </p>
          </div>
          <ActionButtonClient
            launch="taste-rate"
            variant="primary"
            className="w-auto shrink-0 rounded-[9px] px-[18px] py-[11px] max-md:px-3.5 max-md:py-2 max-md:text-[13px]"
          >
            <Wine aria-hidden className="max-md:hidden" />
            <span className="max-md:hidden">{t("taste_and_rate_a_wine")}</span>
            <span className="md:hidden">{t("new_note_short")}</span>
          </ActionButtonClient>
        </header>

        <NotesList rows={rows} currentYear={new Date().getUTCFullYear()} />
      </main>
    </div>
  );
}
