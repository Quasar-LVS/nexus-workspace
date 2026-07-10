"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export function Breadcrumb() {
  const pathname = usePathname() || "";
  
  // Split path segments and ignore route groups (folders starting with parentheses like (workspace))
  const segments = pathname
    .split("/")
    .filter((segment) => segment && !segment.startsWith("(") && !segment.endsWith(")"));

  return (
    <nav className="flex items-center space-x-1.5 text-xs text-muted-foreground font-medium hidden sm:flex">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <Home size={13} />
      </Link>

      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const href = "/" + segments.slice(0, index + 1).join("/");
        
        // Clean text formatting (e.g. "nexus-v1" to "Nexus v1", "c" to "Channels")
        let displayLabel = segment.replace("-", " ");
        if (segment === "c") displayLabel = "Chat";
        if (segment === "p") displayLabel = "Projects";
        
        return (
          <React.Fragment key={href}>
            <ChevronRight size={12} className="text-muted-foreground/60 shrink-0" />
            {isLast ? (
              <span className="font-semibold text-foreground capitalize truncate max-w-[120px]">
                {displayLabel}
              </span>
            ) : (
              <Link
                href={href}
                className="hover:text-foreground transition-colors capitalize truncate max-w-[100px]"
              >
                {displayLabel}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
