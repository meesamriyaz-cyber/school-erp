
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
    vi.resetAllMocks();
    apiRequest.mockResolvedValue({ success: true, data: [] });
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

it("displays student initials when no photo is available", async () => {
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: {
      _id: "student-103",
      firstName: "Sara",
      lastName: "Ahmad",
      admissionNumber: "ADM-103",
      status: "active",
    },
  });

  render(
    <StudentDetails studentId="student-103" onBack={vi.fn()} />,
  );

  expect(
    await screen.findByRole("heading", { name: /Sara Ahmad/ }),
  ).toBeInTheDocument();

  expect(
    screen.getByLabelText("Student photo not available"),
  ).toHaveTextContent("SA");
});

it("handles invalid dates and missing student initials", async () => {
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: {
      _id: "student-104",
      firstName: "",
      lastName: "",
      admissionNumber: "ADM-104",
      dateOfBirth: "invalid-date",
      admissionDate: "invalid-date",
      status: "active",
    },
  });

  render(
    <StudentDetails studentId="student-104" onBack={vi.fn()} />,
  );

  expect(
    //await screen.findByRole("heading", { name: /ADM-104|^\s*$/ }),
    await screen.findByText("Admission No.: ADM-104")
  ).toBeInTheDocument();

  expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
  expect(
    screen.getByLabelText("Student photo not available"),
  ).toHaveTextContent("S");
});

