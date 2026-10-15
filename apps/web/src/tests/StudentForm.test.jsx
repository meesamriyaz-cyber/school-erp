
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import StudentForm from "../components/StudentForm.jsx";
import { apiRequest } from "../lib/api.js";
import { render, screen, waitFor } from "@testing-library/react";
vi.mock("../lib/api.js", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../context/authContext.js", () => ({
  useAuth: () => ({ accessToken: "test-access-token" }),
}));

describe("StudentForm", () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders student and guardian fields with required validation", async () => {
    const user = userEvent.setup();

    render(<StudentForm onClose={onClose} onCreated={onCreated} />);

    expect(
      screen.getByRole("dialog", { name: "Add student" }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/Admission number/i)).toBeRequired();
    expect(screen.getByLabelText(/Admission date/i)).toBeRequired();
    expect(screen.getByLabelText(/First name/i)).toBeRequired();

    expect(screen.getByLabelText(/Last name/i)).not.toBeRequired();
    expect(screen.getByLabelText(/Date of birth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Gender/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Guardian name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Guardian phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Guardian email/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save student" }));

    expect(apiRequest).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
  
it("creates a student and trims text fields", async () => {
  const user = userEvent.setup();

  const createdStudent = {
    _id: "student-101",
    admissionNumber: "ADM-101",
    firstName: "Ayaan",
    lastName: "Khan",
    status: "active",
  };

  apiRequest.mockResolvedValueOnce({
    success: true,
    data: createdStudent,
  });

  render(<StudentForm onClose={onClose} onCreated={onCreated} />);

  await user.type(screen.getByLabelText(/Admission number/i), "  ADM-101  ");
  await user.type(screen.getByLabelText(/First name/i), "  Ayaan  ");
  await user.type(screen.getByLabelText(/Last name/i), "  Khan  ");
  await user.type(screen.getByLabelText(/Guardian name/i), "  Imran Khan  ");
  await user.type(screen.getByLabelText(/Guardian phone/i), "  9999999999  ");
  await user.type(screen.getByLabelText(/Guardian email/i), "  imran@example.com  ");

  await user.click(screen.getByRole("button", { name: "Save student" }));

  await waitFor(() => {
    expect(onCreated).toHaveBeenCalledWith(createdStudent);
  });

  expect(apiRequest).toHaveBeenCalledWith(
    "/students",
    expect.objectContaining({
      method: "POST",
      accessToken: "test-access-token",
      body: expect.objectContaining({
        admissionNumber: "ADM-101",
        firstName: "Ayaan",
        lastName: "Khan",
        guardianName: "Imran Khan",
        guardianPhone: "9999999999",
        guardianEmail: "imran@example.com",
        dateOfBirth: null,
      }),
    }),
  );
});

it("displays an API error and preserves entered form data", async () => {
  const user = userEvent.setup();

  apiRequest.mockRejectedValueOnce(
    new Error("Admission number already exists."),
  );

  render(<StudentForm onClose={onClose} onCreated={onCreated} />);

  const admissionInput = screen.getByLabelText(/Admission number/i);
  const firstNameInput = screen.getByLabelText(/First name/i);

  await user.type(admissionInput, "ADM-202");
  await user.type(firstNameInput, "Sara");
  await user.click(screen.getByRole("button", { name: "Save student" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Admission number already exists.",
  );

  expect(admissionInput).toHaveValue("ADM-202");
  expect(firstNameInput).toHaveValue("Sara");
  expect(onCreated).not.toHaveBeenCalled();

  expect(apiRequest).toHaveBeenCalledWith(
    "/students",
    expect.objectContaining({
      method: "POST",
      accessToken: "test-access-token",
    }),
  );
});

it("closes the form when Cancel is clicked", async () => {
  const user = userEvent.setup();

  render(<StudentForm onClose={onClose} onCreated={onCreated} />);

  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(apiRequest).not.toHaveBeenCalled();
  expect(onCreated).not.toHaveBeenCalled();
});


});
