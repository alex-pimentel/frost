import type { Workspace, WorkspaceMember } from "../types/electron";

/**
 * Local-only workspaces.
 *
 * A workspace here is just a named grouping the user creates on their own machine.
 * There are no members, invitations, teams or billing — membership is always the
 * local user, so `listMembers` returns an empty list and the paid-plan fields are
 * neutral placeholders kept for type compatibility with the existing UI.
 */

const STORAGE_KEY = "frost.workspaces";

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function read(): Workspace[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Workspace[]) : [];
  } catch {
    return [];
  }
}

function write(workspaces: Workspace[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}

function makeWorkspace(name: string): Workspace {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    slug: slugify(name),
    created_by_user_id: "local",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan: "local",
    status: "active",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    seats: 1,
    created_at: timestamp,
    updated_at: timestamp,
    role: "owner",
  };
}

async function list(): Promise<Workspace[]> {
  return read();
}

async function create(name: string): Promise<Workspace> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");
  const workspaces = read();
  if (workspaces.some((workspace) => workspace.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("A workspace with this name already exists");
  }
  const workspace = makeWorkspace(trimmed);
  write([...workspaces, workspace]);
  return workspace;
}

async function get(workspaceId: string): Promise<Workspace> {
  const workspace = read().find((item) => item.id === workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  return workspace;
}

async function update(
  workspaceId: string,
  patch: { name?: string; slug?: string }
): Promise<Workspace> {
  const workspaces = read();
  const index = workspaces.findIndex((item) => item.id === workspaceId);
  if (index === -1) throw new Error("Workspace not found");
  const current = workspaces[index];
  const updated: Workspace = {
    ...current,
    name: patch.name?.trim() || current.name,
    slug: patch.name ? slugify(patch.name) : (patch.slug ?? current.slug),
    updated_at: nowIso(),
  };
  workspaces[index] = updated;
  write(workspaces);
  return updated;
}

async function remove(workspaceId: string): Promise<void> {
  write(read().filter((item) => item.id !== workspaceId));
}

async function listMembers(_workspaceId: string): Promise<WorkspaceMember[]> {
  return [];
}

export const WorkspacesService = {
  list,
  create,
  get,
  update,
  remove,
  listMembers,
};
