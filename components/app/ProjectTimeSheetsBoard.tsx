"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Download, FileText, Users } from "lucide-react";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "@/components/app/trade-pack-builder.module.css";

type DashboardRange = "Today" | "This week" | "All recent";

const MAX_ENTRY_ROWS = 1000;
const MAX_EVENT_ROWS = 80;
interface TimeEntryRow {
  id: string;
  worker_user_id: string;
  worker_name: string;
  company_name: string;
  trade_name: string;
  purchase_order_id: string | null;
  purchase_order_number: string;
  purchase_order_title: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_accuracy_meters: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_out_accuracy_meters: number | null;
  warning_8h5_at: string | null;
  auto_clocked_out: boolean;
  auto_clocked_out_at: string | null;
  total_hours: number | null;
  notes: string;
}

interface TimeEventRow {
  id: string;
  event_type: "clock_in" | "clock_out" | "warning_8h5" | "auto_clock_out" | "manual_edit";
  message: string;
  created_at: string;
}

interface ProjectContext {
  organizationId: string;
  projectId: string;
  projectName: string;
  memberId: string | null;
}

interface PurchaseOrderOption {
  id: string;
  purchase_order_number: string;
  purchase_order_title: string;
  status: string;
}

function startOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function toIsoDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRangeBounds(now: Date, range: DashboardRange) {
  const today = startOfLocalDay(now);
  if (range === "Today") {
    return { start: today, end: endOfLocalDay(today) };
  }
  if (range === "This week") {
    const mondayOffset = (today.getDay() + 6) % 7;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - mondayOffset);
    return { start: weekStart, end: endOfLocalDay(today) };
  }
  const lookback = new Date(today);
  lookback.setDate(today.getDate() - 90);
  return { start: lookback, end: endOfLocalDay(today) };
}

function formatTime(value: string | null) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatHours(hours: number) {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const hourValue = Math.floor(totalMinutes / 60);
  const minuteValue = totalMinutes % 60;
  return `${hourValue}h ${minuteValue.toString().padStart(2, "0")}m`;
}

