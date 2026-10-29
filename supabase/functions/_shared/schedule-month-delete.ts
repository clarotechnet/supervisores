type RecordValue = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type Google = (url: string, method?: string, body?: unknown) => Promise<unknown>;
export class ScheduleDeletionError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export type DeleteSheetLink = {
  id: string;
  city: string;
  sector: string;
  schedule_month: string;
  spreadsheet_id: string;
  sheet_tab: string;
  spreadsheet_url: string;
};
type Metadata = { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Só remove o gid armazenado e depois confirma sua ausência. Retentativa não atinge outra aba. */
export async function deleteOperationalMonth(input: {
  sheet: DeleteSheetLink;
  actorId: string;
  scheduleId: unknown;
  confirmation: unknown;
  expectedSpreadsheet: string | undefined;
  expectedTab: string;
  rpc: (name: string, args: RecordValue) => Promise<RpcResult>;
  google: Google;
}) {
  const { sheet, google, rpc } = input;
  if (
    !uuid(input.scheduleId) ||
    input.confirmation !== "EXCLUIR " + sheet.schedule_month.slice(0, 7)
  )
    throw new ScheduleDeletionError("Digite a confirmação da competência selecionada.", 400);
  if (
    !input.expectedSpreadsheet ||
    sheet.spreadsheet_id !== input.expectedSpreadsheet ||
    sheet.sheet_tab !== input.expectedTab ||
    sheet.sheet_tab === "ATUALIZADA"
  )
    throw new ScheduleDeletionError(
      "A exclusão exige a aba mensal vinculada ao arquivo oficial. Abas históricas são preservadas.",
    );
  let url: URL;
  try {
    url = new URL(sheet.spreadsheet_url);
  } catch {
    throw new ScheduleDeletionError("Link da aba inválido.");
  }
  const gridText = new URLSearchParams(url.hash.slice(1)).get("gid") || url.searchParams.get("gid");
  const gridId = Number(gridText);
  if (
    url.origin !== "https://docs.google.com" ||
    url.pathname !== "/spreadsheets/d/" + sheet.spreadsheet_id + "/edit" ||
    gridText === null ||
    !/^\d+$/.test(gridText) ||
    !Number.isSafeInteger(gridId)
  )
    throw new ScheduleDeletionError("O link não identifica com segurança a aba mensal.");
  const base =
    "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(sheet.spreadsheet_id);
  const metadata = async () =>
    (await google(base + "?fields=sheets(properties(sheetId,title))")) as Metadata;
  function find(meta: Metadata) {
    const sameId = meta.sheets?.filter((s) => s.properties?.sheetId === gridId) || [];
    const sameTitle = meta.sheets?.filter((s) => s.properties?.title === sheet.sheet_tab) || [];
    if (
      sameId.length > 1 ||
      sameTitle.length > 1 ||
      (sameId.length && sameId[0]!.properties?.title !== sheet.sheet_tab) ||
      (sameTitle.length && sameTitle[0]!.properties?.sheetId !== gridId)
    )
      throw new ScheduleDeletionError(
        "A aba foi renomeada ou substituída. Nenhuma outra aba será excluída.",
      );
    return sameId.length === 1;
  }
  const present = find(await metadata());
  const googleSnapshot = present
    ? {
        metadata: { gridId, title: sheet.sheet_tab },
        ...((await google(
          base +
            "/values/" +
            encodeURIComponent("'" + sheet.sheet_tab.replaceAll("'", "''") + "'") +
            "?valueRenderOption=UNFORMATTED_VALUE",
        )) as RecordValue),
      }
    : { metadata: { gridId, title: sheet.sheet_tab }, absent: true };
  const begun = await rpc("schedule_month_begin_delete", {
    p_sheet_id: sheet.id,
    p_actor_id: input.actorId,
    p_schedule_id: input.scheduleId,
    p_grid_id: gridId,
    p_confirmation: input.confirmation,
    p_google_snapshot: googleSnapshot,
  });
  if (begun.error)
    throw new ScheduleDeletionError(
      "Não foi possível preparar a exclusão: " + begun.error.message,
      begun.error.code === "42501" ? 403 : 409,
    );
  const operation = begun.data as { id?: unknown; status?: unknown } | null;
  if (!operation || !uuid(operation.id))
    throw new ScheduleDeletionError(
      "O banco não confirmou a preparação da exclusão. A aba foi preservada.",
      503,
    );
  if (operation.status === "applied") return { deleted: true, alreadyDeleted: true };
  if (operation.status !== "pending")
    throw new ScheduleDeletionError("Estado de exclusão não reconhecido.", 503);
  if (present)
    await google(base + ":batchUpdate", "POST", {
      requests: [{ deleteSheet: { sheetId: gridId } }],
    });
  if (find(await metadata()))
    throw new ScheduleDeletionError(
      "A remoção da aba ainda não foi confirmada. Repita Excluir escala para concluir.",
      502,
    );
  const finished = await rpc("schedule_month_finish_delete", {
    p_deletion_id: operation.id,
    p_actor_id: input.actorId,
  });
  if (finished.error || !(finished.data as { deleted?: unknown } | null)?.deleted)
    throw new ScheduleDeletionError(
      "A aba foi removida, mas falta concluir o registro no sistema. Repita Excluir escala para concluir. " +
        (finished.error?.message || ""),
      503,
    );
  return { deleted: true, alreadyDeleted: false };
}
