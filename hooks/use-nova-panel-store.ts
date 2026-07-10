import { create } from "zustand";

export type NovaContextType = "channel" | "project" | "task" | "brief" | "general" | "dm";

interface NovaPanelState {
  isOpen: boolean;
  contextType: NovaContextType;
  contextId: string | null;
  isLoading: boolean;
  activeSummary: string | null;

  openNova: (type: NovaContextType, contextId?: string | null) => void;
  closeNova: () => void;
  setLoading: (isLoading: boolean) => void;
  setActiveSummary: (summary: string | null) => void;
}

export const useNovaPanelStore = create<NovaPanelState>((set) => ({
  isOpen: false,
  contextType: "general",
  contextId: null,
  isLoading: false,
  activeSummary: null,

  openNova: (type, contextId = null) => set({
    isOpen: true,
    contextType: type,
    contextId,
    activeSummary: null // Clear previous summaries on new context opening
  }),
  
  closeNova: () => set({ isOpen: false, contextId: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setActiveSummary: (summary) => set({ activeSummary: summary })
}));
