import { describe, expect, it } from "vitest";
import { filterPollyVoices, selectPollyVoice } from "../usePollyVoices";

const voices = [
  { id: "Tiffany", gender: "Female", preferredEngine: "generative" },
  { id: "Maxim", gender: "Male", preferredEngine: "standard" },
  { id: "Joanna", gender: "Female", preferredEngine: "neural" },
];

describe("usePollyVoices helpers", () => {
  it("retains the API's generative-first order while filtering by patient gender", () => {
    expect(filterPollyVoices(voices, "Female").map((voice) => voice.id)).toEqual([
      "Tiffany",
      "Joanna",
    ]);
  });

  it("normalizes a legacy lowercase selected voice to Polly's canonical ID", () => {
    expect(selectPollyVoice(voices, "Female", "tiffany")).toBe("Tiffany");
  });
});