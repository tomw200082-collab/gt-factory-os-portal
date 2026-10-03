// Tranche 205 (D-045): team and rules, the control room, and the five small fold-ins.
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const pathname = { current: "/sales/today" };
const currentSession = vi.hoisted(() => ({ value: { role: "admin", email: "other-admin@synthetic.invalid" } as Record<string, string> }));
vi.mock("@/lib/auth/session-provider", () => ({ useSession: () => ({ session: currentSession.value }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { SignersArea } from "@/app/(sales)/_components/SignersArea";
import { MenuFilesArea, validateMenuFile } from "@/app/(sales)/_components/MenuFilesArea";
import { SettingsForm } from "@/app/(sales)/_components/SettingsForm";
import { SettingHistoryList } from "@/app/(sales)/_components/SettingHistory";
import { ControlRoomView, TestPhonesEditor, normalizeTestPhone } from "@/app/(sales)/_components/ControlRoomView";
import { SalesShell, canSeeControl } from "@/app/(sales)/_components/SalesShell";
import { ResponseTimeSection } from "@/app/(sales)/_components/ResponseTimeSection";
import { withPills } from "@/app/(sales)/_components/JourneySection";
import { WhatsAppQuick } from "@/app/(sales)/_components/WhatsAppQuick";
import { describeChange } from "@/app/(sales)/_lib/settingHistory";
import { CONTROL_UI, NAV_LABELS, TEAM_UI, UI } from "@/app/(sales)/_lib/labels";
import type { ControlRoom, MenuFileRow, SalesSettings } from "@/app/(sales)/_lib/types";

afterEach(() => {
  cleanup();
  pathname.current = "/sales/today";
  currentSession.value = { role: "admin", email: "other-admin@synthetic.invalid" };
});
const noop = () => {};

const ASSIGNEES = [
  { name: "דנה", email: "dana@synthetic.invalid", active: true },
  { name: "יואב", email: "Yoav@synthetic.invalid", active: true },
  { name: "רוני", email: "roni@synthetic.invalid", active: true },
];
const SIGNERS = [
  { email: "dana@synthetic.invalid", name: "דנה", signer: "דנה", source: "account" as const },
  { email: "Yoav@synthetic.invalid", name: "יואב", signer: "יואבי", source: "legacy" as const },
  { email: "roni@synthetic.invalid", name: "רוני", signer: null, source: null },
];

// ── fold-ins ─────────────────────────────────────────────────────────────────
describe("fold-ins from earlier gates", () => {
  it("(a) from 3 hours up the hours are whole, rounded down", () => {
    expect(UI.workHours(5.5)).toBe("5 שעות");
    expect(UI.workHours(3)).toBe("3 שעות");
    expect(UI.workHours(2.5)).toBe("שעתיים וחצי");
  });

  it("(b) an invalid response-time save moves focus to the first invalid field", () => {
    render(<ResponseTimeSection value={{ days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00", hot_hours: 2, normal_hours: 8 }}
      change={null} saving={false} saved={false} error={null} onSave={noop} />);
    fireEvent.change(screen.getByTestId("rt-end"), { target: { value: "25:00" } });
    fireEvent.change(screen.getByTestId("rt-normal"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("rt-save"));
    expect(document.activeElement).toBe(screen.getByTestId("rt-end"));
  });

  it("(b) the days come first when no day is chosen", () => {
    render(<ResponseTimeSection value={{ days: [0], start: "09:00", end: "17:00", hot_hours: 2, normal_hours: 8 }}
      change={null} saving={false} saved={false} error={null} onSave={noop} />);
    fireEvent.click(screen.getByTestId("rt-day-0"));
    fireEvent.change(screen.getByTestId("rt-hot"), { target: { value: "99" } });
    fireEvent.click(screen.getByTestId("rt-save"));
    expect(document.activeElement).toBe(screen.getByTestId("rt-day-0"));
  });

  it("(c) a fresh Today card says it is new today, not 0 days old", () => {
    expect(UI.ageInDays(0)).toBe("חדש מהיום");
    expect(UI.ageInDays(1)).toBe("בן יום");
    expect(UI.ageInDays(4)).toBe("בן 4 ימים");
  });

  it("(d) a pill followed by a comma is glued to it, with no gap and no break", () => {
    const { container } = render(<p>{withPills("{{rep}}, GT Everyday")}</p>);
    const pill = container.querySelector(".s-var-pill")!;
    expect(pill.className).toContain("s-var-pill-tight");
    const wrap = pill.parentElement!;
    expect(wrap.className).toContain("whitespace-nowrap");
    expect(wrap.textContent).toMatch(/›,$/);
    expect(container.textContent).toMatch(/›, GT Everyday$/);
    // a pill followed by a space keeps its ordinary spacing
    const { container: c2 } = render(<p>{withPills("היי {{name}} מה")}</p>);
    expect(c2.querySelector(".s-var-pill")!.className).not.toContain("tight");
  });

  it("(e) the other-message picker marks the current choice with aria-pressed and a visible check", () => {
    const settings = {
      sla_hours: 24, whatsapp_templates: { new_lead: "", reminder: "", returning_customer: "" }, lost_reasons: ["אחר"],
      queue: { daily_cap: 15, order: "newest_first" }, assignees: [], last_changes: [],
      whatsapp_quick_messages: { returning_customer: "a", tapped_order_no_order: "b", asked_more: "c", no_answer: "d", menu_no_reply: "e", no_auto: "f" },
      quick_message_signer: "אבי",
    } as SalesSettings;
    const lead = { contact_name: "דנה", org_name: "קפה", is_existing_customer: false,
      conversation: { suggested_situation: "asked_more", opted_out: false, menu_key: null, menu_label: null, auto: [], taps: [] } } as never;
    render(<WhatsAppQuick leadId="L1" phone="+972500000001" lead={lead} settings={settings} testId="wa" />);
    fireEvent.click(screen.getByTestId("wa-other"));
    const current = screen.getByTestId("wa-situation-asked_more");
    expect(current.getAttribute("aria-pressed")).toBe("true");
    expect(current.querySelector(".s-wa-situation-mark svg")).not.toBeNull();
    const other = screen.getByTestId("wa-situation-no_answer");
    expect(other.getAttribute("aria-pressed")).toBe("false");
    expect(other.querySelector(".s-wa-situation-mark svg")).toBeNull();
  });
});

// ── signers ──────────────────────────────────────────────────────────────────
describe("signers by account", () => {
  it("shows each person's signer, says when it is read by display name, and warns when there is none", () => {
    render(<SignersArea assignees={ASSIGNEES} signers={SIGNERS} change={{ actor: "Avi", at: new Date(Date.now() - 3600e3).toISOString() }}
      saving={false} saved={false} error={null} onSave={noop} />);
    expect((screen.getByTestId("signer-input-dana@synthetic.invalid") as HTMLInputElement).value).toBe("דנה");
    expect(screen.getByTestId("signer-note-Yoav@synthetic.invalid").textContent).toBe(TEAM_UI.signerLegacy);
    expect(screen.getByTestId("signer-note-roni@synthetic.invalid").textContent).toBe(TEAM_UI.signerNone("רוני"));
    expect(screen.getByTestId("settings-signers").textContent).toContain("שונה ע״י Avi לפני שעה");
    expect(screen.getByLabelText(new RegExp(TEAM_UI.signerLabel("דנה")))).toBeTruthy();
  });

  it("saves only what changed, by lower-case email; links a legacy name; an emptied field takes the signer away", () => {
    const saves: Array<Record<string, string | null>> = [];
    render(<SignersArea assignees={ASSIGNEES} signers={SIGNERS} change={null} saving={false} saved={false} error={null} onSave={(m) => saves.push(m)} />);
    fireEvent.change(screen.getByTestId("signer-input-dana@synthetic.invalid"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("signer-input-roni@synthetic.invalid"), { target: { value: " רוני " } });
    expect(screen.getByTestId("signers-dirty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("signers-save"));
    expect(saves).toEqual([{ "dana@synthetic.invalid": null, "yoav@synthetic.invalid": "יואבי", "roni@synthetic.invalid": "רוני" }]);
  });

  it("refuses a name over 30 characters and moves focus to it", () => {
    const saves: unknown[] = [];
    render(<SignersArea assignees={ASSIGNEES} signers={SIGNERS} change={null} saving={false} saved={false} error={null} onSave={(m) => saves.push(m)} />);
    fireEvent.change(screen.getByTestId("signer-input-roni@synthetic.invalid"), { target: { value: "א".repeat(31) } });
    fireEvent.click(screen.getByTestId("signers-save"));
    expect(saves).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByTestId("signer-input-roni@synthetic.invalid"));
    expect(screen.getByTestId("settings-signers").textContent).toContain(TEAM_UI.signerTooLong);
  });

  it("an older API without signers shows everyone unsigned and nothing to save", () => {
    render(<SignersArea assignees={ASSIGNEES} change={null} saving={false} saved={false} error={null} onSave={noop} />);
    expect((screen.getByTestId("signers-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("signer-note-dana@synthetic.invalid").textContent).toBe(TEAM_UI.signerNone("דנה"));
  });
});

// ── menu files ───────────────────────────────────────────────────────────────
const MENUS: MenuFileRow[] = [
  { key: "matcha", line: "מאצ׳ה", label: "תפריט המאצ׳ה", filename: "Matcha.pdf", pdf_url: "https://cdn.shopify.com/m.pdf", state: "ok", reason: null, checked_at: new Date().toISOString() },
  { key: "ube", line: "אובה", label: "תפריט האובה", filename: "Ube.pdf", pdf_url: "https://cdn.shopify.com/u.pdf", state: "missing", reason: "http_404", checked_at: new Date().toISOString() },
  { key: "opening", line: "בניית תפריט", label: "תפריט הפתיחה", filename: null, pdf_url: null, state: "missing", reason: "no_file", checked_at: null },
];
describe("menu file per line", () => {
  it("validates as the server does: https on cdn.shopify.com, a .pdf name, a label", () => {
    const ok = { label: "x", filename: "a.pdf", pdf_url: "https://cdn.shopify.com/a.pdf" };
    expect(validateMenuFile(ok)).toEqual({});
    expect(validateMenuFile({ ...ok, pdf_url: "http://cdn.shopify.com/a.pdf" }).pdf_url).toBe(TEAM_UI.menuUrlBad);
    expect(validateMenuFile({ ...ok, pdf_url: "https://cdn.shopify.com.evil.example/a.pdf" }).pdf_url).toBe(TEAM_UI.menuUrlBad);
    expect(validateMenuFile({ ...ok, filename: "a.docx" }).filename).toBe(TEAM_UI.menuFilenameBad);
    expect(validateMenuFile({ ...ok, filename: "a/b.pdf" }).filename).toBe(TEAM_UI.menuFilenameBad);
    expect(validateMenuFile({ ...ok, label: " " }).label).toBe(TEAM_UI.menuLabelRequired);
  });

  it("shows each line's label, file name and state, why it is missing, and the general-reply warning", () => {
    render(<MenuFilesArea menus={MENUS} loading={false} loadError={false} onRetry={noop} change={null}
      savingKey={null} savedKey={null} error={null} onSave={noop} />);
    expect(screen.getByTestId("menu-state-matcha").textContent).toContain(TEAM_UI.menuState.ok);
    expect(screen.getByTestId("menu-state-ube").textContent).toContain(TEAM_UI.menuState.missing);
    expect(screen.getByTestId("menu-reason-ube").textContent).toBe(TEAM_UI.menuReason("http_404"));
    expect(screen.getByTestId("menu-reason-opening").textContent).toBe(TEAM_UI.menuReason("no_file"));
    expect(screen.getByTestId("menu-row-matcha").textContent).toContain("Matcha.pdf");
    expect(screen.getByTestId("menus-warn").textContent).toBe(TEAM_UI.menusWarn);
  });

  it("edits a line: a bad link is refused with focus on it; a good one is saved trimmed", () => {
    const saves: unknown[] = [];
    render(<MenuFilesArea menus={MENUS} loading={false} loadError={false} onRetry={noop} change={null}
      savingKey={null} savedKey={null} error={null} onSave={(k, f) => saves.push([k, f])} />);
    fireEvent.click(screen.getByTestId("menu-opening-edit"));
    const editor = screen.getByTestId("menu-editor-opening");
    expect(document.activeElement).toBe(screen.getByTestId("menu-opening-label"));
    fireEvent.change(screen.getByTestId("menu-opening-filename"), { target: { value: "Opening.pdf" } });
    fireEvent.change(screen.getByTestId("menu-opening-pdf_url"), { target: { value: "https://example.com/o.pdf" } });
    fireEvent.click(screen.getByTestId("menu-opening-save"));
    expect(saves).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByTestId("menu-opening-pdf_url"));
    expect(within(editor).getByText(TEAM_UI.menuUrlBad)).toBeTruthy();
    fireEvent.change(screen.getByTestId("menu-opening-pdf_url"), { target: { value: " https://cdn.shopify.com/o.pdf " } });
    fireEvent.click(screen.getByTestId("menu-opening-save"));
    expect(saves).toEqual([["opening", { label: "תפריט הפתיחה", filename: "Opening.pdf", pdf_url: "https://cdn.shopify.com/o.pdf" }]]);
  });
});

// ── queue and lost reasons: their own saves ──────────────────────────────────
const SETTINGS: SalesSettings = {
  sla_hours: 24, whatsapp_templates: { new_lead: "", reminder: "", returning_customer: "" },
  assignees: ASSIGNEES, lost_reasons: ["אין תקציב", "אחר"], queue: { daily_cap: 15, order: "newest_first" },
  last_changes: [{ key: "lost_reasons", actor: "Tom", at: new Date(Date.now() - 2 * 3600e3).toISOString() }],
};
describe("queue and lost reasons", () => {
  it("each saves only itself, with its own who-changed line", () => {
    const saves: unknown[] = [];
    render(<SettingsForm settings={SETTINGS} onSave={(v) => saves.push(v)} />);
    expect((screen.getByTestId("queue-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("queue-cap"), { target: { value: "9" } });
    fireEvent.click(screen.getByTestId("queue-save"));
    fireEvent.change(screen.getByTestId("lost-reason-new"), { target: { value: "מחיר" } });
    fireEvent.click(screen.getByTestId("lost-reason-add"));
    fireEvent.click(screen.getByTestId("lost-reasons-save"));
    expect(saves).toEqual([{ queue: { daily_cap: 9, order: "newest_first" } }, { lost_reasons: ["אין תקציב", "מחיר", "אחר"] }]);
    expect(screen.getByTestId("settings-lost-reasons").textContent).toContain("שונה ע״י Tom לפני שעתיים");
  });
});

// ── history ──────────────────────────────────────────────────────────────────
describe("history per key", () => {
  it("describes a change in words: added and removed items, fields from what to what, map entries by name", () => {
    expect(describeChange("lost_reasons", ["א", "אחר"], ["א", "ב", "אחר"])).toEqual([TEAM_UI.historyAdded("ב")]);
    expect(describeChange("queue", { daily_cap: 15, order: "newest_first" }, { daily_cap: 7, order: "oldest_first" }))
      .toEqual([TEAM_UI.historyChanged("כמה שיחות ביום מ־15 ל־7, סדר התור מ־חדשים קודם ל־ישנים קודם")]);
    expect(describeChange("lead_journey_signers_by_email", { "a@x.invalid": "אבי" }, { "a@x.invalid": "אבי", "b@x.invalid": "בני" }, { "b@x.invalid": "בני" }))
      .toEqual([TEAM_UI.historyAdded("בני")]);
    expect(describeChange("lead_menus", { matcha: { pdf_url: "a" } }, { matcha: { pdf_url: "b" } })).toEqual([TEAM_UI.historyChanged("מאצ׳ה")]);
    expect(describeChange("queue", null, { daily_cap: 1 })).toEqual([TEAM_UI.historyFirst]);
  });

  it("the list opens on demand and shows who, when and what", () => {
    const toggle = vi.fn();
    const rows = [{ id: "1", actor: "Avi", at: new Date(Date.now() - 3600e3).toISOString(), old_value: ["א"], new_value: ["א", "ב"] }];
    const { rerender } = render(<SettingHistoryList settingKey="lost_reasons" title="סיבות" open={false} onToggle={toggle} rows={undefined} loading={false} error={false} />);
    const button = screen.getByTestId("history-toggle-lost_reasons");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalled();
    rerender(<SettingHistoryList settingKey="lost_reasons" title="סיבות" open onToggle={toggle} rows={rows} loading={false} error={false} />);
    const list = screen.getByTestId("history-list-lost_reasons");
    expect(list.textContent).toContain("Avi");
    expect(list.textContent).toContain("לפני שעה");
    expect(list.textContent).toContain(TEAM_UI.historyAdded("ב"));
  });
});

// ── control room ─────────────────────────────────────────────────────────────
const ROOM: ControlRoom = {
  generated_at: new Date().toISOString(),
  tiles: [
    { id: "intake", state: "red", last_success_at: new Date(Date.now() - 30 * 3600e3).toISOString(), action: "intake_pulse_stale",
      facts: { mode: "make", last_lead_at: null, leads_24h: 0, last_pulse_at: new Date(Date.now() - 30 * 3600e3).toISOString(), rejects_24h: 0, unalerted_48h: 0 } },
    { id: "whatsapp", state: "green", last_success_at: null, action: "wa_test",
      facts: { mode: "test", test_phone_count: 1, window_days: 7, sent: 1, delivered: 2, read: 3, failed: 0, dry_run: 4, opt_outs_total: 0, opt_outs_7d: 0, template_approval: null } },
    { id: "wake", state: "amber", last_success_at: null, action: "wake_no_runs", facts: { last_run: null, runs_24h: 0, sent_24h: 0, skipped_24h: {} } },
    { id: "settings", state: "green", last_success_at: null, action: "ok", facts: { recent: [{ key: "queue", actor: "Tom", at: new Date().toISOString() }] } },
  ],
  technical: { test_phones: ["972500000001"], intake_mode: { mode: "make", reason: "synthetic", changed_at: null, pulse_expected: "hourly" } },
};
describe("control room", () => {
  it("only Tom's email sees the entry", () => {
    expect(canSeeControl("tom@gteveryday.com")).toBe(true);
    expect(canSeeControl(" Tom@GTEveryday.com ")).toBe(true);
    expect(canSeeControl("admin@gteveryday.com")).toBe(false);
    expect(canSeeControl(undefined)).toBe(false);
  });

  it("the nav shows no control-room entry to another admin, and shows it to Tom", () => {
    const withQuery = (ui: ReactNode) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => [] } } })}>{ui}</QueryClientProvider>
    );
    const { unmount } = render(withQuery(<SalesShell><p>x</p></SalesShell>));
    expect(screen.queryByTestId("sales-rail-control")).toBeNull();
    expect(screen.queryByTestId("sales-control-icon")).toBeNull();
    expect(screen.queryByText(NAV_LABELS.control)).toBeNull();
    unmount();
    currentSession.value = { role: "admin", email: "tom@gteveryday.com" };
    render(withQuery(<SalesShell><p>x</p></SalesShell>));
    expect(screen.getByTestId("sales-rail-control").getAttribute("href")).toBe("/sales/control");
    expect(screen.getByTestId("sales-control-icon").getAttribute("aria-label")).toBe(NAV_LABELS.control);
  });

  it("each tile says its state in words, its last success, and one action; the template approval is not stored", () => {
    render(<ControlRoomView room={ROOM} phones={{ phones: [], saving: false, saved: false, error: null, onSave: noop }} />);
    expect(screen.getByTestId("tile-intake-state").textContent).toContain(CONTROL_UI.state.red);
    expect(screen.getByTestId("tile-intake-action").textContent).toBe(CONTROL_UI.action.intake_pulse_stale);
    expect(screen.getByTestId("tile-wake-action").textContent).toBe(CONTROL_UI.action.wake_no_runs);
    expect(screen.getByTestId("tile-wake").textContent).toContain(CONTROL_UI.noSuccess);
    expect(screen.getByTestId("tile-whatsapp").textContent).toContain(CONTROL_UI.templateApproval);
    expect(screen.getByTestId("tile-whatsapp").textContent).toContain("נקראו 3");
    expect(screen.getByTestId("tile-settings").textContent).toContain("צורת התור");
    expect(screen.getByTestId("control-intake-mode").textContent).toContain(CONTROL_UI.intakeModeReadOnly);
  });

  it("test phones: normalised like the server, added, removed and saved", () => {
    expect(normalizeTestPhone("050-123 4567")).toBe("972501234567");
    expect(normalizeTestPhone("+972 50-123-4567")).toBe("972501234567");
    expect(normalizeTestPhone("12345")).toBeNull();
    const saves: string[][] = [];
    render(<TestPhonesEditor phones={["972500000001"]} saving={false} saved={false} error={null} onSave={(p) => saves.push(p)} />);
    fireEvent.change(screen.getByTestId("test-phone-new"), { target: { value: "123" } });
    fireEvent.click(screen.getByTestId("test-phone-add"));
    expect(screen.getByTestId("control-test-phones").textContent).toContain(CONTROL_UI.testPhoneBad);
    expect(document.activeElement).toBe(screen.getByTestId("test-phone-new"));
    fireEvent.change(screen.getByTestId("test-phone-new"), { target: { value: "052-999 8888" } });
    fireEvent.click(screen.getByTestId("test-phone-add"));
    fireEvent.click(screen.getByTestId("test-phone-remove-972500000001"));
    fireEvent.click(screen.getByTestId("test-phones-save"));
    expect(saves).toEqual([["972529998888"]]);
  });
});
