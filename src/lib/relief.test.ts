import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  readRelief,
  resetReliefMemory,
  storeRelief,
  useRelief,
} from "./relief";

afterEach(() => {
  resetReliefMemory();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("relief choice", () => {
  test("is the page's default until the reader picks one, then remembered per page", () => {
    expect(readRelief("live", "hills")).toBe("hills");
    expect(readRelief("neurofeedback", "wells")).toBe("wells");
    storeRelief("live", "wells");
    expect(readRelief("live", "hills")).toBe("wells");
    expect(window.localStorage.getItem("bt-relief:live")).toBe("wells");
    // another page keeps its own
    expect(readRelief("neurofeedback", "wells")).toBe("wells");
    storeRelief("neurofeedback", "hills");
    expect(readRelief("neurofeedback", "wells")).toBe("hills");
  });

  test("a stored choice survives the tab, a nonsense one is ignored", () => {
    window.localStorage.setItem("bt-relief:live", "wells");
    expect(readRelief("live", "hills")).toBe("wells");
    window.localStorage.setItem("bt-relief:live", "craters");
    expect(readRelief("live", "hills")).toBe("hills");
  });

  test("a browser that refuses storage still keeps the choice for the tab", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readRelief("live", "hills")).toBe("hills");
    expect(() => storeRelief("live", "wells")).not.toThrow();
    expect(readRelief("live", "hills")).toBe("wells");
  });

  test("the hook follows a choice made anywhere on the page", () => {
    const { result } = renderHook(() => useRelief("run", "hills"));
    expect(result.current[0]).toBe("hills");
    act(() => result.current[1]("wells"));
    expect(result.current[0]).toBe("wells");
  });
});
