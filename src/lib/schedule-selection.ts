import type { SchedulePerson, ScheduleUpload } from "./types";
import { controlFullName } from "./schedule-control-names";

type Person = Pick<SchedulePerson, "name" | "login">;
type SelectionSchedule = Pick<ScheduleUpload, "id" | "city" | "sector" | "schedule_month"> & {
  payload: { people: readonly Person[] };
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
function uniquePeople(people: readonly Person[], key: (person: Person) => string) {
  const result = new Map<string, Person | null>();
  for (const person of people) {
    const value = key(person);
    if (value) result.set(value, result.has(value) ? null : person);
  }
  return result;
}

/** Reconcilia a seleção com o cadastro recarregado; não altera a escala. */
export function reconcileScheduleSelection(
  selected: readonly string[],
  previous: SelectionSchedule | null,
  next: SelectionSchedule | null,
): string[] {
  if (!next) return [];
  const people = next.payload.people;
  if (
    !previous ||
    previous.id !== next.id ||
    previous.city !== next.city ||
    previous.sector !== next.sector ||
    previous.schedule_month !== next.schedule_month
  ) {
    return people.map((person) => person.name);
  }
  // Uma seleção vazia feita pelo usuário continua vazia na mesma escala.
  if (!selected.length) return [];
  const oldNames = new Set(selected);
  if (
    previous.payload.people.length &&
    previous.payload.people.every((person) => oldNames.has(person.name))
  ) {
    // Equipe inteira selecionada antes do refresh continua sendo a equipe inteira,
    // inclusive se a sincronização completar todos os nomes ou incluir alguém.
    return people.map((person) => person.name);
  }
  const control = next.city === "natal" && next.sector === "controle-operacional";
  const nameKey = (name: string) => normalize(control ? controlFullName(name) : name);
  const nextNames = uniquePeople(people, (person) => nameKey(person.name));
  const previousNames = uniquePeople(previous.payload.people, (person) => nameKey(person.name));
  const loginKey = (person: Person) => normalize(person.login || "");
  const previousLogins = uniquePeople(previous.payload.people, loginKey);
  const nextLogins = uniquePeople(people, loginKey);
  const matches = new Set<string>();
  for (const name of selected) {
    const sameName = nextNames.get(nameKey(name));
    if (sameName) {
      matches.add(sameName.name);
      continue;
    }
    const oldPerson = previousNames.get(nameKey(name));
    const login = oldPerson && loginKey(oldPerson);
    if (!login || previousLogins.get(login) !== oldPerson) continue;
    const person = nextLogins.get(login);
    if (person) matches.add(person.name);
  }
  return people.filter((person) => matches.has(person.name)).map((person) => person.name);
}
