import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GuardianDirectory from "../components/GuardianDirectory.jsx";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";

vi.mock("../context/authContext.js", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api.js", () => ({ apiRequest: vi.fn() }));

const guardians = [
  {
    _id: "guardian-1",
    firstName: "Imran",
    lastName: "Khan",
    phone: "9999999999",
    email: "imran@example.com",
    status: "active",
  },
  {
    _id: "guardian-2",
    firstName: "Sara",
    lastName: "Khan",
    phone: "8888888888",
    email: "sara@example.com",
    status: "inactive",
  },
];

describe("GuardianDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ accessToken: "test-access-token", user: { role: "school_admin" } });
    apiRequest.mockResolvedValue({ success: true, data: guardians });
  });

  it("loads and displays school guardian records", async () => {
    render(<GuardianDirectory />);

    expect((await screen.findAllByText("Imran Khan")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sara Khan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9999999999").length).toBeGreaterThan(0);
    expect(screen.getAllByText("imran@example.com").length).toBeGreaterThan(0);
    expect(apiRequest).toHaveBeenCalledWith(
      "/guardians",
      expect.objectContaining({
        accessToken: "test-access-token",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("opens guardian details and displays all linked students", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce({ success: true, data: guardians })
      .mockResolvedValueOnce({
        success: true,
        data: {
          ...guardians[0],
          linkedStudents: [
            {
              _id: "link-1",
              relationship: "father",
              status: "active",
              isPrimary: true,
              student: { firstName: "Ayaan", lastName: "Khan", admissionNumber: "ADM-001" },
            },
            {
              _id: "link-2",
              relationship: "father",
              status: "active",
              isEmergencyContact: true,
              student: { firstName: "Areeba", lastName: "Khan", admissionNumber: "ADM-002" },
            },
          ],
        },
      });

    render(<GuardianDirectory />);
    await user.click((await screen.findAllByRole("button", { name: "Imran Khan" }))[0]);

    expect(await screen.findByRole("heading", { name: "Guardian details" })).toBeInTheDocument();
    expect(screen.getByText("Linked students (2)")).toBeInTheDocument();
    expect(screen.getByText("Ayaan Khan")).toBeInTheDocument();
    expect(screen.getByText("Areeba Khan")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element.tagName === "SPAN" && element.textContent.includes("ADM-001"))).toBeInTheDocument();
    expect(screen.getByText("Emergency contact")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/guardians/guardian-1",
      { accessToken: "test-access-token" },
    );
  });

  it("allows an administrator to edit guardian contact details", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce({ success: true, data: guardians })
      .mockResolvedValueOnce({ success: true, data: { ...guardians[0], linkedStudents: [] } })
      .mockResolvedValueOnce({
        success: true,
        data: { ...guardians[0], firstName: "Nadia", phone: "7777777777", email: "nadia@example.com" },
      });

    render(<GuardianDirectory />);
    await user.click((await screen.findAllByRole("button", { name: "Imran Khan" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Edit guardian" }));
    await user.clear(screen.getByLabelText("First name *"));
    await user.type(screen.getByLabelText("First name *"), "Nadia");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "7777777777");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "nadia@example.com");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Guardian details updated successfully.")).toBeInTheDocument();
    expect(screen.getByText("Nadia Khan")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenLastCalledWith("/guardians/guardian-1", {
      method: "PATCH",
      accessToken: "test-access-token",
      body: {
        firstName: "Nadia",
        lastName: "Khan",
        phone: "7777777777",
        email: "nadia@example.com",
      },
    });
  });

  it("requires confirmation before deactivating a guardian record", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockResolvedValueOnce({ success: true, data: guardians })
      .mockResolvedValueOnce({ success: true, data: { ...guardians[0], linkedStudents: [] } })
      .mockResolvedValueOnce({
        success: true,
        data: { ...guardians[0], status: "inactive" },
      });

    render(<GuardianDirectory />);
    await user.click((await screen.findAllByRole("button", { name: "Imran Khan" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    expect(screen.getByText(/Existing student links and history will be retained/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Guardian record deactivated. Linked student history has been retained.")).toBeInTheDocument();
    expect(screen.getAllByText("inactive").length).toBeGreaterThan(0);
    expect(apiRequest).toHaveBeenLastCalledWith("/guardians/guardian-1", {
      method: "PATCH",
      accessToken: "test-access-token",
      body: { status: "inactive" },
    });
  });

  it("filters guardian records by name, phone and email", async () => {
    const user = userEvent.setup();
    render(<GuardianDirectory />);

    await screen.findAllByRole("button", { name: "Imran Khan" });
    await user.type(screen.getByRole("searchbox", { name: "Search guardians" }), "sara@example.com");

    expect(screen.getAllByText("Sara Khan").length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Imran Khan" })).toHaveLength(0);
    expect(screen.getByText("1", { selector: "strong" })).toBeInTheDocument();
  });

  it("filters guardian records by active status", async () => {
    const user = userEvent.setup();
    render(<GuardianDirectory />);

    await screen.findAllByText("Imran Khan");
    await user.selectOptions(screen.getByLabelText("Filter guardians by status"), "active");

    expect(screen.getAllByRole("button", { name: "Imran Khan" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Sara Khan")).toHaveLength(0);
    expect(screen.getByText("1", { selector: "strong" })).toBeInTheDocument();
  });

  it("paginates guardian records", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValue({
      success: true,
      data: Array.from({ length: 12 }, (_, index) => ({
        _id: `guardian-${index + 1}`,
        firstName: `Guardian${index + 1}`,
        lastName: "Test",
        status: "active",
      })),
    });

    render(<GuardianDirectory />);

    expect((await screen.findAllByText("Guardian1 Test")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Guardian11 Test")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Guardian11 Test").length).toBeGreaterThan(0);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("shows a load error and retries the directory request", async () => {
    const user = userEvent.setup();
    apiRequest
      .mockRejectedValueOnce(new Error("Directory unavailable"))
      .mockResolvedValueOnce({ success: true, data: guardians });

    render(<GuardianDirectory />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Directory unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText("Imran Khan")).length).toBeGreaterThan(0);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  });
});
