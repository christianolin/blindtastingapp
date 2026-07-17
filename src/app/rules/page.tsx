import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AppHeader } from "@/components/app-header";

export const metadata = {
  title: "Scoring — Danish Championship rules · Blindr",
};

const ROWS: { category: string; points: string; note: string }[] = [
  { category: "Country", points: "2", note: "" },
  { category: "Region", points: "3", note: "e.g. Bordeaux, Piemonte, Mosel" },
  {
    category: "District / Appellation",
    points: "5",
    note: "only if the wine has one (e.g. Pauillac, Barolo)",
  },
  { category: "Primary grape", points: "8", note: "the sole or dominant variety" },
  {
    category: "Secondary grape",
    points: "2",
    note: "only if the wine is a recorded blend",
  },
  { category: "Producer", points: "6", note: "" },
  {
    category: "Type designation",
    points: "2",
    note: "only if the wine has one (Kabinett, GG, Riserva, …)",
  },
  {
    category: "Vintage",
    points: "2 / 1 / 0",
    note: "2 for the exact year, 1 if you're off by exactly one year, 0 otherwise",
  },
];

export default function RulesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Danish Championship scoring
          </h1>
          <p className="mt-2 text-muted-foreground">
            Fully-blind tastings on Blindr are scored with the 
            Danish national championship point system. For each wine 
            you earn points per category you guess correctly:
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Points per category</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROWS.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell>
                      <div className="font-medium">{r.category}</div>
                      {r.note ? (
                        <div className="text-xs text-muted-foreground">
                          {r.note}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right align-top font-semibold tabular-nums">
                      {r.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-4 text-sm text-muted-foreground">
              A wine with every category in play is worth up to{" "}
              <span className="font-semibold text-foreground">30 points</span>.
              A wine with no secondary grape, appellation, or type designation
              simply has fewer scorable categories.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">A note on vintage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Guess the <span className="font-medium text-foreground">exact
              year</span> for 2 points, or land{" "}
              <span className="font-medium text-foreground">
                within one year
              </span>{" "}
              (e.g. 2019 when the answer is 2018 or 2020) for 1 point.
            </p>
            <p>
              Non-vintage (NV) and tawny (10 / 20 / 30 / 40+ years) are their
              own vintage types and only score on an exact match — no
              off-by-one credit.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Semi-blind tastings</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            In a semi-blind tasting the full wine list is shown up front and
            you just match each glass to a wine — so there&apos;s no
            category breakdown. You simply score 1 point per glass matched to
            the correct wine (e.g. &ldquo;4/6 correct&rdquo;).
          </CardContent>
        </Card>

        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Back to your tastings
        </Link>
      </div>
    </div>
  );
}
