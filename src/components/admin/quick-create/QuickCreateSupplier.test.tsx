// ---------------------------------------------------------------------------
// Tranche 151 — the Add-supplier dialog could never create a supplier.
//
// POST /api/v1/mutations/suppliers requires `idempotency_key`, and the shared
// quick-create helper posted the form values verbatim without one, so every
// submit 422'd with a bare "Validation failed." These tests pin the three
// things that were wrong: the key is sent, a 422 names the field, and a retry
// reuses the same key instead of creating twice.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickCreateSupplier } from "./QuickCreateSupplier";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDialog(onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <QuickCreateSupplier open onClose={vi.fn()} onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onCreated };
}

async function fillAndSubmit() {
  await userEvent.type(
    screen.getByLabelText(/supplier code/i),
    "SUP-KETER-HARIMON",
  );
  await userEvent.type(screen.getByLabelText(/official name/i), "כתר הרימון");
  await userEvent.click(screen.getByRole("button", { name: /save supplier/i }));
}

describe("QuickCreateSupplier — tranche 151", () => {
  it("sends a non-empty idempotency_key, without which the server always 422s", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ supplier_id: "SUP-KETER-HARIMON" }), {
          status: 201,
        }),
    );

    renderDialog();
    await fillAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/suppliers"),
    )!;
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(typeof body.idempotency_key).toBe("string");
    expect(body.idempotency_key.length).toBeGreaterThan(0);
    // And the fields the endpoint actually accepts still go through.
    expect(body.supplier_id).toBe("SUP-KETER-HARIMON");
    expect(body.supplier_name_official).toBe("כתר הרימון");
  });

  it("surfaces the server's field-level issue instead of a bare 'Validation failed.'", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            issues: [
              { path: ["supplier_id"], message: "Supplier already exists" },
            ],
          }),
          { status: 422 },
        ),
    );

    renderDialog();
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/supplier_id: Supplier already exists/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/^Validation failed\.$/)).toBeNull();
  });

  it("reuses the same idempotency_key when a failed submit is retried", async () => {
    let attempt = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
      }
      return new Response(JSON.stringify({ supplier_id: "SUP-KETER-HARIMON" }), {
        status: 201,
      });
    });

    renderDialog();
    await fillAndSubmit();
    await waitFor(() => expect(attempt).toBe(1));

    // Retry the same form — a genuine retry must not create a second supplier.
    await userEvent.click(screen.getByRole("button", { name: /save supplier/i }));
    await waitFor(() => expect(attempt).toBe(2));

    const bodies = fetchMock.mock.calls
      .filter((c) => String(c[0]).includes("/api/suppliers"))
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(bodies).toHaveLength(2);
    expect(bodies[0].idempotency_key).toBe(bodies[1].idempotency_key);
  });

  it("does not offer a status control the create endpoint would ignore", async () => {
    renderDialog();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.getByTestId("quick-create-supplier-status-note"),
    ).toBeTruthy();
  });
});
