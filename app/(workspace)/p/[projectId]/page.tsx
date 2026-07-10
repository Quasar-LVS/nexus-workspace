"use client";

import React, { use, useState, useEffect, useMemo, useRef } from "react";
import { 
  FolderKanban, 
  Sparkles, 
  Plus, 
  Loader2, 
  Trash2, 
  Archive, 
  Copy, 
  X, 
  Paperclip, 
  Smile, 
  Calendar as CalendarIcon, 
  AlertCircle, 
  Clock, 
  User, 
  MessageSquare,
  Activity as ActivityIcon,
  Tag,
  Hourglass,
  ArrowRight,
  ExternalLink,
  Edit2,
  FileImage
} from "lucide-react";
import { toast } from "sonner";
import { useNovaPanelStore } from "@/hooks/use-nova-panel-store";
import { useWorkspace } from "@/context/workspace-context";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getProjectTasksAction, 
  createTaskAction, 
  updateTaskAction, 
  deleteTaskAction, 
  duplicateTaskAction,
  getTaskCommentsAction,
  createTaskCommentAction,
  getTaskAttachmentsAction,
  createTaskAttachmentAction,
  getWorkspaceLabelsAction,
  addLabelToTaskAction,
  removeLabelFromTaskAction
} from "@/app/actions/task";
import {
  uploadAttachmentAction,
  deleteAttachmentAction,
  listAttachmentsAction
} from "@/app/actions/storage";
import { generateProjectTasksAction } from "@/app/actions/nova-ai";
import { 
  getProjectColumnsAction, 
  createColumnAction, 
  updateColumnAction 
} from "@/app/actions/column";
import { getProjectByIdAction } from "@/app/actions/project";
import { Task, ProjectColumn, TaskComment, TaskAttachment, TaskLabel } from "@/types";
import { cn } from "@/lib/utils";
import { useRealtimeProjects, useRealtimeTasks } from "@/hooks/use-realtime";
import { NovaAI } from "@/lib/nova";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { openNova, setLoading: setNovaLoading, setActiveSummary } = useNovaPanelStore();
  const { user } = useUser();
  const { currentWorkspace, members, refreshWorkspaceData } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  // Kanban states
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<ProjectColumn[]>([]);
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Column management states
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");

  // Task creation states
  const [addingTaskToColumnId, setAddingTaskToColumnId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [submittingTask, setSubmittingTask] = useState(false);

  // Task Drawer states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [availableLabels, setAvailableLabels] = useState<TaskLabel[]>([]);

  // Drawer comment/attachment actions state
  const [newCommentText, setNewCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [attachingName, setAttachingName] = useState("");
  const [attachingUrl, setAttachingUrl] = useState("");
  const [submittingAttachment, setSubmittingAttachment] = useState(false);

  const [uploadingTaskFile, setUploadingTaskFile] = useState(false);
  const taskFileInputRef = useRef<HTMLInputElement>(null);

  // Project-wide attachments states
  const [projectFilesOpen, setProjectFilesOpen] = useState(false);
  const [projectAttachments, setProjectAttachments] = useState<any[]>([]);
  const [loadingProjectFiles, setLoadingProjectFiles] = useState(false);
  const [uploadingProjectFile, setUploadingProjectFile] = useState(false);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  const loadProjectAttachments = async () => {
    setLoadingProjectFiles(true);
    try {
      const res = await listAttachmentsAction("project", projectId);
      if (res.success && res.data) {
        setProjectAttachments(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjectFiles(false);
    }
  };

  const handleUploadProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !workspaceId) return;
    const file = e.target.files[0];
    setUploadingProjectFile(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspaceId);
      formData.append("entityType", "project");
      formData.append("entityId", projectId);

      const res = await uploadAttachmentAction(formData);
      if (res.success && res.data) {
        setProjectAttachments(prev => [res.data, ...prev]);
        toast.success("Project file uploaded successfully!");
      } else {
        toast.error(res.error || "Failed to upload project file.");
      }
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploadingProjectFile(false);
    }
  };

  const handleUploadTaskFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedTask || !workspaceId) return;
    const file = e.target.files[0];
    setUploadingTaskFile(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspaceId);
      formData.append("entityType", "task");
      formData.append("entityId", selectedTask.id);

      const result = await uploadAttachmentAction(formData);
      if (result.success && result.data) {
        setAttachments(prev => [
          {
            id: result.data.id,
            taskId: result.data.entityId,
            fileName: result.data.fileName,
            fileUrl: result.data.storagePath,
            uploadedBy: result.data.uploaderId,
            createdAt: result.data.createdAt
          },
          ...prev
        ]);
        toast.success("File uploaded and attached!");
      } else {
        toast.error(result.error || "Failed to upload file.");
      }
    } catch {
      toast.error("Upload error occurred.");
    } finally {
      setUploadingTaskFile(false);
    }
  };

  useEffect(() => {
    if (projectFilesOpen) {
      loadProjectAttachments();
    }
  }, [projectFilesOpen]);

  // AI Task Generator states
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [aiGoalPrompt, setAiGoalPrompt] = useState("");
  const [generatingAiTasks, setGeneratingAiTasks] = useState(false);

  const handleGenerateAiTasks = async () => {
    if (!aiGoalPrompt.trim() || !workspaceId) return;

    setGeneratingAiTasks(true);
    try {
      const res = await generateProjectTasksAction(workspaceId, projectId, aiGoalPrompt.trim());
      if (res.success) {
        toast.success("AI tasks successfully generated and seeded!");
        setAiGeneratorOpen(false);
        setAiGoalPrompt("");
        await loadProjectData();
      } else {
        toast.error(res.error || "Failed to generate AI tasks.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setGeneratingAiTasks(false);
    }
  };

  // Load project column and task data
  const loadProjectData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [projectRes, tasksRes, columnsRes] = await Promise.all([
        getProjectByIdAction(projectId),
        getProjectTasksAction(projectId),
        getProjectColumnsAction(projectId),
      ]);

      if (projectRes.success && projectRes.data) {
        setProjectName(projectRes.data.name);
      }

      let fetchedColumns: ProjectColumn[] = [];
      if (columnsRes.success && columnsRes.data) {
        fetchedColumns = columnsRes.data;
      }

      // Seed default columns if none exist (for backward compatibility)
      if (fetchedColumns.length === 0) {
        const defaults = ["Backlog", "Todo", "In Progress", "Review", "Done"];
        const seeded: ProjectColumn[] = [];
        for (let i = 0; i < defaults.length; i++) {
          const colRes = await createColumnAction(projectId, defaults[i], i);
          if (colRes.success && colRes.data) {
            seeded.push(colRes.data);
          }
        }
        fetchedColumns = seeded;
      }
      setColumns(fetchedColumns);

      if (tasksRes.success && tasksRes.data) {
        // Map tasks into their seeded default column if columns exist and tasks have no columnId
        const mapped = tasksRes.data.map(t => {
          if (!t.columnId && fetchedColumns.length > 0) {
            // Match closest category
            const match = fetchedColumns.find(c => c.name.toLowerCase().includes(t.status.toLowerCase())) || fetchedColumns[0];
            return { ...t, columnId: match.id };
          }
          return t;
        });
        setTasks(mapped);
      }
    } catch (err) {
      console.error("Failed to load project data:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  const mapTask = React.useCallback((dbTask: any): Task => {
    return {
      id: dbTask.id,
      projectId: dbTask.project_id,
      workspaceId: dbTask.workspace_id,
      columnId: dbTask.column_id || undefined,
      title: dbTask.title,
      description: dbTask.description || undefined,
      status: dbTask.status,
      priority: dbTask.priority,
      assigneeId: dbTask.assignee_id || undefined,
      reporterId: dbTask.reporter_id || undefined,
      dueDateTime: dbTask.due_date_time || undefined,
      dueDate: dbTask.due_date || undefined,
      estimatedHours: dbTask.estimated_hours ? Number(dbTask.estimated_hours) : undefined,
      position: dbTask.position || 0,
      createdAt: dbTask.created_at,
      updatedAt: dbTask.updated_at,
      completedAt: dbTask.completed_at || undefined,
      labels: dbTask.labels || []
    };
  }, []);

  const handleRealtimeTask = React.useCallback((payload: any) => {
    const { eventType, new: newRow, old: oldRow } = payload;
    const eventProjId = newRow?.project_id || oldRow?.project_id;
    if (eventProjId !== projectId) return;

    setTasks((prev) => {
      if (eventType === "DELETE") {
        return prev.filter((t) => t.id !== oldRow.id);
      }
      if (eventType === "INSERT") {
        if (prev.some((t) => t.id === newRow.id)) return prev;
        return [...prev, mapTask(newRow)];
      }
      if (eventType === "UPDATE") {
        return prev.map((t) => {
          if (t.id === newRow.id) {
            const mapped = mapTask(newRow);
            return {
              ...mapped,
              labels: t.labels || mapped.labels
            };
          }
          return t;
        });
      }
      return prev;
    });
    refreshWorkspaceData();
  }, [projectId, mapTask, refreshWorkspaceData]);

  const handleRealtimeProject = React.useCallback((payload: any) => {
    const { eventType, new: newRow } = payload;
    if (eventType === "UPDATE" && newRow.id === projectId) {
      setProjectName(newRow.name);
    }
  }, [projectId]);

  useRealtimeProjects(workspaceId || null, handleRealtimeProject);
  useRealtimeTasks(workspaceId || null, handleRealtimeTask);

  // Column realtime listener
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`project-columns-realtime:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_columns", filter: `project_id=eq.${projectId}` }, () => {
        getProjectColumnsAction(projectId).then(res => {
          if (res.success && res.data) setColumns(res.data);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Fetch comments, attachments, activity history logs, and labels when a task is opened
  useEffect(() => {
    if (!selectedTask) return;

    const taskId = selectedTask.id;

    async function loadTaskDetails() {
      try {
        const [commentsRes, attachmentsRes, labelsRes] = await Promise.all([
          getTaskCommentsAction(taskId),
          getTaskAttachmentsAction(taskId),
          workspaceId ? getWorkspaceLabelsAction(workspaceId) : Promise.resolve({ success: false, data: [] }),
        ]);

        if (commentsRes.success && commentsRes.data) {
          setComments(commentsRes.data);
        }
        if (attachmentsRes.success && attachmentsRes.data) {
          setAttachments(attachmentsRes.data);
        }
        if (labelsRes.success && labelsRes.data) {
          setAvailableLabels(labelsRes.data);
        }

        // Fetch task activity history from activity_logs table
        const { data: acts, error: actError } = await supabase
          .from("activity_logs")
          .select(`
            id,
            action,
            created_at,
            actor_id,
            profiles (first_name, last_name, avatar_url, email)
          `)
          .eq("target_id", taskId)
          .eq("target_type", "task")
          .order("created_at", { ascending: false });

        if (!actError && acts) {
          setActivities(acts.map((row: any) => {
            const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
            return {
              id: row.id,
              action: row.action,
              createdAt: row.created_at,
              actorName: prof ? ([prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email) : "Someone",
              avatarUrl: prof?.avatar_url
            };
          }));
        }
      } catch (err) {
        console.error(err);
      }
    }

    loadTaskDetails();
  }, [selectedTask, workspaceId]);

  // Map task list by columnId
  const tasksByColumn = useMemo(() => {
    const mapping: Record<string, Task[]> = {};
    columns.forEach(col => {
      mapping[col.id] = tasks.filter(t => t.columnId === col.id).sort((a, b) => a.position - b.position);
    });
    return mapping;
  }, [tasks, columns]);

  const handleQuickAddTask = async (columnId: string) => {
    if (submittingTask) return;
    setSubmittingTask(true);
    const column = columns.find(c => c.id === columnId);
    const normalizedName = column?.name.toLowerCase().trim() || "";
    let status: Task["status"] = "todo";
    if (normalizedName.includes("backlog")) status = "backlog";
    else if (normalizedName.includes("progress")) status = "in-progress";
    else if (normalizedName.includes("review")) status = "in-review";
    else if (normalizedName.includes("done") || normalizedName.includes("completed")) status = "done";

    try {
      const result = await createTaskAction({
        projectId,
        title: "New Task",
        priority: "medium",
        columnId,
        status,
        position: tasksByColumn[columnId]?.length || 0
      });

      if (result.success && result.data) {
        setTasks(prev => [...prev, result.data!]);
        toast.success("Task created!");
        await refreshWorkspaceData();
      } else {
        toast.error(result.error || "Failed to create task.");
      }
    } catch (err: any) {
      toast.error("An error occurred: " + (err.message || err));
    } finally {
      setSubmittingTask(false);
    }
  };

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.columnId === targetColumnId) return;

    const column = columns.find(c => c.id === targetColumnId);
    if (!column) return;

    // Get closest status category
    const normalizedName = column.name.toLowerCase().trim();
    let status: Task["status"] = "todo";
    if (normalizedName.includes("backlog")) status = "backlog";
    else if (normalizedName.includes("progress")) status = "in-progress";
    else if (normalizedName.includes("review")) status = "in-review";
    else if (normalizedName.includes("done") || normalizedName.includes("completed")) status = "done";

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, columnId: targetColumnId, status } : t));

    try {
      const result = await updateTaskAction(taskId, { columnId: targetColumnId, status });
      if (result.success) {
        toast.success(`Task moved to ${column.name}`);
        await refreshWorkspaceData();
      } else {
        // Rollback
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, columnId: task.columnId, status: task.status } : t));
        toast.error(result.error || "Failed to move task.");
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, columnId: task.columnId, status: task.status } : t));
    }
  };

  // Add a task inline
  const handleAddTask = async (columnId: string) => {
    if (!newTaskTitle.trim()) return;
    setSubmittingTask(true);

    const column = columns.find(c => c.id === columnId);
    const normalizedName = column?.name.toLowerCase().trim() || "";
    let status: Task["status"] = "todo";
    if (normalizedName.includes("backlog")) status = "backlog";
    else if (normalizedName.includes("progress")) status = "in-progress";
    else if (normalizedName.includes("review")) status = "in-review";
    else if (normalizedName.includes("done") || normalizedName.includes("completed")) status = "done";

    const tempTaskId = `temp-${Date.now()}`;
    const optimisticTask: Task = {
      id: tempTaskId,
      projectId,
      workspaceId: workspaceId || "",
      columnId,
      title: newTaskTitle.trim(),
      status,
      priority: "medium",
      position: tasksByColumn[columnId]?.length || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      labels: []
    };

    // Optimistic UI insert
    setTasks(prev => [...prev, optimisticTask]);
    const inputTitle = newTaskTitle.trim();
    setNewTaskTitle("");
    setAddingTaskToColumnId(null);

    try {
      const result = await createTaskAction({
        projectId,
        title: inputTitle,
        priority: "medium",
        columnId,
        status,
        position: optimisticTask.position
      });

      if (result.success && result.data) {
        // Reconcile temp task with real task
        setTasks(prev => prev.map(t => t.id === tempTaskId ? result.data! : t));
        toast.success("Task created!");
        await refreshWorkspaceData();
      } else {
        // Rollback
        setTasks(prev => prev.filter(t => t.id !== tempTaskId));
        toast.error(result.error || "Failed to create task.");
      }
    } catch {
      // Rollback
      setTasks(prev => prev.filter(t => t.id !== tempTaskId));
      toast.error("An error occurred.");
    } finally {
      setSubmittingTask(false);
    }
  };

  // Duplicate a task card
  const handleDuplicateTask = async (taskId: string) => {
    try {
      const result = await duplicateTaskAction(taskId);
      if (result.success && result.data) {
        setTasks(prev => [...prev, result.data!]);
        toast.success("Task duplicated successfully!");
        await refreshWorkspaceData();
      } else {
        toast.error(result.error || "Failed to duplicate task.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Delete a task card
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    const originalTask = tasks.find(t => t.id === taskId);
    if (!originalTask) return;

    // Optimistically delete
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (selectedTask?.id === taskId) {
      setDrawerOpen(false);
      setSelectedTask(null);
    }

    try {
      const result = await deleteTaskAction(taskId);
      if (result.success) {
        toast.success("Task deleted.");
        await refreshWorkspaceData();
      } else {
        // Rollback
        setTasks(prev => [...prev, originalTask]);
        toast.error(result.error || "Failed to delete task.");
      }
    } catch {
      // Rollback
      setTasks(prev => [...prev, originalTask]);
      toast.error("An error occurred.");
    }
  };

  // Add column
  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;

    try {
      const result = await createColumnAction(projectId, newColumnName.trim(), columns.length);
      if (result.success && result.data) {
        setColumns(prev => [...prev, result.data!]);
        setNewColumnName("");
        setAddingColumn(false);
        toast.success("Kanban column created!");
      } else {
        toast.error(result.error || "Failed to create column.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Rename column
  const handleSaveColumnName = async (columnId: string) => {
    if (!editingColumnName.trim()) return;

    try {
      const result = await updateColumnAction(columnId, editingColumnName.trim());
      if (result.success && result.data) {
        setColumns(prev => prev.map(c => c.id === columnId ? result.data! : c));
        setEditingColumnId(null);
        toast.success("Column renamed.");
      } else {
        toast.error(result.error || "Failed to rename column.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Archive column
  const handleArchiveColumn = async (columnId: string) => {
    if (!confirm("Are you sure you want to archive this column? Tasks in this column will be hidden.")) return;

    try {
      const result = await updateColumnAction(columnId, undefined, undefined, true);
      if (result.success) {
        setColumns(prev => prev.filter(c => c.id !== columnId));
        toast.success("Column archived.");
      } else {
        toast.error(result.error || "Failed to archive column.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Edit task details inside the drawer
  const handleEditTaskDetail = async (fields: Partial<Task>) => {
    if (!selectedTask) return;

    // Optimistic update inside UI state
    const updatedTask = { ...selectedTask, ...fields } as Task;
    setSelectedTask(updatedTask);
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, ...fields } as Task : t));

    try {
      const result = await updateTaskAction(selectedTask.id, fields);
      if (!result.success) {
        toast.error(result.error || "Failed to update task detail.");
        loadProjectData(); // reload on fail
      } else {
        await refreshWorkspaceData();
      }
    } catch {
      toast.error("Failed to save changes.");
    }
  };

  // Post Comment inside the drawer
  const handlePostComment = async () => {
    if (!newCommentText.trim() || !selectedTask) return;
    setSubmittingComment(true);

    try {
      const result = await createTaskCommentAction(selectedTask.id, newCommentText.trim());
      if (result.success && result.data) {
        setComments(prev => [...prev, result.data!]);
        setNewCommentText("");
        toast.success("Comment posted!");
      } else {
        toast.error(result.error || "Failed to post comment.");
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setSubmittingComment(false);
    }
  };

  // Add Attachment inside the drawer
  const handleAddAttachment = async () => {
    if (!attachingName.trim() || !attachingUrl.trim() || !selectedTask) return;
    setSubmittingAttachment(true);

    try {
      const result = await createTaskAttachmentAction(selectedTask.id, attachingName.trim(), attachingUrl.trim());
      if (result.success && result.data) {
        setAttachments(prev => [result.data!, ...prev]);
        setAttachingName("");
        setAttachingUrl("");
        toast.success("File attached successfully!");
      } else {
        toast.error(result.error || "Failed to add attachment.");
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setSubmittingAttachment(false);
    }
  };

  // Add label to task
  const handleAddLabel = async (labelId: string) => {
    if (!selectedTask) return;

    const label = availableLabels.find(l => l.id === labelId);
    if (!label) return;

    // Check if already mapped
    if (selectedTask.labels?.some(l => l.id === labelId)) return;

    // Optimistic update
    const nextLabels = [...(selectedTask.labels || []), label];
    setSelectedTask(prev => prev ? { ...prev, labels: nextLabels } : null);
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, labels: nextLabels } : t));

    try {
      const result = await addLabelToTaskAction(selectedTask.id, labelId);
      if (!result.success) {
        toast.error("Failed to map label.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Remove label from task
  const handleRemoveLabel = async (labelId: string) => {
    if (!selectedTask) return;

    const nextLabels = (selectedTask.labels || []).filter(l => l.id !== labelId);
    setSelectedTask(prev => prev ? { ...prev, labels: nextLabels } : null);
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, labels: nextLabels } : t));

    try {
      const result = await removeLabelFromTaskAction(selectedTask.id, labelId);
      if (!result.success) {
        toast.error("Failed to remove label mapping.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Analyze project health with AI
  const handleAnalyzeHealth = async () => {
    openNova("project", projectId);
    setNovaLoading(true);
    try {
      const health = await NovaAI.calculateProjectHealth(projectId, tasks, 5);

      setActiveSummary(
        `### Nova AI Board Health Analysis: ${projectName}\n\n` +
        `**Health Index:** ${health.score}/100 | **Status:** ${health.status.toUpperCase()}\n\n` +
        `*Summary Details:* ${health.summary}\n\n` +
        `**Key Kanban suggestions:**\n` +
        health.actionItems.map((item: string) => `- ${item}`).join("\n")
      );
    } catch (err) {
      console.error(err);
      setActiveSummary("Failed to calculate board health metrics.");
    } finally {
      setNovaLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden text-left relative bg-background/35">
        {/* Board Header Skeleton */}
        <div className="flex items-center justify-between border-b border-border pb-4 mb-6 shrink-0 flex-wrap gap-3 select-none">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-6 w-6 rounded bg-muted/40" />
            <Skeleton className="h-7 w-48 rounded-md bg-muted/30" />
            <Skeleton className="h-5 w-16 rounded-full bg-muted/20" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-32 rounded-lg bg-muted/30" />
            <Skeleton className="h-8 w-40 rounded-lg bg-muted/30" />
          </div>
        </div>

        {/* Columns Skeleton */}
        <div className="flex-1 overflow-x-auto flex gap-6 pb-4 items-start select-none">
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              className="w-72 bg-card/30 border border-border/75 rounded-xl p-4 shrink-0 flex flex-col gap-4"
            >
              <div className="flex justify-between items-center px-1">
                <Skeleton className="h-4 w-24 bg-muted/40 rounded" />
                <Skeleton className="h-4 w-6 bg-muted/30 rounded" />
              </div>
              <div className="space-y-3 mt-2">
                {[1, 2].map((j) => (
                  <div key={j} className="bg-card border border-border/50 p-4 rounded-xl space-y-3 shadow-sm">
                    <div className="flex justify-between items-start">
                      <Skeleton className="h-3 w-12 bg-muted/40 rounded" />
                      <Skeleton className="h-3.5 w-3.5 bg-muted/30 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-full bg-muted/30 rounded" />
                    <Skeleton className="h-4 w-2/3 bg-muted/20 rounded" />
                    <div className="flex justify-between items-center pt-2">
                      <Skeleton className="h-5 w-5 bg-muted/40 rounded-full" />
                      <Skeleton className="h-4.5 w-16 bg-muted/30 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden text-left relative">
      {/* Board Header */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-6 shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="text-muted-foreground" size={20} />
          <h1 className="text-xl font-bold tracking-tight">{projectName || "Project Kanban"}</h1>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent text-muted-foreground font-semibold">
            {tasks.length} Task{tasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Project Files */}
          <button
            onClick={() => setProjectFilesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card/30 hover:bg-accent/40 text-muted-foreground hover:text-foreground border border-border text-xs font-semibold transition-all shadow-sm cursor-pointer"
          >
            <Paperclip size={14} />
            <span>Project Files</span>
          </button>

          {/* Analyze health */}
          <button
            onClick={handleAnalyzeHealth}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-nova-purple-glow hover:bg-nova-purple/20 text-nova-purple border border-nova-purple/20 text-xs font-semibold transition-all shadow-sm cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Analyze Board Health</span>
          </button>

          {/* Generate Tasks with AI */}
          <button
            onClick={() => setAiGeneratorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} className="text-nova-purple" />
            <span>Generate Tasks with AI</span>
          </button>
        </div>
      </div>

      {/* Kanban columns scroll area */}
      <div className="flex-1 overflow-x-auto flex gap-6 pb-4 items-start select-none">
        {columns.map((col) => (
          <div 
            key={col.id} 
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
            className="w-72 bg-card/30 border border-border/75 rounded-xl p-4 shrink-0 flex flex-col max-h-full"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 px-1 shrink-0">
              {editingColumnId === col.id ? (
                <input
                  type="text"
                  value={editingColumnName}
                  onChange={(e) => setEditingColumnName(e.target.value)}
                  onBlur={() => handleSaveColumnName(col.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveColumnName(col.id);
                    if (e.key === "Escape") setEditingColumnId(null);
                  }}
                  autoFocus
                  className="text-xs font-semibold bg-background border border-white/10 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring text-white"
                />
              ) : (
                <div 
                  onDoubleClick={() => {
                    setEditingColumnId(col.id);
                    setEditingColumnName(col.name);
                  }}
                  className="flex items-center gap-2 group cursor-pointer"
                >
                  <span className="text-xs font-bold text-foreground/90 uppercase tracking-wider">{col.name}</span>
                  <Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />
                </div>
              )}

              <div className="flex items-center gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/65 text-muted-foreground font-bold mr-1">
                  {tasksByColumn[col.id]?.length || 0}
                </span>
                <button
                  onClick={() => handleQuickAddTask(col.id)}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent/40 p-1 rounded transition-colors cursor-pointer animate-pulse-subtle"
                  title="Add Task"
                >
                  <Plus size={11} />
                </button>
                <button
                  onClick={() => handleArchiveColumn(col.id)}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1 rounded transition-colors cursor-pointer"
                  title="Archive Column"
                >
                  <Archive size={11} />
                </button>
              </div>
            </div>

            {/* Task Card Stack */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 min-h-[150px]">
              {(tasksByColumn[col.id] || []).map((task) => (
                <div 
                  key={task.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => {
                    setSelectedTask(task);
                    setDrawerOpen(true);
                  }}
                  className="p-4 bg-card border border-border/80 rounded-lg shadow-sm hover:border-border/60 hover:shadow-md transition-all cursor-pointer space-y-3 select-none text-left relative group/card"
                >
                  {/* Duplicate / Delete card helpers */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 flex items-center gap-1 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateTask(task.id);
                      }}
                      className="p-1 rounded bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Duplicate Task"
                    >
                      <Copy size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTask(task.id);
                      }}
                      className="p-1 rounded bg-muted/60 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete Task"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>

                  <p className="text-xs font-semibold text-foreground leading-snug pr-12">{task.title}</p>
                  {task.description && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{task.description}</p>
                  )}

                  {/* Task Labels Mapping list */}
                  {task.labels && task.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {task.labels.map(l => (
                        <span 
                          key={l.id} 
                          className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider text-black"
                          style={{ backgroundColor: l.color }}
                        >
                          {l.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card footer details */}
                  <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full font-bold border text-[8px]",
                        task.priority === "urgent" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        task.priority === "high" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        task.priority === "medium" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                        "bg-slate-500/10 text-slate-500 border-slate-500/20"
                      )}>
                        {task.priority}
                      </span>
                      {task.dueDate && (
                        <span className="flex items-center gap-0.5">
                          <CalendarIcon size={9} />
                          {task.dueDate}
                        </span>
                      )}
                    </div>

                    {task.assigneeId && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-bold border border-border/80">
                        {members.find(m => m.profileId === task.assigneeId)?.profile.firstName?.[0]?.toUpperCase() || <User size={9} />}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Inline task creator */}
              {addingTaskToColumnId === col.id ? (
                <div className="p-3 border border-dashed border-nova-purple/40 rounded-lg bg-nova-purple-glow/5 space-y-2">
                  <input
                    type="text"
                    placeholder="Task name..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTask(col.id);
                      if (e.key === "Escape") { setAddingTaskToColumnId(null); setNewTaskTitle(""); }
                    }}
                    autoFocus
                    className="w-full bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground/50 p-1"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAddTask(col.id)}
                      disabled={submittingTask || !newTaskTitle.trim()}
                      className="text-[10px] font-bold text-nova-purple hover:underline disabled:opacity-50"
                    >
                      {submittingTask ? "Creating..." : "Add Task"}
                    </button>
                    <button
                      onClick={() => { setAddingTaskToColumnId(null); setNewTaskTitle(""); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingTaskToColumnId(col.id); setNewTaskTitle(""); }}
                  className="w-full flex items-center justify-center gap-1 py-1.5 border border-dashed border-border/60 hover:border-border rounded-lg text-[10px] text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-all cursor-pointer"
                >
                  <Plus size={11} />
                  <span>Add Task Card</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Add Column creator card */}
        {addingColumn ? (
          <div className="w-72 bg-card/20 border border-dashed border-border rounded-xl p-4 shrink-0 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Column name..."
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddColumn();
                if (e.key === "Escape") setAddingColumn(false);
              }}
              autoFocus
              className="text-xs bg-background border border-white/10 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-ring text-white w-full"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddColumn}
                disabled={!newColumnName.trim()}
                className="text-[10px] font-bold bg-white text-black px-2 py-1 rounded disabled:opacity-50 hover:bg-neutral-200"
              >
                Create
              </button>
              <button
                onClick={() => setAddingColumn(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setAddingColumn(true); setNewColumnName(""); }}
            className="w-72 border border-dashed border-border/60 hover:border-border rounded-xl p-4 shrink-0 flex items-center justify-center gap-2 hover:bg-muted/10 transition-colors text-muted-foreground hover:text-foreground cursor-pointer h-14"
          >
            <Plus size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">Add Custom Column</span>
          </button>
        )}
      </div>

      {/* Task Details Slide Drawer Panel */}
      {drawerOpen && selectedTask && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end animate-fade-in select-text">
          <div className="w-full max-w-lg bg-card border-l border-border h-full flex flex-col shadow-2xl relative animate-slide-in text-left">
            
            {/* Drawer Header Toolbar */}
            <div className="flex items-center justify-between border-b border-border p-4 shrink-0 bg-muted/20">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Task Details</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDuplicateTask(selectedTask.id)}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Duplicate Task"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleDeleteTask(selectedTask.id)}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive cursor-pointer"
                  title="Delete Task"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => { setDrawerOpen(false); setSelectedTask(null); }}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Scrollable Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              {/* Task Title (Inline Edit) */}
              <div className="space-y-1">
                <input
                  type="text"
                  value={selectedTask.title}
                  onChange={(e) => handleEditTaskDetail({ title: e.target.value })}
                  className="w-full text-lg font-bold bg-transparent border-0 outline-none text-white focus:ring-0 px-0.5 border-b border-transparent focus:border-border"
                />
              </div>

              {/* Task Attributes Panel grid */}
              <div className="grid grid-cols-2 gap-4 border-y border-border/40 py-4 text-xs">
                
                 {/* Assignee attribute select */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] block">Assignee</label>
                  <select
                    value={selectedTask.assigneeId || ""}
                    onChange={(e) => handleEditTaskDetail({ assigneeId: e.target.value || undefined })}
                    className="w-full bg-background border border-white/10 rounded px-2.5 py-1.5 text-white outline-none focus:ring-1 focus:ring-ring text-xs"
                  >
                    <option value="">Unassigned</option>
                    {members.map(m => {
                      const name = [m.profile.firstName, m.profile.lastName].filter(Boolean).join(" ") || m.profile.email;
                      return <option key={m.id} value={m.profileId}>{name}</option>;
                    })}
                  </select>
                </div>

                {/* Reporter attribute select */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] block">Reporter</label>
                  <select
                    value={selectedTask.reporterId || ""}
                    onChange={(e) => handleEditTaskDetail({ reporterId: e.target.value || undefined })}
                    className="w-full bg-background border border-white/10 rounded px-2.5 py-1.5 text-white outline-none focus:ring-1 focus:ring-ring text-xs"
                  >
                    <option value="">No Reporter</option>
                    {members.map(m => {
                      const name = [m.profile.firstName, m.profile.lastName].filter(Boolean).join(" ") || m.profile.email;
                      return <option key={m.id} value={m.profileId}>{name}</option>;
                    })}
                  </select>
                </div>

                {/* Priority attribute select */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] block">Priority</label>
                  <select
                    value={selectedTask.priority}
                    onChange={(e) => handleEditTaskDetail({ priority: e.target.value as any })}
                    className="w-full bg-background border border-white/10 rounded px-2.5 py-1.5 text-white outline-none focus:ring-1 focus:ring-ring text-xs capitalize"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* Kanban Status column select */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] block">Column</label>
                  <select
                    value={selectedTask.columnId || ""}
                    onChange={(e) => handleEditTaskDetail({ columnId: e.target.value || undefined })}
                    className="w-full bg-background border border-white/10 rounded px-2.5 py-1.5 text-white outline-none focus:ring-1 focus:ring-ring text-xs"
                  >
                    <option value="">No Column</option>
                    {columns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Due Date picker input */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] block flex items-center gap-1">
                    <CalendarIcon size={10} />
                    <span>Due Date</span>
                  </label>
                  <input
                    type="date"
                    value={selectedTask.dueDate || ""}
                    onChange={(e) => handleEditTaskDetail({ dueDate: e.target.value || undefined })}
                    className="w-full bg-background border border-white/10 rounded px-2.5 py-1.5 text-white outline-none focus:ring-1 focus:ring-ring text-xs"
                  />
                </div>

                {/* Estimated Hours numeric input */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground font-bold uppercase tracking-wider text-[9px] block flex items-center gap-1">
                    <Hourglass size={10} />
                    <span>Estimated Hours</span>
                  </label>
                  <input
                    type="number"
                    value={selectedTask.estimatedHours || ""}
                    placeholder="e.g. 8"
                    onChange={(e) => handleEditTaskDetail({ estimatedHours: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full bg-background border border-white/10 rounded px-2.5 py-1.5 text-white outline-none focus:ring-1 focus:ring-ring text-xs"
                  />
                </div>

              </div>

              {/* Task Labels selection block */}
              <div className="space-y-2">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Labels</span>
                
                {/* Active mapped labels list */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(selectedTask.labels || []).map(lbl => (
                    <span 
                      key={lbl.id} 
                      className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider text-black flex items-center gap-1"
                      style={{ backgroundColor: lbl.color }}
                    >
                      <span>{lbl.name}</span>
                      <button 
                        onClick={() => handleRemoveLabel(lbl.id)}
                        className="hover:bg-black/20 rounded p-0.5 leading-none shrink-0"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {(selectedTask.labels || []).length === 0 && (
                    <span className="text-[10px] text-muted-foreground/60 italic block py-0.5">No labels mapped</span>
                  )}
                </div>

                {/* Label selector dropdown */}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleAddLabel(e.target.value);
                  }}
                  className="bg-background border border-white/10 rounded px-2.5 py-1 text-white outline-none text-[10px] max-w-xs cursor-pointer"
                >
                  <option value="">+ Map Task Label</option>
                  {availableLabels
                    .filter(al => !(selectedTask.labels || []).some(sl => sl.id === al.id))
                    .map(al => (
                      <option key={al.id} value={al.id}>{al.name}</option>
                    ))
                  }
                </select>
              </div>

              {/* Task Description textbox */}
              <div className="space-y-2 text-left">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Description</span>
                <textarea
                  value={selectedTask.description || ""}
                  onChange={(e) => handleEditTaskDetail({ description: e.target.value })}
                  placeholder="What is this task about?"
                  rows={4}
                  className="w-full bg-background border border-white/10 rounded-lg p-3 text-xs text-white focus:ring-1 focus:ring-ring outline-none"
                />
              </div>

              {/* Task Attachments Section */}
              <div className="space-y-3">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block flex items-center gap-1">
                  <Paperclip size={10} />
                  <span>Attachments</span>
                </span>

                {/* File Attachment list */}
                <div className="space-y-2 text-xs">
                  {attachments.map(att => (
                    <div key={att.id} className="p-2.5 rounded-lg border border-white/10 bg-black/40 flex items-center justify-between gap-3">
                      <span className="font-semibold text-white truncate shrink-0 max-w-[200px]">{att.fileName}</span>
                      <div className="flex items-center gap-3">
                        <a 
                          href={`/api/attachments/${att.id}/download`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-nova-teal hover:underline flex items-center gap-0.5 leading-none font-bold"
                        >
                          <span>Open File</span>
                          <ExternalLink size={10} />
                        </a>
                        <button
                          onClick={async () => {
                            if (confirm("Delete this attachment?")) {
                              const res = await deleteAttachmentAction(att.id);
                              if (res.success) {
                                setAttachments(prev => prev.filter(a => a.id !== att.id));
                                toast.success("Attachment deleted.");
                              } else {
                                toast.error(res.error || "Failed to delete.");
                              }
                            }
                          }}
                          className="text-destructive hover:underline font-bold"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {attachments.length === 0 && (
                    <span className="text-[10px] text-muted-foreground/60 italic block pb-1">No file attachments</span>
                  )}
                </div>

                {/* Inline Attacher form */}
                <div className="flex gap-2 flex-col sm:flex-row sm:items-center">
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      placeholder="File name (e.g. mock.pdf)"
                      value={attachingName}
                      onChange={(e) => setAttachingName(e.target.value)}
                      className="flex-1 bg-background border border-white/10 rounded px-2.5 py-1 text-[10px] text-white outline-none"
                    />
                    <input
                      type="text"
                      placeholder="URL address"
                      value={attachingUrl}
                      onChange={(e) => setAttachingUrl(e.target.value)}
                      className="flex-1 bg-background border border-white/10 rounded px-2.5 py-1 text-[10px] text-white outline-none"
                    />
                    <button
                      onClick={handleAddAttachment}
                      disabled={submittingAttachment || !attachingName.trim() || !attachingUrl.trim()}
                      className="px-3 py-1 rounded bg-white text-black font-bold text-[10px] hover:bg-neutral-200 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      Attach Link
                    </button>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground">or</span>
                    <input
                      type="file"
                      ref={taskFileInputRef}
                      onChange={handleUploadTaskFile}
                      className="hidden"
                    />
                    <button
                      onClick={() => taskFileInputRef.current?.click()}
                      disabled={uploadingTaskFile}
                      className="px-3 py-1 rounded border border-white/10 text-white font-bold text-[10px] hover:bg-white/5 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {uploadingTaskFile ? "Uploading..." : "Upload File"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Task Comments Section */}
              <div className="space-y-4">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block flex items-center gap-1">
                  <MessageSquare size={10} />
                  <span>Comments ({comments.length})</span>
                </span>

                {/* Comments List */}
                <div className="space-y-3">
                  {comments.map(c => {
                    const firstName = c.profile?.firstName || "";
                    const lastName = c.profile?.lastName || "";
                    const authorName = [firstName, lastName].filter(Boolean).join(" ") || c.profile?.email || "Someone";
                    const initials = (firstName || authorName)[0]?.toUpperCase() || "?";

                    return (
                      <div key={c.id} className="flex gap-3 text-xs bg-muted/10 p-3 rounded-lg border border-white/5">
                        <Avatar className="h-6 w-6 border border-border/80 shrink-0">
                          {c.profile?.avatarUrl && <AvatarImage src={c.profile.avatarUrl} alt={authorName} />}
                          <AvatarFallback className="bg-muted text-[10px] font-bold">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-bold text-white/95">{authorName}</span>
                            <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-zinc-200 leading-normal font-medium">{c.content}</p>
                        </div>
                      </div>
                    );
                  })}
                  {comments.length === 0 && (
                    <span className="text-[10px] text-muted-foreground/60 italic block py-2">No comments posted yet</span>
                  )}
                </div>

                {/* Comment Textarea composer */}
                <div className="flex gap-2">
                  <textarea
                    placeholder="Write a comment..."
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    rows={2}
                    className="flex-1 bg-background border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={handlePostComment}
                    disabled={submittingComment || !newCommentText.trim()}
                    className="px-4 py-2 rounded-lg bg-nova-purple text-white font-bold text-xs hover:bg-nova-purple/80 disabled:opacity-50 cursor-pointer self-end shrink-0"
                  >
                    Send
                  </button>
                </div>
              </div>

              {/* Task Activity Log Feed */}
              <div className="space-y-3">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block flex items-center gap-1">
                  <ActivityIcon size={10} />
                  <span>Activity History</span>
                </span>

                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {activities.map(act => {
                    const actionLabel = 
                      act.action === "task.create" ? "created the task" :
                      act.action === "task.move" ? "moved task column" :
                      act.action === "task.priority" ? "changed priority" :
                      act.action === "task.assign" ? "reassigned task" :
                      act.action === "task.complete" ? "completed this task" :
                      act.action === "task.comment" ? "added comment" :
                      act.action === "task.attach" ? "attached file" :
                      "modified task details";

                    return (
                      <div key={act.id} className="flex gap-2 items-center text-[10px] text-muted-foreground">
                        <Avatar className="h-4 w-4 shrink-0">
                          {act.avatarUrl && <AvatarImage src={act.avatarUrl} alt={act.actorName} />}
                          <AvatarFallback className="bg-muted text-[8px] font-bold">{act.actorName[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span>
                          <strong className="text-white font-bold">{act.actorName}</strong> {actionLabel}
                        </span>
                        <span className="ml-auto text-[8px] text-muted-foreground/60 shrink-0">
                          {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                  {activities.length === 0 && (
                    <span className="text-[10px] text-muted-foreground/60 italic block py-1">No activities registered</span>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* AI Task Generator Dialog */}
      <Dialog open={aiGeneratorOpen} onOpenChange={setAiGeneratorOpen}>
        <DialogContent className="border border-white/10 bg-zinc-950 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2 text-white">
              <Sparkles size={16} className="text-nova-purple" />
              <span>Generate Tasks with Nova AI</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Describe your project goal, scope, or next milestones. Nova will generate structural backlog tasks and cards, automatically placing them in the correct column.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-left">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Describe Goal / Feature List
            </label>
            <textarea
              placeholder="e.g. Build an analytics page showing team performance, active projects count, task completion rates and recent activities chart..."
              value={aiGoalPrompt}
              onChange={(e) => setAiGoalPrompt(e.target.value)}
              rows={4}
              className="w-full bg-card border border-white/10 rounded-lg p-3 text-xs text-white outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground/50 text-white"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              disabled={generatingAiTasks}
              onClick={() => setAiGeneratorOpen(false)}
              className="text-xs font-semibold hover:bg-white/5 text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateAiTasks}
              disabled={generatingAiTasks || !aiGoalPrompt.trim()}
              className="bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              {generatingAiTasks ? (
                <>
                  <Loader2 size={13} className="animate-spin text-black" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-nova-purple" />
                  <span>Seed Board Cards</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Shared Files Dialog */}
      <Dialog open={projectFilesOpen} onOpenChange={setProjectFilesOpen}>
        <DialogContent className="border border-white/10 bg-zinc-950 text-white rounded-2xl max-w-xl">
          <DialogHeader className="text-left border-b border-white/5 pb-3">
            <DialogTitle className="text-base font-bold flex items-center gap-2 select-none">
              <FolderKanban size={16} className="text-nova-teal" />
              <span>Project Shared Files</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground select-none">
              Manage and access all shared attachments uploaded for this project board.
            </DialogDescription>
          </DialogHeader>

          <div className="pt-4 flex flex-col gap-4">
            <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-xl border border-white/5">
              <span className="text-xs text-muted-foreground select-none">Upload a new document, schema or reference</span>
              <input
                type="file"
                ref={projectFileInputRef}
                onChange={handleUploadProjectFile}
                className="hidden"
              />
              <Button
                onClick={() => projectFileInputRef.current?.click()}
                disabled={uploadingProjectFile}
                size="sm"
                className="bg-white text-black hover:bg-neutral-200 font-semibold"
              >
                {uploadingProjectFile ? <Loader2 size={13} className="animate-spin mr-1" /> : <Plus size={13} className="mr-1" />}
                <span>Upload File</span>
              </Button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
              {loadingProjectFiles && (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Loader2 size={20} className="animate-spin text-nova-teal" />
                  <span className="text-xs font-semibold">Loading shared repository...</span>
                </div>
              )}

              {!loadingProjectFiles && projectAttachments.map((file) => {
                return (
                  <div key={file.id} className="flex items-center justify-between bg-zinc-900/40 p-3 rounded-lg border border-white/5 text-xs">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0 select-none">
                        <FileImage size={16} />
                      </div>
                      <div className="flex flex-col min-w-0 text-left">
                        <span className="font-bold truncate text-white max-w-[280px]">{file.fileName}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {file.fileSize ? (file.fileSize / 1024).toFixed(1) + " KB" : "0 KB"} • {new Date(file.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-2 shrink-0 select-none">
                      <button
                        onClick={() => window.open(`/api/attachments/${file.id}/download`, "_blank")}
                        className="text-[11px] text-nova-teal hover:underline font-bold cursor-pointer"
                      >
                        Download
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Are you sure you want to delete this shared file?")) {
                            const res = await deleteAttachmentAction(file.id);
                            if (res.success) {
                              setProjectAttachments(prev => prev.filter(f => f.id !== file.id));
                              toast.success("File deleted successfully!");
                            } else {
                              toast.error(res.error || "Delete failed.");
                            }
                          }
                        }}
                        className="text-[11px] text-destructive hover:underline font-bold cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              {!loadingProjectFiles && projectAttachments.length === 0 && (
                <div className="py-12 text-center text-xs text-muted-foreground italic select-none">
                  No project-wide attachments found.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
