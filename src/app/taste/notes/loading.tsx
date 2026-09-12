import { PageLoader } from "@/components/wine-glass-loader";
import { NOTES_LANG, makeNotesT } from "./notes-search";

const t = makeNotesT(NOTES_LANG);

export default function Loading() {
  return <PageLoader label={t("loading_notes")} />;
}
