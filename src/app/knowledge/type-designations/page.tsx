import { permanentRedirect } from "next/navigation";

// The old Designations route now lives under the Library at
// /knowledge/designations. Permanent (308) redirect for any old bookmarks.
export default function TypeDesignationsRedirect() {
  permanentRedirect("/knowledge/designations");
}
