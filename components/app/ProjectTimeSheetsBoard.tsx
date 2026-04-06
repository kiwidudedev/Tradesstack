"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Download, FileText, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type DashboardRange = "Today" | "This week" | "All recent";

const MAX_ENTRY_ROWS = 1000;
const MAX_EVENT_ROWS = 80;
const MAX_TIMELINE_ROWS = 120;

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
      return { label: "Auto Pending", tone: "bg-rose-100 text-rose-800 border-rose-200" };
    }
    if (hours >= 8.5) {
      return { label: "Warning", tone: "bg-amber-100 text-amber-800 border-amber-200" };
    }
    return { label: "Clocked In", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  }
  if (entry.auto_clocked_out) {
    return { label: "Auto Clocked", tone: "bg-rose-100 text-rose-800 border-rose-200" };
  }
  return { label: "Finished", tone: "bg-slate-100 text-slate-700 border-slate-200" };
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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
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
          (entry.worker_user_id === session.id && (session.role === "owner" || session.role === "admin") ? "Management" : "Site Crew"),
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
          trade_name: session.role === "owner" || session.role === "admin" ? "Management" : "Site Crew",
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
      `${events.length} clocking events logged in this range.`,
    ];
  }, [events.length, filteredEntries, now]);

  const registerGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        trade: string;
        company: string;
        entries: TimeEntryRow[];
      }
    >();

    filteredEntries.forEach((entry) => {
      const trade = entry.trade_name || "Unassigned";
      const company = entry.company_name || "Unassigned";
      const key = `${trade}__${company}`;
      if (!groups.has(key)) {
        groups.set(key, { key, trade, company, entries: [] });
      }
      groups.get(key)?.entries.push(entry);
    });

    return Array.from(groups.values())
      .map((group) => {
        const sortedEntries = group.entries
          .slice()
          .sort((a, b) => new Date(b.clock_in_at).getTime() - new Date(a.clock_in_at).getTime());
        const totalHours = sortedEntries.reduce((sum, entry) => sum + getHours(entry, now), 0);
        const riskCount = sortedEntries.filter((entry) => getHours(entry, now) >= 8.5 || entry.auto_clocked_out).length;
        return {
          ...group,
          entries: sortedEntries,
          totalHours,
          riskCount,
          entryCount: sortedEntries.length,
        };
      })
      .sort((a, b) => a.trade.localeCompare(b.trade) || a.company.localeCompare(b.company));
  }, [filteredEntries, now]);

  useEffect(() => {
    setExpandedGroups((current) => {
      const next: Record<string, boolean> = {};
      registerGroups.forEach((group, index) => {
        next[group.key] = current[group.key] ?? index === 0;
      });
      return next;
    });
  }, [registerGroups]);

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
    <div className="space-y-4 bg-[#F8F9FC]">
      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
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
                className={`${interMedium.className} h-10 rounded-[6px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}
              >
                <option value="Today">Today</option>
                <option value="This week">This week</option>
                <option value="All recent">All recent</option>
              </select>
              <Button type="button" variant="outline" className="h-10 rounded-[6px] border-[#D6DDE9] bg-white px-3 text-[#1D2433]" onClick={exportCsv}>
                <Download className="mr-1.5 h-4 w-4" />
                CSV
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-[6px] border-[#D6DDE9] bg-white px-3 text-[#1D2433]" onClick={() => window.print()}>
                <FileText className="mr-1.5 h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>
          {notice ? <p className={`${interMedium.className} mt-4 rounded-[6px] border border-[#D6E7FB] bg-[#EFF6FF] px-3 py-2 text-sm font-medium text-[#1D4ED8]`}>{notice}</p> : null}
          {error ? <p className={`${interMedium.className} mt-4 rounded-[6px] border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700`}>{error}</p> : null}
        </CardHeader>
      </Card>

      <div className="overflow-x-auto rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC]">
        <div className="flex min-w-[900px] divide-x divide-[#E3E8F0]">
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <Users className="h-5 w-5 text-[#1D4ED8]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>On Site Now</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{summary.onSiteNow}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <Clock3 className="h-5 w-5 text-[#B45309]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Overtime Alerts</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{summary.overtimeAlerts}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Complete</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{Math.max(0, summary.workersToday - summary.missingClockOuts)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-5 py-4">
            <Timer className="h-5 w-5 text-[#0F766E]" />
            <div>
              <p className={`${interMedium.className} text-[11px] uppercase tracking-[0.12em] text-[#6E7F97]`}>Total Hours</p>
              <p className={`${interMedium.className} text-xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{formatHours(summary.totalHours)}</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Workforce Register</h3>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>{insights[0]}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className={`${interMedium.className} text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6E7F97]`}>Site Clocking</p>
              {activeMyEntry ? (
                <span className={`${interMedium.className} inline-flex items-center gap-1 text-xs font-semibold text-[#1F2E45]`}>
                  <Timer className="h-3.5 w-3.5 text-[#F74917]" />
                  {formatHours(getHours(activeMyEntry, now))}
                </span>
              ) : null}
              <Button type="button" onClick={() => void clockIn()} disabled={isSaving || Boolean(activeMyEntry)} className="h-9 rounded-[6px] bg-[#F74917] px-3 text-xs font-medium text-white hover:bg-[#e63f10]">Clock In</Button>
              <Button type="button" variant="outline" onClick={() => void clockOut()} disabled={isSaving || !activeMyEntry} className="h-9 rounded-[6px] border-[#D6DDE9] bg-white px-3 text-xs font-medium text-[#1D2433]">Clock Out</Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <select value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}>
              {tradeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}>
              {companyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)} className={`${interMedium.className} h-10 rounded-[6px] border border-[#D6DDE9] bg-[#F8FAFC] px-3 text-sm font-medium text-[#1D2433]`}>
              {workerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-5">
          <section className="overflow-hidden rounded-[6px] border border-[#E8EDF5]">
            <div className={`${interMedium.className} grid grid-cols-[1.8fr_0.9fr_0.9fr_0.9fr] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>
              <p>Group</p>
              <p className="text-right">Entries</p>
              <p className="text-right">Total Hours</p>
              <p className="text-right">Risks</p>
            </div>

            {isLoading ? (
              <p className={`${interMedium.className} px-3 py-4 text-sm font-medium text-[#64748B]`}>Loading register...</p>
            ) : registerGroups.length === 0 ? (
              <p className={`${interMedium.className} px-3 py-4 text-sm font-medium text-[#64748B]`}>No time entries in this selection.</p>
            ) : (
              <div>
                {registerGroups.map((group) => (
                  <div key={group.key} className="border-t border-[#EEF2F7] first:border-t-0">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
                      className="grid w-full grid-cols-[1.8fr_0.9fr_0.9fr_0.9fr] items-center px-3 py-2.5 text-left transition-colors hover:bg-[#FBFDFF]"
                    >
                      <p className="text-sm font-semibold text-[#0F172A]">
                        <span className="mr-2 inline-block w-3 text-[#64748B]">{expandedGroups[group.key] ? "−" : "+"}</span>
                        {group.trade} / {group.company}
                      </p>
                      <p className={`${interMedium.className} text-right text-sm font-medium text-[#334155]`}>{group.entryCount}</p>
                      <p className={`${interMedium.className} text-right text-sm font-medium text-[#334155]`}>{formatHours(group.totalHours)}</p>
                      <p className={`text-right text-sm font-semibold ${group.riskCount > 0 ? "text-[#B45309]" : "text-[#64748B]"}`}>{group.riskCount}</p>
                    </button>

                    {expandedGroups[group.key] ? (
                      <div className="border-t border-[#EEF2F7] bg-[#FCFDFF] px-3 py-2.5">
                        <div className="overflow-auto rounded-[6px] border border-[#E9EEF5] bg-white">
                          <table className="min-w-[860px] border-collapse">
                            <thead>
                              <tr className={`${interMedium.className} bg-[#F8FAFC] text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>
                                <th className="px-3 py-2 text-left">Worker</th>
                                <th className="px-3 py-2 text-left">Clock In</th>
                                <th className="px-3 py-2 text-left">Clock Out</th>
                                <th className="px-3 py-2 text-left">Duration</th>
                                <th className="px-3 py-2 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.entries.map((entry) => {
                                const status = registerStatus(entry, now);
                                return (
                                  <tr key={entry.id} className="border-t border-[#EEF2F7] first:border-t-0">
                                    <td className="px-3 py-2 text-sm font-semibold text-[#0F172A]">{entry.worker_name}</td>
                                    <td className={`${interMedium.className} px-3 py-2 text-sm font-medium text-[#334155]`}>{formatTime(entry.clock_in_at)}</td>
                                    <td className={`${interMedium.className} px-3 py-2 text-sm font-medium text-[#334155]`}>{formatTime(entry.clock_out_at)}</td>
                                    <td className={`${interMedium.className} px-3 py-2 text-sm font-medium text-[#334155]`}>{formatHours(getHours(entry, now))}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex rounded-[6px] border px-2 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
          <p className={`${interMedium.className} mt-3 text-xs text-[#7A889C]`}>
            {insights[2]} Coordinates are logged at clock in/out for audit traceability.
          </p>
        </CardContent>
      </Card>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-2 pt-5">
          <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#0F172A]">Workforce Overview</h3>
        </CardHeader>
        <CardContent className="pb-5">
          <div className="space-y-2">
            {timelineRows.length === 0 ? (
              <p className={`${interMedium.className} rounded-[6px] border border-dashed border-[#D7DFEC] bg-[#FAFCFF] px-4 py-3 text-sm font-medium text-[#64748B]`}>No timeline data in this range.</p>
            ) : (
              <>
                <div className="relative h-0"><div className="absolute left-[50%] top-0 z-10 h-4 border-l-2 border-dashed border-[#94A3B8]" /></div>
                {timelineRows.map((row) => (
                  <div key={row.id} className="grid items-center gap-2 md:grid-cols-[220px_1fr_130px]">
                    <p className={`${interMedium.className} text-sm font-semibold text-[#1F2E45]`}>{row.workerName}</p>
                    <div className="relative h-6 rounded-[6px] bg-[#EAF0F8]">
                      <div className={`absolute bottom-0 top-0 rounded-[6px] ${row.isOvertime ? "bg-[#F59E0B]" : "bg-[#0B4F8A]"}`} style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }} />
                    </div>
                    <p className={`${interMedium.className} text-xs font-medium text-[#64748B]`}>{row.rangeLabel}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
