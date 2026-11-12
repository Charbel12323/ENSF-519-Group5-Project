import { describe, expect, it } from "vitest";
import { insertAt } from "./order";

const ids = (items: { id: string }[]) => items.map((item) => item.id);
const list = () => [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("insertAt", () => {
  it("inserts a new item at the given index", () => {
    expect(ids(insertAt(list(), { id: "x" }, 1))).toEqual(["a", "x", "b", "c"]);
  });

  it("inserts at the start and the end", () => {
    expect(ids(insertAt(list(), { id: "x" }, 0))).toEqual(["x", "a", "b", "c"]);
    expect(ids(insertAt(list(), { id: "x" }, 3))).toEqual(["a", "b", "c", "x"]);
  });

  it("clamps out of range indexes", () => {
    expect(ids(insertAt(list(), { id: "x" }, -5))).toEqual(["x", "a", "b", "c"]);
    expect(ids(insertAt(list(), { id: "x" }, 99))).toEqual(["a", "b", "c", "x"]);
  });

  it("moves an item that is already in the list instead of duplicating it", () => {
    expect(ids(insertAt(list(), { id: "a" }, 2))).toEqual(["b", "c", "a"]);
    expect(ids(insertAt(list(), { id: "c" }, 0))).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input array", () => {
    const original = list();
    insertAt(original, { id: "x" }, 0);
    expect(ids(original)).toEqual(["a", "b", "c"]);
  });
});
