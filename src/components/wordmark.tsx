import { BlindrAppIcon, BlindrWordmark } from "@/components/logo";

export function Wordmark() {
  return (
    <div className="mb-8 flex flex-col items-center gap-3">
      <BlindrAppIcon size={56} />
      <BlindrWordmark size={30} />
    </div>
  );
}
