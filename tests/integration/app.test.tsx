import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { buildProfileFromInterview, exportProfile } from "../../src/domain";

describe("Voiceprint application", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:voiceprint"), revokeObjectURL: vi.fn() });
  });

  it("updates the live profile preview from interview answers", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /your portable voice/i })).toBeInTheDocument();
    const name = screen.getByLabelText("What should we call you?");
    fireEvent.change(name, { target: { value: "Grace Hopper" } });
    expect(screen.getByText(/Grace Hopper · Voice Profile/)).toBeInTheDocument();
  });

  it("runs corpus analysis, lets the user approve evidence, and sanitizes storage", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Analyze writing samples" }));
    const input = screen.getByLabelText("Writing samples");
    fireEvent.change(input, { target: { value: "I'm writing this because the plan is clear. You can start with the small step.\n\n---\n\nWe are close. I want the reader to understand what changes and why it matters." } });
    fireEvent.click(screen.getByRole("button", { name: /analyze samples/i }));
    expect(await screen.findByText(/Analysis result/i)).toBeInTheDocument();
    const approve = screen.getAllByRole("button", { name: "Approve" })[0];
    fireEvent.click(approve);
    expect(await screen.findByText(/Rule approved for compilation/i)).toBeInTheDocument();
    const stored = window.localStorage.getItem("voiceprint-profile-v3") || "";
    expect(stored).not.toContain("rawSamples");
    expect(stored).not.toContain("I'm writing this because");
  });

  it("supports blind evaluation and canonical profile import", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Version A · baseline output"), { target: { value: "The update is complete." } });
    fireEvent.change(screen.getByLabelText("Version B · Voiceprint output"), { target: { value: "The update is complete, and here is what changes next." } });
    fireEvent.click(screen.getByRole("button", { name: /start blind comparison/i }));
    expect(await screen.findByText(/Which draft feels more like you/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /feels more like me/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /reveal scoring/i }));
    expect((await screen.findAllByText(/style score/i)).length).toBe(2);

    const imported = buildProfileFromInterview({ fullName: "Imported profile", role: "Writer", audience: "readers" });
    const file = new File([exportProfile(imported)], "import.voiceprint.json", { type: "application/json" });
    const fileInput = document.querySelector('input[accept="application/json,.json"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText(/Imported profile · Voice Profile/)).toBeInTheDocument();
  });

  it("keeps the mobile layout within the viewport-sized DOM", () => {
    render(<App />);
    document.documentElement.style.width = "390px";
    document.body.style.width = "390px";
    expect(document.querySelector(".builder-panel")).toBeInTheDocument();
    expect(document.querySelector(".preview-code")).toBeInTheDocument();
  });
});
