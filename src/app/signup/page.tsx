import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { SignUpForm } from "./signup-form";

// `?next=` (a share link opened without an account) rides through the form
// into the confirmation link, the same way /login carries it.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
        </CardHeader>
        <CardContent>
          <SignUpForm next={next ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
