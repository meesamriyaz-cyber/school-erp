
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StudentDetails from "../components/StudentDetails.jsx";
import { apiRequest } from "../lib/api.js";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/api.js", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "test-access-token" }),
}));


vi.mock("../components/EditStudentForm.jsx", () => ({
  default: ({ student, onSaved, onCancel }) => (
    <div>
      <h2>Edit form opened</h2>
      <button
        onClick={() =>
          onSaved({
            ...student,
            firstName: "Sara Updated",
          })
        }
      >
        Save updated student
      </button>
      <button onClick={onCancel}>Cancel editing</button>
    </div>
  ),
}));


describe("StudentDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays student personal and guardian details", async () => {
    apiRequest.mockResolvedValueOnce({
      success: true,
      data: {
        _id: "student-101",
        firstName: "Ayaan",
        lastName: "Khan",
        admissionNumber: "ADM-101",
        dateOfBirth: "2015-06-12",
        gender: "male",
        admissionDate: "2026-04-10",
        guardianName: "Imran Khan",
        guardianPhone: "9999999999",
        guardianEmail: "imran@example.com",
        status: "active",
      },
    });

    const onBack = vi.fn();

    render(<StudentDetails studentId="student-101" onBack={onBack} />);

    expect(
      screen.getByText("Loading student details..."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Ayaan Khan/ })).toBeInTheDocument();
    });

    expect(screen.getByText("Admission No.: ADM-101")).toBeInTheDocument();
    expect(screen.getByText("Imran Khan")).toBeInTheDocument();
    expect(screen.getByText("9999999999")).toBeInTheDocument();
    expect(screen.getByText("imran@example.com")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith(
      "/students/student-101",
      expect.objectContaining({
        accessToken: "test-access-token",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  
it("displays an error and allows returning to the directory", async () => {
  apiRequest.mockRejectedValueOnce(
    new Error("Student record not found."),
  );

  const onBack = vi.fn();

  render(<StudentDetails studentId="missing-student" onBack={onBack} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Student record not found.",
  );

  await screen.getByRole("button", { name: /Back to Students/i }).click();

  expect(onBack).toHaveBeenCalledTimes(1);

  expect(apiRequest).toHaveBeenCalledWith(
    "/students/missing-student",
    expect.objectContaining({
      accessToken: "test-access-token",
    }),
  );
});

it("opens the edit form for the loaded student", async () => {
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: {
      _id: "student-102",
      firstName: "Sara",
      lastName: "Ahmad",
      admissionNumber: "ADM-102",
      status: "active",
    },
  });

  render(
    <StudentDetails studentId="student-102" onBack={vi.fn()} />,
  );

  await screen.findByRole("heading", { name: /Sara Ahmad/ });

  await screen.getByRole("button", { name: "Edit Student" }).click();

  expect(await screen.findByRole("heading", { name: "Edit form opened" }))
    .toBeInTheDocument();
});

it("updates the displayed student details after saving edits", async () => {
  const user = userEvent.setup();

  
apiRequest.mockResolvedValueOnce({
  success: true,
  data: {
    _id: "student-123",
    firstName: "Sara",
    lastName: "Ahmad",
    admissionNumber: "ADM-001",
    guardianName: "Ahmed Ahmad",
    guardianPhone: "9876543210",
  },
});


  render(<StudentDetails studentId="student-123" onBack={vi.fn()} />);

  expect(await screen.findByText("Sara Ahmad")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit Student" }));
  await user.click(
    screen.getByRole("button", { name: "Save updated student" }),
  );

  expect(await screen.findByText("Sara Updated Ahmad")).toBeInTheDocument();
});

it("handles an unexpected API response", async () => {
  apiRequest.mockResolvedValueOnce({
    success: false,
    data: null,
  });

  render(
    <StudentDetails
      studentId="student-invalid"
      onBack={vi.fn()}
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to load student details.",
  );

  expect(
    screen.getByRole("button", { name: /Back to Students/i }),
  ).toBeInTheDocument();
});

});