it("returns to student details when editing is cancelled", async () => {
  const user = userEvent.setup();

  apiRequest.mockResolvedValueOnce({
    success: true,
    data: {
      _id: "student-105",
      firstName: "Sara",
      lastName: "Ahmad",
      admissionNumber: "ADM-105",
      status: "active",
    },
  });

  render(
    <StudentDetails studentId="student-105" onBack={vi.fn()} />,
  );

  expect(
    await screen.findByRole("heading", { name: /Sara Ahmad/ }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit Student" }));
  await user.click(screen.getByRole("button", { name: "Cancel editing" }));

  expect(
    await screen.findByRole("button", { name: "Edit Student" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Admission No.: ADM-105")).toBeInTheDocument();
});

it("shows a fallback error when the API error has no message", async () => {
  apiRequest.mockRejectedValueOnce({});

  render(<StudentDetails studentId="student-123" onBack={vi.fn()} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to load student details.",
  );
});

it("does not show an error when the student request is aborted", async () => {
  const abortError = new Error("Request aborted");
  abortError.name = "AbortError";

  apiRequest.mockRejectedValueOnce(abortError);

  render(<StudentDetails studentId="student-123" onBack={vi.fn()} />);

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

expect(screen.getByRole("alert")).toHaveTextContent(
  "Student details could not be found.",
);});

it("displays the student photo when a photo URL is available", async () => {
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: {
      _id: "student-photo-1",
      firstName: "Ayaan",
      lastName: "Khan",
      admissionNumber: "ADM-PHOTO",
      photoUrl: "https://example.com/student.jpg",
      status: "active",
    },
  });

  render(
    <StudentDetails studentId="student-photo-1" onBack={vi.fn()} />,
  );

  const photo = await screen.findByRole("img", {
    name: "Ayaan Khan",
  });

  expect(photo).toHaveAttribute(
    "src",
    "https://example.com/student.jpg",
  );
});

it("does not update loading state after the request is aborted", async () => {
  let rejectRequest;

  apiRequest.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        rejectRequest = reject;
      }),
  );

  const { unmount } = render(
    <StudentDetails studentId="student-abort" onBack={vi.fn()} />,
  );

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  unmount();

  const abortError = new Error("Request aborted");
  abortError.name = "AbortError";
  rejectRequest(abortError);

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("displays a student photo with an empty last name", async () => {
  apiRequest.mockResolvedValueOnce({
    success: true,
    data: {
      _id: "student-photo-2",
      firstName: "Ayaan",
      lastName: "",
      admissionNumber: "ADM-PHOTO-2",
      photoUrl: "https://example.com/student.jpg",
      status: "active",
    },
  });

  render(
    <StudentDetails
      studentId="student-photo-2"
      onBack={vi.fn()}
    />,
  );

  expect(
    await screen.findByRole("img", { name: "Ayaan" }),
  ).toHaveAttribute("src", "https://example.com/student.jpg");
});


it("shows the current placement and previous academic enrollment history", async () => {
  const student = {
    _id: "student-history-1",
    firstName: "Ayaan",
    lastName: "Khan",
    admissionNumber: "ADM-HISTORY-1",
    status: "active",
  };
  const enrollments = [
    {
      _id: "enrollment-current",
      studentId: student,
      academicYearId: { _id: "year-current", name: "2026-2027" },
      classId: { _id: "class-current", name: "Class 2" },
      sectionId: { _id: "section-current", name: "A" },
      enrollmentDate: "2026-04-01T00:00:00.000Z",
      status: "active",
      endedAt: null,
    },
    {
      _id: "enrollment-previous",
      studentId: student,
      academicYearId: { _id: "year-previous", name: "2025-2026" },
      classId: { _id: "class-previous", name: "Class 1" },
      sectionId: { _id: "section-previous", name: "B" },
      enrollmentDate: "2025-04-01T00:00:00.000Z",
      endedAt: "2026-03-31T00:00:00.000Z",
      status: "completed",
    },
  ];
  apiRequest.mockImplementation(async (path) => {
    if (path === "/students/student-history-1") return { success: true, data: student };
    if (path === "/enrollments?studentId=student-history-1") return { success: true, data: enrollments };
    return { success: true, data: [] };
  });

  render(<StudentDetails studentId="student-history-1" onBack={vi.fn()} />);

  expect(await screen.findByText("2026-2027")).toBeInTheDocument();
  expect(screen.getByText("Class 2")).toBeInTheDocument();
  expect(screen.getByText("Section A")).toBeInTheDocument();
  expect(screen.getByText("2025-2026 · Class 1 · Section B")).toBeInTheDocument();
  expect(screen.getByText("completed")).toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledWith(
    "/enrollments?studentId=student-history-1",
    expect.objectContaining({ accessToken: "test-access-token", signal: expect.any(AbortSignal) }),
  );
});

it("shows an empty state when a student has no enrollment history", async () => {
  apiRequest.mockImplementation(async (path) => {
    if (path === "/students/student-no-history") {
      return { success: true, data: { _id: "student-no-history", firstName: "Sara", lastName: "Ahmad", status: "active" } };
    }
    if (path === "/enrollments?studentId=student-no-history") return { success: true, data: [] };
    return { success: true, data: [] };
  });

  render(<StudentDetails studentId="student-no-history" onBack={vi.fn()} />);

  expect(await screen.findByText("This student has no active academic placement.")).toBeInTheDocument();
  expect(screen.getByText("No academic history is recorded for this student yet.")).toBeInTheDocument();
});


it("shows terminal enrollment outcomes in history without a current placement", async () => {
  const studentId = "student-terminal-history";
  const student = {
    _id: studentId,
    firstName: "Ayaan",
    lastName: "Khan",
    admissionNumber: "ADM-TERMINAL",
    status: "active",
  };
  const history = [
    { _id: "enrollment-completed", academicYearId: { name: "2023-2024" }, classId: { name: "Class 1" }, enrollmentDate: "2023-04-01", endedAt: "2024-03-31", status: "completed" },
    { _id: "enrollment-transferred", academicYearId: { name: "2024-2025" }, classId: { name: "Class 2" }, enrollmentDate: "2024-04-01", endedAt: "2024-10-15", status: "transferred" },
    { _id: "enrollment-withdrawn", academicYearId: { name: "2025-2026" }, classId: { name: "Class 3" }, enrollmentDate: "2025-04-01", endedAt: "2025-09-10", status: "withdrawn" },
  ];

  apiRequest.mockImplementation(async (path) => {
    if (path === `/students/${studentId}`) return { success: true, data: student };
    if (path === `/enrollments?studentId=${studentId}`) return { success: true, data: history };
    return { success: true, data: [] };
  });

  render(<StudentDetails studentId={studentId} onBack={vi.fn()} />);

  expect(await screen.findByText("This student has no active academic placement.")).toBeInTheDocument();
  expect(screen.getByText("2023-2024 · Class 1")).toBeInTheDocument();
  expect(screen.getByText("2024-2025 · Class 2")).toBeInTheDocument();
  expect(screen.getByText("2025-2026 · Class 3")).toBeInTheDocument();
  expect(screen.getByText("completed")).toBeInTheDocument();
  expect(screen.getByText("transferred")).toBeInTheDocument();
  expect(screen.getByText("withdrawn")).toBeInTheDocument();
  expect(screen.getAllByText(/Ended:/)).toHaveLength(3);
});

});
