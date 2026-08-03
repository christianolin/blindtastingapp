import { redirect } from "next/navigation";

// The scoring rules now live as an instant tab inside the Library shell.
export default function RulesPage() {
  redirect("/knowledge/designations?libtab=rules");
}
