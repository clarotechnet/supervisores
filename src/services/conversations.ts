import { supabase } from "@/integrations/supabase/client";
import type { ConversationMessage, UserRole } from "@/lib/types";

export async function fetchConversation(supervisorId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("supervisor_id", supervisorId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ConversationMessage[];
}

export async function sendConversationMessage(params: {
  supervisorId: string;
  senderId: string;
  senderRole: UserRole;
  body: string;
}): Promise<ConversationMessage> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      supervisor_id: params.supervisorId,
      sender_id: params.senderId,
      sender_role: params.senderRole,
      body: params.body.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ConversationMessage;
}

export async function markConversationRead(supervisorId: string, readerId: string) {
  const { error } = await supabase
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("supervisor_id", supervisorId)
    .is("read_at", null)
    .neq("sender_id", readerId);
  if (error) throw error;
}
