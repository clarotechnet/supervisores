import { supabase } from "@/integrations/supabase/client";
import type { ConversationManagerSummary, ConversationMessage, UserRole } from "@/lib/types";

export async function fetchConversation(
  supervisorId: string,
  managerId: string,
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("supervisor_id", supervisorId)
    .eq("manager_id", managerId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ConversationMessage[];
}

export async function fetchConversationManagers(): Promise<ConversationManagerSummary[]> {
  const { data, error } = await supabase.rpc("list_my_conversation_managers");
  if (error) throw error;
  return (data ?? []) as ConversationManagerSummary[];
}

export async function sendConversationMessage(params: {
  supervisorId: string;
  managerId: string;
  senderId: string;
  senderRole: UserRole;
  body: string;
}): Promise<ConversationMessage> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      supervisor_id: params.supervisorId,
      manager_id: params.managerId,
      sender_id: params.senderId,
      sender_role: params.senderRole,
      body: params.body.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ConversationMessage;
}

export async function markConversationRead(
  supervisorId: string,
  managerId: string,
  readerId: string,
) {
  const { error } = await supabase
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("supervisor_id", supervisorId)
    .eq("manager_id", managerId)
    .is("read_at", null)
    .neq("sender_id", readerId);
  if (error) throw error;
}
