import { redirect } from "next/navigation";

// The calendar now lives inside the Timeline page; keep old links working.
export default async function CalendarPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  redirect(`/groups/${groupId}/timeline?view=calendar`);
}
