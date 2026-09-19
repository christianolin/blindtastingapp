import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { FORGOT_LEAD, FORGOT_TITLE } from "@/lib/auth/login-copy";
import { ForgotForm } from "./forgot-form";

// "Forgot password?" from /login. The emailed link (custom Reset Password
// template → /auth/confirm, or Supabase's default → /auth/callback) signs the
// person in and lands on the set-password page in reset mode.
export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{FORGOT_TITLE}</CardTitle>
          <CardDescription>{FORGOT_LEAD}</CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotForm />
        </CardContent>
      </Card>
    </div>
  );
}
