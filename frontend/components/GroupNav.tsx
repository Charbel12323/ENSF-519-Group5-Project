"use client";
import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BackLink from "./BackLink";

// Header shared by every per-group view so users can switch between views of the same project.
export default function GroupNav({ groupId, groupName, title, actions }: { groupId: string; groupName?: string; title: string; actions?: ReactNode }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/board/${groupId}`, label: "Board" },
    { href: `/groups/${groupId}/calendar`, label: "Calendar" },
    { href: `/groups/${groupId}/timeline`, label: "Timeline" },
    { href: `/dashboard/${groupId}`, label: "Dashboard" },
    { href: `/groups/${groupId}/members`, label: "Members & settings" },
  ];
  return <>
    <BackLink href="/dashboard" label="Back to groups" />
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm text-slate-500">{groupName}</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1></div>
      {actions}
    </div>
    <nav aria-label="Project views" className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{tab.label}</Link>;
      })}
    </nav>
  </>;
}
