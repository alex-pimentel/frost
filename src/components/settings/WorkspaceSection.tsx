import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, UserPlus, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface Props {
  initialSubTab?: string;
}

export default function WorkspaceSection({ initialSubTab: _initialSubTab }: Props) {
  const { t } = useTranslation();
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    loaded,
    refresh,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
  } = useWorkspaceStore();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    if (!activeWorkspaceId && workspaces.length > 0) {
      setActiveWorkspaceId(workspaces[0].id);
    }
  }, [activeWorkspaceId, workspaces, setActiveWorkspaceId]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const workspace = await createWorkspace(name);
      setActiveWorkspaceId(workspace.id);
      setNewName("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    setError(null);
    try {
      await renameWorkspace(id, name);
      setRenamingId(null);
      setRenameValue("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteWorkspace(id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-foreground">{t("settingsPage.workspace.title")}</h3>
        <p className="text-xs text-muted-foreground/80 mt-0.5">
          {t("settingsPage.workspace.description")}
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-border/50 dark:border-border-subtle/70 bg-card/50 dark:bg-surface-2/50 divide-y divide-border/40">
        {workspaces.length === 0 ? (
          <div className="p-6 text-center">
            <Users className="w-5 h-5 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-xs font-medium text-foreground mb-1">
              {t("settingsPage.workspace.empty.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settingsPage.workspace.empty.description")}
            </p>
          </div>
        ) : (
          workspaces.map((workspace) => {
            const isActive = workspace.id === activeWorkspaceId;
            return (
              <div key={workspace.id} className="flex items-center gap-2 px-3 py-2">
                <button
                  onClick={() => setActiveWorkspaceId(workspace.id)}
                  className={cn(
                    "flex-1 min-w-0 text-left rounded-md px-1.5 py-1 outline-none",
                    "focus-visible:ring-1 focus-visible:ring-primary/30"
                  )}
                  aria-label={t("workspaces.switcher.workspaces")}
                >
                  {renamingId === workspace.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRename(workspace.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="h-7 text-xs"
                    />
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground truncate">
                        {isActive && <Check className="h-3 w-3 text-primary shrink-0" />}
                        {workspace.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {workspace.slug}
                      </span>
                    </>
                  )}
                </button>

                {renamingId === workspace.id ? (
                  <Button size="sm" variant="ghost" onClick={() => void handleRename(workspace.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRenamingId(workspace.id);
                      setRenameValue(workspace.name);
                    }}
                    aria-label={t("common.edit")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleDelete(workspace.id)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder={t("settingsPage.workspace.empty.create")}
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          onClick={() => void handleCreate()}
          disabled={creating || !newName.trim()}
        >
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          {t("workspaces.switcher.create")}
        </Button>
      </div>
    </div>
  );
}
