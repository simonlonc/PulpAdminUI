"use client";

import Link from "next/link";
import { MoreVertical, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowActionItem =
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      href: string;
      disabled?: boolean;
      destructive?: boolean;
    }
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      onSelect: () => void;
      disabled?: boolean;
      destructive?: boolean;
    }
  | { key: string; separator: true };

export type RowActionMenuProps = {
  label: string;
  items: (RowActionItem | false | null | undefined)[];
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Row-level "..." action menu: a trigger button plus a Radix dropdown of actions/links. */
export function RowActionMenu({ label, items, disabled, onOpenChange }: RowActionMenuProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          aria-label={`Actions for ${label}`}
        >
          <MoreVertical className="size-4" strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {items.filter((item): item is RowActionItem => Boolean(item)).map((item) => {
          if ("separator" in item) {
            return <DropdownMenuSeparator key={item.key} />;
          }

          const Icon = item.icon;
          const variant = item.destructive ? "destructive" : "default";

          if ("href" in item) {
            return (
              <DropdownMenuItem key={item.key} asChild disabled={item.disabled} variant={variant}>
                <Link href={item.href}>
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem
              key={item.key}
              disabled={item.disabled}
              variant={variant}
              onSelect={item.onSelect}
            >
              <Icon className="size-4" />
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
