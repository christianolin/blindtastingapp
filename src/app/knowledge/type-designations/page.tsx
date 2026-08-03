import { redirect } from "next/navigation";

// The old Designations route now lives under the Library at
// /knowledge/designations. Permanent client-visible redirect for any bookmarks.
export default function TypeDesignationsRedirect() {
  redirect("/knowledge/designations");
}
