import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  Clock3,
  Database,
  ExternalLink,
  FileUp,
  Home,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { AppShell } from "@/components/AppShell";
import { QuarkLocationMap } from "@/components/QuarkLocationMap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import {
  buildLocationSummaries,
  buildOccurrences,
  currentClosingPeriod,
  distanceMeters,
  formatMinutes,
  mergeQuarkPeople,
  personKey,
  resolvePersonCity,
  resolvePersonSector,
  type QuarkDay,
  type QuarkDirectory,
  type QuarkHome,
  type QuarkPerson,
  type QuarkPersonView,
  type QuarkPunch,
  type QuarkSyncRun,
} from "@/lib/quark";
import { parseDirectoryWorkbook } from "@/lib/quark-directory-import";
import {
  deleteQuarkDirectory,
  deleteQuarkHome,
  fetchLastQuarkSync,
  fetchQuarkDays,
  fetchQuarkDirectories,
  fetchQuarkHomes,
  fetchQuarkPeople,
  fetchQuarkPunches,
  fetchQuarkPunchesForPerson,
  saveQuarkDirectories,
  saveQuarkDirectory,
  saveQuarkHome,
  syncQuark,
  syncQuarkLocations,
} from "@/services/quark";

export const Route = createFileRoute("/_app/admin/quark")({
  head: () => ({
    meta: [
      { title: "Quark | TechNET" },
      {
        name: "description",
        content: "Banco de horas, colaboradores, ocorrências e localizações da API Quark.",
      },
    ],
  }),
  component: () => (
    <AdminGate>
      <QuarkPage />
    </AdminGate>
  ),
});

type DirectoryForm = Pick<QuarkDirectory, "city" | "sector" | "supervisor">;
type BankRankingRow = {
  person: QuarkPersonView;
  latest: QuarkDay;
  balance: number;
  extras: number;
};
type HomeForm = {
  address: string;
  latitude: string;
  longitude: string;
  city: string;
  state: string;
  postal_code: string;
  neighborhood: string;
};

const EMPTY_DIRECTORY: DirectoryForm = { city: "", sector: "", supervisor: "" };
const EMPTY_HOME: HomeForm = {
  address: "",
  latitude: "",
  longitude: "",
  city: "",
  state: "",
  postal_code: "",
  neighborhood: "",
};

function localeDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function monthPeriod(value: string): { startDate: string; endDate: string } {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return { startDate: "", endDate: "" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${match[1]}-${match[2]}-01`,
    endDate: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`,
  };
}

function formatDistance(value: number | null): string {
  if (value === null) return "Sem referência";
  return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;
}

