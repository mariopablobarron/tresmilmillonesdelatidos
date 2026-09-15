"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Copy, Gift, LogOut, Pencil, Plus, Search, Share2, ShieldCheck, Trash2, X } from "lucide-react";
import { useSwipeAction } from "@/lib/useSwipeAction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import FamilySettings from "@/components/FamilySettings";
import QuickCheckin from "@/components/QuickCheckin";
import SidebarRetoWidget from "@/components/SidebarRetoWidget";
import { ShareStoryCard } from "@/components/ShareStoryCard";

export type SidebarConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type SidebarProgress = {
  completedActions: number;
  totalActions: number;
  dominantState: string;
  emotionalState?: string;
  streakDays?: number;
  progressTrend?: string;
};

type SidebarProfile = {
  name: string;
  plan: string;
};

type SidebarGoal = {
  id: string;
  title: string;
  status: string;
  progress: number;
  completedCount: number;
  totalCount: number;
  actions: Array<{
    id: string;
    description: string;
    completed: boolean;
  }>;
} | null;

type SidebarProps = {
  conversations: SidebarConversation[];
  activeConversationId: string;
  progress: SidebarProgress;
  activeGoal: SidebarGoal;
  actionLock?: {
    message: string;
    actionTitle: string;
  } | null;
  profile: SidebarProfile;
  adminAuthenticated: boolean;
  adminLoading: boolean;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onAdminLogout: () => Promise<void> | void;
  onRenameConversation?: (id: string, title: string) => Promise<void> | void;
  onDeleteConversation?: (id: string) => Promise<void> | void;
  onToggleAction?: (actionId: string, completed: boolean) => void;
};

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

// Stable config (icons/hrefs/keys), labels & requirement strings come from i18n
const NAV_ITEMS_CONFIG = [
  { key: "chat" as const, href: "/app", icon: "💬", tour: undefined },
  { key: "checkin" as const, href: "/app/checkins", icon: "✅", tour: undefined },
  { key: "comunidad" as const, href: "/community", icon: "👥", tour: "comunidad" },
  { key: "plan" as const, href: "/app/goals", icon: "🎯", tour: undefined },
  { key: "diario" as const, href: "/app/diario", icon: "📔", tour: undefined },
  { key: "respirar" as const, href: "/app/respirar", icon: "🌬", tour: undefined },
  { key: "logros" as const, href: "/app/logros", icon: "🏆", tour: undefined },
  { key: "impulso" as const, href: "/impulso", icon: "⚡", tour: "modo-impulso" },
  { key: "itinerarios" as const, href: "/journey", icon: "🧭", tour: undefined },
];

