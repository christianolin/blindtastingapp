// Client contract for get_wine_place_tree(): the whole verified place
// hierarchy in one call, for the searchable sidebar. RLS (invoker) already
// restricts rows to VERIFIED places.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type WinePlaceTreeNode = {
  id: string;
  key: string;
  name: string;
  kind: string;
  tier: number;
  parent_key: string | null;
  has_children: boolean;
  children: WinePlaceTreeNode[];
};

type RawNode = Omit<WinePlaceTreeNode, "children">;

function isRawNode(value: unknown): value is RawNode {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.id === "string" &&
    typeof node.key === "string" &&
    typeof node.name === "string" &&
    typeof node.kind === "string" &&
    typeof node.tier === "number" &&
    (node.parent_key === null || typeof node.parent_key === "string") &&
    typeof node.has_children === "boolean"
  );
}

// Roots are places whose parent is not in the payload (countries, plus any
// verified place whose parent is unpublished). Children sort by key, which
// matches the catalog's canonical ordering.
export function buildWinePlaceTree(payload: unknown): WinePlaceTreeNode[] {
  if (!Array.isArray(payload) || !payload.every(isRawNode)) {
    throw new Error("Unrecognized wine place tree shape");
  }
  const nodes = new Map<string, WinePlaceTreeNode>();
  for (const raw of payload) nodes.set(raw.key, { ...raw, children: [] });
  const roots: WinePlaceTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_key ? nodes.get(node.parent_key) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: WinePlaceTreeNode[]) => {
    list.sort((a, b) => a.key.localeCompare(b.key));
    for (const node of list) sortRec(node.children);
  };
  sortRec(roots);
  return roots;
}

export async function fetchWinePlaceTree(
  supabase: SupabaseClient<Database>,
): Promise<WinePlaceTreeNode[]> {
  const { data, error } = await supabase.rpc("get_wine_place_tree");
  if (error) throw new Error(`Wine place tree request failed: ${error.message}`);
  return buildWinePlaceTree(data);
}
