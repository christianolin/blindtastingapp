import { PageLoader } from "@/components/wine-glass-loader";
import { makeT } from "@/lib/wset/i18n";
import { ARCHIVE_LANG } from "./taste-archive-math";

const t = makeT(ARCHIVE_LANG);

export default function Loading() {
  return <PageLoader label={t("loading_tastings")} />;
}
