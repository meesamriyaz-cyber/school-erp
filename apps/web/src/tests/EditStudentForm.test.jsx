
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditStudentForm from "../components/EditStudentForm.jsx";
import { apiRequest } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "test-access-token" }),
}));

const student = {
  _id: "student-201",
  admissionNumber: "ADM-201",
  firstName: "Ayaan",
  lastName: "Khan",
  dateOfBirth: "2015-06-12T00:00:00.000Z",
  gender: "male",
  admissionDate: "2026-04-10T00:00:00.000Z",
  guardianName: "Imran Khan",
  guardianPhone: "9999999999",
  guardianEmail: "imran@example.com",
  status: "active",
};

describe("EditStudentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the existing student details into the form", () => {
    render(
      <EditStudentForm
        student={student}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Admission Number")).toHaveValue("ADM-201");
    expect(screen.getByLabelText("First Name")).toHaveValue("Ayaan");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Khan");
    expect(screen.getByLabelText("Gender")).toHaveValue("male");
    expect(screen.getByLabelText("Guardian Name")).toHaveValue("Imran Khan");
    expect(screen.getByLabelText("Status")).toHaveValue("active");
  });

  it("updates the student and calls onSaved", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const updatedStudent = {
      ...student,
      firstName: "Ayaan Updated",
    };

    apiRequest.mockResolvedValueOnce({
      success: true,
      data: updatedStudent,
    });

    render(
      <EditStudentForm
        student={student}
        onCancel={vi.fn()}
        onSaved={onSaved}
      />,
    );

    await user.clear(screen.getByLabelText("First Name"));
    await user.type(screen.getByLabelText("First Name"), "Ayaan Updated");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(updatedStudent);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/students/student-201",
      expect.objectContaining({
        method: "PATCH",
        accessToken: "test-access-token",
        body: expect.objectContaining({
          firstName: "Ayaan Updated",
        }),
      }),
    );
  });

  it("shows an API error and preserves the entered name", async () => {
    const user = userEvent.setup();

    apiRequest.mockRejectedValueOnce(
      new Error("Unable to update student."),
    );

    render(
      <EditStudentForm
        student={student}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const firstNameInput = screen.getByLabelText("First Name");

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Ayaan Revised");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to update student.",
    );
    expect(firstNameInput).toHaveValue("Ayaan Revised");
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <EditStudentForm
        student={student}
        onCancel={onCancel}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  
it("handles an unsuccessful API response", async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();

  apiRequest.mockResolvedValueOnce({
    success: false,
    data: null,
  });

  render(
    <EditStudentForm
      student={student}
      onCancel={vi.fn()}
      onSaved={onSaved}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Save Changes" }),
  );

  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
});

});
