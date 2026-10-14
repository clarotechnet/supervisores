import { useMemo, useRef, useState } from "react";
import { FileUp, Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  associateDirectory,
  emptyQualityLogin,
  nameKey,
  normalizeLogin,
  readDirectoryWorkbook,
  type QualityLogin,
} from "@/lib/quality-directory";
import { isTechnicalVisitSector } from "@/lib/technical-visit-scope";

const fields = [
  ["login", "Login"],
  ["full_name", "Nome"],
  ["city", "Cidade"],
  ["sector", "Setor"],
  ["supervisor", "Supervisor"],
] as const;
export function QualityDirectory({
  entries,
  missing,
  editable,
  busy,
  onSave,
  onDelete,
  technicalVisit = false,
}: {
  entries: QualityLogin[];
  missing: QualityLogin[];
  editable: boolean;
  busy: boolean;
  onSave: (rows: QualityLogin[]) => Promise<void>;
  onDelete: (login: string) => Promise<void>;
  technicalVisit?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [onlyPending, setOnlyPending] = useState(false),
    [page, setPage] = useState(0);
  const [editing, setEditing] = useState<QualityLogin | null>(null),
    [original, setOriginal] = useState("");
  const [preview, setPreview] = useState<QualityLogin[] | null>(null),
    [warnings, setWarnings] = useState<string[]>([]),
    [parsing, setParsing] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const visibleEntries = useMemo(
    () => (technicalVisit ? entries.filter((row) => isTechnicalVisitSector(row.sector)) : entries),
    [entries, technicalVisit],
  );
  const visibleMissing = useMemo(
    () => (technicalVisit ? missing.filter((row) => isTechnicalVisitSector(row.sector)) : missing),
    [missing, technicalVisit],
  );
  const rows = useMemo(
    () =>
      [...visibleEntries, ...visibleMissing]
        .filter(
          (row) =>
            (!onlyPending || !row.supervisor || !row.full_name || !row.city || !row.sector) &&
            nameKey(Object.values(row).join(" ")).includes(nameKey(search)),
        )
        .sort(
          (a, b) =>
            a.full_name.localeCompare(b.full_name, "pt-BR") || a.login.localeCompare(b.login),
        ),
    [visibleEntries, visibleMissing, onlyPending, search],
  );
  function edit(row: QualityLogin, isNew = false) {
    setOriginal(isNew ? "" : row.login);
    setEditing({ ...row });
  }
  async function importFiles(files: File[]) {
    setParsing(true);
    try {
      const parsed = (await Promise.all(files.map(readDirectoryWorkbook))).flat();
      const result = associateDirectory(parsed, entries);
      const previewRows = [...result.entries, ...result.unmatchedNames].filter(
        (row) => !technicalVisit || isTechnicalVisitSector(row.sector),
      );
      setWarnings(
        technicalVisit
          ? result.warnings.filter((warning) =>
              previewRows.some((row) => row.login && warning.startsWith(`${row.login}:`)),
            )
          : result.warnings,
      );
      setPreview(previewRows);
      if (technicalVisit && !previewRows.length)
        toast.info("Nenhum cadastro com setor Visita técnica encontrado na importação.");
      setPreviewPage(0);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setParsing(false);
    }
  }
  async function saveForm(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const login = normalizeLogin(editing.login);
    if (!/^[^\s]{1,100}$/.test(login)) {
      toast.error("O login não pode conter espaços.");
      return;
    }
    const existing = entries.find((row) => normalizeLogin(row.login) === login);
    if (!original && existing) {
      toast.error(
        technicalVisit && !isTechnicalVisitSector(existing.sector)
          ? "Esse login já existe em outro setor. Edite seu setor no cadastro de QQ e Certificação."
          : "Esse login já existe. Use Editar no cadastro existente.",
      );
      return;
    }
    try {
      await onSave([{ ...editing, login }]);
      setEditing(null);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function savePreview() {
    if (!preview) return;
    const valid = preview.filter(
      (row) => row.login.trim() && (!technicalVisit || isTechnicalVisitSector(row.sector)),
    );
    if (technicalVisit && !valid.length) {
      toast.info("Nenhum cadastro de Visita técnica com login será salvo.");
      return;
    }
    if (
      valid.some(
        (row) => !row.full_name.trim() || !/^[^\s]{1,100}$/.test(normalizeLogin(row.login)),
      )
    ) {
      toast.error("Preencha nome e login válido em todos os registros que serão salvos.");
      return;
    }
    if (new Set(valid.map((row) => normalizeLogin(row.login))).size !== valid.length) {
      toast.error("Existem logins repetidos na prévia. Corrija-os antes de salvar.");
      return;
    }
    try {
      await onSave(valid.map((row) => ({ ...row, login: normalizeLogin(row.login) })));
      setPreview(null);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  const disabled = busy || parsing;
  const displayPage = technicalVisit
    ? Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1))
    : page;
  return (
    <section className="quality-card space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Cadastro de logins e supervisores</h2>
          <p className="text-sm text-muted-foreground">
            {technicalVisit
              ? "Somente logins com setor Visita técnica. Para incluir um login de outro setor, altere seu cadastro em QQ e Certificação. O cadastro é compartilhado entre os painéis."
              : "Cadastro dos técnicos usado nos dois painéis. Não cria contas de acesso ao sistema."}
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Button variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
              <FileUp className="size-4" />
              Importar cadastros
            </Button>
            <Button
              disabled={disabled}
              onClick={() =>
                edit(
                  { ...emptyQualityLogin(), sector: technicalVisit ? "Visita técnica" : "" },
                  true,
                )
              }
            >
              <Plus className="size-4" />
              Adicionar login
            </Button>
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void importFiles(files);
        }}
      />
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-md flex-1 min-w-64">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Pesquisar cadastros"
            className="pl-9"
            placeholder="Login, nome, cidade, setor ou supervisor"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => {
              setOnlyPending(e.target.checked);
              setPage(0);
            }}
          />
          Somente cadastros pendentes
        </label>
        <span className="text-sm text-muted-foreground">
          {visibleEntries.length} cadastrados · {visibleMissing.length} logins novos nas bases
        </span>
      </div>
      {parsing && (
        <p className="flex gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Lendo e associando os cadastros…
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="quality-table">
          <thead>
            <tr>
              {fields.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              {editable && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(displayPage * 50, displayPage * 50 + 50).map((row) => (
              <tr key={row.login}>
                {fields.map(([key]) => (
                  <td key={key}>
                    {row[key] || (
                      <span className="text-amber-600 dark:text-amber-400">Não cadastrado</span>
                    )}
                  </td>
                ))}
                {editable && (
                  <td>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => edit(row, !entries.some((r) => r.login === row.login))}
                        aria-label={`Editar ${row.login}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {entries.some((r) => r.login === row.login) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={disabled}
                          aria-label={`Excluir ${row.login}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Excluir o cadastro de ${row.login}? Os registros de QQ/TC não serão apagados.`,
                              )
                            )
                              void onDelete(row.login).catch((error) => toast.error(error.message));
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="py-12 text-center text-muted-foreground">
            Nenhum login encontrado.{" "}
            {editable ? "Adicione um login ou importe os dois XLSX juntos." : ""}
          </p>
        )}
      </div>
      <Pagination page={displayPage} total={rows.length} onChange={setPage} />
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="quality-dialog">
          <DialogTitle>{original ? "Editar login" : "Adicionar login"}</DialogTitle>
          <DialogDescription>Associe o técnico à cidade, setor e supervisor.</DialogDescription>
          {editing && (
            <form onSubmit={saveForm} className="space-y-3">
              {fields.map(([key, label]) => (
                <label key={key} className="block text-sm">
                  {label}
                  <Input
                    required
                    maxLength={
                      key === "login" ? 100 : key === "city" || key === "sector" ? 150 : 250
                    }
                    value={editing[key]}
                    readOnly={key === "login" && !!original}
                    onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                  />
                </label>
              ))}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Salvando…" : "Salvar cadastro"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null);
        }}
      >
        <DialogContent className="quality-dialog max-w-6xl">
          <DialogTitle>Revisar importação de cadastros</DialogTitle>
          <DialogDescription>
            Associação pelo nome completo normalizado, sem aproximações. Campos existentes são
            preservados quando a planilha vem vazia. Linhas sem login não serão salvas; você pode
            preenchê-las aqui.
          </DialogDescription>
          {warnings.length > 0 && (
            <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
              {warnings.join(" ")}
            </p>
          )}
          <div className="max-h-[55vh] overflow-auto">
            <table className="quality-table">
              <thead>
                <tr>
                  {fields.map(([, label]) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview?.slice(previewPage * 50, previewPage * 50 + 50).map((row, offset) => {
                  const i = previewPage * 50 + offset;
                  return (
                    <tr key={i}>
                      {fields.map(([key, label]) => (
                        <td key={key}>
                          <Input
                            aria-label={`${label} linha ${i + 1}`}
                            className="min-w-32"
                            value={row[key]}
                            onChange={(e) =>
                              setPreview(
                                (current) =>
                                  current?.map((item, j) =>
                                    j === i ? { ...item, [key]: e.target.value } : item,
                                  ) ?? null,
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={previewPage} total={preview?.length ?? 0} onChange={setPreviewPage} />
          <div className="flex justify-between items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {preview?.filter((row) => row.login).length} com login ·{" "}
              {preview?.filter((row) => !row.login).length} sem login
            </span>
            <Button
              disabled={busy || !preview?.some((row) => row.login)}
              onClick={() => void savePreview()}
            >
              {busy ? "Salvando…" : "Salvar cadastros com login"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      <span>
        {total ? Math.min(page * 50 + 1, total) : 0}–{Math.min((page + 1) * 50, total)} de {total}
      </span>
      <Button size="sm" variant="outline" disabled={!page} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={(page + 1) * 50 >= total}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </Button>
    </div>
  );
}
