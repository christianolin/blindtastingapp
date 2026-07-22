import Link from "next/link";
import { Clock, Wine, Users, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkLoadingHint } from "@/components/link-loading-hint";
import { LocalDateTime } from "@/components/local-date-time";
import { cn } from "@/lib/utils";

export type TastingCardData = {
  id: string;
  name: string;
  image_url: string | null;
  description: string | null;
  timing_mode: "LIVE" | "ASYNC";
  wine_source: "HOST_PROVIDES" | "PARTICIPANT_CONTRIBUTED";
  scheduled_at: string | null;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Not started",
  OPEN: "Open",
  IN_PROGRESS: "Live now",
  CLOSED: "Finished",
};

export function TastingCard({
  tasting,
  wineInfo,
  participantCount,
  badgeLabel,
  accent,
  index = 0,
}: {
  tasting: TastingCardData;
  wineInfo: { total: number; revealed: number };
  participantCount: number;
  badgeLabel: string;
  accent: "primary" | "gold";
  index?: number;
}) {
  return (
    <Link href={`/tastings/${tasting.id}`}>
      <Card
        className={cn(
          "animate-rise-in group relative gap-3 overflow-hidden border-l-4 py-4 transition-all hover:-translate-y-0.5 hover:shadow-md",
          accent === "primary" ? "border-l-primary" : "border-l-gold",
        )}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="flex gap-4 px-4">
          {tasting.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tasting.image_url}
              alt=""
              className="size-20 shrink-0 rounded-lg object-cover"
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <CardHeader className="p-0">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="inline-flex items-center gap-2 font-heading text-lg font-semibold group-hover:text-primary">
                  {tasting.name}
                  <LinkLoadingHint />
                </span>
                <Badge
                  className={accent === "primary" ? "bg-primary" : undefined}
                  variant={accent === "primary" ? "default" : "outline"}
                >
                  {badgeLabel}
                </Badge>
              </CardTitle>
            </CardHeader>
            {tasting.description ? (
              <p className="line-clamp-1 text-sm text-muted-foreground">
                {tasting.description}
              </p>
            ) : null}
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {/* The pulsing dot means "happening right now" — only while
                    the tasting is actually in progress, never in History. */}
                {tasting.timing_mode === "LIVE" &&
                tasting.status === "IN_PROGRESS" ? (
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" />
                    <span className="relative inline-flex size-2 rounded-full bg-destructive" />
                  </span>
                ) : (
                  <Clock className="size-3.5" />
                )}
                {tasting.timing_mode === "LIVE" ? "Live" : "Async"}
              </span>
              <span className="flex items-center gap-1.5">
                <Wine className="size-3.5" />
                {wineInfo.total > 0
                  ? `${wineInfo.revealed}/${wineInfo.total} revealed`
                  : "No wines yet"}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                {participantCount}
              </span>
              {tasting.scheduled_at ? (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  <LocalDateTime iso={tasting.scheduled_at} />
                </span>
              ) : null}
              {/* Skip the status badge when the top-right tab badge already
                  says the same thing (History passes "Finished"). */}
              {(STATUS_LABEL[tasting.status] ?? tasting.status) !==
              badgeLabel ? (
                <Badge variant="secondary" className="ml-auto">
                  {STATUS_LABEL[tasting.status] ?? tasting.status}
                </Badge>
              ) : null}
            </CardContent>
          </div>
        </div>
      </Card>
    </Link>
  );
}
