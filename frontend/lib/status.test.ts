import { describe, expect, it } from "vitest";
import { addDays, dateKey, daysBetween, isOverdue, parseKey, statusResolver } from "./status";
import type { Column } from "./types";

const column = (id: string, order: number): Column => ({ id, order, groupId: "g", name: id });

describe("statusResolver", () => {
  it("maps first, middle and last columns to TODO, IN_PROGRESS and DONE", () => {
    const status = statusResolver([column("done", 2), column("todo", 0), column("doing", 1)]);
    expect(status("todo")).toBe("TODO");
    expect(status("doing")).toBe("IN_PROGRESS");
    expect(status("done")).toBe("DONE");
  });

  it("treats a single column as TODO", () => {
    expect(statusResolver([column("only", 0)])("only")).toBe("TODO");
  });
});

describe("date keys", () => {
  it("formats a local date as YYYY-MM-DD with zero padding", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("parses both plain dates and ISO timestamps as local dates", () => {
    expect(dateKey(parseKey("2026-03-09"))).toBe("2026-03-09");
    expect(dateKey(parseKey("2026-03-09T00:00:00.000Z"))).toBe("2026-03-09");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days between keys, including across DST changes", () => {
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-11-10", "2026-11-01")).toBe(-9);
  });
});

describe("isOverdue", () => {
  const today = "2026-06-15";

  it("is overdue when due before today and not done", () => {
    expect(isOverdue({ dueDate: "2026-06-14" }, "IN_PROGRESS", today)).toBe(true);
  });

  it("is not overdue when due today", () => {
    expect(isOverdue({ dueDate: "2026-06-15T00:00:00.000Z" }, "TODO", today)).toBe(false);
  });

  it("is never overdue once done or without a due date", () => {
    expect(isOverdue({ dueDate: "2026-01-01" }, "DONE", today)).toBe(false);
    expect(isOverdue({ dueDate: null }, "TODO", today)).toBe(false);
  });
});
