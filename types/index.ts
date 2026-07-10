export type UserRole = "owner" | "admin" | "manager" | "member" | "guest";

export interface WorkspaceMember {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  joinedAt: string;
}

/**
 * Extended member type with profile details for UI display (member management page).
 */
export interface WorkspaceMemberWithProfile {
  id: string;
  workspaceId: string;
  profileId: string;
  role: UserRole;
  createdAt: string;
  profile: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  ai_provider?: string;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  createdAt: string;
  createdById: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  isAI?: boolean;
  attachments?: Attachment[];
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: "planning" | "active" | "completed" | "on-hold";
  dueDate?: string;
  createdAt: string;
  createdById: string;
}

export interface ProjectColumn {
  id: string;
  projectId: string;
  name: string;
  position: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  profileId: string;
  content: string;
  createdAt: string;
  profile?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface TaskLabel {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  workspaceId?: string;
  columnId?: string;
  title: string;
  description?: string;
  status: "backlog" | "todo" | "in-progress" | "in-review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigneeId?: string;
  reporterId?: string;
  dueDateTime?: string;
  dueDate?: string;
  estimatedHours?: number;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  labels?: TaskLabel[];
}

export interface ActivityLog {
  id: string;
  workspaceId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Notification {
  id: string;
  workspaceId: string;
  profileId: string;
  type: string;
  title: string;
  content: string;
  targetUrl: string;
  isRead: boolean;
  createdAt: string;
  referenceType?: string | null;
  referenceId?: string | null;
  body?: string | null;
}

export interface Attachment {
  id: string;
  workspaceId: string;
  uploaderId: string | null;
  bucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  entityType: string;
  entityId: string;
  createdAt: string;
  signedUrl?: string;
}
