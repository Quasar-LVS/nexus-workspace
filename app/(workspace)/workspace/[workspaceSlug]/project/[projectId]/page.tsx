"use client";

import React, { useEffect, use } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import ProjectPage from "../../../../p/[projectId]/page";

interface PageProps {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}

export default function WorkspaceSlugProjectPage({ params }: PageProps) {
  const { workspaceSlug, projectId } = use(params);
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

  // Wrap projectId into a Promise to match ProjectPage params requirement
  const resolvedParams = React.useMemo(() => Promise.resolve({ projectId }), [projectId]);

  return <ProjectPage params={resolvedParams} />;
}
