import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

interface PageHeaderValue {
  title: ReactNode;
  subtitle?: ReactNode;
}

interface PageHeaderContextValue {
  header: PageHeaderValue;
  setHeader: (value: PageHeaderValue) => void;
}

const DEFAULT_HEADER: PageHeaderValue = { title: "TimeSync" };

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderValue>(DEFAULT_HEADER);
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

/** Pages call this to put their title/subtitle in the Topbar instead of rendering their own <h1>. */
export function usePageHeader(title: ReactNode, subtitle?: ReactNode) {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error("usePageHeader must be used within a PageHeaderProvider");
  const { setHeader } = ctx;
  useLayoutEffect(() => {
    setHeader({ title, subtitle });
    return () => setHeader(DEFAULT_HEADER);
  }, [title, subtitle, setHeader]);
}

export function usePageHeaderValue(): PageHeaderValue {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error("usePageHeaderValue must be used within a PageHeaderProvider");
  return ctx.header;
}
