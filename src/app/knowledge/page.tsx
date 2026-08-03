import { redirect } from "next/navigation";

// The Library now opens straight into its tabbed view (Designations by default);
// the old card hub is retired.
export default function KnowledgePage() {
  redirect("/knowledge/designations");
}
