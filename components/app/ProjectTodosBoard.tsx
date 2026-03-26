"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";

interface TodoItem {
  id: string;
  title: string;
  dueLabel: string;
  completed: boolean;
}

const INITIAL_TODOS: TodoItem[] = [
  { id: "todo-site-measure", title: "Confirm site measure with electrician", dueLabel: "Today", completed: false },
  { id: "todo-material-order", title: "Approve variation material order", dueLabel: "Tomorrow", completed: false },
  { id: "todo-client-signoff", title: "Get client sign-off on joinery selections", dueLabel: "This week", completed: true },
];

function buildTodoId() {
  return `todo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function ProjectTodosBoard() {
  const [todos, setTodos] = useState<TodoItem[]>(INITIAL_TODOS);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDueLabel, setDraftDueLabel] = useState("Today");

  const completedCount = useMemo(() => todos.filter((item) => item.completed).length, [todos]);
  const pendingCount = todos.length - completedCount;

  const addTodo = () => {
    const normalizedTitle = draftTitle.trim();
    if (!normalizedTitle) {
      return;
    }

    setTodos((current) => [
      {
        id: buildTodoId(),
        title: normalizedTitle,
        dueLabel: draftDueLabel.trim() || "Today",
        completed: false,
      },
      ...current,
    ]);
    setDraftTitle("");
    setDraftDueLabel("Today");
  };

  const toggleTodo = (id: string) => {
    setTodos((current) =>
      current.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">To do&apos;s</CardTitle>
          <p className={`${interMedium.className} mt-2 text-sm font-medium text-[#64748B]`}>
            Plan and track job actions for this project.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pb-7">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-4 py-3">
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#6E7F97]`}>Pending</p>
              <p className={`${interMedium.className} mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{pendingCount}</p>
            </div>
            <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-4 py-3">
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#6E7F97]`}>Completed</p>
              <p className={`${interMedium.className} mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]`}>{completedCount}</p>
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
              <Input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Add a to do..."
                className="h-10 border-[#D6DDE9] bg-white"
              />
              <Input
                value={draftDueLabel}
                onChange={(event) => setDraftDueLabel(event.target.value)}
                placeholder="Due (e.g. Today)"
                className="h-10 border-[#D6DDE9] bg-white"
              />
              <Button
                type="button"
                onClick={addTodo}
                className="h-10 rounded-[8px] bg-[#F74917] px-4 text-sm font-medium text-white hover:bg-[#e63f10]"
              >
                Add To do
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-3 pt-6">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">Job List</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-6">
          {todos.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleTodo(item.id)}
              className="flex w-full items-center justify-between rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-3 text-left transition-colors hover:bg-white"
            >
              <span className="flex items-center gap-2">
                {item.completed ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-[#15803D]" />
                ) : (
                  <Circle className="h-4.5 w-4.5 text-[#7B8AA2]" />
                )}
                <span
                  className={`${interMedium.className} text-sm font-semibold ${
                    item.completed ? "text-[#7B8AA2] line-through" : "text-[#1D2433]"
                  }`}
                >
                  {item.title}
                </span>
              </span>
              <span className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.12em] text-[#6E7F97]`}>
                {item.dueLabel}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
