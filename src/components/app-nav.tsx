"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type NavEntry = { href: string; label: string };
export type NavGroup = { label: string; items: NavEntry[] };

// The app's top-level navigation: three dropdown groups instead of five
// flat links (owner brief 2026-07-22).
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tastings",
    items: [
      { href: "/dashboard", label: "My tastings" },
      { href: "/tastings/new", label: "New tasting" },
      { href: "/people", label: "People & Friends" },
      { href: "/rules", label: "Rules" },
    ],
  },
  {
    label: "Knowledge library",
    items: [
      { href: "/knowledge/map", label: "Wine Map" },
      { href: "/knowledge/type-designations", label: "Designation library" },
      { href: "/knowledge/grapes", label: "Grape library" },
    ],
  },
];

// Desktop dropdown nav (the header hides it below md; MobileNav renders the
// same groups in the drawer).
export function AppNav() {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <DropdownMenu key={group.label}>
          <DropdownMenuTrigger className="inline-flex cursor-pointer items-center gap-1 text-sm hover:underline">
            {group.label}
            <ChevronDown className="size-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-auto min-w-44">
            {group.items.map((item) => (
              <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </>
  );
}
