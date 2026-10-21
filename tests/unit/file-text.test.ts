import { describe, expect, it } from "vitest";
import { jsonText, parseCorpusFileText, readFilesAsCorpusSamples, registerForPath } from "../../src/lib/file-text";

describe("corpus file ingestion", () => {
  it("strips executable HTML and extracts conversation JSON prose", () => {
    expect(parseCorpusFileText("<h1>Update</h1><script>alert(1)</script><p>The plan is clear.</p>", "html")).toContain("Update");
    expect(parseCorpusFileText("<h1>Update</h1><script>alert(1)</script><p>The plan is clear.</p>", "html")).not.toContain("alert");
    expect(jsonText({ messages: [{ role: "user", content: "This is a sufficiently long conversation message." }] })).toEqual(["This is a sufficiently long conversation message."]);
  });

  it("categorizes source paths and parses supported files without retaining File objects", async () => {
    expect(registerForPath("exports/slack/chat.json")).toBe("chat");
    expect(registerForPath("writing/email/team.md")).toBe("email");
    const result = await readFilesAsCorpusSamples([
      new File(["<p>A useful update for the team.</p>"], "public/update.html", { type: "text/html" }),
      new File([JSON.stringify({ messages: [{ content: "This is a long enough conversation message for analysis." }] })], "chat/messages.json", { type: "application/json" }),
      new File(["binary"], "archive.pdf", { type: "application/pdf" })
    ]);
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0].format).toBe("html");
    expect(result.samples[1].format).toBe("json");
    expect(result.skipped).toEqual(["archive.pdf"]);
    expect(result.samples.every((sample) => !Object.prototype.hasOwnProperty.call(sample, "file"))).toBe(true);
  });
});
