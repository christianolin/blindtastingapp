import { getOptionalUser } from "@/lib/auth/dal";
import { redirect } from "next/navigation";
export default async function Home() {
  const user = await getOptionalUser();

  redirect(user ? "/taste" : "/login");
}
