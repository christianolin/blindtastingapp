import { redirect } from "next/navigation";

// Grapes now live as an instant tab inside the Library shell.
export default function GrapesPage() {
  redirect("/knowledge/designations?libtab=grapes");
}
