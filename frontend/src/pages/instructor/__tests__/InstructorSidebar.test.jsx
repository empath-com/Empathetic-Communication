import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("../../../utils/apiClient", () => ({
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

import InstructorSidebar from "../InstructorSidebar";

const currentCode = "ABCD-EFGH-IJKL-MNOP";
const newCode = "QRST-UVWX-YZ12-3456";

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <InstructorSidebar
        setSelectedComponent={vi.fn()}
        simulation_group_id="group-123"
      />
    </MemoryRouter>
  );

describe("InstructorSidebar access code regeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({ group_access_code: currentCode });
    mockApiPut.mockResolvedValue({ access_code: newCode });
  });

  it("opens a warning before regenerating the access code", async () => {
    renderSidebar();

    await screen.findByText(currentCode);
    fireEvent.click(screen.getByRole("button", { name: "Generate New" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Regenerating will invalidate the current access code and issue a new code for everyone who relies on it."
    );
    expect(mockApiPut).not.toHaveBeenCalled();
  });

  it("leaves the current code unchanged when cancelled or dismissed", async () => {
    renderSidebar();

    await screen.findByText(currentCode);
    fireEvent.click(screen.getByRole("button", { name: "Generate New" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(currentCode)).toBeInTheDocument();
    expect(mockApiPut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Generate New" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(currentCode)).toBeInTheDocument();
    expect(mockApiPut).not.toHaveBeenCalled();
  });

  it("regenerates the access code only after explicit confirmation", async () => {
    renderSidebar();

    await screen.findByText(currentCode);
    fireEvent.click(screen.getByRole("button", { name: "Generate New" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(
        "instructor/generate_access_code",
        undefined,
        { simulation_group_id: "group-123" }
      )
    );
    expect(await screen.findByText(newCode)).toBeInTheDocument();
  });
});