// components/notifications/NotificationCenter.tsx
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Bell } from "lucide-react";
import NotificationItem, { Notification } from "./NotificationItem";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: Notification[]; // [{id, title, tags, status, motive, ts}, ...]
};

export default function NotificationCenter({ open, onOpenChange, items }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="
          p-0 md:p-0
          h-[100dvh] md:h-auto
          md:max-w-[480px] md:rounded-l-2xl md:right-0 md:left-auto
          md:border-l
          overflow-hidden
        "
      >
        {/* HEADER sticky */}
        <SheetHeader className="sticky top-0 z-20 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="inline-flex size-9 items-center justify-center rounded-xl border">
              <Bell className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-semibold truncate">
                Centro de notificaciones
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                Últimas 24 h · filtradas por tu rol
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* LISTA scrollable */}
        <div
          className="
            no-scrollbar
            h-[calc(100dvh-64px)] md:h-[min(80vh,680px)]
            overflow-y-auto
            p-3 md:p-4
            space-y-3
            bg-gradient-to-b from-background to-muted/20
          "
        >
          {items?.length ? (
            items.map((n) => <NotificationItem key={n.id} {...n} />)
          ) : (
            <Card className="p-6 text-sm text-muted-foreground text-center">
              No hay notificaciones por ahora.
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
