import { FC, useState } from "react";
import { useTranslation } from "@/i18n";
import {
  useGetMyReservations,
  useDeleteReservation,
  getGetMyReservationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Clock, Users, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  confirmed: "default",
  pending: "secondary",
  cancelled: "destructive",
  maintenance: "outline",
};

export const Reservations: FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const queryParams = { page: 1, limit: 50 };
  const { data, isLoading } = useGetMyReservations(queryParams, {
    query: { queryKey: getGetMyReservationsQueryKey(queryParams) },
  });

  const deleteReservation = useDeleteReservation();

  const handleCancel = (id: number) => {
    setCancellingId(id);
    deleteReservation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: t("book.cancelled") });
          queryClient.invalidateQueries({ queryKey: getGetMyReservationsQueryKey(queryParams) });
        },
        onSettled: () => setCancellingId(null),
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.reservations")}
        icon={CalendarDays}
        gradient="from-cyan-400 to-blue-600"
        actions={
          <span className="text-sm text-muted-foreground">
            {data?.total ?? 0} {t("common.total")}
          </span>
        }
      />

      {/* card list */}

      {isLoading ? (
        <div className="flex justify-center items-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          {t("common.loading")}
        </div>
      ) : data?.reservations && data.reservations.length > 0 ? (
        <div className="space-y-3">
          {data.reservations.map((res) => {
            const canCancel = res.status === "confirmed" || res.status === "pending";
            return (
              <Card
                key={res.id}
                data-testid={`card-reservation-${res.id}`}
                className="hover:shadow-md transition-shadow"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={STATUS_VARIANT[res.status] ?? "secondary"}
                          data-testid={`badge-status-${res.id}`}
                        >
                          {t(`status.${res.status}` as any) || res.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">#{res.id}</span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="flex items-center gap-1.5 text-foreground font-medium">
                          <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                          {res.date}
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="w-4 h-4 shrink-0" />
                          {res.startTime} – {res.endTime}
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="w-4 h-4 shrink-0" />
                          {res.numberOfPeople} {t("book.people")}
                        </span>
                      </div>

                      {res.notes && (
                        <p className="text-xs text-muted-foreground truncate">{res.notes}</p>
                      )}
                    </div>

                    {/* Right: cancel */}
                    {canCancel && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            disabled={cancellingId === res.id}
                            data-testid={`button-cancel-${res.id}`}
                          >
                            {cancellingId === res.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <X className="w-4 h-4 sm:mr-1" />
                                <span className="hidden sm:inline">{t("common.cancel")}</span>
                              </>
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="mx-4 sm:mx-auto">
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("res.cancelTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("res.cancelDesc")} {res.date} {res.startTime}–{res.endTime}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancel(res.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t("common.confirmCancel")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t("res.empty")}</p>
        </div>
      )}
    </div>
  );
};
