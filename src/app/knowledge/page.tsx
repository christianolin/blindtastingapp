import { redirect } from "next/navigation";

// Knowledge has no landing page of its own — the Wine Map is the centrepiece,
// and the section tabs on each knowledge page switch subsections. Old
// /knowledge links land on the map.
export default function KnowledgePage() {
  redirect("/knowledge/map");
}
