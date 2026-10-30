import type { SchedulePerson } from "./types";
import type { ScheduleGeneratedPreview } from "./schedule-generator";
import { normalizeScheduleEmployeeName as normalize } from "./schedule-generator-rules";

export type InheritedSchedulePerson = Pick<SchedulePerson, "name" | "login" | "assignments">;
type Continuity = Pick<ScheduleGeneratedPreview, "inheritedAssignments">;
/** Identity, not row number: Control has no login column and legacy IDs may repeat. */
export function inheritedSchedulePerson(preview: Continuity, person: SchedulePerson) {
  const rows = preview.inheritedAssignments || [];
  const named = rows.find((p) => normalize(p.name) === normalize(person.name));
  if (named) return named;
  const login = normalize(person.login || "");
  const matched = login ? rows.filter((p) => normalize(p.login || "") === login) : [];
  return matched.length === 1 ? matched[0] : undefined;
}
export function isInheritedScheduleDate(preview: Continuity, person: SchedulePerson, date: string) {
  return !!inheritedSchedulePerson(preview, person)?.assignments[date]?.trim();
}
export function scheduleContinuityIssues(preview: ScheduleGeneratedPreview): string[] {
  return (preview.inheritedAssignments || []).flatMap((original) => {
    const person = preview.payload.people.find(
      (p) => inheritedSchedulePerson(preview, p) === original,
    );
    if (!person) return [original.name + ": colaborador com dias herdados foi removido."];
    const index = preview.payload.people.indexOf(person);
    const codes = { ...preview.outsideAssignments[index], ...person.assignments };
    return Object.entries(original.assignments).flatMap(([date, code]) =>
      codes[date] === code
        ? []
        : [
            original.name +
              ": dia herdado " +
              date +
              " divergente da escala anterior; não pode ser alterado nesta competência.",
          ],
    );
  });
}
