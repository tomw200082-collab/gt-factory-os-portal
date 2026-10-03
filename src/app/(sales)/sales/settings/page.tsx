"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useJourney, useLeads, useMenuFiles, useSaveMenuFile, useSaveQuickMessage, useSaveResponseTime,
  useSaveSettings, useSaveSigners, useSettings,
} from "../../_lib/api";
import { RULE_MESSAGES, TEAM_UI, UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { SettingsForm, type SettingsArea } from "../../_components/SettingsForm";
import { JourneySection } from "../../_components/JourneySection";
import { QuickMessagesSection } from "../../_components/QuickMessagesSection";
import { ResponseTimeSection } from "../../_components/ResponseTimeSection";
import { SignersArea } from "../../_components/SignersArea";
import { MenuFilesArea } from "../../_components/MenuFilesArea";
import { SettingHistory } from "../../_components/SettingHistory";
import type { MenuKey, QuickSituation } from "../../_lib/types";
import type { SalesApiError } from "../../_lib/api";
import { useSession } from "@/lib/auth/session-provider";

/** "Saved" is news for a moment, not a standing claim about fields edited since (UX gate FLOW-006). */
function useFlash<T>(): [T | null, (v: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return;
    const timer = setTimeout(() => setValue(null), 3000);
    return () => clearTimeout(timer);
  }, [value]);
  return [value, setValue];
}

const messageOf = (e: SalesApiError) => (e.code && RULE_MESSAGES[e.code]) || e.message || UI.saveFailed;

