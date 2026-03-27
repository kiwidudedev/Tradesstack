"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Clock3, Download, FileText, LogIn, LogOut, MapPin, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type DashboardRange = "Today" | "This week" | "All recent";

const MAX_ENTRY_ROWS = 1000;
const MAX_EVENT_ROWS = 80;
const MAX_LIVE_ROWS = 200;
const MAX_TIMELINE_ROWS = 120;
const BREAKDOWN_PAGE_SIZE = 50;

interface TimeEntryRow {
  id: string;
  worker_user_id: string;
  worker_name: string;
  company_name: string;
  trade_name: string;
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

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

function liveStatus(entry: TimeEntryRow, now: Date) {
  if (entry.clock_out_at) {
    return "Closed";
  }
  const hours = getHours(entry, now);
  if (hours >= 10) {
    return "Auto Clock-Out Pending";
  }
  if (hours >= 8.5) {
    return "8.5h Warning";
  }
  return "Normal";
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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
  const [range, setRange] = useState<DashboardRange>("This week");
  const [tradeFilter, setTradeFilter] = useState("All trades");
  const [companyFilter, setCompanyFilter] = useState("All companies");
  const [workerFilter, setWorkerFilter] = useState("All workers");
  const [breakdownPage, setBreakdownPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isLoadingRef = useRef(false);

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

  const loadData = async (options?: { showLoading?: boolean }) => {
    if (!supabase || !routeProjectSlug || !session?.id || isLoadingRef.current) {
      return;
    }

    const showLoading = options?.showLoading ?? true;
    isLoadingRef.current = true;
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      let resolvedOrganizationId = session.organizationId;
      if (!resolvedOrganizationId) {
        const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
        resolvedOrganizationId = ensuredOrganizationId ?? null;
      }

      if (!resolvedOrganizationId) {
        throw new Error("Could not resolve your organization.");
      }

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entriesTable = (supabase as any).from("project_time_sheet_entries");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventsTable = (supabase as any).from("project_time_sheet_events");

      const since = new Date();
      since.setDate(since.getDate() - 120);
      const sinceIso = since.toISOString();

      const [entriesResult, eventsResult] = await Promise.all([
        entriesTable
          .select(
            "id, worker_user_id, worker_name, company_name, trade_name, clock_in_at, clock_out_at, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters, clock_out_latitude, clock_out_longitude, clock_out_accuracy_meters, warning_8h5_at, auto_clocked_out, auto_clocked_out_at, total_hours, notes"
          )
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .gte("clock_in_at", sinceIso)
          .order("clock_in_at", { ascending: false })
          .limit(MAX_ENTRY_ROWS),
        eventsTable
          .select("id, event_type, message, created_at")
          .eq("organization_id", resolvedOrganizationId)
          .eq("project_id", projectRow.id)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(MAX_EVENT_ROWS),
      ]);

      if (entriesResult.error) {
        throw new Error(entriesResult.error.message);
      }
      if (eventsResult.error) {
        throw new Error(eventsResult.error.message);
      }

      const normalizedEntries = ((entriesResult.data ?? []) as TimeEntryRow[]).map((entry) => ({
        ...entry,
        company_name: entry.company_name?.trim() || session.organizationName?.trim() || "TradesStack",
        trade_name:
          entry.trade_name?.trim() ||
          (entry.worker_user_id === session.id && session.role === "admin" ? "Management" : "Site Crew"),
      }));

      setContext({
        organizationId: resolvedOrganizationId,
        projectId: projectRow.id,
        projectName: projectRow.name || "Project",
        memberId: memberRow?.id ?? null,
      });
      setEntries(normalizedEntries);
      setEvents((eventsResult.data ?? []) as TimeEventRow[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load time sheets.");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    void loadData({ showLoading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProjectSlug, session?.id, session?.organizationId, supabase]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData({ showLoading: false });
    }, 60_000);
    return () => window.clearInterval(intervalId);
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
    setNotice(null);

    try {
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
          trade_name: session.role === "admin" ? "Management" : "Site Crew",
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
        message: `${session.name || "Worker"} clocked in - ${formatTime(nowIso)}`,
      });

      setNotice(`Clocked in at ${formatTime(nowIso)} with location captured.`);
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
    setNotice(null);

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

      setNotice(`Clocked out at ${formatTime(nowIso)} with location captured.`);
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

  useEffect(() => {
    setBreakdownPage(1);
  }, [range, tradeFilter, companyFilter, workerFilter]);

  const liveWorkforce = useMemo(() => filteredEntries.filter((entry) => !entry.clock_out_at), [filteredEntries]);
  const visibleLiveWorkforce = useMemo(() => liveWorkforce.slice(0, MAX_LIVE_ROWS), [liveWorkforce]);

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

  const labourRisk = useMemo(() => {
    const pendingAuto = liveWorkforce.filter((entry) => getHours(entry, now) >= 10).length;
    const warningCount = liveWorkforce.filter((entry) => {
      const hours = getHours(entry, now);
      return hours >= 8.5 && hours < 10;
    }).length;
    if (pendingAuto > 0) {
      return { tone: "high" as const, message: `${pendingAuto} workers are at 10h+ and need immediate review.` };
    }
    if (warningCount > 0) {
      return { tone: "medium" as const, message: `${warningCount} workers are approaching overtime threshold.` };
    }
    return { tone: "low" as const, message: "No labour risks detected right now." };
  }, [liveWorkforce, now]);

  const timelineRows = useMemo(() => {
    return filteredEntries
      .slice()
      .sort((a, b) => new Date(a.clock_in_at).getTime() - new Date(b.clock_in_at).getTime())
      .slice(0, MAX_TIMELINE_ROWS)
      .map((entry) => {
        const start = new Date(entry.clock_in_at);
        const end = entry.clock_out_at ? new Date(entry.clock_out_at) : now;
        const dayStart = startOfLocalDay(start);
        const minutesFromDayStart = (start.getTime() - dayStart.getTime()) / 60_000;
        const durationMinutes = Math.max(1, (end.getTime() - start.getTime()) / 60_000);
        const leftPct = Math.max(0, Math.min(100, (minutesFromDayStart / (24 * 60)) * 100));
        const widthPct = Math.max(1, Math.min(100 - leftPct, (durationMinutes / (24 * 60)) * 100));
        return {
          id: entry.id,
          workerName: entry.worker_name,
          rangeLabel: `${formatTime(entry.clock_in_at)} → ${formatTime(entry.clock_out_at)}`,
          leftPct,
          widthPct,
          isOvertime: getHours(entry, now) >= 9,
        };
      });
  }, [filteredEntries, now]);

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
    ];
  }, [filteredEntries, now]);

  const breakdownTotalPages = Math.max(1, Math.ceil(filteredEntries.length / BREAKDOWN_PAGE_SIZE));
  const breakdownStartIndex = (breakdownPage - 1) * BREAKDOWN_PAGE_SIZE;
  const breakdownEntries = useMemo(
    () => filteredEntries.slice(breakdownStartIndex, breakdownStartIndex + BREAKDOWN_PAGE_SIZE),
    [breakdownStartIndex, filteredEntries]
  );

  useEffect(() => {
    if (breakdownPage > breakdownTotalPages) {
      setBreakdownPage(breakdownTotalPages);
    }
  }, [breakdownPage, breakdownTotalPages]);

  const exportCsv = () => {
    const header = ["Worker", "Trade", "Company", "Clock In", "Clock Out", "Total Hours", "Overtime Flag", "Auto Clocked", "Clock In Location", "Clock Out Location", "Notes"];
    const rows = filteredEntries.map((entry) => [
      entry.worker_name,
      entry.trade_name,
      entry.company_name,
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
    <div className="space-y-6">
      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#0F172A]">Time Sheets</CardTitle>
              <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
                Real-time labour visibility and control for {context?.projectName ?? "this job"}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={range}
                onChange={(event) => setRange(event.target.value as DashboardRange)}
                className={`${interMedium.className} h-10 rounded-[10px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}
              >
                <option value="Today">Today</option>
                <option value="This week">This week</option>
                <option value="All recent">All recent</option>
              </select>
              <Button type="button" variant="outline" className="h-10 rounded-[10px] border-[#D6DDE9] bg-white px-3 text-[#1D2433]" onClick={exportCsv}>
                <Download className="mr-1.5 h-4 w-4" />
                CSV
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-[10px] border-[#D6DDE9] bg-white px-3 text-[#1D2433]" onClick={() => window.print()}>
                <FileText className="mr-1.5 h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <div className="grid gap-2 md:grid-cols-3">
            <select value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)} className={`${interMedium.className} h-10 rounded-[10px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}>
              {tradeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className={`${interMedium.className} h-10 rounded-[10px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}>
              {companyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)} className={`${interMedium.className} h-10 rounded-[10px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}>
              {workerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>

          <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] p-3">
            <div className="flex items-center justify-between">
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#6E7F97]`}>Site Clocking</p>
              <p className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Utility actions</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void clockIn()} disabled={isSaving || Boolean(activeMyEntry)} className="h-10 rounded-[10px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]">Clock In</Button>
              <Button type="button" variant="outline" onClick={() => void clockOut()} disabled={isSaving || !activeMyEntry} className="h-10 rounded-[10px] border-[#D6DDE9] bg-white px-4 text-sm font-medium text-[#1D2433]">Clock Out</Button>
              {activeMyEntry ? (
                <span className={`${interMedium.className} inline-flex items-center gap-1 text-xs font-semibold text-[#1F2E45]`}>
                  <Timer className="h-3.5 w-3.5 text-[#F74917]" />
                  Active for {formatHours(getHours(activeMyEntry, now))}
                </span>
              ) : null}
            </div>
          </div>

          {notice ? <p className={`${interMedium.className} rounded-[10px] border border-[#D6E7FB] bg-[#EFF6FF] px-3 py-2 text-sm font-medium text-[#1D4ED8]`}>{notice}</p> : null}
          {error ? <p className={`${interMedium.className} rounded-[10px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p> : null}
        </CardContent>
      </Card>

      <Card className={`border shadow-none ${labourRisk.tone === "high" ? "border-[#F4C4B6] bg-[#FFF5F2]" : labourRisk.tone === "medium" ? "border-[#F4E0A6] bg-[#FFFAEB]" : "border-[#CFE7D6] bg-[#F4FCF6]"}`}>
        <CardContent className="py-3">
          <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#6E7F97]`}>Labour Risk Indicator</p>
          <p className="mt-1 text-sm font-semibold text-[#1F2E45]">{labourRisk.message}</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardContent className="py-5">
            <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#6E7F97]`}>On Site Now</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
              <p className="text-4xl font-semibold tracking-[-0.03em] text-[#0F172A]">{summary.onSiteNow}</p>
            </div>
            <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>Live workforce on site</p>
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: "Total Hours", value: formatHours(summary.totalHours) },
            { label: "Workers", value: summary.workersToday.toString() },
            { label: "Avg Hours / Worker", value: formatHours(summary.avgHours) },
            { label: "Overtime Alerts", value: summary.overtimeAlerts.toString() },
            { label: "Missing Clock Outs", value: summary.missingClockOuts.toString() },
          ].map((card) => (
            <Card key={card.label} className="border-[#E6EAF0] bg-white shadow-none">
              <CardContent className="py-4">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#6E7F97]`}>{card.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-2 pt-5">
            <CardTitle className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Live Site Workforce</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            {isLoading ? (
              <p className={`${interMedium.className} py-8 text-sm font-medium text-[#64748B]`}>Loading workforce...</p>
            ) : liveWorkforce.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[#D7DFEC] bg-[#FAFCFF] px-4 py-6">
                <p className="text-sm font-semibold text-[#0F172A]">Live workforce feed is active</p>
                <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>No one is clocked in right now. New clock-ins will appear here immediately.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleLiveWorkforce.map((entry) => {
                  const status = liveStatus(entry, now);
                  const statusClass = status === "Normal" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : status === "8.5h Warning" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-rose-100 text-rose-800 border-rose-200";
                  return (
                    <div key={entry.id} className="grid gap-2 rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] p-3 md:grid-cols-[1.2fr_1fr_1fr_1.3fr_1fr]">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B4F8A] text-xs font-semibold text-white">{getInitials(entry.worker_name)}</span>
                        <div>
                          <p className="text-sm font-semibold text-[#0F172A]">{entry.worker_name}</p>
                          <p className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>{entry.company_name} / {entry.trade_name}</p>
                        </div>
                      </div>
                      <p className={`${interMedium.className} text-sm font-medium text-[#334155]`}>In: {formatTime(entry.clock_in_at)}</p>
                      <p className={`${interMedium.className} text-sm font-medium text-[#334155]`}>
                        <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5 text-[#F74917]" />{formatHours(getHours(entry, now))}</span>
                      </p>
                      <p className={`${interMedium.className} text-sm font-medium text-[#334155]`}>
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#0B4F8A]" />{locationLabel(entry.clock_in_latitude, entry.clock_in_longitude, entry.clock_in_accuracy_meters)}</span>
                      </p>
                      <span className={`inline-flex h-fit rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{status}</span>
                    </div>
                  );
                })}
                {liveWorkforce.length > visibleLiveWorkforce.length ? (
                  <p className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>Showing first {visibleLiveWorkforce.length} live workers for performance.</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#E6EAF0] bg-white shadow-none">
          <CardHeader className="pb-2 pt-5">
            <CardTitle className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-5">
            {events.length === 0 ? (
              <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>No activity yet.</p>
            ) : (
              events.slice(0, 12).map((event) => {
                const EventIcon = event.event_type === "clock_in" ? LogIn : event.event_type === "clock_out" ? LogOut : event.event_type === "warning_8h5" ? AlertTriangle : Clock3;
                const iconTone = event.event_type === "warning_8h5" || event.event_type === "auto_clock_out" ? "text-[#B45309]" : "text-[#0B4F8A]";
                return (
                  <div key={event.id} className="rounded-[10px] border border-[#E6EAF0] bg-[#FAFCFF] px-3 py-2.5">
                    <p className={`${interMedium.className} inline-flex items-center gap-1.5 text-sm font-medium text-[#1F2E45]`}>
                      <EventIcon className={`h-3.5 w-3.5 ${iconTone}`} />
                      {event.message}
                    </p>
                    <p className={`${interMedium.className} mt-1 text-xs text-[#64748B]`}>{formatDateTime(event.created_at)}</p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-5">
          <CardTitle className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Workforce Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-5">
          {timelineRows.length === 0 ? (
            <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>No timeline data in this range.</p>
          ) : (
            <>
              <div className="relative h-0"><div className="absolute left-[50%] top-0 z-10 h-4 border-l-2 border-dashed border-[#94A3B8]" /></div>
              {timelineRows.map((row) => (
                <div key={row.id} className="grid items-center gap-2 md:grid-cols-[220px_1fr_130px]">
                  <p className={`${interMedium.className} text-sm font-semibold text-[#1F2E45]`}>{row.workerName}</p>
                  <div className="relative h-6 rounded-[8px] bg-[#EAF0F8]">
                    <div className={`absolute bottom-0 top-0 rounded-[8px] ${row.isOvertime ? "bg-[#F59E0B]" : "bg-[#0B4F8A]"}`} style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }} />
                  </div>
                  <p className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>{row.rangeLabel}</p>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-5">
          <CardTitle className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Worker Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          {filteredEntries.length === 0 ? (
            <p className={`${interMedium.className} text-sm font-medium text-[#64748B]`}>No workers in this selection.</p>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[#E8EDF5]">
              <table className="min-w-[1100px] border-collapse">
                <thead>
                  <tr className={`${interMedium.className} bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>
                    <th className="px-3 py-2 text-left">Worker</th>
                    <th className="px-3 py-2 text-left">Trade / Company</th>
                    <th className="px-3 py-2 text-left">Clock In</th>
                    <th className="px-3 py-2 text-left">Clock Out</th>
                    <th className="px-3 py-2 text-left">Total Hours</th>
                    <th className="px-3 py-2 text-left">Overtime</th>
                    <th className="px-3 py-2 text-left">Auto Clocked</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownEntries.map((entry) => {
                    const hours = getHours(entry, now);
                    const statusClass =
                      hours >= 10
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : hours >= 8.5
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-emerald-100 text-emerald-800 border-emerald-200";
                    const statusLabel = hours >= 10 ? "Critical" : hours >= 8.5 ? "Warning" : "Normal";
                    return (
                      <tr key={entry.id} className="border-t border-[#EEF2F7] transition-colors hover:bg-[#F8FBFF]">
                        <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A]">{entry.worker_name}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{entry.trade_name} / {entry.company_name}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{formatTime(entry.clock_in_at)}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{formatTime(entry.clock_out_at)}</td>
                        <td className={`${interMedium.className} px-3 py-2.5 text-sm font-medium text-[#334155]`}>{formatHours(hours)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${entry.auto_clocked_out ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
                            {entry.auto_clocked_out ? "Yes" : "No"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredEntries.length > BREAKDOWN_PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>
                Showing {breakdownStartIndex + 1}-{Math.min(filteredEntries.length, breakdownStartIndex + BREAKDOWN_PAGE_SIZE)} of {filteredEntries.length}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" className="h-8 rounded-[8px] border-[#D6DDE9] px-3 text-xs" disabled={breakdownPage <= 1} onClick={() => setBreakdownPage((current) => Math.max(1, current - 1))}>Previous</Button>
                <span className={`${interMedium.className} text-xs font-medium text-[#334155]`}>Page {breakdownPage} / {breakdownTotalPages}</span>
                <Button type="button" variant="outline" className="h-8 rounded-[8px] border-[#D6DDE9] px-3 text-xs" disabled={breakdownPage >= breakdownTotalPages} onClick={() => setBreakdownPage((current) => Math.min(breakdownTotalPages, current + 1))}>Next</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-2 pt-5">
          <CardTitle className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Labour Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-5">
          {insights.map((insight) => (
            <div key={insight} className="flex items-start gap-2 rounded-[10px] border border-[#E6EAF0] bg-[#FAFCFF] px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#0B4F8A]" />
              <p className={`${interMedium.className} text-sm font-medium text-[#1F2E45]`}>{insight}</p>
            </div>
          ))}
          <p className={`${interMedium.className} text-xs text-[#64748B]`}>
            Clock in/out location is stored as coordinates with accuracy for accountability and audit history.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
