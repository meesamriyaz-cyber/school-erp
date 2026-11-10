import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), mode: "parent" }));
vi.mock("../lib/api.js", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../context/authContext.js", () => ({ useAuth: () => ({ accessToken: "messaging-token" }) }));

import MessagingWorkspace from "../components/MessagingWorkspace.jsx";

const conversation = {
  _id: "conversation-1", status: "open", parentUnreadCount: 0, teacherUnreadCount: 1,
  studentId: { _id: "student-1", firstName: "Amina", lastName: "Khan" },
  parentUserId: { _id: "parent-1", firstName: "Parent", lastName: "Khan" },
  teacherUserId: { _id: "teacher-1", firstName: "Ayaan", lastName: "Ahmed" },
};

describe("MessagingWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiRequest.mockImplementation((path) => {
      if (path === "/messaging/conversations") return Promise.resolve({ success: true, data: [] });
      if (path === "/messaging/contacts") return Promise.resolve({ success: true, data: [{
        teacher: { _id: "teacher-1", firstName: "Ayaan", lastName: "Ahmed" },
        subject: { name: "Mathematics" },
        students: [{ _id: "student-1", firstName: "Amina", lastName: "Khan" }],
      }] });
      if (path === "/messaging/oversight") return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: true, data: [] });
    });
  });

  it("lets a parent initiate a conversation with an assigned teacher", async () => {
    mocks.apiRequest.mockImplementation((path, options = {}) => {
      if (path === "/messaging/conversations" && options.method === "POST") return Promise.resolve({ success: true, data: conversation });
      if (path === "/messaging/conversations") return Promise.resolve({ success: true, data: [] });
      if (path === "/messaging/contacts") return Promise.resolve({ success: true, data: [{
        teacher: { _id: "teacher-1", firstName: "Ayaan", lastName: "Ahmed" },
        subject: { name: "Mathematics" },
        students: [{ _id: "student-1", firstName: "Amina", lastName: "Khan" }],
      }] });
      if (path.endsWith("/messages")) return Promise.resolve({ success: true, data: [] });
      return Promise.resolve({ success: true, data: {} });
    });
    render(<MessagingWorkspace mode="parent" />);
    expect(await screen.findByText("Contact an assigned teacher")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Write a message to the teacher…"), { target: { value: "Please discuss homework." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("/messaging/conversations", expect.objectContaining({
      method: "POST", accessToken: "messaging-token",
      body: { studentId: "student-1", teacherId: "teacher-1", message: "Please discuss homework." },
    })));
    expect(await screen.findByText("Regarding Amina Khan")).toBeInTheDocument();
  });

  it("lets a teacher open a parent conversation and send a reply", async () => {
    mocks.apiRequest.mockImplementation((path, options = {}) => {
      if (path === "/messaging/conversations") return Promise.resolve({ success: true, data: [conversation] });
      if (path === "/messaging/contacts") return Promise.resolve({ success: true, data: [] });
      if (path.endsWith("/messages") && options.method === "POST") return Promise.resolve({ success: true, data: {
        _id: "message-2", senderUserId: "teacher-1", senderRole: "teacher", body: "I will follow up.", createdAt: "2026-11-10T08:00:00.000Z",
      } });
      if (path.endsWith("/messages")) return Promise.resolve({ success: true, data: [{
        _id: "message-1", senderUserId: "parent-1", senderRole: "parent", body: "Could we discuss homework?", createdAt: "2026-11-10T07:00:00.000Z",
      }] });
      return Promise.resolve({ success: true, data: {} });
    });
    render(<MessagingWorkspace mode="teacher" />);
    fireEvent.click(await screen.findByRole("button", { name: /Parent Khan/ }));
    expect(await screen.findByText("Could we discuss homework?")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Write your reply…"), { target: { value: "I will follow up." } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(screen.getByText("I will follow up.")).toBeInTheDocument());
  });

  it("shows administrators metadata without offering message content", async () => {
    mocks.apiRequest.mockResolvedValue({ success: true, data: [{
      _id: "conversation-1", status: "open", lastMessageAt: "2026-11-10T08:00:00.000Z",
      studentId: { firstName: "Amina", lastName: "Khan" },
      parentUserId: { firstName: "Parent", lastName: "Khan" },
      teacherUserId: { firstName: "Ayaan", lastName: "Ahmed" },
      parentUnreadCount: 1, teacherUnreadCount: 0,
    }] });
    render(<MessagingWorkspace mode="admin" />);
    expect(await screen.findByText("Conversation metadata only. Message contents are not available to administrators.")).toBeInTheDocument();
    expect(screen.getByText("Amina Khan")).toBeInTheDocument();
    expect(screen.queryByText("Could we discuss homework?")).toBeNull();
  });
});
