"use client";
import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BackLink from "./BackLink";

type Indicator = { left: number; width: number; animate: boolean };
// Each page mounts its own GroupNav, so remember where the underline was to slide it from there.
let lastIndicator: Omit<Indicator, "animate"> | null = null;

// Header shared by every per-group view so users can switch between views of the same project.
export default function GroupNav({ groupId, groupName, title, actions }: { groupId: string; groupName?: string; title: string; actions?: ReactNode }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/board/${groupId}`, label: "Board" },
    { href: `/groups/${groupId}/timeline`, label: "Timeline" },
    { href: `/dashboard/${groupId}`, label: "Dashboard" },
    { href: `/groups/${groupId}/members`, label: "Members & settings" },
  ];
  const activeIndex = tabs.findIndex((tab) => tab.href === pathname);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  useLayoutEffect(() => {
    const el = refs.current[activeIndex];
    if (!el) return;
    const target = { left: el.offsetLeft, width: el.offsetWidth };
    const from = lastIndicator;
    lastIndicator = target;
    if (!from) { setIndicator({ ...target, animate: false }); return; }
    // Paint at the previous tab's position first, then transition to the new one.
    setIndicator({ ...from, animate: false });
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setIndicator({ ...target, animate: true })));
    return () => cancelAnimationFrame(frame);
  }, [activeIndex]);

  return <>
    <BackLink href="/dashboard" label="Back to groups" />
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm text-slate-500">{groupName}</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1></div>
      {actions}
    </div>
    <nav aria-label="Project views" className="relative mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab, i) => {
        const active = i === activeIndex;
        return <Link key={tab.href} href={tab.href} ref={(el) => { refs.current[i] = el; }} aria-current={active ? "page" : undefined}
          className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors duration-300 active:scale-95 ${active ? "text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>{tab.label}</Link>;
      })}
      {indicator && <span aria-hidden="true" className={`absolute bottom-0 h-0.5 rounded-full bg-brand-600 ${indicator.animate ? "transition-all duration-300 ease-out motion-reduce:transition-none" : ""}`}
        style={{ left: indicator.left, width: indicator.width }} />}
    </nav>
  </>;
}
