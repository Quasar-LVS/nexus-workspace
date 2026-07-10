import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkspaceState {
  activeWorkspaceId: string | null;
  activeWorkspaceName: string | null;
  activeWorkspaceSlug: string | null;
  activeChannelId: string | null;
  activeProjectId: string | null;
  sidebarOpen: boolean;
  
  setActiveWorkspace: (id: string | null, name?: string | null, slug?: string | null) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  setActiveChannelId: (id: string | null) => void;
  setActiveProjectId: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  resetWorkspaceSelection: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      activeWorkspaceName: null,
      activeWorkspaceSlug: null,
      activeChannelId: null,
      activeProjectId: null,
      sidebarOpen: true,

      setActiveWorkspace: (id, name = null, slug = null) =>
        set({
          activeWorkspaceId: id,
          activeWorkspaceName: name,
          activeWorkspaceSlug: slug,
          activeChannelId: null,
          activeProjectId: null,
        }),

      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
      
      setActiveChannelId: (id) => set({ 
        activeChannelId: id, 
        activeProjectId: null // Reset active project when switching to a channel
      }),
      
      setActiveProjectId: (id) => set({ 
        activeProjectId: id, 
        activeChannelId: null // Reset active channel when switching to a project
      }),
      
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      resetWorkspaceSelection: () => set({ activeChannelId: null, activeProjectId: null }),
    }),
    {
      name: "nexus-workspace-store",
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        activeWorkspaceName: state.activeWorkspaceName,
        activeWorkspaceSlug: state.activeWorkspaceSlug,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);

