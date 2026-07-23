import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SupplierCallLink } from "./SupplierCallLink";

afterEach(cleanup);

describe("SupplierCallLink", () => {
  it("renders a tel: link with digits only when a phone is present", () => {
    render(<SupplierCallLink phone="050-123 4567" supplierName="ספק א׳" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("tel:0501234567");
    expect(link.getAttribute("aria-label")).toContain("ספק א׳");
    expect(screen.getByText("050-123 4567")).toBeTruthy();
  });

  it("keeps a leading + in the dialled number", () => {
    render(<SupplierCallLink phone="+972 50 1234567" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "tel:+972501234567",
    );
  });

  it("shows a muted 'no phone' hint (no link) when the phone is null", () => {
    render(<SupplierCallLink phone={null} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("אין טלפון")).toBeTruthy();
  });

  it("compact mode keeps the link but drops the visible number", () => {
    render(<SupplierCallLink phone="0501234567" compact />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("tel:0501234567");
    expect(screen.queryByText("0501234567")).toBeNull();
  });
});
