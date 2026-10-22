import type { QualityRegistry } from "./quality";
import { normalizeLogin, validQualityName } from "./quality-directory";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

// Display metadata only. Never replace the logins used by the original SLA math.
export function resolveSlaTechnicians(value: string, registry: QualityRegistry) {
  const seen = new Set<string>();
  return String(value ?? "")
    .split(",")
    .map((login) => login.trim())
    .filter((login) => {
      const key = normalizeLogin(login);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((login) => {
      const person = registry[normalizeLogin(login)];
      return {
        login,
        name: validQualityName(person?.name, login),
        supervisor: String(person?.supervisor ?? "").trim(),
      };
    });
}

export function createSlaDirectoryPresentation(readRegistry: () => QualityRegistry) {
  const resolve = (value: string) => resolveSlaTechnicians(value, readRegistry());
  const known = (person: ReturnType<typeof resolve>[number]) =>
    !!(person.name || person.supervisor);
  const text = (value: string) => {
    const people = resolve(value);
    if (!people.some(known)) return String(value ?? "");
    return people
      .map((person) =>
        [
          person.name ? `${person.name} (${person.login})` : person.login,
          `Supervisor: ${person.supervisor || "Sem supervisor"}`,
        ].join(" · "),
      )
      .join("; ");
  };
  return {
    text,
    cell(value: string) {
      const people = resolve(value);
      if (!people.some(known)) return escape(String(value ?? ""));
      return people
        .map(
          (person) =>
            `<div class="sla-technician" data-login="${escape(person.login)}"><b>${escape(person.name || person.login)}</b>${person.name ? `<div class="muted">Login: ${escape(person.login)}</div>` : ""}<div class="muted">Supervisor: ${escape(person.supervisor || "Sem supervisor")}</div></div>`,
        )
        .join("");
    },
    chart<T extends { name: string }>(point: T) {
      const people = resolve(point.name);
      if (!people.some(known)) return point;
      const name = people.map((person) => person.name || person.login).join(", ");
      return {
        ...point,
        technicianLabel: text(point.name),
        axisName: name.length > 16 ? `${name.slice(0, 15)}…` : name,
        axisLogin: point.name.length > 16 ? `${point.name.slice(0, 15)}…` : point.name,
      };
    },
  };
}
