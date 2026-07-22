import { redirect } from "next/navigation";

// Friends now lives as a tab of the People & Friends page; old links and
// bookmarks land there.
export default function FriendsPage() {
  redirect("/people?tab=friends");
}
