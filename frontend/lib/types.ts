export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  googleConnected?: boolean;
  hasPassword?: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  role: "OWNER" | "MEMBER";
  memberCount: number;
  taskCount: number;
}

export interface Column {
  id: string;
  groupId: string;
  name: string;
  order: number;
}

export interface GroupMember {
  id: string;
  role: "OWNER" | "MEMBER";
  user: User;
}

export interface GroupDetail {
  id: string;
  name: string;
  ownerId: string;
  columns: Column[];
  members: GroupMember[];
  labels: Label[];
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  groupId: string;
  columnId: string;
  order: number;
  assignee: User | null;
  creator: User;
  createdAt: string;
  updatedAt: string;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  labels: Label[];
  dependencies: { dependsOnId: string }[];
  subtasks: Subtask[];
  _count: { comments: number; attachments: number };
}

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export interface Label { id: string; name: string; color: string }
export interface Subtask { id: string; title: string; completed: boolean }
export interface Comment { id: string; body: string; author: User; authorId: string; createdAt: string; updatedAt: string }
export interface Attachment { id: string; name: string; size: number; uploaderId: string; createdAt: string }
export interface Activity { id: string; message: string; actor: User; createdAt: string; taskId: string | null }
export interface TaskDetail extends Task { comments: Comment[]; attachments: Attachment[]; activity: Activity[] }
export interface PersonalTask extends Task { group: { id: string; name: string }; column: Column }

export interface Invite {
  id: string;
  groupId: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: string;
  group: { id: string; name: string };
  invitedBy: User;
}

export type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE";
export type DeadlineState = "UPCOMING" | "TODAY" | "OVERDUE" | "COMPLETED";

export interface Milestone {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberProgress {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MEMBER";
  assigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  completionPercent: number;
}

export interface DashboardStats {
  totalTasks: number;
  totalMembers: number;
  unassignedCount: number;
  tasksByColumn: { columnId: string; columnName: string; status: StatusCategory; count: number }[];
  tasksByAssignee: { userId: string; name: string; email: string; count: number }[];
  summary: { completed: number; inProgress: number; notStarted: number; overdue: number; upcoming: number; completionPercent: number; upcomingDays: number };
  team: MemberProgress[];
  deadlines: { id: string; title: string; dueDate: string; assignee: User | null; status: StatusCategory; deadline: DeadlineState }[];
}
