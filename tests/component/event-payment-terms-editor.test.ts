import { fireEvent, render, screen } from "@testing-library/svelte";
import type { Component } from "svelte";
import { describe, expect, it } from "vitest";
import EventPaymentTermsEditor from "../../src/components/crm/billing/EventPaymentTermsEditor.svelte";

const Tested = EventPaymentTermsEditor as unknown as Component;

describe("event payment terms editor", () => {
  it("keeps free events simple and calculates exact installment cents", async () => {
    render(Tested);
    expect(screen.queryByText("How can families pay?")).toBeNull();
    await fireEvent.input(screen.getByLabelText("Event registration price"), {
      target: { value: "1000.00" },
    });
    await fireEvent.click(screen.getByLabelText("Allow split payments"));
    expect(screen.getByText("3 family payments")).toBeVisible();
    expect(screen.getByText(/Payment 1: \$333\.33 · due at enrollment/)).toBeVisible();
    expect(screen.getByText(/Payment 3: \$333\.34 · due 2 months after enrollment \(final payment\)/)).toBeVisible();
  });
});
