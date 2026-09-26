import { PageLoader } from "@/components/wine-glass-loader";
import { TRAINING_COPY } from "@/lib/training/copy";

export default function Loading() {
  return <PageLoader label={TRAINING_COPY.loading} />;
}
