import { Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SchedulePerson } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SchedulePeoplePicker({
  people,
  selectedNames,
  search,
  onSearchChange,
  onSelectionChange,
}: {
  people: SchedulePerson[];
  selectedNames: string[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelectionChange: (names: string[]) => void;
}) {
  const multiple = selectedNames.length > 1;
  const selected = new Set(selectedNames);
  const allVisibleSelected =
    people.length > 0 && people.every((person) => selected.has(person.name));

  function toggle(name: string) {
    onSelectionChange(
      selected.has(name) ? selectedNames.filter((item) => item !== name) : [...selectedNames, name],
    );
  }

  return (
    <aside
      className={cn(
        "min-w-0 border-b border-border pb-4",
        !multiple && "lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4",
      )}
    >
      <div className={cn("grid gap-3", multiple && "lg:grid-cols-[1fr_320px] lg:items-center")}>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Users className="size-4 text-primary" /> Colaboradores
            <span
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
              aria-live="polite"
            >
              {selectedNames.length} selecionado(s)
            </span>
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Marque duas ou mais pessoas para comparar as escalas na tabela.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="person-search"
            aria-label="Buscar colaboradores por nome ou função"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nome ou função"
            className="pl-9"
          />
        </div>
      </div>
      <div className="my-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!people.length || allVisibleSelected}
          onClick={() =>
            onSelectionChange([
              ...new Set([...selectedNames, ...people.map((person) => person.name)]),
            ])
          }
        >
          {search.trim() ? "Selecionar encontrados" : "Selecionar todos"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!selectedNames.length}
          onClick={() => onSelectionChange([])}
        >
          Limpar seleção
        </Button>
      </div>
      <div
        role="group"
        aria-label="Seleção de colaboradores"
        className={cn(
          "grid gap-1 overflow-y-auto pr-1",
          multiple ? "max-h-44 sm:grid-cols-2 xl:grid-cols-3" : "max-h-[540px]",
        )}
      >
        {people.map((person) => (
          <label
            key={person.name}
            className={cn(
              "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-primary",
              selected.has(person.name)
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:bg-secondary/60",
            )}
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 cursor-pointer accent-primary"
              aria-label={`Selecionar ${person.name}`}
              checked={selected.has(person.name)}
              onChange={() => toggle(person.name)}
            />
            <span className="min-w-0">
              <b className="block truncate text-xs" title={person.name}>
                {person.name}
              </b>
              <small
                className="mt-0.5 block truncate text-[9px] text-muted-foreground"
                title={person.jobTitle}
              >
                {person.jobTitle || "Função não informada"}
              </small>
            </span>
          </label>
        ))}
        {people.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground sm:col-span-full">
            Nenhum colaborador encontrado. A busca não altera as pessoas selecionadas.
          </p>
        )}
      </div>
    </aside>
  );
}
