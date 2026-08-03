import { redirect } from "next/navigation";

// Typical wines now live as an instant tab inside the Library shell.
export default function ArchetypesPage() {
  redirect("/knowledge/designations?libtab=typical");
}
