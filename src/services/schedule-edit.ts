import { supabase } from "@/integrations/supabase/client";
export class OfficialScheduleEditError extends Error {
  constructor(
    message: string,
    public sheetWritten: boolean,
    public writeAttempted: boolean,
  ) {
    super(message);
  }
}
export async function editOfficialScheduleCell(input: {
  scheduleId: string;
  name: string;
  date: string;
  expectedCode: string;
  code: string;
}) {
  const { data, error } = await supabase.functions.invoke("schedule-edit", { body: input });
  if (error) {
    if (typeof error === "object" && "context" in error && error.context instanceof Response) {
      const body = (await error.context
        .clone()
        .json()
        .catch(() => null)) as {
        error?: string;
        sheetWritten?: boolean;
        writeAttempted?: boolean;
      } | null;
      if (body?.error)
        throw new OfficialScheduleEditError(body.error, !!body.sheetWritten, !!body.writeAttempted);
    }
    throw error;
  }
  if (!data?.ok) throw Error(data?.error || "O servidor não confirmou a edição.");
  return data as { ok: true; sheetWritten: boolean; unchanged?: boolean };
}