function formatHoursLong(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function syncStatus(run: QuarkSyncRun | null): string {
  if (!run) return "Nenhuma atualização realizada";
  if (run.status === "running") return "Atualização em andamento";
  if (run.status === "error") return "Última atualização falhou";
  return `Atualizado em ${new Date(run.completed_at ?? run.started_at).toLocaleString("pt-BR")}`;
}

function QuarkPage() {
  const { profile } = useAuth();
  const initialPeriod = useMemo(() => {
    // O Apps Script abre no ciclo da última informação disponível.
    // A partir do dia 26, o ciclo que acabou no dia 25 é o último fechado;
    // evita abrir automaticamente um período futuro (26 -> 25) ainda sem BH.
    const reference = new Date();
    if (reference.getDate() >= 26) reference.setDate(25);
    return currentClosingPeriod(reference);
  }, []);
  const [startDate, setStartDate] = useState(initialPeriod.startDate);
  const [endDate, setEndDate] = useState(initialPeriod.endDate);
  const [people, setPeople] = useState<QuarkPerson[]>([]);
  const [directories, setDirectories] = useState<QuarkDirectory[]>([]);
  const [homes, setHomes] = useState<QuarkHome[]>([]);
  const [days, setDays] = useState<QuarkDay[]>([]);
  const [punches, setPunches] = useState<QuarkPunch[]>([]);
  const [lastRun, setLastRun] = useState<QuarkSyncRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState("all");
  const [city, setCity] = useState("all");
  const [sector, setSector] = useState("all");
  const [supervisor, setSupervisor] = useState("all");
  const [directoryPerson, setDirectoryPerson] = useState<QuarkPersonView | null>(null);
  const [directoryForm, setDirectoryForm] = useState<DirectoryForm>(EMPTY_DIRECTORY);
  const [homePerson, setHomePerson] = useState<QuarkPersonView | null>(null);
  const [homeForm, setHomeForm] = useState<HomeForm>(EMPTY_HOME);
  const [saving, setSaving] = useState(false);
  const [homeRadiusMeters, setHomeRadiusMeters] = useState(200);
  const [nearHomeOnly, setNearHomeOnly] = useState(false);
  const [mapPerson, setMapPerson] = useState<QuarkPersonView | null>(null);
  const [mapMode, setMapMode] = useState<"day" | "month" | "period">("month");
  const [mapNearHomeOnly, setMapNearHomeOnly] = useState(false);
  const [mapDate, setMapDate] = useState(endDate);
  const [mapMonth, setMapMonth] = useState(endDate.slice(0, 7));
  const [syncingLocations, setSyncingLocations] = useState(false);
  const [directoryAddOpen, setDirectoryAddOpen] = useState(false);
  const [directoryCandidateKey, setDirectoryCandidateKey] = useState("");
  const [directoryImporting, setDirectoryImporting] = useState(false);
  const [directoryImportReport, setDirectoryImportReport] = useState("");
  const directoryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [homeAddOpen, setHomeAddOpen] = useState(false);
  const [homeCandidateKey, setHomeCandidateKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Faz uma chamada de diagnóstico primeiro. Se a tabela base estiver
      // indisponível no REST, evita disparar outras cinco requisições com erro.
      const nextPeople = await fetchQuarkPeople();
      const [nextDirectories, nextHomes, nextDays, nextPunches, nextRun] = await Promise.all([
        fetchQuarkDirectories(),
        fetchQuarkHomes(),
        fetchQuarkDays(startDate, endDate),
        fetchQuarkPunches(startDate, endDate),
        fetchLastQuarkSync(),
      ]);
      setPeople(nextPeople);
      setDirectories(nextDirectories);
      setHomes(nextHomes);
      setDays(nextDays);
      setPunches(nextPunches);
      setLastRun(nextRun);
    } catch (error) {
      console.error("[Quark] Falha ao carregar painel", error);
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Não foi possível carregar os dados.";
      toast.error(`Quark indisponível no Supabase: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const directoryKeys = useMemo(() => new Set(directories.map(personKey)), [directories]);
  const peopleView = useMemo(
    () => mergeQuarkPeople(people, directories, homes),
    [people, directories, homes],
  );
  const technicalPeople = useMemo(
    () => peopleView.filter((person) => person.directory !== null),
    [peopleView],
  );
  const directoryCandidates = useMemo(
    () =>
      peopleView
        .filter((person) => person.directory === null)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")),
    [peopleView],
  );
  const homeCandidates = useMemo(
    () =>
      technicalPeople
        .filter((person) => person.home === null)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")),
    [technicalPeople],
  );
  const units = useMemo(
    () => [
      ...new Map(
        technicalPeople.map((person) => [String(person.unit_id), person.unit_name]),
      ).entries(),
    ],
    [technicalPeople],
  );
  const cities = useMemo(
    () => [...new Set(technicalPeople.map(resolvePersonCity))].filter(Boolean).sort(),
    [technicalPeople],
  );
  const sectors = useMemo(
    () => [...new Set(technicalPeople.map(resolvePersonSector))].filter(Boolean).sort(),
    [technicalPeople],
  );
  const supervisors = useMemo(
    () =>
      [
        ...new Set(
          technicalPeople.map((person) => person.directory?.supervisor).filter(Boolean) as string[],
        ),
      ].sort(),
    [technicalPeople],
  );
  const filteredPeople = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return technicalPeople.filter((person) => {
      const matchesSearch =
        !query ||
        person.full_name.toLocaleLowerCase("pt-BR").includes(query) ||
        person.registration?.toLocaleLowerCase("pt-BR").includes(query) ||
        person.job_title?.toLocaleLowerCase("pt-BR").includes(query);
      return (
        matchesSearch &&
        (unit === "all" || String(person.unit_id) === unit) &&
        (city === "all" || resolvePersonCity(person) === city) &&
        (sector === "all" || resolvePersonSector(person) === sector) &&
        (supervisor === "all" || person.directory?.supervisor === supervisor)
      );
    });
  }, [technicalPeople, search, unit, city, sector, supervisor]);
  const directoryRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return filteredPeople;
    return peopleView.filter((person) => {
      const matchesSearch =
        person.full_name.toLocaleLowerCase("pt-BR").includes(query) ||
        person.registration?.toLocaleLowerCase("pt-BR").includes(query) ||
        person.job_title?.toLocaleLowerCase("pt-BR").includes(query);
      return (
        matchesSearch &&
        (unit === "all" || String(person.unit_id) === unit) &&
        (city === "all" || resolvePersonCity(person) === city) &&
        (sector === "all" || resolvePersonSector(person) === sector) &&
        (supervisor === "all" || person.directory?.supervisor === supervisor)
      );
    });
  }, [filteredPeople, peopleView, search, unit, city, sector, supervisor]);
  // Banco de horas, colaboradores e ocorrências não dependem de moradia.
  // Moradia é requisito apenas para comparação geográfica/localizações.
  const filteredKeys = useMemo(() => new Set(filteredPeople.map(personKey)), [filteredPeople]);
  const todayKey = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);
  const filteredDays = useMemo(
    () => days.filter((day) => filteredKeys.has(personKey(day)) && day.work_date <= todayKey),
    [days, filteredKeys, todayKey],
  );
  const filteredPunches = useMemo(
    () =>
      punches.filter((punch) => filteredKeys.has(personKey(punch)) && punch.work_date <= todayKey),
    [punches, filteredKeys, todayKey],
  );
  const locationPeople = useMemo(
    () => filteredPeople.filter((person) => person.home !== null),
    [filteredPeople],
  );
  const locationKeys = useMemo(() => new Set(locationPeople.map(personKey)), [locationPeople]);
  const locationPunches = useMemo(
    () => filteredPunches.filter((punch) => locationKeys.has(personKey(punch))),
    [filteredPunches, locationKeys],
  );
  const peopleByKey = useMemo(
    () => new Map(peopleView.map((person) => [personKey(person), person])),
    [peopleView],
  );
  const occurrences = useMemo(
    () => buildOccurrences(filteredPeople, filteredDays, filteredPunches),
    [filteredPeople, filteredDays, filteredPunches],
  );
  const latestDayByPerson = useMemo(() => {
    const map = new Map<string, QuarkDay>();
    for (const day of [...filteredDays].sort((a, b) => b.work_date.localeCompare(a.work_date))) {
      if (!map.has(personKey(day))) map.set(personKey(day), day);
    }
    return map;
  }, [filteredDays]);
  const extraByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of filteredDays) {
      const key = personKey(day);
      const extra = day.normal_extra_minutes + day.night_extra_minutes + day.extra_100_minutes;
      map.set(key, (map.get(key) ?? 0) + extra);
    }
    return map;
  }, [filteredDays]);
  const bankBalanceByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of filteredDays) {
      const key = personKey(day);
      map.set(key, (map.get(key) ?? 0) + day.bank_balance_minutes);
    }
    return map;
  }, [filteredDays]);
  const locationRows = useMemo(
    () =>
      locationPunches
        .filter((punch) => punch.latitude !== null && punch.longitude !== null)
        .map((punch) => {
          const person = peopleByKey.get(personKey(punch)) ?? null;
          const meters =
            person?.home && punch.latitude !== null && punch.longitude !== null
              ? distanceMeters(
                  punch.latitude,
                  punch.longitude,
                  person.home.latitude,
                  person.home.longitude,
                )
              : null;
          return { punch, person, meters };
        })
        .sort((a, b) =>
          `${b.punch.work_date} ${b.punch.punch_time ?? ""}`.localeCompare(
            `${a.punch.work_date} ${a.punch.punch_time ?? ""}`,
          ),
        ),
    [locationPunches, peopleByKey],
  );
  const locationSummaries = useMemo(
    () => buildLocationSummaries(locationPeople, locationPunches, homeRadiusMeters),
    [locationPeople, locationPunches, homeRadiusMeters],
  );
  const locationNearCount = locationSummaries.reduce((sum, item) => sum + item.nearHome, 0);
  const locationOutsideCount = locationSummaries.reduce((sum, item) => sum + item.outsideHome, 0);
  const locationNoReferenceCount = locationSummaries.reduce(
    (sum, item) => sum + item.noReference,
    0,
  );
  const visibleLocationSummaries = useMemo(
    () =>
      nearHomeOnly
        ? locationSummaries.filter((summary) => summary.nearHome > 0)
        : locationSummaries,
    [locationSummaries, nearHomeOnly],
  );
  const visibleLocationRows = useMemo(
    () =>
      nearHomeOnly
        ? locationRows.filter((row) => row.meters !== null && row.meters <= homeRadiusMeters)
        : locationRows,
    [locationRows, nearHomeOnly, homeRadiusMeters],
  );
  const mapRange = useMemo(() => {
    if (mapMode === "day") return { startDate: mapDate, endDate: mapDate };
    if (mapMode === "month") return monthPeriod(mapMonth);
    return { startDate, endDate };
  }, [mapMode, mapDate, mapMonth, startDate, endDate]);
  const mapPunches = useMemo(() => {
    if (!mapPerson || !mapRange.startDate || !mapRange.endDate) return [];
    return punches
      .filter(
        (punch) =>
          personKey(punch) === personKey(mapPerson) &&
          punch.work_date >= mapRange.startDate &&
          punch.work_date <= mapRange.endDate,
      )
      .sort((a, b) =>
        `${a.work_date} ${a.punch_time ?? ""}`.localeCompare(
          `${b.work_date} ${b.punch_time ?? ""}`,
        ),
      );
  }, [mapPerson, mapRange, punches]);
  const mapStats = useMemo(() => {
    let near = 0;
    let outside = 0;
    let noReference = 0;
    let distanceSum = 0;
    let distanceCount = 0;
    for (const punch of mapPunches) {
      if (!mapPerson?.home || punch.latitude === null || punch.longitude === null) {
        noReference += 1;
        continue;
      }
      const meters = distanceMeters(
        punch.latitude,
        punch.longitude,
        mapPerson.home.latitude,
        mapPerson.home.longitude,
      );
      distanceSum += meters;
      distanceCount += 1;
      if (meters <= homeRadiusMeters) near += 1;
      else outside += 1;
    }
    return {
      near,
      outside,
      noReference,
      average: distanceCount ? Math.round(distanceSum / distanceCount) : null,
    };
  }, [mapPunches, mapPerson, homeRadiusMeters]);
  const mapNearHomeDates = useMemo(() => {
    const dates = new Set<string>();
    if (!mapPerson?.home) return dates;
    for (const punch of mapPunches) {
      if (punch.latitude === null || punch.longitude === null) continue;
      const meters = distanceMeters(
        punch.latitude,
        punch.longitude,
        mapPerson.home.latitude,
        mapPerson.home.longitude,
      );
      if (meters <= homeRadiusMeters) dates.add(punch.work_date);
    }
    return dates;
  }, [mapPunches, mapPerson, homeRadiusMeters]);
  const visibleMapPunches = useMemo(
    () =>
      mapNearHomeOnly
        ? mapPunches.filter((punch) => mapNearHomeDates.has(punch.work_date))
        : mapPunches,
    [mapPunches, mapNearHomeOnly, mapNearHomeDates],
  );

  const bankRows = useMemo(
    () =>
      filteredPeople
        .map((person) => {
          const latest = latestDayByPerson.get(personKey(person));
          if (!latest) return null;
          return {
            person,
            latest,
            balance: bankBalanceByPerson.get(personKey(person)) ?? 0,
            extras: extraByPerson.get(personKey(person)) ?? 0,
          };
        })
        .filter((row): row is BankRankingRow => row !== null),
    [filteredPeople, latestDayByPerson, bankBalanceByPerson, extraByPerson],
  );
  const positiveBankRows = useMemo(
    () => bankRows.filter((row) => row.balance > 0).sort((a, b) => b.balance - a.balance),
    [bankRows],
  );
  const negativeBankRows = useMemo(
    () => bankRows.filter((row) => row.balance < 0).sort((a, b) => a.balance - b.balance),
    [bankRows],
  );
  const totalPositiveMinutes = positiveBankRows.reduce((sum, row) => sum + row.balance, 0);
  const totalNegativeMinutes = negativeBankRows.reduce((sum, row) => sum + row.balance, 0);
  const extraAlerts = occurrences.filter((item) => item.type === "extra").length;

  async function updateFromQuark() {
    setSyncing(true);
    try {
      await syncQuark(startDate, endDate);
      toast.success("Dados do Quark atualizados.");
      await load();
    } catch (error) {
      console.error("[Quark] Falha na sincronização", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o Quark.");
    } finally {
      setSyncing(false);
    }
  }

  function openLocationMap(person: QuarkPersonView) {
    const latest = punches
      .filter((punch) => personKey(punch) === personKey(person))
      .sort((a, b) =>
        `${b.work_date} ${b.punch_time ?? ""}`.localeCompare(
          `${a.work_date} ${a.punch_time ?? ""}`,
        ),
      )[0];
    const date = latest?.work_date ?? endDate;
    setMapDate(date);
    setMapMonth(date.slice(0, 7));
    setMapMode("month");
    setMapNearHomeOnly(false);
    setMapPerson(person);
  }

  async function updateMapLocations() {
    if (!mapPerson || !mapRange.startDate || !mapRange.endDate) return;
    setSyncingLocations(true);
    try {
      await syncQuarkLocations(
        mapPerson.unit_id,
        mapPerson.collaborator_id,
        mapRange.startDate,
        mapRange.endDate,
      );
      const refreshed = await fetchQuarkPunchesForPerson(
        mapPerson.unit_id,
        mapPerson.collaborator_id,
        mapRange.startDate,
        mapRange.endDate,
      );
      setPunches((current) => [
        ...current.filter(
          (punch) =>
            !(
              personKey(punch) === personKey(mapPerson) &&
              punch.work_date >= mapRange.startDate &&
              punch.work_date <= mapRange.endDate
            ),
        ),
        ...refreshed,
      ]);
      toast.success(`${refreshed.length} batida(s) de localização atualizadas.`);
    } catch (error) {
      console.error("[Quark] Falha ao atualizar localizações", error);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível consultar as localizações.",
      );
    } finally {
      setSyncingLocations(false);
    }
  }

  async function importDirectoryWorkbook(file: File) {
    if (!profile) return;
    setDirectoryImporting(true);
    try {
      const result = await parseDirectoryWorkbook(file, people, profile.id);
      if (!result.rows.length) {
        throw new Error("Nenhum colaborador da planilha foi associado ao cadastro atual do Quark.");
      }

      await saveQuarkDirectories(result.rows);
      setDirectories(await fetchQuarkDirectories());

      const report = [
        `${result.rows.length} associado(s)`,
        result.unmatched.length ? `${result.unmatched.length} não encontrado(s) no Quark` : "",
        result.ambiguous.length ? `${result.ambiguous.length} nome(s) ambíguo(s)` : "",
        result.invalid.length ? `${result.invalid.length} linha(s) inválida(s)` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      setDirectoryImportReport(report);
      toast.success(`Base técnica importada: ${result.rows.length} colaborador(es).`);
      if (result.unmatched.length || result.ambiguous.length || result.invalid.length) {
        toast.warning("A importação terminou com pendências. Veja o resumo em Supervisores.");
      }
    } catch (error) {
      console.error("[Quark] Falha ao importar dados.xlsx", error);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível importar a base técnica.",
      );
    } finally {
      setDirectoryImporting(false);
      if (directoryFileInputRef.current) directoryFileInputRef.current.value = "";
    }
  }

  function openDirectory(person: QuarkPersonView) {
    setDirectoryPerson(person);
    setDirectoryForm(
      person.directory
        ? {
            city: person.directory.city,
            sector: person.directory.sector,
            supervisor: person.directory.supervisor,
          }
        : {
            city: person.unit_city,
            sector: person.api_sector ?? "",
            supervisor: "",
          },
    );
  }

  function openHome(person: QuarkPersonView) {
    setHomePerson(person);
    setHomeForm(
      person.home
        ? {
            address: person.home.address,
            latitude: String(person.home.latitude),
            longitude: String(person.home.longitude),
            city: person.home.city,
            state: person.home.state,
            postal_code: person.home.postal_code,
            neighborhood: person.home.neighborhood,
          }
        : { ...EMPTY_HOME, city: resolvePersonCity(person) },
    );
  }

  function beginAddDirectory() {
    setDirectoryCandidateKey(directoryCandidates[0] ? personKey(directoryCandidates[0]) : "");
    setDirectoryAddOpen(true);
  }

  function continueAddDirectory() {
    const person = directoryCandidates.find((item) => personKey(item) === directoryCandidateKey);
    if (!person) {
      toast.error("Selecione um colaborador.");
      return;
    }
    setDirectoryAddOpen(false);
    openDirectory(person);
  }

  function beginAddHome() {
    setHomeCandidateKey(homeCandidates[0] ? personKey(homeCandidates[0]) : "");
    setHomeAddOpen(true);
  }

  function continueAddHome() {
    const person = homeCandidates.find((item) => personKey(item) === homeCandidateKey);
    if (!person) {
      toast.error("Selecione um colaborador.");
      return;
    }
    setHomeAddOpen(false);
    openHome(person);
  }

  async function submitDirectory() {
    if (
      !directoryPerson ||
      !profile ||
      !directoryForm.city.trim() ||
      !directoryForm.sector.trim() ||
      !directoryForm.supervisor.trim()
    ) {
      toast.error("Preencha cidade, setor e supervisor.");
      return;
    }
    setSaving(true);
    try {
      await saveQuarkDirectory({
        unit_id: directoryPerson.unit_id,
        collaborator_id: directoryPerson.collaborator_id,
        city: directoryForm.city.trim(),
        sector: directoryForm.sector.trim(),
        supervisor: directoryForm.supervisor.trim(),
        updated_by: profile.id,
      });
      const now = new Date().toISOString();
      const saved: QuarkDirectory = {
        unit_id: directoryPerson.unit_id,
        collaborator_id: directoryPerson.collaborator_id,
        city: directoryForm.city.trim(),
        sector: directoryForm.sector.trim(),
        supervisor: directoryForm.supervisor.trim(),
        updated_by: profile.id,
        created_at: directoryPerson.directory?.created_at ?? now,
        updated_at: now,
      };
      setDirectories((current) => [
        ...current.filter((row) => personKey(row) !== personKey(saved)),
        saved,
      ]);
      toast.success("Associação atualizada.");
      setDirectoryPerson(null);
    } catch {
      toast.error("Não foi possível salvar a associação.");
    } finally {
      setSaving(false);
    }
  }

  async function submitHome() {
    const latitude = Number(homeForm.latitude.replace(",", "."));
    const longitude = Number(homeForm.longitude.replace(",", "."));
    if (
      !homePerson ||
      !profile ||
      !homeForm.address.trim() ||
      !homeForm.city.trim() ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      toast.error("Preencha endereço, cidade e coordenadas válidas.");
      return;
    }
    setSaving(true);
    try {
      await saveQuarkHome({
        unit_id: homePerson.unit_id,
        collaborator_id: homePerson.collaborator_id,
        address: homeForm.address.trim(),
        latitude,
        longitude,
        city: homeForm.city.trim(),
        state: homeForm.state.trim(),
        postal_code: homeForm.postal_code.trim(),
        neighborhood: homeForm.neighborhood.trim(),
        updated_by: profile.id,
      });
      const now = new Date().toISOString();
      const saved: QuarkHome = {
        unit_id: homePerson.unit_id,
        collaborator_id: homePerson.collaborator_id,
        address: homeForm.address.trim(),
        latitude,
        longitude,
        city: homeForm.city.trim(),
        state: homeForm.state.trim(),
        postal_code: homeForm.postal_code.trim(),
        neighborhood: homeForm.neighborhood.trim(),
        updated_by: profile.id,
        created_at: homePerson.home?.created_at ?? now,
        updated_at: now,
      };
      setHomes((current) => [
        ...current.filter((row) => personKey(row) !== personKey(saved)),
        saved,
      ]);
      toast.success("Moradia atualizada.");
      setHomePerson(null);
    } catch {
      toast.error("Não foi possível salvar a moradia.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDirectory(person: QuarkPersonView) {
    if (!person.directory || !window.confirm(`Remover a associação de ${person.full_name}?`))
      return;
    try {
      await deleteQuarkDirectory(person.unit_id, person.collaborator_id);
      setDirectories((current) => current.filter((row) => personKey(row) !== personKey(person)));
      toast.success("Associação removida.");
    } catch {
      toast.error("Não foi possível remover a associação.");
    }
  }

  async function removeHome(person: QuarkPersonView) {
    if (!person.home || !window.confirm(`Remover a moradia de ${person.full_name}?`)) return;
    try {
      await deleteQuarkHome(person.unit_id, person.collaborator_id);
      setHomes((current) => current.filter((row) => personKey(row) !== personKey(person)));
      toast.success("Moradia removida.");
    } catch {
      toast.error("Não foi possível remover a moradia.");
    }
  }

  return (
    <AppShell areaColor="#e72c3a">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
            Controle operacional
          </span>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black">
            <Database className="size-6 text-primary" /> Quark
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Banco de horas, ocorrências e pontos da equipe técnica. Cidade, setor e supervisor usam
            a base enviada; moradia é necessária somente para os cálculos de localização.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="quark-start">Início</Label>
            <Input
              id="quark-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="quark-end">Fim</Label>
            <Input
              id="quark-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <Button onClick={updateFromQuark} disabled={syncing || loading || !startDate || !endDate}>
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {syncing ? "Atualizando..." : "Atualizar dados"}
          </Button>
        </div>
      </header>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`size-2 rounded-full ${lastRun?.status === "error" ? "bg-destructive" : lastRun?.status === "running" ? "bg-warning" : "bg-success"}`}
          />
          <b>{syncStatus(lastRun)}</b>
          {lastRun && (
            <span className="text-muted-foreground">
              · período {localeDate(lastRun.period_start)} a {localeDate(lastRun.period_end)}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          Ciclo sugerido: dia 26 ao dia 25 · máximo de 60 dias
        </span>
      </section>

      <section className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card md:grid-cols-2 xl:grid-cols-5">
        <div className="grid gap-1.5 xl:col-span-2">
          <Label htmlFor="quark-search">Colaborador</Label>
          <Input
            id="quark-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, matrícula ou função"
          />
        </div>
        <FilterSelect
          label="Unidade"
          value={unit}
          onChange={setUnit}
          options={units.map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          label="Cidade"
          value={city}
          onChange={setCity}
          options={cities.map((value) => ({ value, label: value }))}
        />
        <FilterSelect
          label="Setor"
          value={sector}
          onChange={setSector}
          options={sectors.map((value) => ({ value, label: value }))}
        />
        <FilterSelect
          label="Supervisor"
          value={supervisor}
          onChange={setSupervisor}
          options={supervisors.map((value) => ({ value, label: value }))}
        />
      </section>

      {loading ? (
        <div className="grid min-h-[320px] place-items-center rounded-2xl border border-border bg-card">
          <div className="text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Carregando dados do Quark...</p>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="hours" className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-card p-2 shadow-card">
            <TabsTrigger value="hours">
              <Clock3 className="mr-1.5 size-3.5" /> Banco de horas
            </TabsTrigger>
            <TabsTrigger value="people">
              <Users className="mr-1.5 size-3.5" /> Colaboradores
            </TabsTrigger>
            <TabsTrigger value="occurrences">
              <AlertTriangle className="mr-1.5 size-3.5" /> Ocorrências
            </TabsTrigger>
            <TabsTrigger value="locations">
              <MapPin className="mr-1.5 size-3.5" /> Localizações
            </TabsTrigger>
            <TabsTrigger value="directory">
              <UserRoundCheck className="mr-1.5 size-3.5" /> Supervisores
            </TabsTrigger>
            <TabsTrigger value="homes">
              <Home className="mr-1.5 size-3.5" /> Moradia
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hours" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HoursMetricCard
                label="Horas positivas"
                value={formatHoursLong(totalPositiveMinutes)}
                subtitle="Soma dos saldos positivos no período"
                icon={Clock3}
              />
              <HoursMetricCard
                label="Horas negativas"
                value={formatHoursLong(totalNegativeMinutes)}
                subtitle="Soma dos saldos negativos no período"
                icon={Clock3}
                emphasis="danger"
              />
              <HoursMetricCard
                label="Alertas acima de 2h/dia"
                value={String(extraAlerts)}
                subtitle="Ocorrências que pedem atenção"
                icon={AlertTriangle}
                emphasis="danger"
              />
              <HoursMetricCard
                label="Colaboradores analisados"
                value={String(bankRows.length)}
                subtitle={`${filteredDays.length.toLocaleString("pt-BR")} registros válidos no período`}
                icon={Users}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <BankRankingPanel
                title="Maiores saldos positivos"
                hint=">20h alerta · >40h crítico"
                rows={positiveBankRows.slice(0, 10)}
                startDate={startDate}
                endDate={endDate}
                kind="positive"
              />
              <BankRankingPanel
                title="Maiores saldos negativos"
                hint="Ordenado do menor saldo"
                rows={negativeBankRows.slice(0, 10)}
                startDate={startDate}
                endDate={endDate}
                kind="negative"
              />
            </div>

            <Panel
              title="Banco de horas por colaborador"
              subtitle={`Colaboradores da área técnica associados pela base de supervisão, com ou sem moradia. O saldo é a soma das movimentações do banco entre ${localeDate(startDate)} e ${localeDate(endDate)}.`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Cidade / setor</TableHead>
                    <TableHead>Último dia</TableHead>
                    <TableHead>Saldo no período</TableHead>
                    <TableHead>Extras no período</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankRows.map(({ person, latest, balance, extras }) => (
                    <TableRow key={personKey(person)}>
                      <TableCell>
                        <b>{person.full_name}</b>
                        <small className="block text-muted-foreground">
                          {person.job_title ?? "Sem função"}
                        </small>
                      </TableCell>
                      <TableCell>
                        {resolvePersonCity(person)}
                        <small className="block text-muted-foreground">
                          {resolvePersonSector(person)}
                        </small>
                      </TableCell>
                      <TableCell>{localeDate(latest.work_date)}</TableCell>
                      <TableCell>
                        <Balance value={balance} />
                      </TableCell>
                      <TableCell className="font-semibold">{formatMinutes(extras)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!bankRows.length && (
                <Empty text="Nenhum colaborador técnico com moradia e registros no período." />
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="people">
            <KpiGrid
              items={[
                ["Associados técnicos", technicalPeople.length],
                ["Cadastro Quark", peopleView.length],
                ["Exibidos no filtro", filteredPeople.length],
                ["Com moradia", filteredPeople.filter((person) => person.home !== null).length],
              ]}
            />
            <Panel
              title="Colaboradores técnicos"
              subtitle="Cidade, setor e supervisor são associações protegidas salvas no Supabase. A base pode ser atualizada pela importação do dados.xlsx na aba Supervisores."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPeople.map((person) => (
                    <TableRow key={personKey(person)}>
                      <TableCell className="font-semibold">{person.full_name}</TableCell>
                      <TableCell>{person.registration ?? "—"}</TableCell>
                      <TableCell>{person.job_title ?? "—"}</TableCell>
                      <TableCell>{person.unit_name}</TableCell>
                      <TableCell>{resolvePersonCity(person)}</TableCell>
                      <TableCell>{resolvePersonSector(person)}</TableCell>
                      <TableCell>
                        <Status active={person.is_active} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!filteredPeople.length && <Empty text="Nenhum colaborador encontrado." />}
            </Panel>
          </TabsContent>

          <TabsContent value="occurrences">
            <KpiGrid
              items={[
                ["Ocorrências", occurrences.length],
                ["Ausências", occurrences.filter((item) => item.type === "absence").length],
                [
                  "Batidas incompletas",
                  occurrences.filter((item) => item.type === "incomplete").length,
                ],
                [
                  "Intervalos curtos",
                  occurrences.filter((item) => item.type === "short-break").length,
                ],
              ]}
            />
            <Panel
              title="Ocorrências do período"
              subtitle="Ausências, atrasos, batidas incompletas, intervalos curtos e excesso de hora extra."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead>Ocorrência</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {occurrences.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>{localeDate(item.date)}</TableCell>
                      <TableCell>
                        <b>{item.person.full_name}</b>
                        <small className="block text-muted-foreground">
                          {resolvePersonSector(item.person)}
                        </small>
                      </TableCell>
                      <TableCell>{item.person.directory?.supervisor ?? "Não associado"}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-late-soft px-2 py-1 text-[10px] font-bold text-late-foreground">
                          {item.label}
                        </span>
                      </TableCell>
                      <TableCell>{item.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!occurrences.length && <Empty text="Nenhuma ocorrência encontrada no período." />}
            </Panel>
          </TabsContent>

          <TabsContent value="locations" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">
                  Raio da moradia
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  A mesma regra do painel do Sheets, aplicada às coordenadas gravadas no Supabase.
                </p>
              </div>
              <div className="w-full sm:w-48">
                <Label>Distância considerada próxima</Label>
                <Select
                  value={String(homeRadiusMeters)}
                  onValueChange={(value) => setHomeRadiusMeters(Number(value))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[100, 200, 300, 500, 1000, 2000].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value >= 1000 ? `${value / 1000} km` : `${value} metros`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <KpiGrid
              items={[
                ["Batidas analisadas", filteredPunches.length],
                ["Colaboradores", locationSummaries.length],
                ["Próximas da moradia", locationNearCount],
                ["Fora do raio", locationOutsideCount],
              ]}
              clickableItems={["Próximas da moradia"]}
              activeItem={nearHomeOnly ? "Próximas da moradia" : null}
              onItemClick={(label) => {
                if (label === "Próximas da moradia") {
                  setNearHomeOnly((current) => !current);
                }
              }}
            />

            <Panel
              title="Resumo da equipe"
              subtitle={
                nearHomeOnly
                  ? `Filtro ativo: somente colaboradores com batidas próximas da moradia. Clique novamente no KPI para remover. ${visibleLocationSummaries.length} colaborador(es) exibido(s).`
                  : `Clique em Mapa para abrir as batidas diárias ou mensais. ${locationNoReferenceCount} registro(s) estão sem referência de moradia/coordenada.`
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Unidade / setor</TableHead>
                    <TableHead>Moradia cadastrada</TableHead>
                    <TableHead>Batidas</TableHead>
                    <TableHead>Próximas</TableHead>
                    <TableHead>Fora</TableHead>
                    <TableHead>Distância média</TableHead>
                    <TableHead>Local mais frequente</TableHead>
                    <TableHead className="text-right">Mapa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLocationSummaries.map((summary) => (
                    <TableRow key={personKey(summary.person)}>
                      <TableCell>
                        <b>{summary.person.full_name}</b>
                        <small className="block text-muted-foreground">
                          {summary.person.directory?.supervisor ?? "Sem supervisor"}
                        </small>
                      </TableCell>
                      <TableCell>
                        {summary.person.unit_name}
                        <small className="block text-muted-foreground">
                          {resolvePersonSector(summary.person)}
                        </small>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        {summary.person.home?.address ?? (
                          <span className="text-warning-foreground">Não cadastrada</span>
                        )}
                      </TableCell>
                      <TableCell className="font-black">{summary.punches}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-success-soft px-2 py-1 text-[10px] font-black text-success-foreground">
                          {summary.nearHome}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-late-soft px-2 py-1 text-[10px] font-black text-late-foreground">
                          {summary.outsideHome}
                        </span>
                      </TableCell>
                      <TableCell>{formatDistance(summary.averageDistanceMeters)}</TableCell>
                      <TableCell className="max-w-[280px]">
                        {summary.mainLocation || "Não informado"}
                        {summary.mainLocationCount > 0 && (
                          <small className="block text-muted-foreground">
                            {summary.mainLocationCount} batida(s)
                          </small>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLocationMap(summary.person)}
                        >
                          <MapPin className="size-3.5" /> Mapa
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!visibleLocationSummaries.length && (
                <Empty
                  text={
                    nearHomeOnly
                      ? "Nenhum colaborador possui batida próxima da moradia neste período."
                      : "Nenhuma batida encontrada no período selecionado."
                  }
                />
              )}
            </Panel>

            <Panel
              title="Últimas batidas com coordenada"
              subtitle={
                nearHomeOnly
                  ? `Mostrando somente batidas a até ${homeRadiusMeters} m da moradia.`
                  : "Amostra dos 300 registros mais recentes do filtro atual."
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data / hora</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Distância da moradia</TableHead>
                    <TableHead>Mapa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLocationRows.slice(0, 300).map(({ punch, person, meters }) => (
                    <TableRow key={punch.point_id}>
                      <TableCell>
                        {localeDate(punch.work_date)}
                        <small className="block text-muted-foreground">
                          {punch.punch_time?.slice(0, 5) ?? "—"}
                        </small>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {person?.full_name ?? punch.collaborator_id}
                      </TableCell>
                      <TableCell>{punch.location ?? "Coordenada informada"}</TableCell>
                      <TableCell>{formatDistance(meters)}</TableCell>
                      <TableCell>
                        <a
                          className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                          href={`https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir <ExternalLink className="size-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!visibleLocationRows.length && (
                <Empty
                  text={
                    nearHomeOnly
                      ? "Nenhuma batida próxima da moradia neste período."
                      : "Nenhuma batida com coordenadas neste período."
                  }
                />
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="directory" className="space-y-4">
            <KpiGrid
              items={[
                ["Com supervisor", technicalPeople.length],
                ["Sem associação", directoryCandidates.length],
                ["Cadastro Quark", peopleView.length],
                ["Com moradia", technicalPeople.filter((person) => person.home !== null).length],
              ]}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
              <div>
                <b className="text-sm">Base técnica protegida</b>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Importe o dados.xlsx aqui. Os nomes e relações são gravados no Supabase com RLS e
                  não ficam dentro do código público do site ou do GitHub.
                </p>
                {directoryImportReport && (
                  <p className="mt-2 text-[10px] font-semibold text-primary">
                    {directoryImportReport}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={directoryFileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importDirectoryWorkbook(file);
                  }}
                />
                <Button
                  variant="outline"
                  disabled={directoryImporting || !people.length}
                  onClick={() => directoryFileInputRef.current?.click()}
                >
                  {directoryImporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileUp className="size-4" />
                  )}
                  {directoryImporting ? "Importando..." : "Importar dados.xlsx"}
                </Button>
                <Button onClick={beginAddDirectory} disabled={!directoryCandidates.length}>
                  <Plus className="size-4" /> Adicionar colaborador
                </Button>
              </div>
            </div>
            <Panel
              title="Supervisores, cidades e setores"
              subtitle="As associações abaixo estão salvas no Supabase e são visíveis somente para a gestão. Atualizar dados sincroniza o cadastro do Quark; a planilha define cidade, setor e supervisor."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directoryRows.map((person) => (
                    <TableRow key={personKey(person)}>
                      <TableCell>
                        <b>{person.full_name}</b>
                        <small className="block text-muted-foreground">{person.unit_name}</small>
                      </TableCell>
                      <TableCell>{resolvePersonCity(person)}</TableCell>
                      <TableCell>{resolvePersonSector(person)}</TableCell>
                      <TableCell>
                        {person.directory?.supervisor ?? (
                          <span className="text-warning-foreground">Não associado</span>
                        )}
                        {person.directory && (
                          <small className="block text-muted-foreground">
                            Associação protegida
                          </small>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => openDirectory(person)}>
                            <Pencil className="size-3.5" /> Editar
                          </Button>
                          {directoryKeys.has(personKey(person)) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remover associação"
                              title="Remover associação técnica"
                              onClick={() => removeDirectory(person)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!directoryRows.length && (
                <Empty text="Nenhuma associação técnica encontrada. Importe o dados.xlsx ou adicione um colaborador." />
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="homes" className="space-y-4">
            <KpiGrid
              items={[
                ["Equipe técnica", technicalPeople.length],
                [
                  "Com moradia cadastrada",
                  technicalPeople.filter((person) => person.home !== null).length,
                ],
                ["Sem moradia", homeCandidates.length],
                [
                  "Com moradia no filtro",
                  filteredPeople.filter((person) => person.home !== null).length,
                ],
              ]}
            />
            <div className="flex justify-end">
              <Button onClick={beginAddHome} disabled={!homeCandidates.length}>
                <Plus className="size-4" /> Adicionar moradia
              </Button>
            </div>
            <Panel
              title="Moradia"
              subtitle="A base inicial de moradias já foi importada da planilha enviada. Use Adicionar moradia para cadastrar quem ainda não possui referência; a API Quark não sobrescreve esses dados."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead>Cidade / bairro</TableHead>
                    <TableHead>Coordenadas</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPeople.map((person) => (
                    <TableRow key={personKey(person)}>
                      <TableCell className="font-semibold">{person.full_name}</TableCell>
                      <TableCell>
                        {person.home?.address ?? (
                          <span className="text-warning-foreground">Não cadastrada</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {person.home
                          ? `${person.home.city}${person.home.neighborhood ? ` · ${person.home.neighborhood}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {person.home ? `${person.home.latitude}, ${person.home.longitude}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => openHome(person)}>
                            {person.home ? (
                              <Pencil className="size-3.5" />
                            ) : (
                              <Plus className="size-3.5" />
                            )}
                            {person.home ? "Editar" : "Adicionar"}
                          </Button>
                          {person.home && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remover moradia"
                              onClick={() => removeHome(person)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>
        </Tabs>
      )}

      <Dialog
        open={directoryAddOpen}
        onOpenChange={(open) => {
          setDirectoryAddOpen(open);
          if (!open) setDirectoryCandidateKey("");
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adicionar colaborador técnico</DialogTitle>
            <DialogDescription>
              Escolha um colaborador existente no Quark que ainda não esteja associado à equipe
              técnica. Depois informe cidade, setor e supervisor.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Colaborador</Label>
            <Select value={directoryCandidateKey} onValueChange={setDirectoryCandidateKey}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um colaborador" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {directoryCandidates.map((person) => (
                  <SelectItem key={personKey(person)} value={personKey(person)}>
                    {person.full_name} · {person.unit_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!directoryCandidates.length && (
              <p className="text-xs text-muted-foreground">
                Todos os colaboradores disponíveis no Quark já possuem associação técnica.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDirectoryAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={continueAddDirectory}
              disabled={!directoryCandidateKey || !directoryCandidates.length}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={homeAddOpen}
        onOpenChange={(open) => {
          setHomeAddOpen(open);
          if (!open) setHomeCandidateKey("");
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adicionar moradia</DialogTitle>
            <DialogDescription>
              Escolha um colaborador da equipe técnica que ainda não possui moradia cadastrada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Colaborador</Label>
            <Select value={homeCandidateKey} onValueChange={setHomeCandidateKey}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um colaborador" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {homeCandidates.map((person) => (
                  <SelectItem key={personKey(person)} value={personKey(person)}>
                    {person.full_name} · {resolvePersonCity(person)} · {resolvePersonSector(person)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!homeCandidates.length && (
              <p className="text-xs text-muted-foreground">
                Todos os colaboradores técnicos já possuem moradia cadastrada.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHomeAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={continueAddHome}
              disabled={!homeCandidateKey || !homeCandidates.length}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(mapPerson)} onOpenChange={(open) => !open && setMapPerson(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="size-5 text-primary" /> Mapa de batidas
            </DialogTitle>
            <DialogDescription>
              {mapPerson?.full_name} · compare cada ponto com a moradia cadastrada.
            </DialogDescription>
          </DialogHeader>

          {mapPerson && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-border bg-secondary/30 p-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="grid gap-1.5">
                  <Label>Visualização</Label>
                  <Select
                    value={mapMode}
                    onValueChange={(value) => setMapMode(value as "day" | "month" | "period")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Dia</SelectItem>
                      <SelectItem value="month">Mês</SelectItem>
                      <SelectItem value="period">Período do painel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mapMode === "day" ? (
                  <div className="grid gap-1.5">
                    <Label>Dia</Label>
                    <Input
                      type="date"
                      value={mapDate}
                      onChange={(event) => setMapDate(event.target.value)}
                    />
                  </div>
                ) : mapMode === "month" ? (
                  <div className="grid gap-1.5">
                    <Label>Mês</Label>
                    <Input
                      type="month"
                      value={mapMonth}
                      onChange={(event) => setMapMonth(event.target.value)}
                    />
                  </div>
                ) : (
                  <div className="grid gap-1.5">
                    <Label>Período</Label>
                    <div className="flex min-h-10 items-center rounded-md border border-input bg-background px-3 text-xs">
                      {localeDate(startDate)} a {localeDate(endDate)}
                    </div>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label>Raio da moradia</Label>
                  <Select
                    value={String(homeRadiusMeters)}
                    onValueChange={(value) => setHomeRadiusMeters(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[100, 200, 300, 500, 1000, 2000].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value >= 1000 ? `${value / 1000} km` : `${value} m`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5 md:col-span-2 xl:col-span-1">
                  <Label>Fonte</Label>
                  <Button
                    onClick={() => void updateMapLocations()}
                    disabled={syncingLocations || !mapRange.startDate || !mapRange.endDate}
                  >
                    {syncingLocations ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    {syncingLocations ? "Consultando..." : "Atualizar pela API"}
                  </Button>
                </div>
              </div>

              {!mapPerson.home && (
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs">
                  Este colaborador ainda não possui moradia cadastrada. O mapa exibirá as batidas,
                  mas a distância e o raio só serão calculados depois do cadastro/importação.
                </div>
              )}

              <KpiGrid
                items={[
                  ["Batidas", mapPunches.length],
                  ["Próximas", mapStats.near],
                  ["Fora do raio", mapStats.outside],
                  ["Sem referência", mapStats.noReference],
                ]}
                clickableItems={["Próximas"]}
                activeItem={mapNearHomeOnly ? "Próximas" : null}
                onItemClick={(label) => {
                  if (label === "Próximas") {
                    setMapNearHomeOnly((current) => !current);
                  }
                }}
              />

              {mapNearHomeOnly && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Filtro ativo: exibindo somente os {mapNearHomeDates.size} dia(s) em que houve pelo
                  menos uma batida a até {homeRadiusMeters} m da moradia. Clique em
                  <b className="mx-1 text-foreground">Próximas</b>
                  novamente para voltar ao mês completo.
                </div>
              )}

              <QuarkLocationMap
                person={mapPerson}
                punches={visibleMapPunches}
                radiusMeters={homeRadiusMeters}
              />

              <div className="flex flex-wrap gap-2 text-[10px]">
                <span className="rounded-full border border-border bg-card px-3 py-1.5">
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-slate-950" />
                  Moradia
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1.5">
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-600" />
                  Até {homeRadiusMeters} m
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1.5">
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-primary" />
                  Fora do raio
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1.5">
                  Distância média: {formatDistance(mapStats.average)}
                </span>
              </div>

              <div className="rounded-xl border border-border">
                <div className="border-b border-border px-4 py-3">
                  <b className="text-xs">Batidas exibidas no mapa</b>
                  <p className="text-[10px] text-muted-foreground">
                    {mapNearHomeOnly
                      ? `${mapNearHomeDates.size} dia(s) com batida próxima da moradia · ${visibleMapPunches.length} batida(s) exibida(s)`
                      : mapRange.startDate && mapRange.endDate
                        ? `${localeDate(mapRange.startDate)} a ${localeDate(mapRange.endDate)}`
                        : "Selecione um período válido."}
                  </p>
                </div>
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Data / hora</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Distância</TableHead>
                        <TableHead>Coordenadas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleMapPunches.map((punch, index) => {
                        const meters =
                          mapPerson.home && punch.latitude !== null && punch.longitude !== null
                            ? distanceMeters(
                                punch.latitude,
                                punch.longitude,
                                mapPerson.home.latitude,
                                mapPerson.home.longitude,
                              )
                            : null;
                        return (
                          <TableRow key={punch.point_id}>
                            <TableCell className="font-black">{index + 1}</TableCell>
                            <TableCell>
                              {localeDate(punch.work_date)}
                              <small className="block text-muted-foreground">
                                {punch.punch_time?.slice(0, 5) ?? "—"}
                              </small>
                            </TableCell>
                            <TableCell>{punch.location ?? "Local não informado"}</TableCell>
                            <TableCell>
                              <span
                                className={
                                  meters !== null && meters <= homeRadiusMeters
                                    ? "font-bold text-success-foreground"
                                    : meters !== null
                                      ? "font-bold text-late-foreground"
                                      : "text-muted-foreground"
                                }
                              >
                                {formatDistance(meters)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {punch.latitude !== null && punch.longitude !== null ? (
                                <a
                                  className="font-bold text-primary hover:underline"
                                  href={`https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {punch.latitude.toFixed(6)}, {punch.longitude.toFixed(6)}
                                </a>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {!visibleMapPunches.length && (
                    <Empty
                      text={
                        mapNearHomeOnly
                          ? "Nenhum dia com batida próxima da moradia neste recorte."
                          : "Nenhuma batida carregada para este recorte. Use Atualizar pela API."
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(directoryPerson)}
        onOpenChange={(open) => !open && setDirectoryPerson(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {directoryPerson && directoryKeys.has(personKey(directoryPerson))
                ? "Editar associação"
                : "Associar supervisor"}
            </DialogTitle>
            <DialogDescription>
              {directoryPerson?.full_name} · cidade, setor e supervisor responsáveis.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FormInput
              label="Cidade"
              value={directoryForm.city}
              onChange={(value) => setDirectoryForm((current) => ({ ...current, city: value }))}
            />
            <FormInput
              label="Setor"
              value={directoryForm.sector}
              onChange={(value) => setDirectoryForm((current) => ({ ...current, sector: value }))}
            />
            <FormInput
              label="Supervisor"
              value={directoryForm.supervisor}
              onChange={(value) =>
                setDirectoryForm((current) => ({ ...current, supervisor: value }))
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDirectoryPerson(null)}>
              Cancelar
            </Button>
            <Button onClick={submitDirectory} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(homePerson)} onOpenChange={(open) => !open && setHomePerson(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{homePerson?.home ? "Editar moradia" : "Adicionar moradia"}</DialogTitle>
            <DialogDescription>
              {homePerson?.full_name} · endereço e coordenadas de referência.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormInput
                label="Endereço"
                value={homeForm.address}
                onChange={(value) => setHomeForm((current) => ({ ...current, address: value }))}
              />
            </div>
            <FormInput
              label="Latitude"
              value={homeForm.latitude}
              onChange={(value) => setHomeForm((current) => ({ ...current, latitude: value }))}
              placeholder="-5.7945"
            />
            <FormInput
              label="Longitude"
              value={homeForm.longitude}
              onChange={(value) => setHomeForm((current) => ({ ...current, longitude: value }))}
              placeholder="-35.2110"
            />
            <FormInput
              label="Cidade"
              value={homeForm.city}
              onChange={(value) => setHomeForm((current) => ({ ...current, city: value }))}
            />
            <FormInput
              label="UF"
              value={homeForm.state}
              onChange={(value) => setHomeForm((current) => ({ ...current, state: value }))}
            />
            <FormInput
              label="CEP"
              value={homeForm.postal_code}
              onChange={(value) => setHomeForm((current) => ({ ...current, postal_code: value }))}
            />
            <FormInput
              label="Bairro"
              value={homeForm.neighborhood}
              onChange={(value) => setHomeForm((current) => ({ ...current, neighborhood: value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHomePerson(null)}>
              Cancelar
            </Button>
            <Button onClick={submitHome} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function HoursMetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  emphasis = "default",
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  emphasis?: "default" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <strong
        className={`mt-2 block text-3xl font-black tracking-tight ${
          emphasis === "danger" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </strong>
      <p className="mt-2 text-[10px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function BankRankingPanel({
  title,
  hint,
  rows,
  startDate,
  endDate,
  kind,
}: {
  title: string;
  hint: string;
  rows: BankRankingRow[];
  startDate: string;
  endDate: string;
  kind: "positive" | "negative";
}) {
  const maxBalance = Math.max(1, ...rows.map((row) => Math.abs(row.balance)));
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 py-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">
            Top 10
          </span>
          <h2 className="mt-0.5 text-sm font-black">{title}</h2>
        </div>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>

      <div className="grid grid-cols-[44px_minmax(0,1.5fr)_minmax(160px,1fr)_120px] border-b border-border px-3 py-2 text-[9px] font-black uppercase tracking-wide text-muted-foreground">
        <span>#</span>
        <span>Colaborador</span>
        <span>Unidade / período</span>
        <span>Saldo</span>
      </div>

      {rows.map((row, index) => {
        const width = Math.max(8, (Math.abs(row.balance) / maxBalance) * 100);
        return (
          <div
            key={personKey(row.person)}
            className="grid grid-cols-[44px_minmax(0,1.5fr)_minmax(160px,1fr)_120px] items-center border-b border-border/80 px-3 py-3 last:border-b-0"
          >
            <div>
              <span className="grid size-7 place-items-center rounded-lg bg-secondary text-xs font-black">
                {index + 1}
              </span>
            </div>
            <div className="min-w-0 pr-3">
              <b className="block truncate text-[11px]">{row.person.full_name}</b>
              <small className="block truncate text-[9px] text-muted-foreground">
                {resolvePersonSector(row.person)}
              </small>
            </div>
            <div className="min-w-0 pr-3">
              <span className="block truncate text-[10px]">{row.person.unit_name}</span>
              <small className="block text-[9px] text-muted-foreground">
                {localeDate(startDate)} a {localeDate(endDate)}
              </small>
            </div>
            <div>
              <b
                className={`text-[11px] ${
                  kind === "negative" ? "text-destructive" : "text-foreground"
                }`}
              >
                {formatHoursLong(row.balance)}
              </b>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${
                    kind === "negative" ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {!rows.length && (
        <div className="grid min-h-32 place-items-center px-4 text-xs text-muted-foreground">
          Nenhum saldo {kind === "negative" ? "negativo" : "positivo"} neste período.
        </div>
      )}
    </section>
  );
}

function KpiGrid({
  items,
  clickableItems = [],
  activeItem = null,
  onItemClick,
}: {
  items: [string, number][];
  clickableItems?: string[];
  activeItem?: string | null;
  onItemClick?: (label: string) => void;
}) {
  const icons = [Users, Clock3, AlertTriangle, Building2];
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value], index) => {
        const Icon = icons[index] ?? Users;
        const clickable = clickableItems.includes(label);
        const active = activeItem === label;
        const className = [
          "rounded-xl border bg-card p-4 text-left shadow-card transition",
          active ? "border-primary ring-1 ring-primary/50" : "border-border",
          clickable
            ? "w-full cursor-pointer hover:border-primary/60 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        const content = (
          <>
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
              {clickable && (
                <span className="normal-case tracking-normal text-primary">
                  · {active ? "filtro ativo" : "clique para filtrar"}
                </span>
              )}
            </span>
            <strong className="mt-1 block text-2xl font-black">{value}</strong>
          </>
        );

        return clickable ? (
          <button
            key={label}
            type="button"
            className={className}
            aria-pressed={active}
            onClick={() => onItemClick?.(label)}
          >
            {content}
          </button>
        ) : (
          <div key={label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3">
        <h2 className="text-sm font-black">{title}</h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-bold ${active ? "bg-success-soft text-success-foreground" : "bg-secondary text-muted-foreground"}`}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function Balance({ value }: { value: number }) {
  return (
    <b
      className={
        value < 0
          ? "text-late-foreground"
          : value > 0
            ? "text-success-foreground"
            : "text-muted-foreground"
      }
    >
      {formatMinutes(value)}
    </b>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-28 place-items-center text-xs text-muted-foreground">{text}</div>
  );
}
