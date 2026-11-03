// @vitest-environment jsdom
// The review screen: flags show up, edits re-run the checks, CSV export works.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewPanel } from "../src/web/components/ReviewPanel";
import { doc, line, po } from "./fixtures";

const reading = (extraction = doc()) => ({ extraction, source: "Test reading", isAnswerKey: false });

describe("ReviewPanel", () => {
  it("says so when nothing is wrong", () => {
    render(<ReviewPanel reading={reading()} orders={[po()]} fileName="t" />);
    expect(screen.getByText(/No problems found/)).toBeInTheDocument();
    expect(screen.getByText("Matched to PO-1")).toBeInTheDocument();
  });

  it("highlights a short shipment and clears it when the quantity is corrected", async () => {
    const short = doc({ line_items: [line({ quantity: 1, line_total: 5 })], subtotal: 5, total: 5 });
    render(<ReviewPanel reading={reading(short)} orders={[po()]} fileName="t" />);
    expect(screen.getByText(/Short shipment/)).toBeInTheDocument();
    expect(screen.getByLabelText("Line 1 quantity").closest("tr")).toHaveClass("problem");

    const qty = screen.getByLabelText("Line 1 quantity");
    await userEvent.clear(qty);
    await userEvent.type(qty, "2");
    // Now 2 x $5 = $10 but the line still says $5: a different problem appears.
    expect(screen.queryByText(/Short shipment/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 x \$5.00 = \$10.00/)).toBeInTheDocument();
    expect(screen.getByText(/edited by you/)).toBeInTheDocument();
  });

  it("warns clearly when showing the answer key instead of an AI reading", () => {
    render(
      <ReviewPanel reading={{ ...reading(), source: "Answer key", isAnswerKey: true }} orders={[]} fileName="t" />,
    );
    expect(screen.getByText("Answer key")).toHaveClass("answer-key");
  });

  it("downloads a CSV with the checked lines", async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ReviewPanel reading={reading()} orders={[]} fileName="inv" />);
    await userEvent.click(screen.getByLabelText("Line 1 checked"));
    await userEvent.click(screen.getByText("Download checked CSV"));
    expect(click).toHaveBeenCalled();
    const text = await created[0].text();
    expect(text).toContain(",yes,");
  });
});
