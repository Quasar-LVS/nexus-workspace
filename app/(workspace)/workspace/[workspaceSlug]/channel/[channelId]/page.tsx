"use client";

import React, { useEffect, use } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import ChannelPage from "../../../../c/[channelId]/page";

interface PageProps {
  params: Promise<{ workspaceSlug: string; channelId: string }>;
}

export default function WorkspaceSlugChannelPage({ params }: PageProps) {
  const { workspaceSlug, channelId } = use(params);
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

  // Wrap channelId into a Promise to match ChannelPage params requirement
  const resolvedParams = React.useMemo(() => Promise.resolve({ channelId }), [channelId]);

  return <ChannelPage params={resolvedParams} />;
}
