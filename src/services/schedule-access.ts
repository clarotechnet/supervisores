import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/lib/types";
export type ControlAccessStatus = "pending" | "approved" | "denied" | "revoked";
export interface ControlAccessRequest {
  id: string;
  user_id: string | null;
  city: string;
  status: ControlAccessStatus;
  request_note: string;
  review_note: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
  requester?: { full_name: string; email: string | null; role: UserRole; status: string } | null;
}
export interface ControlAccessEvent {
  id: string;
  access_id: string;
  actor_id: string | null;
  action: "requested" | "approved" | "denied" | "revoked";
  previous_status: string | null;
  current_status: string;
  note: string;
  created_at: string;
  actor?: { full_name: string } | null;
}
export interface ControlAccessState {
  canView: boolean;
  request: ControlAccessRequest | null;
}
type Reply = Partial<ControlAccessState> & {
  ok?: boolean;
  error?: string;
  requests?: ControlAccessRequest[];
  events?: ControlAccessEvent[];
  total?: number;
  hasMore?: boolean;
};
async function invoke(body: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke<Reply>("schedule-access", { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const response = (await context
        .clone()
        .json()
        .catch(() => null)) as { error?: string } | null;
      if (response?.error) throw Error(response.error);
    }
    throw error;
  }
  if (!data?.ok) throw Error(data?.error || "O servidor não confirmou a operação de acesso.");
  return data;
}
export async function fetchControlAccess(city: string): Promise<ControlAccessState> {
  const data = await invoke({ action: "status", city });
  return { canView: data.canView === true, request: data.request ?? null };
}
export async function requestControlAccess(city: string, note: string): Promise<void> {
  await invoke({ action: "request", city, note: note.trim() });
}
export async function listControlAccessRequests(
  filter: ControlAccessStatus | "all" = "pending",
  offset = 0,
) {
  const reply = await invoke({ action: "list", filter, offset });
  return {
    requests: reply.requests ?? [],
    total: reply.total ?? 0,
    hasMore: reply.hasMore === true,
  };
}
export async function reviewControlAccess(
  request: ControlAccessRequest,
  decision: Exclude<ControlAccessStatus, "pending">,
  note: string,
): Promise<void> {
  await invoke({
    action: "review",
    requestId: request.id,
    updatedAt: request.updated_at,
    decision,
    note: note.trim(),
  });
}
export async function fetchControlAccessHistory(requestId: string): Promise<ControlAccessEvent[]> {
  return (await invoke({ action: "history", requestId })).events ?? [];
}
