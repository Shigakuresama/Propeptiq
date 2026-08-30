import { LibraryBig } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/design-system/archive-primitives";
import { Button } from "@/components/ui/button";

export function CatalogEmptyState({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  return (
    <EmptyState
      action={
        <Button
          asChild
          variant="outline"
          className="h-11 rounded-full border-ink/20 bg-transparent px-5 text-ink hover:bg-moss-soft/60"
        >
          <Link href="/research-use-policy">Read research-use policy</Link>
        </Button>
      }
      description="Production remains empty until a separately verified catalog source is connected."
      eyebrow="Catalog state"
      headingLevel={headingLevel}
      icon={LibraryBig}
      title="No active catalog records are currently available."
    />
  );
}
