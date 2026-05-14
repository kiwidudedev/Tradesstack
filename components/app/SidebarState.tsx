"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY_COLLAPSED = "tradesstack:sidebar-collapsed";
const STORAGE_KEY_WIDTH = "tradesstack:sidebar-width";

export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_COMPACT_WIDTH = 64;

interface SidebarStateContextValue {
  isCollapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  isDragging: boolean;
  setDragging: (dragging: boolean) => void;
  isHydrated: boolean;
}

const SidebarStateContext = createContext<SidebarStateContextValue | null>(null);

function clampWidth(value: number) {
  if (Number.isNaN(value)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, value));
}

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsedState] = useState(false);
  const [width, setWidthState] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isDragging, setIsDraggingState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedCollapsed = window.localStorage.getItem(STORAGE_KEY_COLLAPSED);
      if (storedCollapsed === "true") {
        setIsCollapsedState(true);
      }
      const storedWidth = window.localStorage.getItem(STORAGE_KEY_WIDTH);
      if (storedWidth) {
        const parsed = parseInt(storedWidth, 10);
        if (!Number.isNaN(parsed)) {
          setWidthState(clampWidth(parsed));
        }
      }
    } catch {
      // localStorage unavailable — keep defaults
    }
    setIsHydrated(true);
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed);
    try {
      window.localStorage.setItem(STORAGE_KEY_COLLAPSED, String(collapsed));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    setIsCollapsedState((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY_COLLAPSED, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setWidth = useCallback((nextWidth: number) => {
    const clamped = clampWidth(nextWidth);
    setWidthState(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY_WIDTH, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  const setDragging = useCallback((dragging: boolean) => {
    setIsDraggingState(dragging);
  }, []);

  return (
    <SidebarStateContext.Provider
      value={{
        isCollapsed,
        toggle,
        setCollapsed,
        width,
        setWidth,
        isDragging,
        setDragging,
        isHydrated,
      }}
    >
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState(): SidebarStateContextValue {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) {
    return {
      isCollapsed: false,
      toggle: () => {},
      setCollapsed: () => {},
      width: SIDEBAR_DEFAULT_WIDTH,
      setWidth: () => {},
      isDragging: false,
      setDragging: () => {},
      isHydrated: false,
    };
  }
  return ctx;
}
