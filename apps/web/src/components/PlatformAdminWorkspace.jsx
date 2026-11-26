import { useEffect, useState } from "react";
import { useAuth } from "../context/authContext.js";
import { apiRequest } from "../lib/api.js";
import "./PlatformAdminWorkspace.css";

const navigation = [
  { label: "Overview", icon: "▦" },
  { label: "Schools", icon: "⌂" },
  { label: "Users", icon: "♙" },
  { label: "Plans", icon: "◇" },
  { label: "Billing", icon: "₹" },
  { label: "Commercial audit", icon: "≡" },
];

const PAGE_SIZE = 20;

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function statusLabel(status) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
}

export default function PlatformAdminWorkspace() {
  const { user, logout, accessToken } = useAuth();
  const [activePage, setActivePage] = useState("Overview");
  const [businessOverview, setBusinessOverview] = useState(null);
  const [businessOverviewError, setBusinessOverviewError] = useState("");
  const [loadingBusinessOverview, setLoadingBusinessOverview] = useState(true);
  const [schools, setSchools] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [users, setUsers] = useState([]);
  const [userPagination, setUserPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("");
  const [userSchoolFilter, setUserSchoolFilter] = useState("");
  const [userSchools, setUserSchools] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolsError, setSchoolsError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [updatingUserStatus, setUpdatingUserStatus] = useState(false);
  const [userStatusError, setUserStatusError] = useState("");
    const [userStatusSuccess, setUserStatusSuccess] = useState("");
  const [schoolForm, setSchoolForm] = useState({
    name: "",
    slug: "",
    contactEmail: "",
    timezone: "Asia/Kolkata",
    adminFirstName: "",
    adminLastName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [createSchoolError, setCreateSchoolError] = useState("");
  const [createSchoolSuccess, setCreateSchoolSuccess] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [schoolDetails, setSchoolDetails] = useState(null);
  const [loadingSchoolDetails, setLoadingSchoolDetails] = useState(false);
  const [schoolDetailsError, setSchoolDetailsError] = useState("");
  const [updatingSchoolStatus, setUpdatingSchoolStatus] = useState(false);
  const [schoolStatusError, setSchoolStatusError] = useState("");
  const [schoolStatusSuccess, setSchoolStatusSuccess] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userDetails, setUserDetails] = useState(null);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [userDetailsError, setUserDetailsError] = useState("");
  const [userProfileForm, setUserProfileForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [savingUserProfile, setSavingUserProfile] = useState(false);
  const [userProfileError, setUserProfileError] = useState("");
  const [userProfileSuccess, setUserProfileSuccess] = useState("");
  const [updatingUserRole, setUpdatingUserRole] = useState(false);
  const [userRoleError, setUserRoleError] = useState("");
  const [userRoleSuccess, setUserRoleSuccess] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [userForm, setUserForm] = useState({ tenantId: "", firstName: "", lastName: "", email: "", phone: "", role: "teacher", password: "" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState("");
  const [createUserSuccess, setCreateUserSuccess] = useState("");
  const [plans, setPlans] = useState([]);
  const [plansError, setPlansError] = useState("");
  const [planForm, setPlanForm] = useState({ name: "", description: "", billingInterval: "monthly", amount: "", currency: "INR", annualDiscountPercent: "0" });
  const [savingPlan, setSavingPlan] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [billingError, setBillingError] = useState("");
  const [paymentForms, setPaymentForms] = useState({});
  const [paymentBusyId, setPaymentBusyId] = useState("");
  const [commercialEvents, setCommercialEvents] = useState([]);
  const [eventsError, setEventsError] = useState("");
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignDueAt, setAssignDueAt] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigningSubscription, setAssigningSubscription] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");

  const fullName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ") || "Platform Administrator";

  const initials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (activePage !== "Plans" && activePage !== "SchoolDetails") return undefined;
    const controller = new AbortController();
    if (activePage === "Plans") {
      apiRequest("/platform/subscription-plans?includeArchived=true", { accessToken, signal: controller.signal })
        .then((response) => { if (!controller.signal.aborted) setPlans(response?.data ?? []); })
        .catch((error) => { if (!controller.signal.aborted) setPlansError(error.message || "Unable to load subscription plans."); });
    } else {
      apiRequest("/platform/subscription-plans", { accessToken, signal: controller.signal })
        .then((response) => { if (!controller.signal.aborted) setPlans(response?.data ?? []); })
        .catch(() => {});
    }
    return () => controller.abort();
  }, [activePage, accessToken]);

  useEffect(() => {
    if (activePage !== "Billing") return undefined;
    const controller = new AbortController();
    apiRequest("/platform/invoices", { accessToken, signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setInvoices(response?.data ?? []); })
      .catch((error) => { if (!controller.signal.aborted) setBillingError(error.message || "Unable to load invoices."); });
    return () => controller.abort();
  }, [activePage, accessToken, reloadCount]);

  useEffect(() => {
    if (activePage !== "Commercial audit") return undefined;
    const controller = new AbortController();
    apiRequest("/platform/commercial-events?limit=50", { accessToken, signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setCommercialEvents(response?.data ?? []); })
      .catch((error) => { if (!controller.signal.aborted) setEventsError(error.message || "Unable to load commercial events."); });
    return () => controller.abort();
  }, [activePage, accessToken, reloadCount]);

  useEffect(() => {
    if (activePage !== "Overview") return undefined;
    const controller = new AbortController();
    apiRequest("/platform/business-overview", { accessToken, signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setBusinessOverview(response?.data ?? null);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== "AbortError") {
          setBusinessOverviewError(error.message || "Unable to load business overview.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingBusinessOverview(false);
      });
    return () => controller.abort();
  }, [activePage, accessToken, reloadCount]);

  useEffect(() => {
    if (activePage !== "Schools") return undefined;

    const controller = new AbortController();
    const loadSchools = async () => {
      setLoadingSchools(true);
      setSchoolsError("");

      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      try {
        const response = await apiRequest(
          `/platform/schools?${params.toString()}`,
          { accessToken, signal: controller.signal },
        );
        setSchools(Array.isArray(response?.data) ? response.data : []);
        setPagination((current) => ({
          ...current,
          ...(response?.pagination ?? {}),
        }));
      } catch (error) {
        if (error.name !== "AbortError") {
          setSchoolsError(error.message || "Unable to load the school directory.");
          setSchools([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSchools(false);
      }
    };

    void loadSchools();
    return () => controller.abort();
  }, [activePage, accessToken, pagination.page, search, statusFilter, reloadCount]);


  useEffect(() => {
    if (activePage !== "Users") return undefined;

    const controller = new AbortController();
    const loadUsers = async () => {
      setLoadingUsers(true);
      setUsersError("");
      const params = new URLSearchParams({
        page: String(userPagination.page),
        limit: String(PAGE_SIZE),
      });
      if (userRoleFilter) params.set("role", userRoleFilter);
      if (userStatusFilter) params.set("status", userStatusFilter);
      if (userSchoolFilter) params.set("tenantId", userSchoolFilter);
      if (userSearch) params.set("search", userSearch);

      try {
        const response = await apiRequest(
          `/platform/users?${params.toString()}`,
          { accessToken, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setUsers(Array.isArray(response?.data) ? response.data : []);
        setUserPagination((current) => ({ ...current, ...(response?.pagination ?? {}) }));

        const schoolsResponse = await apiRequest(
          "/platform/schools?page=1&limit=100",
          { accessToken, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setUserSchools(Array.isArray(schoolsResponse?.data) ? schoolsResponse.data : []);
        }
      } catch (error) {
        if (error.name !== "AbortError" && !controller.signal.aborted) {
          setUsersError(error.message || "Unable to load the user directory.");
          setUsers([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingUsers(false);
      }
    };

    void loadUsers();
    return () => controller.abort();
  }, [activePage, accessToken, userPagination.page, userRoleFilter, userStatusFilter, userSchoolFilter, userSearch, reloadCount]);

  useEffect(() => {
    if (activePage !== "SchoolDetails" || !selectedSchoolId) return undefined;
    const controller = new AbortController();
    const loadSchoolDetails = async () => {
      setLoadingSchoolDetails(true);
      setSchoolDetailsError("");
      try {
        const response = await apiRequest(
          `/platform/schools/${encodeURIComponent(selectedSchoolId)}`,
          { accessToken, signal: controller.signal },
        );
        setSchoolDetails(response?.data ?? response?.school ?? response ?? null);
      } catch (error) {
        if (error.name !== "AbortError") {
          setSchoolDetailsError(error.message || "Unable to load school details.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSchoolDetails(false);
      }
    };
    void loadSchoolDetails();
    return () => controller.abort();
  }, [activePage, accessToken, selectedSchoolId, reloadCount]);

  useEffect(() => {
    if (activePage !== "UserDetails" || !selectedUserId) return undefined;
    const controller = new AbortController();
    const loadUserDetails = async () => {
      setLoadingUserDetails(true);
      setUserDetailsError("");
      setUserProfileError("");
      setUserProfileSuccess("");
      try {
        const response = await apiRequest(
          `/platform/users/${encodeURIComponent(selectedUserId)}`,
          { accessToken, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const details = response?.data?.user ?? response?.user ?? response?.data ?? null;
        if (!details) throw new Error("The server returned no user details.");
        setUserDetails(details);
        setSelectedRole(details.role || "");
        setUserRoleError("");
        setUserRoleSuccess("");
        setUserProfileForm({
          firstName: details.firstName || "",
          lastName: details.lastName || "",
          email: details.email || "",
          phone: details.phone || "",
        });
      } catch (error) {
        if (error.name !== "AbortError" && !controller.signal.aborted) {
          setUserDetailsError(error.message || "Unable to load user details.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingUserDetails(false);
      }
    };
    void loadUserDetails();
    return () => controller.abort();
  }, [activePage, accessToken, selectedUserId, reloadCount]);

  const savePlan = async (event) => {
    event.preventDefault();
    if (savingPlan) return;
    setSavingPlan(true);
    setPlanMessage("");
    setPlansError("");
    try {
      const payload = { ...planForm, amount: Number(planForm.amount), annualDiscountPercent: planForm.billingInterval === "annual" ? Number(planForm.annualDiscountPercent) : 0 };
      const response = await apiRequest("/platform/subscription-plans", { method: "POST", accessToken, body: payload });
      setPlans((current) => [...current, response?.data?.plan ?? response?.data].filter(Boolean));
      setPlanForm({ name: "", description: "", billingInterval: "monthly", amount: "", currency: "INR", annualDiscountPercent: "0" });
      setPlanMessage("Subscription plan created.");
    } catch (error) { setPlansError(error.message || "Unable to create subscription plan."); }
    finally { setSavingPlan(false); }
  };

  const updatePlan = async (plan, updates) => {
    try {
      const response = await apiRequest(`/platform/subscription-plans/${encodeURIComponent(plan.id || plan._id)}`, { method: "PATCH", accessToken, body: updates });
      const updated = response?.data?.plan ?? response?.data;
      setPlans((current) => current.map((item) => (item.id || item._id) === (plan.id || plan._id) ? updated : item));
    } catch (error) { setPlansError(error.message || "Unable to update plan."); }
  };

  const archivePlan = async (plan) => {
    if (!window.confirm(`Archive ${plan.name}? Existing subscriptions will not change.`)) return;
    try {
      await apiRequest(`/platform/subscription-plans/${encodeURIComponent(plan.id || plan._id)}/archive`, { method: "POST", accessToken });
      setPlans((current) => current.map((item) => (item.id || item._id) === (plan.id || plan._id) ? { ...item, isArchived: true, isActive: false } : item));
    } catch (error) { setPlansError(error.message || "Unable to archive plan."); }
  };

  const assignSubscription = async () => {
    if (!selectedSchoolId || !assignPlanId || assigningSubscription) return;
    setAssigningSubscription(true);
    setSubscriptionMessage("");
    try {
      const body = { planId: assignPlanId, notes: assignNotes };
      if (assignDueAt) body.dueAt = new Date(assignDueAt).toISOString();
      const response = await apiRequest(`/platform/schools/${encodeURIComponent(selectedSchoolId)}/subscription`, { method: "POST", accessToken, body });
      setSubscriptionMessage(response?.message || "Subscription assigned. Access awaits confirmed payment.");
      setAssignPlanId(""); setAssignDueAt(""); setAssignNotes("");
      setReloadCount((count) => count + 1);
    } catch (error) { setSubscriptionMessage(error.message || "Unable to assign subscription."); }
    finally { setAssigningSubscription(false); }
  };

  const recordPayment = async (invoice) => {
    const key = invoice.id || invoice._id;
    const form = paymentForms[key] || {};
    if (!form.amount || !form.method || paymentBusyId) return;
    setPaymentBusyId(key);
    try {
      await apiRequest(`/platform/invoices/${encodeURIComponent(key)}/payments`, {
        method: "POST", accessToken,
        body: { amount: Number(form.amount), method: form.method, reference: form.reference || "", notes: form.notes || "" },
      });
      setPaymentForms((current) => ({ ...current, [key]: { amount: "", method: "bank_transfer", reference: "", notes: "" } }));
      setReloadCount((count) => count + 1);
      const response = await apiRequest("/platform/invoices", { accessToken });
      setInvoices(response?.data ?? []);
    } catch (error) { setBillingError(error.message || "Unable to record payment."); }
    finally { setPaymentBusyId(""); }
  };

  const reversePayment = async (payment) => {
    const reason = window.prompt("Enter the reason for reversing this payment:");
    if (!reason?.trim()) return;
    try {
      await apiRequest(`/platform/payments/${encodeURIComponent(payment.id || payment._id)}/reverse`, { method: "POST", accessToken, body: { reason: reason.trim() } });
      const response = await apiRequest("/platform/invoices", { accessToken });
      setInvoices(response?.data ?? []);
    } catch (error) { setBillingError(error.message || "Unable to reverse payment."); }
  };

  const openCreateUser = () => {
    setUserForm({ tenantId: "", firstName: "", lastName: "", email: "", phone: "", role: "teacher", password: "" });
    setCreateUserError("");
    setCreateUserSuccess("");
    setActivePage("CreateUser");
  };

  const updateUserForm = (event) => {
    const { name, value } = event.target;
    setUserForm((current) => ({ ...current, [name]: value }));
  };

  const submitCreateUser = async (event) => {
    event.preventDefault();
    if (creatingUser) return;
    setCreateUserError("");
    setCreateUserSuccess("");
    const payload = {
      tenantId: userForm.tenantId,
      firstName: userForm.firstName.trim(),
      lastName: userForm.lastName.trim(),
      email: userForm.email.trim().toLowerCase(),
      phone: userForm.phone.trim(),
      role: userForm.role,
      password: userForm.password,
    };
    if (!payload.tenantId || !payload.firstName || payload.firstName.length > 80 ||
        payload.lastName.length > 80 || !payload.email || payload.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
        payload.phone.length > 20 || payload.password.length < 8 ||
        new TextEncoder().encode(payload.password).length > 72) {
      setCreateUserError("Check the required fields. Password must be 8–72 UTF-8 bytes; names, email and phone must meet their length limits.");
      return;
    }
    setCreatingUser(true);
    try {
      const response = await apiRequest("/platform/users", { method: "POST", accessToken, body: payload });
      const created = response?.data?.user ?? response?.user ?? response?.data;
      if (!created?.id) throw new Error("The server did not return the created user. Refresh the directory to verify the result.");
      setUsers((current) => [created, ...current.filter((item) => (item.id || item._id) !== created.id)].slice(0, PAGE_SIZE));
      setUserPagination((current) => ({ ...current, total: current.total + 1 }));
      setCreateUserSuccess(response?.message || "User created and awaiting activation.");
      setUserForm({ tenantId: "", firstName: "", lastName: "", email: "", phone: "", role: "teacher", password: "" });
    } catch (error) {
      setCreateUserError(error.message || "Unable to create the user.");
    } finally {
      setCreatingUser(false);
    }
  };

  const openUserDetails = (listedUser) => {
    setSelectedUserId(listedUser.id || listedUser._id);
    setUserDetails(null);
    setUserDetailsError("");
    setUserProfileError("");
    setUserProfileSuccess("");
    setActivePage("UserDetails");
  };

  const updateUserProfileForm = (event) => {
    const { name, value } = event.target;
    setUserProfileForm((current) => ({ ...current, [name]: value }));
  };

  const submitUserProfile = async (event) => {
    event.preventDefault();
    if (!selectedUserId || savingUserProfile) return;
    setUserProfileError("");
    setUserProfileSuccess("");
    const payload = {
      firstName: userProfileForm.firstName.trim(),
      lastName: userProfileForm.lastName.trim(),
      email: userProfileForm.email.trim().toLowerCase(),
      phone: userProfileForm.phone.trim(),
    };
    if (!payload.firstName || payload.firstName.length > 80) {
      setUserProfileError("First name is required and must be 80 characters or fewer.");
      return;
    }
  if (
  payload.lastName.length > 80 ||
  !payload.email ||
  payload.email.length > 254 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
  payload.phone.length > 20
) {
  setUserProfileError(
    "Enter a valid email address. Names and phone number must be within their length limits."
  );
  return;
}
    setSavingUserProfile(true);
    try {
      const response = await apiRequest(
        `/platform/users/${encodeURIComponent(selectedUserId)}`,
        { method: "PATCH", accessToken, body: payload },
      );
      const updated = response?.data?.user ?? response?.user ?? response?.data;
      if (!updated) throw new Error("The server did not return the updated user profile.");
      setUserDetails(updated);
      setUserProfileForm({
        firstName: updated.firstName || "",
        lastName: updated.lastName || "",
        email: updated.email || "",
        phone: updated.phone || "",
      });
      setUsers((current) => current.map((item) =>
        (item.id || item._id) === selectedUserId ? { ...item, ...updated } : item
      ));
      setUserProfileSuccess(response?.message || "User profile updated successfully.");
    } catch (error) {
      setUserProfileError(error.message || "Unable to update the user profile.");
    } finally {
      setSavingUserProfile(false);
    }
  };
  const updateUserStatus = async (status) => {
  if (!selectedUserId || updatingUserStatus) return;

  setUpdatingUserStatus(true);
  setUserStatusError("");
  setUserStatusSuccess("");

  try {
    const response = await apiRequest(
      `/platform/users/${encodeURIComponent(selectedUserId)}/status`,
      { method: "PATCH", accessToken, body: { status } },
    );

    const updatedUser = response?.data?.user ?? response?.user;

    if (!updatedUser) {
      throw new Error(
        "The server did not return the updated user status. Refresh and verify the user before retrying.",
      );
    }

    setUserDetails((current) => current ? { ...current, ...updatedUser } : current);

    setUsers((current) =>
      current.map((item) =>
        (item.id || item._id) === selectedUserId
          ? { ...item, ...updatedUser }
          : item
      )
    );

    setUserStatusSuccess(
      response?.message || `User status updated to ${status}.`,
    );
  } catch (error) {
    setUserStatusError(
      error.message || "Unable to update the user status. Please retry.",
    );
  } finally {
    setUpdatingUserStatus(false);
  }
};
  const updateUserRole = async () => {
  if (!selectedUserId || !selectedRole || updatingUserRole) return;

  if (selectedRole === userDetails?.role) return;

  setUpdatingUserRole(true);
  setUserRoleError("");
  setUserRoleSuccess("");

  try {
    const response = await apiRequest(
      `/platform/users/${encodeURIComponent(selectedUserId)}/role`,
      {
        method: "PATCH",
        accessToken,
        body: { role: selectedRole },
      },
    );

    const updatedUser = response?.data?.user ?? response?.user;

    if (!updatedUser) {
      throw new Error(
        "The server did not return the updated user role. Refresh and verify the user before retrying.",
      );
    }

    setUserDetails((current) =>
      current ? { ...current, ...updatedUser } : current,
    );

    setSelectedRole(updatedUser.role || "");

    setUsers((current) =>
      current.map((item) =>
        (item.id || item._id) === selectedUserId
          ? { ...item, ...updatedUser }
          : item,
      ),
    );

    setUserRoleSuccess(
      response?.message || "User role updated successfully.",
    );
  } catch (error) {
    setUserRoleError(
      error.message || "Unable to update the user role. Please retry.",
    );
  } finally {
    setUpdatingUserRole(false);
  }
};
  const updateSchoolForm = (event) => {
    const { name, value } = event.target;
    setSchoolForm((current) => ({ ...current, [name]: value }));
  };

  const submitCreateSchool = async (event) => {
    event.preventDefault();
    setCreateSchoolError("");
    setCreateSchoolSuccess("");
    const name = schoolForm.name.trim();
    const slug = schoolForm.slug.trim().toLowerCase();
    const adminEmail = schoolForm.adminEmail.trim().toLowerCase();
    if (!name || !slug || !schoolForm.adminFirstName.trim() || !adminEmail || !schoolForm.adminPassword) {
      setCreateSchoolError("Complete all required fields before creating the school.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setCreateSchoolError("School ID must use lowercase letters, numbers, and single hyphens only.");
      return;
    }
    if (schoolForm.adminPassword.length < 8) {
      setCreateSchoolError("The initial administrator password must be at least 8 characters.");
      return;
    }
    setCreatingSchool(true);
    try {
      const response = await apiRequest("/platform/schools", {
        method: "POST",
        accessToken,
        body: {
          school: {
            name,
            slug,
            ...(schoolForm.contactEmail.trim() ? { contactEmail: schoolForm.contactEmail.trim().toLowerCase() } : {}),
            timezone: schoolForm.timezone.trim() || "Asia/Kolkata",
          },
          admin: {
            firstName: schoolForm.adminFirstName.trim(),
            ...(schoolForm.adminLastName.trim() ? { lastName: schoolForm.adminLastName.trim() } : {}),
            email: adminEmail,
            password: schoolForm.adminPassword,
          },
        },
      });
      const created = response?.data?.school ?? response?.school ?? response?.data ?? null;
      setCreateSchoolSuccess(`School "${created?.name || name}" and its initial administrator were created successfully.`);
      setSchoolForm({
        name: "", slug: "", contactEmail: "", timezone: "Asia/Kolkata",
        adminFirstName: "", adminLastName: "", adminEmail: "", adminPassword: "",
      });
      setPagination((current) => ({ ...current, page: 1 }));
      setSearch("");
      setSearchInput("");
      setStatusFilter("");
      setReloadCount((count) => count + 1);
    } catch (error) {
      setCreateSchoolError(
        error.status === 409
          ? error.message || "A school with this ID or administrator email already exists."
          : error.message || "Unable to create the school. Please try again.",
      );
    } finally {
      setCreatingSchool(false);
    }
  };

  const updateSchoolStatus = async (status) => {
    if (!selectedSchoolId || updatingSchoolStatus) return;
    setUpdatingSchoolStatus(true);
    setSchoolStatusError("");
    setSchoolStatusSuccess("");
    try {
      const response = await apiRequest(
        `/platform/schools/${encodeURIComponent(selectedSchoolId)}/status`,
        { method: "PATCH", accessToken, body: { status } },
      );
      const updatedSchool = response?.data?.school;
      if (!updatedSchool) {
        throw new Error("The server did not return the updated school status. Refresh and verify the school before retrying.");
      }
      setSchoolDetails((current) => {
        if (!current) return current;
        return current.school
          ? { ...current, school: { ...current.school, ...updatedSchool } }
          : { ...current, ...updatedSchool };
      });
      setSchoolStatusSuccess(response?.message || `School status updated to ${status}.`);
      setReloadCount((count) => count + 1);
    } catch (error) {
      setSchoolStatusError(error.message || "Unable to update the school status. Please retry.");
    } finally {
      setUpdatingSchoolStatus(false);
    }
  };

  const openSchoolDetails = (school) => {
    setSelectedSchoolId(school.id || school._id);
    setSchoolDetails(null);
    setActivePage("SchoolDetails");
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setSearch(searchInput.trim());
  };

  const changeStatusFilter = (value) => {
    setPagination((current) => ({ ...current, page: 1 }));
    setStatusFilter(value);
  };

  const submitUserSearch = (event) => {
    event.preventDefault();
    setUserPagination((current) => ({ ...current, page: 1 }));
    setUserSearch(userSearchInput.trim());
  };

  const changeUserFilter = (setter) => (value) => {
    setUserPagination((current) => ({ ...current, page: 1 }));
    setter(value);
  };

  const userTotalPages = userPagination.totalPages || 0;
  const userStartItem = userPagination.total === 0 ? 0 : (userPagination.page - 1) * PAGE_SIZE + 1;
  const userEndItem = Math.min(userPagination.page * PAGE_SIZE, userPagination.total);
  const totalPages = pagination.totalPages || 0;
  const startItem = pagination.total === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(pagination.page * PAGE_SIZE, pagination.total);

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <div className="platform-brand">
          <div className="platform-brand-mark">S</div>
          <div>
            <div className="platform-brand-name">School<span>Suite</span></div>
            <div className="platform-brand-caption">PLATFORM CONTROL</div>
          </div>
        </div>

        <div className="platform-identity">
          <span className="platform-identity-label">ADMINISTRATION</span>
          <strong>Platform workspace</strong>
          <span>All schools · Central management</span>
        </div>

        <nav className="platform-navigation" aria-label="Platform navigation">
          <span className="platform-nav-heading">WORKSPACE</span>
          {navigation.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`platform-nav-link ${activePage === item.label ? "platform-nav-link-active" : ""}`}
              onClick={() => setActivePage(item.label)}
              aria-current={activePage === item.label ? "page" : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="platform-sidebar-footer">
          <span className="platform-security-dot" />
          <span>Restricted administrator access</span>
        </div>
      </aside>

      <main className="platform-main">
        <header className="platform-topbar">
          <div>
            <span className="platform-breadcrumb">Platform</span>
            <span className="platform-breadcrumb-divider">/</span>
            <strong>{activePage}</strong>
          </div>
          <div className="platform-user-actions">
            <div className="platform-user-avatar">{initials}</div>
            <div className="platform-user-copy">
              <strong>{fullName}</strong>
              <span>Platform Administrator</span>
            </div>
            <button type="button" className="platform-logout" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>

        <div className="platform-content">
          <div className="platform-eyebrow">CENTRAL ADMINISTRATION</div>
          <h1>{({ Overview: "Platform overview", CreateSchool: "Create school", SchoolDetails: "School details", Users: "User directory", UserDetails: "User details", CreateUser: "Create user", Plans: "Subscription plans", Billing: "Platform billing", "Commercial audit": "Commercial audit trail" })[activePage] || "School directory"}</h1>
          <p className="platform-page-description">
            {activePage === "Overview"
              ? "Manage schools and their access from one secure workspace."
              : activePage === "CreateSchool"
                ? "Register a school and create its first administrator in one secure step."
                : activePage === "SchoolDetails"
                  ? "Review school information and its associated administrators."
                  : activePage === "Users"
                    ? "Search and manage accounts across all registered schools."
                    : activePage === "UserDetails"
                      ? "Review and update an account profile."
                      : "Search registered schools, review their status, and move through the directory."}
          </p>

          {activePage === "Overview" ? (
            <>
              <section className="platform-welcome-card">
                <div>
                  <span className="platform-card-kicker">SCHOOLS AT A GLANCE</span>
                  <h2>Your platform, centrally managed.</h2>
                  <p>Manage school onboarding and lifecycle controls from one secure workspace.</p>
                  <button type="button" onClick={() => setActivePage("Schools")}>
                    Open school directory <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="platform-card-art" aria-hidden="true">⌂</div>
              </section>

              {businessOverviewError && <div className="platform-directory-error" role="alert"><p>{businessOverviewError}</p><button type="button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button></div>}
              {loadingBusinessOverview && <p role="status">Loading business metrics…</p>}
              {businessOverview && (
                <>
                  <section className="platform-summary-grid" aria-label="Business overview">
                    <article className="platform-summary-card"><span className="platform-summary-icon">⌂</span><span className="platform-summary-label">Client schools</span><strong>{businessOverview.schools?.total ?? 0}</strong><p>{businessOverview.schools?.active ?? 0} active schools</p></article>
                    <article className="platform-summary-card"><span className="platform-summary-icon">↻</span><span className="platform-summary-label">Active subscriptions</span><strong>{Object.values(businessOverview.subscriptions || {}).reduce((sum, item) => sum + (item.activeSubscriptions || 0), 0)}</strong><p>Monthly, annual and lifetime plans</p></article>
                    <article className="platform-summary-card"><span className="platform-summary-icon">₹</span><span className="platform-summary-label">Invoiced revenue</span><strong>{(businessOverview.invoiced || []).map(item => new Intl.NumberFormat("en-IN", { style: "currency", currency: item._id, maximumFractionDigits: 0 }).format(item.invoiced || 0)).join(" · ") || "—"}</strong><p>Issued platform invoices, excluding void and draft</p></article>
                    <article className="platform-summary-card"><span className="platform-summary-icon">✓</span><span className="platform-summary-label">Cash collected</span><strong>{(businessOverview.collected || []).map(item => new Intl.NumberFormat("en-IN", { style: "currency", currency: item._id, maximumFractionDigits: 0 }).format(item.collected || 0)).join(" · ") || "—"}</strong><p>Recorded platform payments</p></article>
                  </section>
                  <section className="platform-summary-grid" aria-label="Recurring revenue">
                    {Object.entries(businessOverview.subscriptions || {}).map(([currency, metrics]) => (
                      <article className="platform-summary-card" key={currency}><span className="platform-summary-label">{currency} recurring run rate</span><strong>{new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(metrics.mrr || 0)} / month</strong><p>{new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(metrics.arr || 0)} annualised · {new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(metrics.lifetimeSales || 0)} lifetime sales</p></article>
                    ))}
                  </section>
                </>
              )}
              <section className="platform-summary-grid" aria-label="Platform operations">
                <article className="platform-summary-card"><span className="platform-summary-icon">⌂</span><span className="platform-summary-label">Client portfolio</span><strong>Manage schools</strong><p>Search school accounts and review their lifecycle.</p><button type="button" className="platform-secondary-button" onClick={() => setActivePage("Schools")}>Open schools</button></article>
                <article className="platform-summary-card"><span className="platform-summary-icon">＋</span><span className="platform-summary-label">Onboarding</span><strong>New client</strong><p>Register a school and its initial administrator.</p><button type="button" className="platform-secondary-button" onClick={() => setActivePage("CreateSchool")}>Add school</button></article>
                <article className="platform-summary-card"><span className="platform-summary-icon">₹</span><span className="platform-summary-label">Billing data</span><strong>Separate from school fees</strong><p>These metrics represent SchoolSuite platform invoices and payments.</p></article>
              </section>
            </>
          ) : activePage === "Plans" ? (
            <section className="platform-directory" aria-label="Subscription plans">
              <div className="platform-form-heading"><div><h2>Commercial plans</h2><p>Annual discount applies to the listed annual price. Existing subscriptions retain their agreed price snapshot.</p></div></div>
              {plansError && <div className="platform-directory-error" role="alert">{plansError}</div>}
              {planMessage && <p role="status" className="platform-form-success">{planMessage}</p>}
              <form className="platform-school-form platform-plan-form" onSubmit={savePlan}>
                <label>Plan name *<input required maxLength={100} value={planForm.name} onChange={(event) => setPlanForm((v) => ({ ...v, name: event.target.value }))} /></label>
                <label>Billing model<select value={planForm.billingInterval} onChange={(event) => setPlanForm((v) => ({ ...v, billingInterval: event.target.value }))}><option value="monthly">Monthly recurring</option><option value="annual">Annual recurring</option><option value="one_time">One-time lifetime</option></select></label>
                <label>Price *<input type="number" min="0.01" step="0.01" required value={planForm.amount} onChange={(event) => setPlanForm((v) => ({ ...v, amount: event.target.value }))} /></label>
                <label>Currency<input required minLength={3} maxLength={3} value={planForm.currency} onChange={(event) => setPlanForm((v) => ({ ...v, currency: event.target.value.toUpperCase() }))} /></label>
                {planForm.billingInterval === "annual" && <label>Annual discount (%)<input type="number" min="0" max="100" step="0.01" value={planForm.annualDiscountPercent} onChange={(event) => setPlanForm((v) => ({ ...v, annualDiscountPercent: event.target.value }))} /></label>}
                <label>Description<input maxLength={500} value={planForm.description} onChange={(event) => setPlanForm((v) => ({ ...v, description: event.target.value }))} /></label>
                <div className="platform-form-actions"><button className="platform-primary-button" type="submit" disabled={savingPlan}>{savingPlan ? "Saving…" : "Create plan"}</button></div>
              </form>
              <div className="platform-table-wrap"><table className="platform-school-table" aria-label="Subscription plans"><thead><tr><th>Plan</th><th>Billing</th><th>Price</th><th>Discount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {plans.map((plan) => <tr key={plan.id || plan._id}><td><strong>{plan.name}</strong><br /><small>{plan.description}</small></td><td>{plan.billingInterval === "one_time" ? "Lifetime · one payment" : statusLabel(plan.billingInterval)}</td><td>{plan.currency} {Number(plan.amount).toLocaleString("en-IN")}</td><td>{plan.billingInterval === "annual" ? `${plan.annualDiscountPercent || 0}%` : "—"}</td><td>{plan.isArchived ? "Archived" : plan.isActive ? "Active" : "Inactive"}</td><td>{!plan.isArchived && <><button type="button" className="platform-secondary-button" onClick={() => void updatePlan(plan, { isActive: !plan.isActive })}>{plan.isActive ? "Deactivate" : "Activate"}</button> <button type="button" className="platform-secondary-button" onClick={() => void archivePlan(plan)}>Archive</button></>}</td></tr>)}
                {!plans.length && <tr><td colSpan="6" className="platform-table-message">No subscription plans yet.</td></tr>}
              </tbody></table></div>
            </section>
          ) : activePage === "Billing" ? (
            <section className="platform-directory" aria-label="Platform invoices and payments">
              <div className="platform-form-heading"><div><h2>Invoices & payments</h2><p>Platform billing only. Student fee collections remain within each school's finance records.</p></div><button type="button" className="platform-secondary-button" onClick={() => setReloadCount((count) => count + 1)}>Refresh</button></div>
              {billingError && <div className="platform-directory-error" role="alert">{billingError}<button type="button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button></div>}
              <div className="platform-table-wrap"><table className="platform-school-table" aria-label="Platform invoices"><thead><tr><th>Invoice</th><th>School</th><th>Issued / due</th><th>Total</th><th>Status</th><th>Record payment</th></tr></thead><tbody>
                {invoices.map((invoice) => { const key = invoice.id || invoice._id; const form = paymentForms[key] || { amount: "", method: "bank_transfer", reference: "" }; return <tr key={key}><td><strong>{invoice.invoiceNumber}</strong></td><td>{invoice.tenantId?.name || "School"}</td><td>{formatDate(invoice.issuedAt)} / {formatDate(invoice.dueAt)}</td><td>{invoice.currency} {Number(invoice.totalAmount).toLocaleString("en-IN")}</td><td>{statusLabel(invoice.status)}</td><td>{["paid", "void"].includes(invoice.status) ? "—" : <div className="platform-payment-inline"><input aria-label={`Payment amount for ${invoice.invoiceNumber}`} type="number" min="0.01" max={invoice.outstandingAmount} step="0.01" value={form.amount} onChange={(event) => setPaymentForms((v) => ({ ...v, [key]: { ...form, amount: event.target.value } }))} /><select aria-label={`Payment method for ${invoice.invoiceNumber}`} value={form.method} onChange={(event) => setPaymentForms((v) => ({ ...v, [key]: { ...form, method: event.target.value } }))}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="card">Card</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select><input aria-label={`Payment reference for ${invoice.invoiceNumber}`} placeholder="Reference" value={form.reference || ""} onChange={(event) => setPaymentForms((v) => ({ ...v, [key]: { ...form, reference: event.target.value } }))} /><button className="platform-primary-button" type="button" disabled={paymentBusyId === key || !form.amount} onClick={() => void recordPayment(invoice)}>{paymentBusyId === key ? "Saving…" : "Record"}</button></div>}</td></tr>{(invoice.payments || []).map((payment) => <tr key={payment.id || payment._id}><td colSpan="2">Payment · {formatDate(payment.paymentDate)} · {payment.method?.replaceAll("_", " ")}</td><td>{payment.reference || "—"}</td><td>{payment.currency} {Number(payment.amount).toLocaleString("en-IN")}</td><td>{statusLabel(payment.status)}</td><td>{payment.status === "recorded" && <button type="button" className="platform-secondary-button" onClick={() => void reversePayment(payment)}>Reverse</button>}</td></tr>)}; })}
                {!invoices.length && <tr><td colSpan="6" className="platform-table-message">No platform invoices found.</td></tr>}
              </tbody></table></div>
            </section>
          ) : activePage === "Commercial audit" ? (
            <section className="platform-directory" aria-label="Commercial audit events">
              <div className="platform-form-heading"><div><h2>Commercial event history</h2><p>Plan changes, subscription assignments, activations, renewals and payment actions.</p></div><button type="button" className="platform-secondary-button" onClick={() => setReloadCount((count) => count + 1)}>Refresh</button></div>
              {eventsError && <div className="platform-directory-error" role="alert">{eventsError}</div>}
              <div className="platform-table-wrap"><table className="platform-school-table" aria-label="Commercial audit events"><thead><tr><th>When</th><th>School</th><th>Action</th><th>Details</th></tr></thead><tbody>
                {commercialEvents.map((item) => <tr key={item.id || item._id}><td>{formatDate(item.createdAt)}</td><td>{item.tenantId?.name || "—"}</td><td>{statusLabel(item.action?.replaceAll("_", " ").toLowerCase())}</td><td><code>{JSON.stringify(item.details || {})}</code></td></tr>)}
                {!commercialEvents.length && <tr><td colSpan="4" className="platform-table-message">No commercial events recorded yet.</td></tr>}
              </tbody></table></div>
            </section>
          ) : activePage === "CreateSchool" ? (
            <section className="platform-form-card" aria-label="Create school form">
              <div className="platform-form-heading">
                <div><h2>School information</h2><p>Fields marked required must be completed.</p></div>
                <button type="button" className="platform-secondary-button" onClick={() => setActivePage("Schools")}>Back to directory</button>
              </div>
              {createSchoolSuccess && <div className="platform-form-success" role="status">{createSchoolSuccess}<button type="button" onClick={() => { setCreateSchoolSuccess(""); setActivePage("Schools"); }}>View directory</button></div>}
              {createSchoolError && <div className="platform-directory-error" role="alert"><p>{createSchoolError}</p></div>}
              <form className="platform-school-form" onSubmit={submitCreateSchool}>
                <h3>School details</h3>
                <label>School name *<input name="name" value={schoolForm.name} onChange={updateSchoolForm} required maxLength={160} autoComplete="organization" /></label>
                <label>School ID / slug *<input name="slug" value={schoolForm.slug} onChange={(event) => setSchoolForm((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") }))} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} aria-describedby="platform-school-slug-help" /><small id="platform-school-slug-help">Use lowercase letters, numbers, and hyphens. This ID is used for school sign-in.</small></label>
                <label>School contact email<input type="email" name="contactEmail" value={schoolForm.contactEmail} onChange={updateSchoolForm} maxLength={254} autoComplete="email" /></label>
                <label>Timezone *<input name="timezone" value={schoolForm.timezone} onChange={updateSchoolForm} required maxLength={80} placeholder="Asia/Kolkata" /></label>
                <h3>Initial school administrator</h3>
                <label>First name *<input name="adminFirstName" value={schoolForm.adminFirstName} onChange={updateSchoolForm} required maxLength={80} autoComplete="given-name" /></label>
                <label>Last name<input name="adminLastName" value={schoolForm.adminLastName} onChange={updateSchoolForm} maxLength={80} autoComplete="family-name" /></label>
                <label>Administrator email *<input type="email" name="adminEmail" value={schoolForm.adminEmail} onChange={updateSchoolForm} required maxLength={254} autoComplete="email" /></label>
                <label>Temporary password *<input type="password" name="adminPassword" value={schoolForm.adminPassword} onChange={updateSchoolForm} required minLength={8} maxLength={128} autoComplete="new-password" /><small>Use at least 8 characters and share it securely with the administrator.</small></label>
                <div className="platform-form-actions"><button type="button" className="platform-secondary-button" onClick={() => setActivePage("Schools")} disabled={creatingSchool}>Cancel</button><button type="submit" className="platform-primary-button" disabled={creatingSchool}>{creatingSchool ? "Creating school…" : "Create school"}</button></div>
              </form>
            </section>
          ) : activePage === "SchoolDetails" ? (
            <section className="platform-form-card" aria-label="School details">
              <div className="platform-form-heading"><div><h2>{schoolDetails?.school?.name || schoolDetails?.name || "School details"}</h2><p>School profile and administrator accounts</p></div><button type="button" className="platform-secondary-button" onClick={() => setActivePage("Schools")}>Back to directory</button></div>
              {loadingSchoolDetails && <p role="status">Loading school details…</p>}
              {schoolDetailsError && <div className="platform-directory-error" role="alert"><p>{schoolDetailsError}</p><button type="button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button></div>}
              {schoolDetails && (() => {
                const school = schoolDetails.school || schoolDetails;
                const administrators = schoolDetails.administrators || schoolDetails.admins || schoolDetails.schoolAdmins || [];
                return <>
                  <dl className="platform-school-details">
                    <div><dt>School name</dt><dd>{school.name || "—"}</dd></div>
                    <div><dt>School ID</dt><dd>{school.slug || "—"}</dd></div>
                    <div><dt>Contact email</dt><dd>{school.contactEmail || "—"}</dd></div>
                    <div><dt>Status</dt><dd>{statusLabel(school.status)}</dd></div>
                    <div><dt>Timezone</dt><dd>{school.timezone || "—"}</dd></div>
                    <div><dt>Created</dt><dd>{formatDate(school.createdAt)}</dd></div>
                  </dl>
                
                  <section className="platform-lifecycle-controls" aria-label="School lifecycle controls">
                    <div>
                      <h3>School lifecycle</h3>
                      <p>Change access for this school and its school administrators.</p>
                    </div>
                    <div className="platform-form-actions">
                      {school.status === "pending" && (
                        <button type="button" className="platform-primary-button" onClick={() => void updateSchoolStatus("active")} disabled={updatingSchoolStatus}>
                          {updatingSchoolStatus ? "Updating…" : "Activate school"}
                        </button>
                      )}
                      {school.status === "active" && (
                        <button type="button" className="platform-secondary-button" onClick={() => void updateSchoolStatus("suspended")} disabled={updatingSchoolStatus}>
                          {updatingSchoolStatus ? "Updating…" : "Suspend school"}
                        </button>
                      )}
                      {school.status === "suspended" && (
                        <button type="button" className="platform-primary-button" onClick={() => void updateSchoolStatus("active")} disabled={updatingSchoolStatus}>
                          {updatingSchoolStatus ? "Updating…" : "Reactivate school"}
                        </button>
                      )}
                    </div>
                    {schoolStatusSuccess && <p role="status">{schoolStatusSuccess}</p>}
                    {schoolStatusError && <div className="platform-directory-error" role="alert"><p>{schoolStatusError}</p><button type="button" onClick={() => void updateSchoolStatus(school.status === "pending" || school.status === "suspended" ? "active" : "suspended")} disabled={updatingSchoolStatus}>Retry</button></div>}
                  </section>
                  <section className="platform-lifecycle-controls" aria-label="School subscription management">
                    <div><h3>Subscription</h3><p>Assign monthly, discounted annual, or negotiated lifetime access. Access activates only after the invoice is fully paid.</p></div>
                    <div className="platform-subscription-assign">
                      <label>Plan<select value={assignPlanId} onChange={(event) => setAssignPlanId(event.target.value)}><option value="">Select a plan</option>{plans.filter((plan) => plan.isActive && !plan.isArchived).map((plan) => <option key={plan.id || plan._id} value={plan.id || plan._id}>{plan.name} · {plan.billingInterval} · {plan.currency} {plan.amount}{plan.billingInterval === "annual" ? ` · ${plan.annualDiscountPercent || 0}% discount` : ""}</option>)}</select></label>
                      <label>Invoice due date (optional)<input type="date" value={assignDueAt} onChange={(event) => setAssignDueAt(event.target.value)} /></label>
                      <label>Commercial notes<input maxLength={500} value={assignNotes} onChange={(event) => setAssignNotes(event.target.value)} /></label>
                      <button type="button" className="platform-primary-button" disabled={!assignPlanId || assigningSubscription} onClick={() => void assignSubscription()}>{assigningSubscription ? "Assigning…" : "Assign plan & issue invoice"}</button>
                    </div>
                    {subscriptionMessage && <p role="status">{subscriptionMessage}</p>}
                  </section>
                  <h3>School administrators</h3>
                  {administrators.length ? <div className="platform-admin-list">{administrators.map((admin) => <article key={admin.id || admin._id || admin.email}><strong>{[admin.firstName, admin.lastName].filter(Boolean).join(" ") || "Administrator"}</strong><span>{admin.email || "—"}</span><span>{statusLabel(admin.status)}</span></article>)}</div> : <p>No school administrators were returned for this school.</p>}
                </>;
              })()}
            </section>
          ) : activePage === "UserDetails" ? (
            <section className="platform-form-card" aria-label="User details">
              <div className="platform-form-heading">
                <div>
                  <h2>{userDetails ? [userDetails.firstName, userDetails.lastName].filter(Boolean).join(" ") || "User details" : "User details"}</h2>
                  <p>Account information and editable profile fields</p>
                </div>
                <button type="button" className="platform-secondary-button" onClick={() => setActivePage("Users")}>Back to directory</button>
              </div>
              {loadingUserDetails && <p role="status">Loading user details…</p>}
              {userDetailsError && <div className="platform-directory-error" role="alert"><p>{userDetailsError}</p><button type="button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button></div>}
              {userDetails && (
                <>
                  <dl className="platform-school-details">
                    <div><dt>School</dt><dd>{userSchools.find((item) => (item.id || item._id) === userDetails.tenantId)?.name || "—"}</dd></div>
                    <div><dt>Role</dt><dd>{statusLabel(userDetails.role?.replaceAll("_", " "))}</dd></div>
                    <div><dt>Status</dt><dd>{statusLabel(userDetails.status)}</dd></div>
                    <div><dt>Last login</dt><dd>{userDetails.lastLoginAt ? formatDate(userDetails.lastLoginAt) : "Never"}</dd></div>
                    <div><dt>Account created</dt><dd>{formatDate(userDetails.createdAt)}</dd></div>
                    <div><dt>Last updated</dt><dd>{formatDate(userDetails.updatedAt)}</dd></div>
                  </dl>
                    <section
  className="platform-lifecycle-controls"
  aria-label="User role management"
>
  <div>
    <h3>Role management</h3>
    <p>Change this user's role and permissions.</p>
  </div>

  <label>
    <span>User role</span>
    <select
      aria-label="User role"
      value={selectedRole}
      onChange={(event) => {
        setSelectedRole(event.target.value);
        setUserRoleError("");
        setUserRoleSuccess("");
      }}
      disabled={updatingUserRole}
    >
      {["accountant", "librarian", "transport_manager"].includes(selectedRole) && (
        <option value={selectedRole} disabled>{selectedRole.replaceAll("_", " ")} — unsupported in this release</option>
      )}
      <option value="school_admin">School admin</option>
      <option value="principal">Principal</option>
      <option value="teacher">Teacher</option>
      <option value="student">Student</option>
      <option value="parent">Parent</option>
    </select>
  </label>

  <div className="platform-form-actions">
    <button
      type="button"
      className="platform-primary-button"
      onClick={() => void updateUserRole()}
      disabled={
        updatingUserRole ||
        !selectedRole ||
        selectedRole === userDetails.role
      }
    >
      {updatingUserRole ? "Updating…" : "Save role"}
    </button>
  </div>

  {userRoleSuccess && (
    <p role="status">{userRoleSuccess}</p>
  )}

  {userRoleError && (
    <p className="platform-directory-error" role="alert">
      {userRoleError}
    </p>
  )}
</section>
                  <section className="platform-lifecycle-controls" aria-label="User lifecycle controls">
  <div>
    <h3>User account lifecycle</h3>
    <p>Manage this user's access to the school ERP.</p>
  </div>

  <div className="platform-form-actions">
    {userDetails.status === "pending" && (
      <button
        type="button"
        className="platform-primary-button"
        onClick={() => void updateUserStatus("active")}
        disabled={updatingUserStatus}
      >
        {updatingUserStatus ? "Updating…" : "Activate user"}
      </button>
    )}

    {userDetails.status === "active" && (
      <button
        type="button"
        className="platform-secondary-button"
        onClick={() => void updateUserStatus("suspended")}
        disabled={updatingUserStatus}
      >
        {updatingUserStatus ? "Updating…" : "Suspend user"}
      </button>
    )}

    {userDetails.status === "suspended" && (
      <button
        type="button"
        className="platform-primary-button"
        onClick={() => void updateUserStatus("active")}
        disabled={updatingUserStatus}
      >
        {updatingUserStatus ? "Updating…" : "Reactivate user"}
      </button>
    )}
  </div>

  {userStatusSuccess && (
    <p role="status">{userStatusSuccess}</p>
  )}

  {userStatusError && (
    <div className="platform-directory-error" role="alert">
      <p>{userStatusError}</p>
      <button
        type="button"
        onClick={() => void updateUserStatus(userDetails.status === "active" ? "suspended" : "active")}
        disabled={updatingUserStatus}
      >
        Retry
      </button>
    </div>
  )}
</section>
                  <form className="platform-school-form" onSubmit={submitUserProfile}>
                    <h3>Edit profile</h3>
                    <label>First name *<input name="firstName" value={userProfileForm.firstName} onChange={updateUserProfileForm} required maxLength={80} autoComplete="given-name" /></label>
                    <label>Last name<input name="lastName" value={userProfileForm.lastName} onChange={updateUserProfileForm} maxLength={80} autoComplete="family-name" /></label>
                    <label>Email address *<input type="email" name="email" value={userProfileForm.email} onChange={updateUserProfileForm} required maxLength={254} autoComplete="email" /></label>
                    <label>Phone<input type="tel" name="phone" value={userProfileForm.phone} onChange={updateUserProfileForm} maxLength={20} autoComplete="tel" /></label>
                    {userProfileError && <div className="platform-directory-error" role="alert"><p>{userProfileError}</p></div>}
                    {userProfileSuccess && <p className="platform-form-success" role="status">{userProfileSuccess}</p>}
                    <div className="platform-form-actions">
                      <button type="button" className="platform-secondary-button" onClick={() => setActivePage("Users")} disabled={savingUserProfile}>Back</button>
                      <button type="submit" className="platform-primary-button" disabled={savingUserProfile || loadingUserDetails}>{savingUserProfile ? "Saving…" : "Save profile"}</button>
                    </div>
                  </form>
                </>
              )}
            </section>
          ) : activePage === "CreateUser" ? (
            <section className="platform-form-card" aria-label="Create user form">
              <div className="platform-form-heading">
                <div><h2>New school user</h2><p>New accounts are created with pending status and must be activated separately.</p></div>
                <button type="button" className="platform-secondary-button" onClick={() => setActivePage("Users")}>Back to directory</button>
              </div>
              {createUserSuccess && <div className="platform-form-success" role="status">{createUserSuccess}<button type="button" onClick={() => setActivePage("Users")}>View directory</button></div>}
              {createUserError && <div className="platform-directory-error" role="alert"><p>{createUserError}</p></div>}
              <form className="platform-school-form" onSubmit={submitCreateUser}>
                <h3>School and account details</h3>
                <label>School *<select name="tenantId" value={userForm.tenantId} onChange={updateUserForm} required>
                  <option value="">Select an active school</option>
                  {userSchools.filter((school) => school.status === "active").map((school) => <option key={school.id || school._id} value={school.id || school._id}>{school.name}</option>)}
                </select></label>
                <label>First name *<input name="firstName" value={userForm.firstName} onChange={updateUserForm} required maxLength={80} autoComplete="given-name" /></label>
                <label>Last name<input name="lastName" value={userForm.lastName} onChange={updateUserForm} maxLength={80} autoComplete="family-name" /></label>
                <label>Email address *<input type="email" name="email" value={userForm.email} onChange={updateUserForm} required maxLength={254} autoComplete="email" /></label>
                <label>Phone<input type="tel" name="phone" value={userForm.phone} onChange={updateUserForm} maxLength={20} autoComplete="tel" /></label>
                <label>Role *<select name="role" value={userForm.role} onChange={updateUserForm} required>
                  <option value="school_admin">School admin</option><option value="principal">Principal</option><option value="teacher">Teacher</option><option value="student">Student</option><option value="parent">Parent</option>
                </select></label>
                <label>Initial password *<input type="password" name="password" value={userForm.password} onChange={updateUserForm} required minLength={8} maxLength={72} autoComplete="new-password" /><small>At least 8 characters and no more than 72 UTF-8 bytes.</small></label>
                <div className="platform-form-actions">
                  <button type="button" className="platform-secondary-button" onClick={() => setActivePage("Users")} disabled={creatingUser}>Cancel</button>
                  <button type="submit" className="platform-primary-button" disabled={creatingUser || !userSchools.some((school) => school.status === "active")}>{creatingUser ? "Creating user…" : "Create user"}</button>
                </div>
              </form>
            </section>
          ) : activePage === "Users" ? (
            <section className="platform-directory" aria-label="User directory">
              <div className="platform-directory-toolbar platform-user-toolbar">
                <button type="button" className="platform-primary-button" onClick={openCreateUser}>＋ Create user</button>
                <form className="platform-search-form" onSubmit={submitUserSearch} role="search">
                  <label className="platform-search-field">
                    <span className="platform-search-icon" aria-hidden="true">⌕</span>
                    <span className="sr-only">Search users</span>
                    <input type="search" value={userSearchInput} onChange={(event) => setUserSearchInput(event.target.value)} placeholder="Search by name or email" maxLength={100} />
                  </label>
                  <button type="submit" className="platform-primary-button">Search</button>
                </form>
                <label className="platform-status-filter">
                  <span>Role</span>
                  <select aria-label="Filter users by role" value={userRoleFilter} onChange={(event) => changeUserFilter(setUserRoleFilter)(event.target.value)}>
                    <option value="">All roles</option>
                    <option value="school_admin">School admin</option>
                    <option value="principal">Principal</option>
                    <option value="teacher">Teacher</option>
                    <option value="accountant">Accountant</option>
                    <option value="librarian">Librarian</option>
                    <option value="transport_manager">Transport manager</option>
                    <option value="student">Student</option>
                    <option value="parent">Parent</option>
                  </select>
                </label>
                <label className="platform-status-filter">
                  <span>Status</span>
                  <select aria-label="Filter users by status" value={userStatusFilter} onChange={(event) => changeUserFilter(setUserStatusFilter)(event.target.value)}>
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
                <label className="platform-status-filter">
                  <span>School</span>
                  <select aria-label="Filter users by school" value={userSchoolFilter} onChange={(event) => changeUserFilter(setUserSchoolFilter)(event.target.value)}>
                    <option value="">All schools</option>
                    {userSchools.map((school) => <option key={school.id || school._id} value={school.id || school._id}>{school.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="platform-directory-meta">
                <strong>{userPagination.total} {userPagination.total === 1 ? "user" : "users"}</strong>
                <span>{loadingUsers ? "Refreshing directory…" : userSearch || userRoleFilter || userStatusFilter || userSchoolFilter ? "Filtered results" : "All school users"}</span>
              </div>

              {usersError && <div className="platform-directory-error" role="alert"><p>{usersError}</p><button type="button" onClick={() => setReloadCount((count) => count + 1)}>Retry</button></div>}

              <div className="platform-table-wrap">
                <table className="platform-school-table" aria-label="User directory">
                  <thead><tr><th scope="col">User</th><th scope="col">Email</th><th scope="col">School</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Created</th></tr></thead>
                  <tbody>
                    {loadingUsers && users.length === 0 ? (
                      <tr><td colSpan="6" className="platform-table-message" role="status">Loading users…</td></tr>
                    ) : users.length ? users.map((listedUser) => {
                      const school = userSchools.find((item) => (item.id || item._id) === listedUser.tenantId);
                      return <tr key={listedUser.id || listedUser._id}>
                        <td><button type="button" className="platform-school-name-button" onClick={() => openUserDetails(listedUser)}>{[listedUser.firstName, listedUser.lastName].filter(Boolean).join(" ") || "Unnamed user"}</button></td>
                        <td>{listedUser.email || "—"}</td>
                        <td>{school?.name || "—"}</td>
                        <td>{statusLabel(listedUser.role?.replaceAll("_", " "))}</td>
                        <td><span className={`platform-status-pill platform-status-${listedUser.status || "unknown"}`}>{statusLabel(listedUser.status)}</span></td>
                        <td>{formatDate(listedUser.createdAt)}</td>
                      </tr>;
                    }) : (
                      <tr><td colSpan="6" className="platform-table-message">{usersError ? "User records could not be loaded." : "No users match these filters."}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="platform-pagination">
                <span>{userPagination.total === 0 ? "No results" : `Showing ${userStartItem}–${userEndItem} of ${userPagination.total}`}</span>
                <div>
                  <button type="button" className="platform-page-button" disabled={loadingUsers || userPagination.page <= 1} onClick={() => setUserPagination((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
                  <span className="platform-page-count">Page {userPagination.page}{userTotalPages > 0 ? ` of ${userTotalPages}` : ""}</span>
                  <button type="button" className="platform-page-button" disabled={loadingUsers || userTotalPages === 0 || userPagination.page >= userTotalPages} onClick={() => setUserPagination((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
                </div>
              </div>
            </section>
          ) : (
            <section className="platform-directory" aria-label="School directory">
              <div className="platform-directory-toolbar">
                <button type="button" className="platform-primary-button" onClick={() => { setCreateSchoolError(""); setCreateSchoolSuccess(""); setActivePage("CreateSchool"); }}>＋ Create school</button>
                <form className="platform-search-form" onSubmit={submitSearch} role="search">
                  <label className="platform-search-field">
                    <span className="platform-search-icon" aria-hidden="true">⌕</span>
                    <span className="sr-only">Search schools</span>
                    <input
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Search by school name or slug"
                      maxLength={100}
                    />
                  </label>
                  <button type="submit" className="platform-primary-button">Search</button>
                </form>
                <label className="platform-status-filter">
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => changeStatusFilter(event.target.value)}
                    aria-label="Filter schools by status"
                  >
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
              </div>

              <div className="platform-directory-meta">
                <strong>{pagination.total} {pagination.total === 1 ? "school" : "schools"}</strong>
                <span>{loadingSchools ? "Refreshing directory…" : search || statusFilter ? "Filtered results" : "All registered schools"}</span>
              </div>

              {schoolsError && (
                <div className="platform-directory-error" role="alert">
                  <p>{schoolsError}</p>
                  <button type="button" onClick={() => setReloadCount((count) => count + 1)}>
                    Retry
                  </button>
                </div>
              )}

              <div className="platform-table-wrap">
                <table className="platform-school-table" aria-label="School directory">
                  <thead>
                    <tr>
                      <th scope="col">School</th>
                      <th scope="col">School ID</th>
                      <th scope="col">Contact email</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSchools && schools.length === 0 ? (
                      <tr><td colSpan="5" className="platform-table-message" role="status">Loading schools…</td></tr>
                    ) : schools.length > 0 ? (
                      schools.map((school) => (
                        <tr key={school.id || school._id}>
                          <td>
                            <button type="button" className="platform-school-name-button" onClick={() => openSchoolDetails(school)}>{school.name || "Unnamed school"}</button>
                          </td>
                          <td><code>{school.slug || "—"}</code></td>
                          <td>{school.contactEmail || "—"}</td>
                          <td><span className={`platform-status-pill platform-status-${school.status || "unknown"}`}>{statusLabel(school.status)}</span></td>
                          <td>{formatDate(school.createdAt)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="platform-table-message">
                          {schoolsError ? "School records could not be loaded." : "No schools match these filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="platform-pagination">
                <span>
                  {pagination.total === 0 ? "No results" : `Showing ${startItem}–${endItem} of ${pagination.total}`}
                </span>
                <div>
                  <button
                    type="button"
                    className="platform-page-button"
                    disabled={loadingSchools || pagination.page <= 1}
                    onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
                  >
                    Previous
                  </button>
                  <span className="platform-page-count">
                    Page {pagination.page}{totalPages > 0 ? ` of ${totalPages}` : ""}
                  </span>
                  <button
                    type="button"
                    className="platform-page-button"
                    disabled={loadingSchools || totalPages === 0 || pagination.page >= totalPages}
                    onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
