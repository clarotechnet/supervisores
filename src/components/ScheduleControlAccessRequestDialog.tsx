import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole, RefreshCw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScheduleControlAccessGate } from "@/components/ScheduleControlAccessGate";
import { useControlScheduleAccess } from "@/hooks/useControlScheduleAccess";
import { SCHEDULE_CITY_OPTIONS, scheduleFrontOptionsForCity, type UserRole } from "@/lib/types";
import type { ControlAccessRequest } from "@/services/schedule-access";
import { controlCities, controlAccessRequestCity } from "@/lib/schedule-control-access";

export function ScheduleControlAccessShortcut({
  role,
  onRequest,
  onReview,
}: {
  role: UserRole | undefined;
  onRequest: () => void;
  onReview: () => void;
}) {
  if (!role) return null;
  return role === "admin" ? (
    <Button size="sm" variant="outline" onClick={onReview}>
      <UserCheck className="size-3.5" /> Autorizações Controle
    </Button>
  ) : (
    <Button
      size="sm"
      variant="outline"
      onClick={onRequest}
      title="Consultar autorização ou solicitar acesso ao Controle operacional"
    >
      <LockKeyhole className="size-3.5" /> Acesso ao Controle
    </Button>
  );
}

export function ScheduleControlAccessRequestPanel({
  city,
  cityLabel,
  allowed,
  loading,
  error,
  request,
  onRefresh,
  onViewSchedule,
}: {
  city: string;
  cityLabel: string;
  allowed: boolean;
  loading: boolean;
  error: Error | null;
  request: ControlAccessRequest | null;
  onRefresh: () => void;
  onViewSchedule: () => void;
}) {
  if (allowed && !error) {
    return (
      <section className="grid gap-3 rounded-xl border p-5">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-5 text-emerald-500" />
          Você já tem autorização para consultar esta escala.
        </div>
        <p className="text-sm text-muted-foreground">
          A autorização vale para todos os meses do Controle operacional em {cityLabel}. Seu perfil
          e as permissões das demais frentes continuam os mesmos.
        </p>
        <Button className="justify-self-start" onClick={onViewSchedule}>
          Ver escala do Controle
        </Button>
      </section>
    );
  }
  return (
    <ScheduleControlAccessGate
      key={city}
      city={city}
      cityLabel={cityLabel}
      loading={loading}
      error={error}
      request={request}
      onRefresh={onRefresh}
    />
  );
}

export function ScheduleControlAccessRequestDialog({
  open,
  onOpenChange,
  userId,
  initialCity,
  onViewSchedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  initialCity: string;
  onViewSchedule: (city: string) => void;
}) {
  const [city, setCity] = useState(() => controlAccessRequestCity(initialCity));
  useEffect(() => {
    if (open) setCity(controlAccessRequestCity(initialCity));
  }, [open, initialCity]);
  const access = useControlScheduleAccess(userId, false, city, "controle-operacional", open);
  const label = SCHEDULE_CITY_OPTIONS.find((option) => option.value === city)?.label ?? city;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acesso ao Controle operacional</DialogTitle>
          <DialogDescription>
            Consulte sua autorização ou envie um pedido ao administrador, sem alterar seu perfil.
          </DialogDescription>
        </DialogHeader>
        {controlCities.length > 1 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="control-access-city">Cidade da escala</Label>
            <select
              id="control-access-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {controlCities.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm font-semibold">
            {city === "natal" ? "Controle RN · Multicidade — escala vinculada a Natal" : label}
          </p>
        )}
        <ScheduleControlAccessRequestPanel
          city={city}
          cityLabel={label}
          allowed={access.allowed}
          loading={access.loading}
          error={access.error}
          request={access.request}
          onRefresh={() => void access.refetch()}
          onViewSchedule={() => {
            onViewSchedule(city);
            onOpenChange(false);
          }}
        />
        <DialogFooter>
          <Button
            variant="outline"
            disabled={access.refreshing || !city}
            onClick={() => void access.refetch()}
          >
            <RefreshCw className={access.refreshing ? "size-4 animate-spin" : "size-4"} />
            Atualizar situação
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
