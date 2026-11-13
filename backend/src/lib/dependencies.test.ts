import { describe, expect, it } from "vitest";
import { wouldCycle } from "./dependencies";

describe("wouldCycle", () => {
  it("rejects a task that depends on itself", () => {
    expect(wouldCycle("a", ["a"], [])).toBe(true);
  });

  it("rejects a direct cycle", () => {
    // b already depends on a, so a cannot depend on b.
    expect(wouldCycle("a", ["b"], [{ taskId: "b", dependsOnId: "a" }])).toBe(true);
  });

  it("rejects a transitive cycle", () => {
    const edges = [{ taskId: "b", dependsOnId: "c" }, { taskId: "c", dependsOnId: "a" }];
    expect(wouldCycle("a", ["b"], edges)).toBe(true);
  });

  it("allows dependencies that do not loop back", () => {
    const edges = [{ taskId: "b", dependsOnId: "c" }, { taskId: "d", dependsOnId: "a" }];
    expect(wouldCycle("a", ["b", "c"], edges)).toBe(false);
  });

  it("ignores the task's own existing edges since they are being replaced", () => {
    // a currently depends on b; replacing that with a dependency on c is fine.
    const edges = [{ taskId: "a", dependsOnId: "b" }, { taskId: "c", dependsOnId: "b" }];
    expect(wouldCycle("a", ["c"], edges)).toBe(false);
  });

  it("handles diamonds without looping forever", () => {
    const edges = [
      { taskId: "b", dependsOnId: "d" },
      { taskId: "c", dependsOnId: "d" },
      { taskId: "d", dependsOnId: "e" },
    ];
    expect(wouldCycle("a", ["b", "c"], edges)).toBe(false);
  });
});
