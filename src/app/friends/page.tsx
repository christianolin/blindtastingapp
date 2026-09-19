import { redirect } from "next/navigation";

// Friends now lives as a filter pill of the Community page; old links and
// bookmarks land there.
export default function FriendsPage() {
  redirect("/community?tab=friends");
}