export default function SettingsPage() {
  const { session } = useSession();
  const settings = useSettings();
  const leads = useLeads();
  const manager = Boolean(session) && session?.role !== "sales_rep";
  // D-044: the automatic sequence, read-only. D-042: the quick messages, one save each.
  const journey = useJourney(manager);
  const saveQuick = useSaveQuickMessage();
  const [quickSaved, setQuickSaved] = useFlash<QuickSituation>();
  const [quickError, setQuickError] = useState<{ situation: QuickSituation; message: string } | null>(null);
  // D-043: the response clock, its own save.
  const saveRt = useSaveResponseTime();
  const [rtSaved, setRtSaved] = useFlash<true>();
  // D-045: team and rules — every area its own save.
  const saveSigners = useSaveSigners();
  const [signersSaved, setSignersSaved] = useFlash<true>();
  const menus = useMenuFiles(manager);
  const saveMenu = useSaveMenuFile();
  const [menuSaved, setMenuSaved] = useFlash<MenuKey>();
  const [menuError, setMenuError] = useState<{ key: MenuKey; message: string } | null>(null);
  const save = useSaveSettings();
  const [areaSaved, setAreaSaved] = useFlash<SettingsArea>();
  const [areaError, setAreaError] = useState<{ area: SettingsArea; message: string } | null>(null);
  const [savingArea, setSavingArea] = useState<SettingsArea | null>(null);

  const openLeadsByAssignee = useMemo(() => {
    const out: Record<string, number> = {};
    for (const lead of leads.data ?? []) {
      if (!lead.assignee) continue;
      if (lead.status !== "new" && lead.status !== "working") continue;
      out[lead.assignee] = (out[lead.assignee] ?? 0) + 1;
    }
    return out;
  }, [leads.data]);

  const data = settings.isSuccess ? settings.data : null;
  const changeOf = (key: string) => data?.last_changes.find((c) => c.key === key) ?? null;
  const names = useMemo(() => Object.fromEntries((data?.assignees ?? []).map((a) => [a.email.toLowerCase(), a.name])), [data]);

  return (
    <div className="flex flex-col gap-4">
      <header className="s-opening s-opening-compact flex flex-col gap-1">
        <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.settingsTitle}
        </h1>
        <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.settingsHint}
        </p>
      </header>

      {session?.role === "sales_rep" ? (
        <p className="text-sm" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.settingsManagerOnly}
        </p>
      ) : null}
      {manager && settings.isLoading ? <QueueLoading /> : null}
      {manager && settings.isError ? <QueueError onRetry={() => void settings.refetch()} what={UI.loadErrorSettings} /> : null}

      {manager && journey.isLoading ? <QueueLoading /> : null}
      {manager && journey.isError ? (
        <QueueError onRetry={() => void journey.refetch()} what={UI.journeyLoadError} />
      ) : null}
      {manager && journey.isSuccess ? <JourneySection journey={journey.data} /> : null}

      {manager && data?.whatsapp_quick_messages ? (
        <QuickMessagesSection
          messages={data.whatsapp_quick_messages}
          changes={data.quick_message_changes ?? {}}
          signer={data.quick_message_signer ?? ""}
          savingSituation={saveQuick.isPending ? (saveQuick.variables?.situation ?? null) : null}
          savedSituation={quickSaved}
          error={quickError}
          onSave={(situation, text) => {
            setQuickSaved(null);
            setQuickError(null);
            saveQuick.mutate({ situation, text }, {
              onSuccess: () => setQuickSaved(situation),
              onError: (e) => setQuickError({ situation, message: (e.code && RULE_MESSAGES[e.code]) || UI.saveFailed }),
            });
          }}
          history={<SettingHistory settingKey="whatsapp_quick_messages" title={UI.quickTitle} />}
        />
      ) : null}

      {manager && data?.response_time ? (
        <ResponseTimeSection
          value={data.response_time}
          change={changeOf("response_time")}
          saving={saveRt.isPending}
          saved={rtSaved === true}
          error={saveRt.error ? ((saveRt.error.code && RULE_MESSAGES[saveRt.error.code]) || UI.saveFailed) : null}
          onSave={(value) => {
            setRtSaved(null);
            saveRt.mutate(value, { onSuccess: () => setRtSaved(true) });
          }}
          history={<SettingHistory settingKey="response_time" title={UI.rtTitle} />}
        />
      ) : null}

      {manager && data ? (
        <section className="flex w-full max-w-2xl flex-col gap-3" aria-labelledby="settings-team-title" data-testid="settings-team">
          <div className="flex flex-col gap-1 px-1">
            <h2 id="settings-team-title" className="s-section-heading">{TEAM_UI.title}</h2>
            <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{TEAM_UI.hint}</p>
          </div>
          <div className="s-team-areas">
            <SignersArea
              assignees={data.assignees}
              signers={data.signers}
              openLeadsByAssignee={openLeadsByAssignee}
              change={changeOf("lead_journey_signers_by_email")}
              saving={saveSigners.isPending}
              saved={signersSaved === true}
              error={saveSigners.error ? messageOf(saveSigners.error) : null}
              onSave={(map) => {
                setSignersSaved(null);
                saveSigners.mutate(map, { onSuccess: () => setSignersSaved(true) });
              }}
              history={<SettingHistory settingKey="lead_journey_signers_by_email" title={TEAM_UI.signersTitle} names={names} />}
            />
            <MenuFilesArea
              menus={menus.data}
              loading={menus.isLoading}
              loadError={menus.isError}
              onRetry={() => void menus.refetch()}
              change={changeOf("lead_menus")}
              savingKey={saveMenu.isPending ? (saveMenu.variables?.key ?? null) : null}
              savedKey={menuSaved}
              error={menuError}
              onSave={(key, file) => {
                setMenuSaved(null);
                setMenuError(null);
                saveMenu.mutate({ key, file }, {
                  onSuccess: () => setMenuSaved(key),
                  onError: (e) => setMenuError({ key, message: messageOf(e) }),
                });
              }}
              history={<SettingHistory settingKey="lead_menus" title={TEAM_UI.menusTitle} />}
            />
            <SettingsForm
              settings={data}
              savingArea={save.isPending ? savingArea : null}
              savedArea={areaSaved}
              error={areaError}
              onSave={(vars) => {
                const area: SettingsArea = "queue" in vars ? "queue" : "lost_reasons";
                setAreaSaved(null);
                setAreaError(null);
                setSavingArea(area);
                save.mutate(vars, {
                  onSuccess: () => setAreaSaved(area),
                  onError: (e) => setAreaError({ area, message: messageOf(e) }),
                });
              }}
              queueHistory={<SettingHistory settingKey="queue" title={UI.queueShapeTitle} />}
              lostReasonsHistory={<SettingHistory settingKey="lost_reasons" title={UI.lostReasonsTitle} />}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
