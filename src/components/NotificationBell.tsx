import { useState } from "react";
import {
  AlertCircle,
  AtSign,
  Bell,
  CheckCheck,
  ClipboardList,
  MessageCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppNotifications } from "@/hooks/useAppNotifications";
import { formatOverdueTask } from "@/lib/assignment-notification";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, busyKey, error, openItem, dismissItem } = useAppNotifications();
  const count = items.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            count
              ? `Notificações, ${count} ${count === 1 ? "pendente" : "pendentes"}`
              : "Notificações"
          }
          title="Notificações"
          className="relative grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="size-4" aria-hidden="true" />
          {count > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-extrabold leading-4 text-primary-foreground"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        aria-label="Notificações"
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border-border bg-card p-0 text-foreground shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-extrabold">Notificações</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {count
                ? `${count} ${count === 1 ? "aviso pendente" : "avisos pendentes"}`
                : error
                  ? "Verificação indisponível"
                  : "Tudo em dia"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="border-b border-border bg-destructive/10 px-4 py-3 text-xs text-destructive"
          >
            {error}
          </p>
        )}
        <div className="max-h-[min(65vh,520px)] min-h-0 overflow-y-auto overscroll-contain">
          {count === 0 ? (
            <div className="px-6 py-10 text-center">
              <CheckCheck className="mx-auto size-7 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-3 text-xs text-muted-foreground">
                {error
                  ? "Não foi possível verificar todos os avisos."
                  : "Nenhuma notificação pendente."}
              </p>
            </div>
          ) : (
            items.map((item) => {
              const Icon =
                item.kind === "overdue"
                  ? AlertCircle
                  : item.kind === "message"
                    ? MessageCircle
                    : item.kind === "mention"
                      ? AtSign
                      : ClipboardList;
              const action =
                item.kind === "overdue"
                  ? "Ver supervisor"
                  : item.kind === "message"
                    ? "Abrir conversa"
                    : item.kind === "mention"
                      ? "Abrir observação"
                      : "Ver tarefas";
              return (
                <article
                  key={item.key}
                  className="border-b border-border px-4 py-4 last:border-b-0"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-xs font-bold leading-relaxed">
                        {item.title}
                      </h3>
                      {item.kind === "overdue" ? (
                        <div className="mt-1.5 grid gap-1 text-[11px] leading-relaxed text-muted-foreground">
                          {item.group.tasks.slice(0, 5).map((task) => (
                            <p key={task.id} className="break-words">
                              {formatOverdueTask(task)}
                            </p>
                          ))}
                          {item.group.tasks.length > 5 && (
                            <p className="font-semibold">
                              + {item.group.tasks.length - 5} outras atividades
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      {(item.kind !== "overdue" || item.group.supervisorId) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!!busyKey}
                          className="mt-3"
                          onClick={() =>
                            void openItem(item).then((done) => {
                              if (done) setOpen(false);
                            })
                          }
                        >
                          {busyKey === item.key ? "Aguarde…" : action}
                        </Button>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!!busyKey}
                      aria-label={`Dispensar: ${item.title}`}
                      title="Dispensar aviso"
                      onClick={() => void dismissItem(item)}
                      className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
