"use client";

import React, { useEffect, use } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import DMPage from "../../../../dm/[conversationId]/page";

interface PageProps {
  params: Promise<{ workspaceSlug: string; conversationId: string }>;
}

export default function WorkspaceSlugDMPage({ params }: PageProps) {
  const { workspaceSlug, conversationId } = use(params);
  const { workspaces } = useWorkspace();
  const { activeWorkspaceSlug, setActiveWorkspace } = useWorkspaceStore();

  useEffect(() => {
    if (workspaceSlug && workspaceSlug !== activeWorkspaceSlug && workspaces.length > 0) {
      const target = workspaces.find((w) => w.slug === workspaceSlug);
      if (target) {
        setActiveWorkspace(target.id, target.name, target.slug);
      }
    }
  }, [workspaceSlug, activeWorkspaceSlug, workspaces, setActiveWorkspace]);

  // Wrap conversationId into a Promise to match DMPage params requirement
  const resolvedParams = React.useMemo(() => Promise.resolve({ conversationId }), [conversationId]);

  return <DMPage params={resolvedParams} />;
}
