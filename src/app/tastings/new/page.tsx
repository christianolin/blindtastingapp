import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewTastingForm } from "./new-tasting-form";

export default function NewTastingPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>New tasting</CardTitle>
        </CardHeader>
        <CardContent>
          <NewTastingForm />
        </CardContent>
      </Card>
    </div>
  );
}
