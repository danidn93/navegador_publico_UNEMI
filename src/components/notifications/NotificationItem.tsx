// components/notifications/NotificationItem.tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import clsx from "clsx";

export type Notification = {
  id: string | number;
  title: string;               // Ej: "Calle: Corredor Cultural (tramo detrás del bloque U) (both)"
  tags?: string[];             // Ej: ["info","footways"]
  status: "ABIERTO" | "CERRADO" | "PARCIAL";
  motive?: string;             // Ej: "La vía es de uso mixto"
  ts: string | Date;           // fecha/hora
};

export default function NotificationItem(n: Notification) {
  const statusColor = {
    ABIERTO: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CERRADO: "bg-rose-50 text-rose-700 border-rose-200",
    PARCIAL: "bg-amber-50 text-amber-800 border-amber-200",
  }[n.status];

  return (
    <Card className="p-4 md:p-5 rounded-2xl shadow-sm border">
      {/* Título y chips */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 inline-flex size-8 items-center justify-center rounded-xl border">
          <Info className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[15px] leading-snug line-clamp-2">
            {n.title}
          </h3>

          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                statusColor
              )}
            >
              {n.status}
            </span>

            {n.tags?.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="rounded-full text-[11px] px-2 py-0.5"
              >
                {t}
              </Badge>
            ))}

            <time
              className="ml-auto text-[11px] text-muted-foreground"
              dateTime={new Date(n.ts).toISOString()}
              title={new Date(n.ts).toLocaleString()}
            >
              {new Intl.DateTimeFormat(undefined, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(n.ts))}
            </time>
          </div>

          {/* Motivo */}
          {n.motive && (
            <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Motivo:</span>{" "}
              {n.motive}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
