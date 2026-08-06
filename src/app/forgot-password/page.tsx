import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Wordmark />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotForm />
        </CardContent>
      </Card>
    </div>
  );
}
