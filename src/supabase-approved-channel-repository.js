import { buildContentMachinePacket } from "./content-machine-packets.js";
import { deriveUpdatedAt, isMissingTableError } from "./supabase-relational.js";

const TABLE_NAME = "approved_channel_items";

function initialState() {
  return {
    updatedAt: null,
    items: []
  };
}

function normalizePacket(row) {
  return {
    ...row.payload,
    updatedAt: row.updated_at || null
  };
}

function toRow(item, workspaceId, nowValue) {
  return {
    id: item.id,
    workspace_id: workspaceId,
    output_file_name: item.outputFileName || null,
    updated_at: item.updatedAt || nowValue,
    payload: item
  };
}

export function createSupabaseApprovedChannelRepository({
  client,
  now = () => new Date().toISOString()
}) {
  if (!client) {
    throw new Error("Supabase client ausente para approved channel.");
  }

  async function list(workspaceId) {
    if (!workspaceId) {
      return initialState();
    }

    const { data, error } = await client
      .from(TABLE_NAME)
      .select("id, updated_at, payload")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase approved channel list failed: ${error.message}`);
    }

    const items = (data || []).map(normalizePacket);
    return {
      updatedAt: deriveUpdatedAt(items),
      items
    };
  }

  async function clear(workspaceId) {
    if (!workspaceId) {
      return initialState();
    }

    const { error } = await client
      .from(TABLE_NAME)
      .delete()
      .eq("workspace_id", workspaceId);

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase approved channel clear failed: ${error.message}`);
    }

    return {
      updatedAt: now(),
      items: []
    };
  }

  async function syncFromReviewQueue(queue, workspaceId) {
    const currentState = await list(workspaceId);
    const currentMap = new Map(currentState.items.map((item) => [item.id, item]));
    const approvedDrafts = (queue.items ?? [])
      .filter((item) => item.reviewDecision === "approved")
      .map((item) => {
        const previous = currentMap.get(item.id);

        return buildContentMachinePacket(item, {
          selectedHeadlineNumber: previous?.selectedHeadlineNumber || 1,
          selectedTemplate: previous?.selectedTemplate || 1,
          manualFinalRender: previous?.manualFinalRender || "",
          aiPrompt: previous?.aiPrompt || "",
          newsContext: previous?.newsContext || "",
          evaluationStatus: previous?.evaluationStatus || "pending",
          evaluationScore: previous?.evaluationScore || 0,
          evaluationNotes: previous?.evaluationNotes || ""
        });
      });

    const nowValue = now();
    const rows = approvedDrafts.map((item) => toRow({
      ...item,
      updatedAt: nowValue
    }, workspaceId, nowValue));

    if (rows.length > 0) {
      const { error } = await client
        .from(TABLE_NAME)
        .upsert(rows, { onConflict: "id" });

      if (error) {
        throw new Error(`Supabase approved channel sync failed: ${error.message}`);
      }
    }

    const approvedIds = new Set(approvedDrafts.map((item) => item.id));
    const staleIds = currentState.items
      .map((item) => item.id)
      .filter((id) => !approvedIds.has(id));

    if (staleIds.length > 0) {
      const { error: deleteError } = await client
        .from(TABLE_NAME)
        .delete()
        .eq("workspace_id", workspaceId)
        .in("id", staleIds);

      if (deleteError && !isMissingTableError(deleteError)) {
        throw new Error(`Supabase approved channel cleanup failed: ${deleteError.message}`);
      }
    }

    return {
      updatedAt: nowValue,
      items: approvedDrafts.map((item) => ({
        ...item,
        updatedAt: nowValue
      }))
    };
  }

  async function updatePacket(id, updates = {}, workspaceId) {
    const state = await list(workspaceId);
    const currentItem = state.items.find((item) => item.id === id);

    if (!currentItem) {
      return state;
    }

    const nextItem = buildContentMachinePacket(currentItem.draftSnapshot, {
      selectedHeadlineNumber: updates.selectedHeadlineNumber ?? currentItem.selectedHeadlineNumber,
      selectedTemplate: updates.selectedTemplate ?? currentItem.selectedTemplate,
      manualFinalRender: updates.manualFinalRender ?? currentItem.manualFinalRender ?? "",
      aiPrompt: updates.aiPrompt ?? currentItem.aiPrompt,
      newsContext: updates.newsContext ?? currentItem.newsContext ?? "",
      evaluationStatus: updates.evaluationStatus ?? currentItem.evaluationStatus,
      evaluationScore: updates.evaluationScore ?? currentItem.evaluationScore,
      evaluationNotes: updates.evaluationNotes ?? currentItem.evaluationNotes
    });

    const nowValue = now();
    const { error } = await client
      .from(TABLE_NAME)
      .upsert([toRow({
        ...nextItem,
        updatedAt: nowValue
      }, workspaceId, nowValue)], { onConflict: "id" });

    if (error) {
      throw new Error(`Supabase approved channel update failed: ${error.message}`);
    }

    return {
      updatedAt: nowValue,
      items: state.items.map((item) => item.id === id ? {
        ...nextItem,
        updatedAt: nowValue
      } : item)
    };
  }

  return {
    list,
    clear,
    syncFromReviewQueue,
    updatePacket
  };
}
