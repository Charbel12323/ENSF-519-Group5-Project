import { describe, expect, it } from "vitest";
import { statusResolver } from "./status";

describe("statusResolver", () => {
  it("maps first, middle and last columns to TODO, IN_PROGRESS and DONE", () => {
    const status = statusResolver([{ id: "todo", order: 0 }, { id: "doing", order: 1 }, { id: "review", order: 2 }, { id: "done", order: 3 }]);
    expect(status("todo")).toBe("TODO");
    expect(status("doing")).toBe("IN_PROGRESS");
    expect(status("review")).toBe("IN_PROGRESS");
    expect(status("done")).toBe("DONE");
  });

  it("sorts by order rather than trusting the input order", () => {
    const status = statusResolver([{ id: "done", order: 2 }, { id: "todo", order: 0 }, { id: "doing", order: 1 }]);
    expect(status("todo")).toBe("TODO");
    expect(status("done")).toBe("DONE");
  });

  it("treats a single column as TODO, never DONE", () => {
    expect(statusResolver([{ id: "only", order: 0 }])("only")).toBe("TODO");
  });

  it("treats two columns as TODO and DONE", () => {
    const status = statusResolver([{ id: "a", order: 0 }, { id: "b", order: 1 }]);
    expect(status("a")).toBe("TODO");
    expect(status("b")).toBe("DONE");
  });
});