function getHours(entry: TimeEntryRow, now: Date) {
  if (typeof entry.total_hours === "number") {
    return Math.max(0, entry.total_hours);
  }
  const start = new Date(entry.clock_in_at);
  const end = entry.clock_out_at ? new Date(entry.clock_out_at) : now;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

function registerStatus(entry: TimeEntryRow, now: Date) {
  const hours = getHours(entry, now);
  if (!entry.clock_out_at) {
    if (hours >= 10) {
      return { label: "Auto Pending", tone: "bg-[var(--error-light)] text-[var(--error)] border-[var(--error-light)]" };
    }
    if (hours >= 8.5) {
      return { label: "Warning", tone: "bg-[var(--warning-light)] text-[var(--warning)] border-[var(--warning-light)]" };
    }
    return { label: "Clocked In", tone: "bg-[var(--success-light)] text-[var(--success)] border-[var(--success-light)]" };
  }
  if (entry.auto_clocked_out) {
    return { label: "Auto Clocked", tone: "bg-[var(--error-light)] text-[var(--error)] border-[var(--error-light)]" };
  }
  return { label: "Finished", tone: "bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border)]" };
}

function locationLabel(latitude: number | null, longitude: number | null, accuracy: number | null) {
  if (latitude === null || longitude === null) {
    return "—";
  }
  const accuracyText = typeof accuracy === "number" ? ` (±${Math.round(accuracy)}m)` : "";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracyText}`;
}

async function captureLocation() {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    throw new Error("Location services are unavailable in this browser.");
  }

  return new Promise<{ latitude: number; longitude: number; accuracy: number }>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => reject(new Error("Location is required to clock in and clock out.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function ProjectTimeSheetsBoard() {
  const params = useParams<{ projectId: string }>();
  const routeProjectSlug = params?.projectId ?? "";
  const { session } = useAuth();

  const [now, setNow] = useState(() => new Date());
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [events, setEvents] = useState<TimeEventRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [range, setRange] = useState<DashboardRange>("This week");
  const [tradeFilter, setTradeFilter] = useState("All trades");
  const [companyFilter, setCompanyFilter] = useState("All companies");
  const [workerFilter, setWorkerFilter] = useState("All workers");
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState("");
  const [, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);
  const contextRef = useRef<ProjectContext | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const writeEvent = async (payload: { entryId: string | null; eventType: TimeEventRow["event_type"]; message: string }) => {
    if (!supabase || !context) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventsTable = (supabase as any).from("project_time_sheet_events");
    await eventsTable.insert({
      organization_id: context.organizationId,
      project_id: context.projectId,
      entry_id: payload.entryId,
      actor_user_id: session?.id ?? null,
      worker_name: session?.name ?? "",
      event_type: payload.eventType,
      message: payload.message,
    });
  };

  const isWorkerRole = session?.role === "worker";

  const selectedPurchaseOrder = useMemo(
    () => purchaseOrders.find((purchaseOrder) => purchaseOrder.id === selectedPurchaseOrderId) ?? null,
    [purchaseOrders, selectedPurchaseOrderId]
  );

  const loadData = async (options?: { showLoading?: boolean }) => {
    if (!supabase || !routeProjectSlug || !session?.id || isLoadingRef.current) {
      return;
    }

    const showLoading = options?.showLoading ?? true;
    const timingLabel = `[projects][time-sheets] load:${routeProjectSlug}`;
    console.time(timingLabel);
    isLoadingRef.current = true;
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      let activeContext = contextRef.current;
      let resolvedOrganizationId = activeContext?.organizationId ?? session.organizationId ?? null;

      if (!resolvedOrganizationId) {
        const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
        resolvedOrganizationId = ensuredOrganizationId ?? null;
      }

      if (!resolvedOrganizationId) {
        throw new Error("Could not resolve your organization.");
      }

      if (!activeContext) {
        const [{ data: projectRow, error: projectError }, { data: memberRow, error: memberError }] = await Promise.all([
          supabase
            .from("organization_projects")
            .select("id, name")
            .eq("organization_id", resolvedOrganizationId)
            .eq("slug", routeProjectSlug)
            .maybeSingle(),
          supabase
            .from("organization_members")
            .select("id")
            .eq("organization_id", resolvedOrganizationId)
            .eq("user_id", session.id)
            .maybeSingle(),
        ]);

        if (projectError || !projectRow) {
          throw new Error(projectError?.message ?? "Project not found.");
        }
        if (memberError) {
          throw new Error(memberError.message);
        }

        activeContext = {
          organizationId: resolvedOrganizationId,
          projectId: String(projectRow.id),
          projectName: projectRow.name || "Project",
          memberId: typeof memberRow?.id === "string" ? memberRow.id : null,
        };
        contextRef.current = activeContext;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entriesTable = (supabase as any).from("project_time_sheet_entries");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventsTable = (supabase as any).from("project_time_sheet_events");

      const since = new Date();
      since.setDate(since.getDate() - 120);
      const sinceIso = since.toISOString();

      const purchaseOrdersPromise = isWorkerRole
        ? activeContext.memberId
          ? supabase.rpc("list_worker_assigned_purchase_orders", {
              p_organization_id: activeContext.organizationId,
              p_project_id: activeContext.projectId,
              p_organization_member_id: activeContext.memberId,
            })
          : Promise.resolve({ data: [], error: null })
        : supabase
            .from("project_purchase_orders")
            .select("id, purchase_order_number, purchase_order_title, status")
            .eq("organization_id", activeContext.organizationId)
            .eq("project_id", activeContext.projectId)
            .order("created_at", { ascending: false });

      const [entriesResult, eventsResult, purchaseOrdersResult] = await Promise.all([
        entriesTable
          .select(
            "id, worker_user_id, worker_name, company_name, trade_name, purchase_order_id, purchase_order_number, purchase_order_title, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, clock_out_latitude, clock_out_longitude, clock_out_accuracy_meters, warning_8h5_at, auto_clocked_out, auto_clocked_out_at, total_hours, notes"
          )
          .eq("organization_id", activeContext.organizationId)
          .eq("project_id", activeContext.projectId)
          .gte("clock_in_at", sinceIso)
          .order("clock_in_at", { ascending: false })
          .limit(MAX_ENTRY_ROWS),
        eventsTable
          .select("id, event_type, message, created_at")
          .eq("organization_id", activeContext.organizationId)
          .eq("project_id", activeContext.projectId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(MAX_EVENT_ROWS),
        purchaseOrdersPromise,
      ]);

      if (entriesResult.error) {
        throw new Error(entriesResult.error.message);
      }
      if (eventsResult.error) {
        throw new Error(eventsResult.error.message);
      }
      if (purchaseOrdersResult.error) {
        throw new Error(purchaseOrdersResult.error.message);
      }

      const normalizedEntries = ((entriesResult.data ?? []) as TimeEntryRow[]).map((entry) => ({
        ...entry,
        company_name: entry.company_name?.trim() || session.organizationName?.trim() || "TradesStack",
        trade_name:
          entry.trade_name?.trim() ||
          (entry.worker_user_id === session.id && (session.role === "owner" || session.role === "admin") ? "Management" : "Site Crew"),
        purchase_order_number: entry.purchase_order_number?.trim() || "",
        purchase_order_title: entry.purchase_order_title?.trim() || "",
      }));
      const normalizedPurchaseOrders = ((purchaseOrdersResult.data ?? []) as Array<Record<string, unknown>>).map((purchaseOrder) => ({
        id: typeof purchaseOrder.id === "string" ? purchaseOrder.id : "",
        purchase_order_number:
          typeof purchaseOrder.purchase_order_number === "string" ? purchaseOrder.purchase_order_number.trim() : "",
        purchase_order_title:
          typeof purchaseOrder.purchase_order_title === "string"
            ? purchaseOrder.purchase_order_title.trim()
            : typeof purchaseOrder.title === "string"
              ? purchaseOrder.title.trim()
              : "",
        status: typeof purchaseOrder.status === "string" ? purchaseOrder.status : "Draft",
      }));

      setContext(activeContext);
      setEntries(normalizedEntries);
      setEvents((eventsResult.data ?? []) as TimeEventRow[]);
      setPurchaseOrders(normalizedPurchaseOrders.filter((purchaseOrder) => purchaseOrder.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load time sheets.");
    } finally {
      console.info("[projects][time-sheets] query-count", {
        projectSlug: routeProjectSlug,
        approximateQueries: (session.organizationId ? 0 : 1) + (contextRef.current ? 0 : 2) + 3,
      });
      console.timeEnd(timingLabel);
      if (showLoading) {
        setIsLoading(false);
      }
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    contextRef.current = null;
    setContext(null);
    setEntries([]);
    setEvents([]);
    setPurchaseOrders([]);
    void loadData({ showLoading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, supabase]);

  useEffect(() => {
    if (!isWorkerRole) {
      setSelectedPurchaseOrderId("");
      return;
    }

    if (purchaseOrders.length === 1) {
      if (selectedPurchaseOrderId !== purchaseOrders[0]?.id) {
        setSelectedPurchaseOrderId(purchaseOrders[0]?.id ?? "");
      }
      return;
    }

    if (selectedPurchaseOrderId && purchaseOrders.some((purchaseOrder) => purchaseOrder.id === selectedPurchaseOrderId)) {
      return;
    }

    setSelectedPurchaseOrderId("");
  }, [isWorkerRole, purchaseOrders, selectedPurchaseOrderId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadData({ showLoading: false });
      }
    }, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadData({ showLoading: false });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, supabase]);

  const activeMyEntry = useMemo(() => {
    if (!session?.id) {
      return null;
    }
    return entries.find((entry) => entry.worker_user_id === session.id && !entry.clock_out_at) ?? null;
  }, [entries, session?.id]);

  const clockIn = async () => {
    if (!supabase || !context || !session?.id || activeMyEntry) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (isWorkerRole && purchaseOrders.length === 0) {
        throw new Error("No purchase order has been assigned to you for this project. Please contact your manager.");
      }

      if (isWorkerRole && !selectedPurchaseOrder) {
        throw new Error("Select one of your assigned purchase orders before clocking in.");
      }

      const location = await captureLocation();
      const nowIso = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entriesTable = (supabase as any).from("project_time_sheet_entries");

      const { data, error: insertError } = await entriesTable
        .insert({
          organization_id: context.organizationId,
          project_id: context.projectId,
          created_by: session.id,
          worker_user_id: session.id,
          worker_member_id: context.memberId,
          worker_name: session.name || "Worker",
          company_name: session.organizationName?.trim() || "TradesStack",
          trade_name: session.role === "owner" || session.role === "admin" ? "Management" : "Site Crew",
          purchase_order_id: isWorkerRole ? selectedPurchaseOrder?.id ?? null : null,
          purchase_order_number: isWorkerRole ? selectedPurchaseOrder?.purchase_order_number ?? "" : "",
          purchase_order_title: isWorkerRole ? selectedPurchaseOrder?.purchase_order_title ?? "" : "",
          clock_in_at: nowIso,
          clock_in_latitude: location.latitude,
          clock_in_longitude: location.longitude,
          clock_in_accuracy_meters: location.accuracy,
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        throw new Error(insertError.message);
      }

      await writeEvent({
        entryId: data?.id ?? null,
        eventType: "clock_in",
        message: `${session.name || "Worker"} clocked in - ${formatTime(nowIso)}${isWorkerRole && selectedPurchaseOrder ? ` (${selectedPurchaseOrder.purchase_order_number})` : ""}`,
      });

      await loadData({ showLoading: false });
    } catch (clockInError) {
      setError(clockInError instanceof Error ? clockInError.message : "Unable to clock in.");
    } finally {
      setIsSaving(false);
    }
  };

  const clockOut = async () => {
    if (!supabase || !context || !activeMyEntry) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const location = await captureLocation();
      const nowIso = new Date().toISOString();
      const totalHours = Number(getHours(activeMyEntry, new Date(nowIso)).toFixed(2));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entriesTable = (supabase as any).from("project_time_sheet_entries");

      const { error: updateError } = await entriesTable
        .update({
          clock_out_at: nowIso,
          total_hours: totalHours,
          clock_out_latitude: location.latitude,
          clock_out_longitude: location.longitude,
          clock_out_accuracy_meters: location.accuracy,
        })
        .eq("id", activeMyEntry.id)
        .eq("organization_id", context.organizationId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await writeEvent({
        entryId: activeMyEntry.id,
        eventType: "clock_out",
        message: `${activeMyEntry.worker_name} clocked out - ${formatTime(nowIso)}`,
      });

      await loadData({ showLoading: false });
    } catch (clockOutError) {
      setError(clockOutError instanceof Error ? clockOutError.message : "Unable to clock out.");
    } finally {
      setIsSaving(false);
    }
  };

  const rangeBounds = useMemo(() => getRangeBounds(now, range), [now, range]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const inAt = new Date(entry.clock_in_at);
      if (Number.isNaN(inAt.getTime()) || inAt < rangeBounds.start || inAt > rangeBounds.end) {
        return false;
      }
      if (tradeFilter !== "All trades" && entry.trade_name !== tradeFilter) {
        return false;
      }
      if (companyFilter !== "All companies" && entry.company_name !== companyFilter) {
        return false;
      }
      if (workerFilter !== "All workers" && entry.worker_name !== workerFilter) {
        return false;
      }
      return true;
    });
  }, [companyFilter, entries, rangeBounds.end, rangeBounds.start, tradeFilter, workerFilter]);

  const liveWorkforce = useMemo(() => filteredEntries.filter((entry) => !entry.clock_out_at), [filteredEntries]);

  const tradeOptions = useMemo(() => ["All trades", ...Array.from(new Set(entries.map((entry) => entry.trade_name)))], [entries]);
  const companyOptions = useMemo(
    () => ["All companies", ...Array.from(new Set(entries.map((entry) => entry.company_name)))],
    [entries]
  );
  const workerOptions = useMemo(() => ["All workers", ...Array.from(new Set(entries.map((entry) => entry.worker_name)))], [entries]);

  const summary = useMemo(() => {
    const onSiteNow = liveWorkforce.length;
    const totalHours = filteredEntries.reduce((sum, entry) => sum + getHours(entry, now), 0);
    const workersToday = new Set(filteredEntries.map((entry) => entry.worker_user_id)).size;
    const avgHours = workersToday > 0 ? totalHours / workersToday : 0;
    const overtimeAlerts = filteredEntries.filter((entry) => getHours(entry, now) > 9).length;
    const missingClockOuts = filteredEntries.filter((entry) => !entry.clock_out_at).length;
    return { onSiteNow, totalHours, workersToday, avgHours, overtimeAlerts, missingClockOuts };
  }, [filteredEntries, liveWorkforce.length, now]);

  const insights = useMemo(() => {
    const overNineHours = filteredEntries.filter((entry) => getHours(entry, now) > 9).length;
    const autoClockedCount = filteredEntries.filter((entry) => entry.auto_clocked_out).length;
    const avgShift = filteredEntries.length > 0 ? filteredEntries.reduce((sum, entry) => sum + getHours(entry, now), 0) / filteredEntries.length : 0;

    return [
      overNineHours > 0
        ? `${overNineHours} workers are in overtime-risk range.`
        : "No overtime risk detected in the selected range.",
      `Average shift length is ${formatHours(avgShift)}.`,
      autoClockedCount > 0 ? `${autoClockedCount} entries were auto clocked out.` : "Late clock-outs are currently stable.",
      `${events.length} clocking events logged in this range.`,
    ];
  }, [events.length, filteredEntries, now]);

  const sortedEntries = useMemo(
    () => filteredEntries.slice().sort((a, b) => new Date(b.clock_in_at).getTime() - new Date(a.clock_in_at).getTime()),
    [filteredEntries]
  );

  const exportCsv = () => {
    const header = ["Worker", "Trade", "Company", "Purchase Order", "Clock In", "Clock Out", "Total Hours", "Overtime Flag", "Auto Clocked", "Clock In Location", "Clock Out Location", "Notes"];
    const rows = filteredEntries.map((entry) => [
      entry.worker_name,
      entry.trade_name,
      entry.company_name,
      entry.purchase_order_number ? `${entry.purchase_order_number}${entry.purchase_order_title ? ` - ${entry.purchase_order_title}` : ""}` : "",
      entry.clock_in_at,
      entry.clock_out_at ?? "",
      getHours(entry, now).toFixed(2),
      getHours(entry, now) > 9 ? "Yes" : "No",
      entry.auto_clocked_out ? "Yes" : "No",
      locationLabel(entry.clock_in_latitude, entry.clock_in_longitude, entry.clock_in_accuracy_meters),
      locationLabel(entry.clock_out_latitude, entry.clock_out_longitude, entry.clock_out_accuracy_meters),
      entry.notes || "",
    ]);

    const csvText = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `time-sheets-${toIsoDateOnly(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${ibmPlexSans.className} ${styles.quoteDashboardScope} -mb-8 w-full space-y-6`}>

      <OperationalModuleHeader
        title="Timesheets"
        description={`Real-time labour visibility and control for ${context?.projectName ?? "this job"}`}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary">
                  Range: {range}
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="!z-[200] min-w-[180px] rounded-[14px] border border-[var(--border)] !bg-[var(--surface)] p-1.5 shadow-[0_4px_24px_rgba(15,23,42,0.10)]">
                {(["Today", "This week", "All recent"] as DashboardRange[]).map((r) => (
                  <DropdownMenuItem key={r} onClick={() => setRange(r)} className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium focus:bg-[var(--surface-muted)] ${range === r ? "text-[var(--brand-blue)]" : "text-[var(--text-primary)]"}`}>
                    <span className="mr-2 inline-flex w-4 items-center justify-center">{range === r ? <Check className="h-4 w-4" /> : null}</span>
                    {r}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="my-1 bg-[var(--border-subtle)]" />
                <DropdownMenuItem onClick={exportCsv} className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]`}>
                  <Download className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()} className={`${interMedium.className} h-9 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium text-[var(--text-primary)] focus:bg-[var(--surface-muted)]`}>
                  <FileText className="mr-2 h-4 w-4 text-[var(--text-secondary)]" />Print PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              onClick={() => { if (activeMyEntry) { void clockOut(); } else { void clockIn(); } }}
              disabled={isSaving}
            >
              {activeMyEntry ? "Clock Out" : "Clock In"}
            </Button>
          </>
        }
      />

      {error ? (
        <p className={`${interMedium.className} rounded-[10px] border border-[var(--error-light)] bg-[var(--error-light)] px-3 py-2 text-sm font-medium text-[var(--error)]`}>{error}</p>
      ) : null}

      {activeMyEntry ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--success-light)] bg-[var(--success-light)] px-4 py-3">
          <div>
            <p className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--success)]`}>You are clocked in</p>
            <p className={`${ibmPlexSans.className} mt-1 text-[15px] font-semibold text-[var(--success)]`}>
              {formatTime(activeMyEntry.clock_in_at)} → Now ({formatHours(getHours(activeMyEntry, now))})
            </p>
            {activeMyEntry.purchase_order_number ? (
              <p className={`${interMedium.className} mt-1 text-[12px] font-medium text-[var(--success)]`}>
                Linked to {activeMyEntry.purchase_order_number}{activeMyEntry.purchase_order_title ? ` - ${activeMyEntry.purchase_order_title}` : ""}
              </p>
            ) : null}
          </div>
          <Button type="button" onClick={() => void clockOut()} disabled={isSaving} className="h-9 rounded-full bg-[var(--primary)] px-5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
            Clock Out
          </Button>
        </div>
      ) : null}

      <div className="px-0 py-0">
        <div className="space-y-6">

          {/* Stat cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card-elevated)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[var(--kpi-bg-sage)]">
                  <Users className="h-5 w-5 text-[var(--kpi-fg-sage)]" />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>On Site Now</p>
              </div>
              <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{summary.onSiteNow}</p>
              <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-sage)]`}>Workers Currently Clocked In</p>
            </div>
            <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card-elevated)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[var(--kpi-bg-red)]">
                  <AlertTriangle className="h-5 w-5 text-[var(--kpi-fg-red)]" />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>Overtime Alerts</p>
              </div>
              <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{summary.overtimeAlerts}</p>
              <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-red)]`}>Entries Over Threshold</p>
            </div>
            <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card-elevated)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[var(--kpi-bg-navy)]">
                  <CheckCircle2 className="h-5 w-5 text-[var(--kpi-fg-navy)]" />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>Complete</p>
              </div>
              <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{Math.max(0, summary.workersToday - summary.missingClockOuts)}</p>
              <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-navy)]`}>Finished Shifts This Range</p>
            </div>
            <div className="flex min-h-[160px] flex-col rounded-[14px] border-[1.3px] border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card-elevated)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-[3.1rem] w-[3.1rem] items-center justify-center rounded-[1rem] bg-[var(--kpi-bg-amber)]">
                  <Clock className="h-5 w-5 text-[var(--kpi-fg-orange)]" />
                </span>
                <p className={`${ibmPlexSans.className} text-[15px] font-medium text-[var(--text-secondary)]`}>Total Hours</p>
              </div>
              <p className={`${ibmPlexSans.className} mt-auto pt-5 text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)]`}>{formatHours(summary.totalHours)}</p>
              <p className={`${ibmPlexSans.className} mt-3 text-[14px] font-medium text-[var(--kpi-fg-orange)]`}>Labour Hours In Selected Range</p>
            </div>
          </div>

          {/* Worker filters + PO selector */}
          {isWorkerRole ? (
            <div className="flex flex-wrap items-center gap-2">
              {purchaseOrders.length === 1 && selectedPurchaseOrder ? (
                <div className={`${interMedium.className} flex h-9 items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 text-[13px] font-medium text-[var(--text-primary)]`}>
                  PO: {selectedPurchaseOrder.purchase_order_number} — {selectedPurchaseOrder.purchase_order_title || "Untitled"}
                </div>
              ) : (
                <select
                  value={selectedPurchaseOrderId}
                  onChange={(e) => setSelectedPurchaseOrderId(e.target.value)}
                  disabled={isSaving || Boolean(activeMyEntry)}
                  className={`${interMedium.className} h-9 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 text-[13px] font-medium text-[var(--text-primary)] disabled:opacity-50`}
                >
                  <option value="">Select purchase order</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>{po.purchase_order_number} — {po.purchase_order_title || "Untitled"}</option>
                  ))}
                </select>
              )}
              {isWorkerRole && purchaseOrders.length === 0 ? (
                <p className={`${interMedium.className} text-[13px] font-medium text-[var(--warning)]`}>No purchase order assigned. Contact your manager.</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { value: tradeFilter, onChange: setTradeFilter, options: tradeOptions },
              { value: companyFilter, onChange: setCompanyFilter, options: companyOptions },
              { value: workerFilter, onChange: setWorkerFilter, options: workerOptions },
            ] as const).map((filter, i) => (
              <div key={i} className="relative">
                <select
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className={`${interMedium.className} h-9 w-full appearance-none rounded-full border border-[var(--border)] bg-[var(--surface-muted)] pl-4 pr-9 text-[13px] font-medium text-[var(--text-primary)]`}
                >
                  {filter.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)]">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className={`${interMedium.className} border-b border-[var(--border)] bg-[var(--surface-muted)] text-[13px] font-semibold text-[var(--text-secondary)]`}>
                  <th className="w-[13%] px-4 py-2.5 text-left">Worker</th>
                  <th className="w-[25%] px-4 py-2.5 text-left">Purchase Order</th>
                  <th className="w-[12%] px-4 py-2.5 text-left">Date</th>
                  <th className="w-[12%] whitespace-nowrap px-4 py-2.5 text-left">Clock In</th>
                  <th className="w-[12%] whitespace-nowrap px-4 py-2.5 text-left">Clock Out</th>
                  <th className="w-[12%] px-4 py-2.5 text-left">Duration</th>
                  <th className="w-[14%] px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface)]">
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`${interMedium.className} px-4 py-10 text-center text-[13px] text-[var(--text-secondary)]`}>
                      No timesheet entries for the selected range.
                    </td>
                  </tr>
                ) : sortedEntries.map((entry) => {
                  const status = registerStatus(entry, now);
                  return (
                    <tr key={entry.id} className="transition-colors">
                      <td className={`${interMedium.className} px-4 py-3 text-[13px] font-semibold text-[var(--text-primary)]`}>{entry.worker_name}</td>
                      <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[var(--text-secondary)]`}>
                        {entry.purchase_order_number ? `${entry.purchase_order_number}${entry.purchase_order_title ? ` — ${entry.purchase_order_title}` : ""}` : "—"}
                      </td>
                      <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[var(--text-secondary)]`}>{formatDate(entry.clock_in_at)}</td>
                      <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[var(--text-secondary)]`}>{formatTime(entry.clock_in_at)}</td>
                      <td className={`${interMedium.className} px-4 py-3 text-[13px] text-[var(--text-secondary)]`}>{formatTime(entry.clock_out_at)}</td>
                      <td className={`${interMedium.className} px-4 py-3 text-[13px] font-medium text-[var(--text-primary)]`}>{formatHours(getHours(entry, now))}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-[8px] border px-2.5 py-0.5 text-[12px] font-semibold ${status.tone}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="flex items-center justify-end border-t border-[var(--border-subtle)] pt-4">
            <p className={`${interMedium.className} flex items-center gap-6 text-[18px] font-semibold text-[var(--text-primary)]`}>
              <span>Total Hours</span>
              <span>{formatHours(summary.totalHours)}</span>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
