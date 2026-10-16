
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import StudentDirectory from "../components/StudentDirectory.jsx";
import { fireEvent } from "@testing-library/react";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "test-access-token" }),
}));

vi.mock("../components/StudentForm.jsx", () => ({
  default: () => null,
}));

vi.mock("../components/StudentDetails.jsx", () => ({
  default: () => null,
}));

describe("StudentDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays student records", async () => {
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: [
        {
          _id: "student-1",
          firstName: "Ayaan",
          lastName: "Khan",
          admissionNumber: "ADM-001",
          admissionDate: "2026-04-10",
          gender: "male",
          guardianName: "Imran Khan",
          guardianPhone: "9999999999",
          status: "active",
        },
      ],
      pagination: { total: 1 },
    });

    render(<StudentDirectory />);

    expect(
  screen.getAllByText("Loading student records…"),
).toHaveLength(2);

    await waitFor(() => {
      expect(screen.getAllByText("Ayaan Khan").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("ADM-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Imran Khan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("active").length).toBeGreaterThan(0);
    expect(screen.getByText("Showing 1–1 of 1")).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith(
      "/students?page=1&limit=10",
      expect.objectContaining({
        accessToken: "test-access-token",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  
it("displays an error and a Retry button when loading students fails", async () => {
  apiRequest.mockRejectedValueOnce(
    new Error("Unable to load students."),
  );

  render(<StudentDirectory />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to load students.",
  );

  expect(
    screen.getByRole("button", { name: "Retry" }),
  ).toBeInTheDocument();

  expect(
  screen.getAllByText("Student records could not be loaded."),
).toHaveLength(2);
});

it("retries loading students and displays records after recovery", async () => {
  apiRequest
    .mockRejectedValueOnce(new Error("Temporary server error"))
    .mockResolvedValueOnce({
      success: true,
      data: [
        {
          _id: "student-2",
          firstName: "Sara",
          lastName: "Ahmad",
          admissionNumber: "ADM-002",
          admissionDate: "2026-04-12",
          gender: "female",
          guardianName: "Yusuf Ahmad",
          guardianPhone: "8888888888",
          status: "active",
        },
      ],
      pagination: { total: 1 },
    });

  render(<StudentDirectory />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Temporary server error",
  );

  await act(async () => {
    screen.getByRole("button", { name: "Retry" }).click();
  });

  await waitFor(() => {
    expect(screen.getAllByText("Sara Ahmad").length).toBeGreaterThan(0);
  });

  expect(screen.getAllByText("ADM-002").length).toBeGreaterThan(0);
  expect(apiRequest).toHaveBeenCalledTimes(2);
});

it("searches students using the entered search term", async () => {
  apiRequest
    .mockResolvedValueOnce({
      success: true,
      data: [],
      pagination: { total: 0 },
    })
    .mockResolvedValueOnce({
      success: true,
      data: [
        {
          _id: "student-3",
          firstName: "Ayaan",
          lastName: "Khan",
          admissionNumber: "ADM-003",
          status: "active",
        },
      ],
      pagination: { total: 1 },
    });

  render(<StudentDirectory />);

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/students?page=1&limit=10",
      expect.any(Object),
    );
  });

  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search students" }),
    { target: { value: "Ayaan" } },
  );

  await waitFor(
    () => {
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/students?page=1&limit=10&search=Ayaan",
        expect.any(Object),
      );
    },
    { timeout: 2000 },
  );

  expect(screen.getAllByText("Ayaan Khan").length).toBeGreaterThan(0);
});

it("filters students by status", async () => {
  apiRequest
    .mockResolvedValueOnce({
      success: true,
      data: [],
      pagination: { total: 0 },
    })
    .mockResolvedValueOnce({
      success: true,
      data: [
        {
          _id: "student-4",
          firstName: "Sara",
          lastName: "Ahmad",
          admissionNumber: "ADM-004",
          status: "inactive",
        },
      ],
      pagination: { total: 1 },
    });

  render(<StudentDirectory />);

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/students?page=1&limit=10",
      expect.any(Object),
    );
  });

  fireEvent.change(
    screen.getByRole("combobox", { name: "Filter by status" }),
    { target: { value: "inactive" } },
  );

  await waitFor(() => {
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/students?page=1&limit=10&status=inactive",
      expect.any(Object),
    );
  });

  expect(screen.getAllByText("Sara Ahmad").length).toBeGreaterThan(0);
  expect(screen.getAllByText("inactive").length).toBeGreaterThan(0);
});

it("loads the next page when Next is clicked", async () => {
  apiRequest
    .mockResolvedValueOnce({
      success: true,
      data: Array.from({ length: 10 }, (_, index) => ({
        _id: `student-${index + 1}`,
        firstName: `Student${index + 1}`,
        admissionNumber: `ADM-${String(index + 1).padStart(3, "0")}`,
        status: "active",
      })),
      pagination: { total: 11 },
    })
    .mockResolvedValueOnce({
      success: true,
      data: [
        {
          _id: "student-11",
          firstName: "Student11",
          admissionNumber: "ADM-011",
          status: "active",
        },
      ],
      pagination: { total: 11 },
    });

  render(<StudentDirectory />);

  await waitFor(() => {
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  await act(async () => {
    screen.getByRole("button", { name: "Next" }).click();
  });

  await waitFor(() => {
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  expect(screen.getByText("Showing 11–11 of 11")).toBeInTheDocument();
  expect(screen.getAllByText("Student11").length).toBeGreaterThan(0);

  expect(apiRequest).toHaveBeenLastCalledWith(
    "/students?page=2&limit=10",
    expect.objectContaining({
      accessToken: "test-access-token",
    }),
  );
});


it("displays an empty state when no students are found", async () => {
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: [],
    pagination: { total: 0 },
  });

  render(<StudentDirectory />);

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/students?page=1&limit=10",
      expect.any(Object),
    );
  });

  expect(
    await screen.findAllByText(
      /No students found\. Try another search or add your first student\./i,
    ),
  ).toHaveLength(2);

  expect(screen.getByText("No records")).toBeInTheDocument();
});

it("handles an unexpected API response", async () => {
  apiRequest.mockResolvedValueOnce({
    success: false,
    data: null,
  });

  render(<StudentDirectory />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The server returned an unexpected response.",
  );

  expect(
    screen.getByRole("button", { name: "Retry" }),
  ).toBeInTheDocument();
});

});