export default function Sidebar({
  conversations,
  activeConversationId,
  progress,
  activeGoal,
  actionLock,
  profile,
  adminAuthenticated,
  adminLoading,
  onSelectConversation,
  onNewConversation,
  onAdminLogout,
  onRenameConversation,
  onDeleteConversation,
  onToggleAction,
}: SidebarProps) {
  const t = useTranslations("sidebar");
  const pathname = usePathname();

  // ── Progressive unlock system ──────────────────────────────────────────────
  const [daysSinceSignup] = useState(() => {
    if (typeof window === "undefined") return 0;
    const key = "luc_first_visit";
    let first = localStorage.getItem(key);
    if (!first) {
      first = new Date().toISOString();
      localStorage.setItem(key, first);
    }
    return Math.floor((Date.now() - new Date(first).getTime()) / (1000 * 60 * 60 * 24));
  });
  const streak = progress.streakDays ?? 0;

  const unlocks = useMemo(() => ({
    chat: true,
    checkin: true,
    comunidad: true,
    plan: daysSinceSignup >= 3,
    diario: daysSinceSignup >= 7,
    respirar: streak >= 3,
    logros: streak >= 7,
    impulso: daysSinceSignup >= 21,
    itinerarios: daysSinceSignup >= 7,
  }), [daysSinceSignup, streak]);

  const unlockedCount = Object.values(unlocks).filter(Boolean).length;
  const totalFeatures = Object.keys(unlocks).length;
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showShareStory, setShowShareStory] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  type InviteItem = { code: string; url: string; used: boolean; usedByEmail: string | null };
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  type SupportMsg = { id: string; fromName: string; content: string; deliveredAt: string; readAt: string | null };
  const [supportMessages, setSupportMessages] = useState<SupportMsg[]>([]);
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [hasPendingAssessment, setHasPendingAssessment] = useState(false);
  const [latidosBalance, setLatidosBalance] = useState(0);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    fetch("/api/user/invites", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok: boolean; invites?: InviteItem[] }) => {
        if (d.ok) setInvites(d.invites ?? []);
      })
      .catch(() => { /* Invites are non-critical — fail silently */ });

    fetch("/api/user/assessments/pending", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { assessment?: unknown } | null) => {
        if (d?.assessment) setHasPendingAssessment(true);
      })
      .catch(() => { /* Non-critical */ });

    fetch("/api/user/latidos", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { balance?: number } | null) => {
        if (typeof d?.balance === "number") setLatidosBalance(d.balance);
      })
      .catch(() => { /* Non-critical */ });

    fetch("/api/user/support-messages", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { messages?: SupportMsg[]; unreadCount?: number } | null) => {
        if (d?.messages) setSupportMessages(d.messages);
        if (typeof d?.unreadCount === "number") setUnreadSupport(d.unreadCount);
      })
      .catch(() => { /* Non-critical */ });
  }, []);

  function copyInvite(code: string, url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  const availableInvites = invites.filter((i) => !i.used);

  const pendingActionsCount = useMemo(() => {
    if (!activeGoal) {
      return 0;
    }

    return activeGoal.actions.filter((action) => !action.completed).length;
  }, [activeGoal]);

  const progressPercent = useMemo(() => {
    if (progress.totalActions <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((progress.completedActions / progress.totalActions) * 100));
  }, [progress.completedActions, progress.totalActions]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  function startEditing(id: string, title: string) {
    setEditingId(id);
    setEditingTitle(title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  async function commitRename(id: string) {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== conversations.find((c) => c.id === id)?.title) {
      await onRenameConversation?.(id, trimmed);
    }
    setEditingId(null);
  }

  return (
    <aside className="flex h-full flex-col rounded-3xl border border-border/80 bg-card/95 p-4 shadow-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/app" className="inline-flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <span className="text-xl leading-none">💓</span>
            <span className="font-bold text-sm leading-tight">
              Tres Mil
              <br className="lg:hidden" />
              <span className="lg:ml-1">Millones</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-2.5 py-1 gap-1">
              💓 <span className="font-bold tabular-nums">{latidosBalance}</span>
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {profile.plan}
            </Badge>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("workspace")}
          </p>
          <Link href="/settings" className="mt-1 block text-sm font-medium text-foreground hover:text-primary transition-colors">
            {profile.name}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("workspaceDesc")}
          </p>
          <Button type="button" className="mt-4 w-full justify-between" onClick={onNewConversation} data-tour="new-conversation">
            {t("newConversation")}
            <Plus className="size-4" />
          </Button>
        </div>

        {/* ── Progressive unlock roadmap ──────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-3" data-tour="nav-buttons">
          <div className="flex items-center justify-between">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
              title={t("yourPathTooltip")}
            >
              {t("yourPath")}
            </p>
            <Badge
              variant="secondary"
              className="rounded-full px-2 py-0.5 text-[10px]"
              title={t("unlockedFeaturesAria", { count: unlockedCount, total: totalFeatures })}
              aria-label={t("unlockedFeaturesAria", { count: unlockedCount, total: totalFeatures })}
            >
              {unlockedCount}/{totalFeatures}
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 transition-all duration-700"
              style={{ width: `${(unlockedCount / totalFeatures) * 100}%` }}
            />
          </div>

          {/* Feature list */}
          <div className="space-y-1">
            {NAV_ITEMS_CONFIG.map((item) => {
              const unlocked = unlocks[item.key];
              const active = item.href === "/app" ? pathname === "/app" : pathname?.startsWith(item.href);
              const label = t(`nav.${item.key}.label`);
              const req = t(`nav.${item.key}.req`);

              if (unlocked) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    data-tour={item.tour}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/60 text-foreground"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="font-medium">{label}</span>
                  </Link>
                );
              }

              return (
                <div
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground/50 cursor-not-allowed"
                  title={t("unlocksAt", { req })}
                >
                  <span className="text-base grayscale opacity-40">🔒</span>
                  <span className="font-medium">{label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/40">{req}</span>
                </div>
              );
            })}
          </div>

          {/* Settings always accessible */}
          <Button asChild type="button" variant={pathname?.startsWith("/settings") ? "default" : "outline"} size="sm" className="w-full justify-center text-xs" data-tour="ajustes">
            <Link href="/settings">{t("settings")}</Link>
          </Button>

          {/* Método — always linked so registered users can return to the pedagogical frame */}
          <Link
            href="/como-funciona"
            className="block text-center text-[11px] text-muted-foreground/70 hover:text-violet-300 transition-colors"
          >
            {t("knowMethod")}
          </Link>
        </div>

        {/* Telegram CTA */}
        <a
          href="https://t.me/TRESMILMILLONESDELATIDOSBOT"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm transition hover:border-cyan-500/40 hover:bg-cyan-500/10"
        >
          <span className="text-xl">💬</span>
          <div>
            <p className="font-semibold text-cyan-300 leading-snug">{t("telegramTitle")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {t("telegramDesc")}
            </p>
          </div>
        </a>

        <SidebarRetoWidget />
      </div>

      <Separator className="my-4" />

      <QuickCheckin />

      {hasPendingAssessment && (
        <div className="mt-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-3">
          <p className="text-xs font-semibold text-cyan-400">{t("pendingAssessment")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("pendingAssessmentDesc")}</p>
          <Button asChild type="button" size="sm" variant="outline" className="mt-2 w-full">
            <Link href="/app/checkins">{t("completeAssessment")}</Link>
          </Button>
        </div>
      )}

      <Separator className="my-4" />

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("conversations")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("conversationsDesc")}
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {conversations.length}
            </Badge>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 rounded-xl pl-8 text-xs"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <ScrollArea className="h-64 rounded-2xl border border-border bg-muted/30">
            <div className="space-y-2 p-2">
              {filteredConversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
                  {searchQuery ? t("noResults") : t("noConversations")}
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={conversation.id === activeConversationId}
                    isEditing={editingId === conversation.id}
                    isDeleting={deletingId === conversation.id}
                    t={t}
                    editInputRef={editInputRef}
                    editingTitle={editingTitle}
                    setEditingTitle={setEditingTitle}
                    onSelectConversation={onSelectConversation}
                    startEditing={startEditing}
                    commitRename={commitRename}
                    setEditingId={setEditingId}
                    setDeletingId={setDeletingId}
                    onDeleteConversation={onDeleteConversation}
                    formatRelativeDate={formatRelativeDate}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div id="mi-progreso" data-tour="mi-progreso" className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {t("actionsProgress", { done: progress.completedActions, total: progress.totalActions })}
              </Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1 capitalize">
                {progress.dominantState}
              </Badge>
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">{t("processProgress")}</p>
            <Progress value={progressPercent} className="mt-3 h-2.5" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t("processProgressDesc")}
            </p>
            {progress.emotionalState || progress.streakDays !== undefined ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {progress.emotionalState ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1 capitalize">
                    {progress.emotionalState}
                  </Badge>
                ) : null}
                {progress.progressTrend ? (
                  <Badge
                    variant={
                      progress.progressTrend === "mejor"
                        ? "success"
                        : progress.progressTrend === "empeora"
                          ? "warning"
                          : "secondary"
                    }
                    className="rounded-full px-3 py-1"
                  >
                    {t("trend", { value: progress.progressTrend })}
                  </Badge>
                ) : null}
                {(progress.streakDays ?? 0) > 0 ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {t("streakDays", { count: progress.streakDays ?? 0 })}
                  </Badge>
                ) : null}
                <button
                  onClick={() => setShowShareStory(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors"
                >
                  <Share2 className="w-3 h-3" /> {t("share")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("activeGoal")}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {activeGoal?.title || t("noActiveGoal")}
                </p>
              </div>
              {activeGoal ? (
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {activeGoal.progress}%
                </Badge>
              ) : null}
            </div>

            {activeGoal ? (
              <>
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("actionsCompleted", { done: activeGoal.completedCount, total: activeGoal.totalCount })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge
                    variant={pendingActionsCount > 0 ? "warning" : "success"}
                    className="rounded-full px-3 py-1"
                  >
                    {pendingActionsCount > 0
                      ? t("pendingCount", { count: pendingActionsCount })
                      : t("noOpenDebt")}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {activeGoal.actions.slice(0, 3).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => onToggleAction?.(action.id, !action.completed)}
                      disabled={!onToggleAction}
                      title={
                        action.completed
                          ? t("markPendingAgain")
                          : t("markDone")
                      }
                      className={`flex items-start gap-2 w-full text-left rounded-xl border border-border bg-background/80 px-3 py-2 text-sm transition-colors ${
                        onToggleAction
                          ? "hover:border-signal-success/40 hover:bg-signal-success/5 cursor-pointer"
                          : "cursor-default"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex items-center justify-center h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${
                          action.completed
                            ? "bg-signal-success border-signal-success"
                            : "border-zinc-500"
                        }`}
                      >
                        {action.completed && (
                          <Check className="h-2.5 w-2.5 text-white" />
                        )}
                      </span>
                      <span
                        className={
                          action.completed
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                        }
                      >
                        {action.description}
                      </span>
                    </button>
                  ))}
                </div>
                {actionLock ? (
                  <div className="mt-3 rounded-xl border border-signal-warning/30 bg-signal-warning/12 px-3 py-3 text-sm text-foreground">
                    <p className="font-semibold">{actionLock.actionTitle}</p>
                    <p className="mt-1">{actionLock.message}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("emptyGoalHint")}
              </p>
            )}
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <FamilySettings />

      {/* Support messages from trusted contacts */}
      {supportMessages.length > 0 && (
        <>
          <Separator className="my-4" />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("supportMessages")}
              </p>
              {unreadSupport > 0 && (
                <Badge variant="warning" className="rounded-full px-2 py-0.5 text-[10px]">
                  {t("newCount", { count: unreadSupport })}
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {supportMessages.slice(0, 3).map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl border p-3 text-sm ${
                    msg.readAt
                      ? "border-border bg-muted/20 text-muted-foreground"
                      : "border-fuchsia-500/30 bg-fuchsia-500/5 text-foreground"
                  }`}
                >
                  <p className="text-xs font-semibold">{msg.fromName}</p>
                  <p className="mt-1 text-xs leading-relaxed line-clamp-2">{msg.content}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(msg.deliveredAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator className="my-4" />

      {/* Invitaciones */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("invitations")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {availableInvites.length > 0
                ? t("availableCount", { count: availableInvites.length })
                : t("earnInvites")}
            </p>
          </div>
          <Gift className="size-4 shrink-0 text-fuchsia-400" />
        </div>

        {availableInvites.length > 0 ? (
          <div className="space-y-2">
            {availableInvites.slice(0, 3).map((inv) => (
              <div
                key={inv.code}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
              >
                <p className="truncate text-xs text-muted-foreground font-mono">
                  /i/{inv.code.slice(0, 8)}…
                </p>
                <button
                  type="button"
                  onClick={() => copyInvite(inv.code, inv.url)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted transition-colors"
                >
                  {copiedCode === inv.code ? (
                    <><Check className="size-3 text-green-500" /> {t("copied")}</>
                  ) : (
                    <><Copy className="size-3" /> {t("copy")}</>
                  )}
                </button>
              </div>
            ))}
            <Link href="/app/invitar" className="block text-center text-xs text-violet-400 hover:text-violet-300 transition-colors">
              {availableInvites.length > 3 ? t("moreInvites", { count: availableInvites.length - 3 }) : ""}{t("viewAllInvitations")}
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <p>{t.rich("streak7", { strong: (c) => <strong>{c}</strong> })}</p>
            <p>{t.rich("streak30", { strong: (c) => <strong>{c}</strong> })}</p>
          </div>
        )}
      </div>

      {adminAuthenticated && (
        <>
          <Separator className="my-4" />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("adminAccess")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("adminSession")}
                </p>
              </div>
              <Badge
                variant="success"
                className="rounded-full px-3 py-1"
              >
                <ShieldCheck className="mr-1 size-3.5" />
                {t("active")}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button asChild type="button" variant="outline" size="sm" className="justify-between">
                <Link href="/admin">
                  {t("adminPanel")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-between"
                onClick={() => void onAdminLogout()}
              >
                {t("logout")}
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Share Story Modal */}
      {showShareStory && (
        <ShareStoryCard
          data={{
            name: profile.name,
            streakDays: progress.streakDays ?? 0,
            completedActions: progress.completedActions,
            totalActions: progress.totalActions,
            goalTitle: activeGoal?.title ?? null,
            state: progress.emotionalState ?? progress.dominantState ?? "neutral",
            plan: profile.plan ?? "Free",
          }}
          onClose={() => setShowShareStory(false)}
        />
      )}

      {/* Atribución sutil — el producto es Tres Mil Millones de Latidos pero
          en el fondo se reconoce que es proyecto de Startidea sin saturar la UI. */}
      <p className="mt-auto pt-3 text-center text-[10px] text-muted-foreground/60">
        {t.rich("projectOf", {
          startidea: (c) => (
            <a
              href="https://startidea.es"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground/80 transition-colors underline decoration-dotted underline-offset-2"
            >
              {c}
            </a>
          ),
        })}
      </p>
    </aside>
  );
}

/**
 * Item de conversación con soporte de swipe-to-delete (touch only).
 *
 * El usuario en móvil arrastra el item a la izquierda; al superar 80px,
 * al soltar el dedo dispara la confirmación de borrado (mismo flujo que
 * el botón Trash de hover en desktop). El reveal rojo bajo el item da
 * feedback visual del progreso.
 */
type Conv = {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
};
type ConvItemProps = {
  conversation: Conv;
  isActive: boolean;
  isEditing: boolean;
  isDeleting: boolean;
  // next-intl's useTranslations devuelve un tipo genérico complejo; usamos
  // ReturnType para no acoplarnos al detalle interno.
  t: ReturnType<typeof useTranslations>;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  onSelectConversation: (id: string) => void;
  startEditing: (id: string, title: string) => void;
  commitRename: (id: string) => Promise<void> | void;
  setEditingId: (id: string | null) => void;
  setDeletingId: (id: string | null) => void;
  onDeleteConversation?: (id: string) => Promise<void> | void;
  formatRelativeDate: (dateString: string) => string;
};
function ConversationItem({
  conversation,
  isActive,
  isEditing,
  isDeleting,
  t,
  editInputRef,
  editingTitle,
  setEditingTitle,
  onSelectConversation,
  startEditing,
  commitRename,
  setEditingId,
  setDeletingId,
  onDeleteConversation,
  formatRelativeDate,
}: ConvItemProps) {
  const { handlers: swipeHandlers, offset, swiping, progress } = useSwipeAction({
    threshold: 80,
    onTrigger: () => setDeletingId(conversation.id),
  });

  // Mientras se hace swipe activo, deshabilitar el "transition" para que
  // el seguimiento del dedo sea inmediato. Al soltar (offset=0), volver
  // a animación suave para el snap-back.
  const transformStyle = {
    transform: `translateX(${offset}px)`,
    transition: swiping ? "none" : "transform 200ms ease-out",
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Reveal rojo bajo el item, visible mientras se swipea. La intensidad
          aumenta con progress hacia el threshold. */}
      {offset < 0 ? (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-end pr-6 bg-destructive/80 pointer-events-none"
          style={{ opacity: progress }}
        >
          <Trash2 className="size-5 text-destructive-foreground" />
        </div>
      ) : null}

      <div
        {...swipeHandlers}
        style={transformStyle}
        className={`group relative rounded-2xl border ${
          isActive
            ? "border-primary/20 bg-primary text-primary-foreground shadow-sm"
            : "border-border bg-background/80 text-foreground hover:bg-accent"
        }`}
      >
        {isDeleting ? (
          <div className="flex items-center gap-2 px-3 py-3">
            <p className="flex-1 truncate text-xs">{t("deleteConfirm")}</p>
            <button
              type="button"
              onClick={async () => {
                await onDeleteConversation?.(conversation.id);
                setDeletingId(null);
              }}
              className="rounded-lg bg-destructive px-2 py-1 text-[11px] font-semibold text-destructive-foreground hover:opacity-90"
            >
              {t("yes")}
            </button>
            <button
              type="button"
              onClick={() => setDeletingId(null)}
              className="rounded-lg border px-2 py-1 text-[11px] hover:bg-muted"
            >
              {t("no")}
            </button>
          </div>
        ) : isEditing ? (
          <div className="flex items-center gap-1 px-2 py-2">
            <input
              ref={editInputRef}
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename(conversation.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="h-7 flex-1 rounded-lg border border-primary/30 bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => void commitRename(conversation.id)}
              className="rounded-lg p-1 text-signal-success hover:bg-signal-success/10"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-lg p-2 hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSelectConversation(conversation.id)}
            className="w-full px-3 py-3 text-left"
          >
            <p className="truncate pr-12 text-sm font-medium">{conversation.title}</p>
            <div
              className={`mt-2 flex items-center justify-between gap-2 text-xs ${
                isActive ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}
            >
              <span>{t("messageCount", { count: conversation.messageCount })}</span>
              <span>{formatRelativeDate(conversation.updatedAt)}</span>
            </div>
          </button>
        )}

        {!isEditing && !isDeleting ? (
          <div className="absolute right-2 top-2 hidden items-center gap-0.5 group-hover:flex">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startEditing(conversation.id, conversation.title);
              }}
              className={`rounded-lg p-2 hover:bg-muted/60 ${isActive ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title={t("rename")}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeletingId(conversation.id);
              }}
              className={`rounded-lg p-2 hover:bg-destructive/10 ${isActive ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive"}`}
              title={t("delete")}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
