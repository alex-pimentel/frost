import { create } from "zustand";
import type { Workspace } from "../types/electron";
import { WorkspacesService } from "../services/WorkspacesService";
import logger from "../utils/logger";

interface WorkspaceState {
  workspaces: Workspace[];
  loaded: boolean;
  loading: boolean;
  activeWorkspaceId: string | null;

  setActiveWorkspaceId: (id: string | null) => void;
  refresh: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  current: () => Workspace | null;
}

const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";

function readActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
}

function writeActiveWorkspaceId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
  else localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  loaded: false,
  loading: false,
  activeWorkspaceId: readActiveWorkspaceId(),

  setActiveWorkspaceId: (id) => {
    writeActiveWorkspaceId(id);
    set({ activeWorkspaceId: id });
  },

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const workspaces = await WorkspacesService.list();
      const activeId = get().activeWorkspaceId;
      const stillValid = activeId && workspaces.some((w) => w.id === activeId);
      set({
        workspaces,
        loaded: true,
        loading: false,
        activeWorkspaceId: stillValid ? activeId : null,
      });
      if (!stillValid && activeId) writeActiveWorkspaceId(null);
    } catch (error) {
      logger.error("Failed to load workspaces", { error: (error as Error).message }, "workspaces");
      set({ loading: false, loaded: true });
    }
  },

  createWorkspace: async (name) => {
    const workspace = await WorkspacesService.create(name);
    set((s) => ({ workspaces: [...s.workspaces, workspace] }));
    return workspace;
  },

  renameWorkspace: async (id, name) => {
    const updated = await WorkspacesService.update(id, { name });
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? updated : w)) }));
  },

  deleteWorkspace: async (id) => {
    await WorkspacesService.remove(id);
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
    }));
    if (get().activeWorkspaceId === null) writeActiveWorkspaceId(null);
  },

  current: () => {
    const { activeWorkspaceId, workspaces } = get();
    if (!activeWorkspaceId) return null;
    return workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  },
}));
