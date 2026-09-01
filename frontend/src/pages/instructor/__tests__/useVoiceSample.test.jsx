import { act, renderHook } from "@testing-library/react";
import { afterEach } from "vitest";

const { mockApiPost } = vi.hoisted(() => ({
  mockApiPost: vi.fn(),
}));

vi.mock("../../../utils/apiClient", () => ({
  apiPost: mockApiPost,
}));

import { useVoiceSample } from "../useVoiceSample";

describe("useVoiceSample", () => {
  let audioElement;

  beforeEach(() => {
    vi.clearAllMocks();
    audioElement = {
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(),
    };
    vi.stubGlobal("Audio", vi.fn(() => audioElement));
    vi.stubGlobal("atob", vi.fn(() => "sample audio"));
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:voice-sample"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests, plays, and cleans up a selected voice sample", async () => {
    mockApiPost.mockResolvedValue({ audio: "c2FtcGxlIGF1ZGlv" });
    const { result } = renderHook(() => useVoiceSample());

    await act(async () => {
      await result.current.playSample("Tiffany");
    });

    expect(mockApiPost).toHaveBeenCalledWith("instructor/voice_sample", { voice_id: "Tiffany" });
    expect(Audio).toHaveBeenCalledWith("blob:voice-sample");
    expect(audioElement.play).toHaveBeenCalledOnce();
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      audioElement.onended();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice-sample");
    expect(result.current.isPlaying).toBe(false);
  });

  it("returns to idle and rejects when a sample request fails", async () => {
    mockApiPost.mockRejectedValue(new Error("Voice preview unavailable"));
    const { result } = renderHook(() => useVoiceSample());

    await expect(
      act(async () => result.current.playSample("Tiffany"))
    ).rejects.toThrow("Voice preview unavailable");

    expect(result.current.isPlaying).toBe(false);
  });
});