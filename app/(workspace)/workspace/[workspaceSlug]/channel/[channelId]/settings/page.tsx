"use client";

import React, { useEffect, use } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useWorkspace } from "@/context/workspace-context";
import ChannelSettingsPage from "../../../../../c/[channelId]/settings/page";

interface PageProps {
  params: Promise<{ workspaceSlug: string; channelId: string }>;
}

export default function WorkspaceSlugChannelSettingsPage({ params }: PageProps) {
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

  const resolvedParams = React.useMemo(() => Promise.resolve({ channelId }), [channelId]);

  return <ChannelSettingsPage params={resolvedParams} />;
}
