import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import SchoolSubscription from "../models/SchoolSubscription.js";
import PlatformInvoice from "../models/PlatformInvoice.js";
import PlatformPayment from "../models/PlatformPayment.js";
import PlatformCommercialEvent from "../models/PlatformCommercialEvent.js";

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const validId = (value) => mongoose.isObjectIdOrHexString(value);
const actorId = (req) => req.auth?.userId;
const finiteAmount = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function periodEnd(start, interval) {
  if (interval === "monthly") return new Date(new Date(start).setMonth(new Date(start).getMonth() + 1));
  if (interval === "annual") return new Date(new Date(start).setFullYear(new Date(start).getFullYear() + 1));
  return null;
}

export async function listSubscriptionPlans(req, res, next) {
  try {
    const filter = req.query.includeArchived === "true" ? {} : { isArchived: false };
    const plans = await SubscriptionPlan.find(filter).sort({ billingInterval: 1, amount: 1, name: 1 }).lean();
    return res.json({ success: true, data: plans.map(p => ({ ...p, id: String(p._id) })) });
  } catch (error) { return next(error); }
}

export async function createSubscriptionPlan(req, res, next) {
  try {
    const { name, description = "", billingInterval, amount, currency = "INR", annualDiscountPercent = 0, features = [] } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) return fail(res, 400, "Plan name is required");
    if (!["monthly", "annual", "one_time"].includes(billingInterval)) return fail(res, 400, "Invalid billing interval");
    if (!finiteAmount(amount) || Number(amount) <= 0) return fail(res, 400, "Plan amount must be greater than zero");
    if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) return fail(res, 400, "Currency must be a three-letter code");
    if (!Number.isFinite(Number(annualDiscountPercent)) || Number(annualDiscountPercent) < 0 || Number(annualDiscountPercent) > 100 || (billingInterval !== "annual" && Number(annualDiscountPercent) !== 0)) return fail(res, 400, "Discount is only valid for annual plans and must be between 0 and 100");
    if (!Array.isArray(features) || features.some(x => typeof x !== "string" || x.length > 120)) return fail(res, 400, "Features must be a list of short text values");
    const plan = await SubscriptionPlan.create({ name: name.trim(), description, billingInterval, amount: money(amount), currency: currency.toUpperCase(), annualDiscountPercent: Number(annualDiscountPercent), features, createdBy: actorId(req) });
    await PlatformCommercialEvent.create({ actorUserId: actorId(req), action: "PLAN_CREATED", details: { planId: String(plan._id), billingInterval, amount: plan.amount, currency: plan.currency } });
    return res.status(201).json({ success: true, data: { plan: { ...plan.toObject(), id: String(plan._id) } } });
  } catch (error) { if (error.name === "ValidationError") return fail(res, 400, "Invalid plan details"); return next(error); }
}

export async function updateSubscriptionPlan(req, res, next) {
  try {
    if (!validId(req.params.planId)) return fail(res, 400, "Invalid plan ID");
    const allowed = ["name", "description", "amount", "currency", "annualDiscountPercent", "features", "isActive"];
    const updates = Object.fromEntries(Object.entries(req.body ?? {}).filter(([key]) => allowed.includes(key)));
    if (!Object.keys(updates).length || Object.keys(updates).length !== Object.keys(req.body ?? {}).length) return fail(res, 400, "Provide supported plan fields only");
    if ("amount" in updates && (!finiteAmount(updates.amount) || Number(updates.amount) <= 0)) return fail(res, 400, "Plan amount must be greater than zero");
    if ("annualDiscountPercent" in updates && (!Number.isFinite(Number(updates.annualDiscountPercent)) || Number(updates.annualDiscountPercent) < 0 || Number(updates.annualDiscountPercent) > 100)) return fail(res, 400, "Discount must be between 0 and 100");
    if ("currency" in updates && (typeof updates.currency !== "string" || !/^[A-Za-z]{3}$/.test(updates.currency))) return fail(res, 400, "Invalid currency");
    if ("amount" in updates) updates.amount = money(updates.amount);
    if ("currency" in updates) updates.currency = updates.currency.toUpperCase();
    const plan = await SubscriptionPlan.findOneAndUpdate({ _id: req.params.planId, isArchived: false }, { $set: updates }, { new: true, runValidators: true }).lean();
    if (!plan) return fail(res, 404, "Subscription plan not found");
    await PlatformCommercialEvent.create({ actorUserId: actorId(req), action: "PLAN_UPDATED", details: { planId: String(plan._id), changedFields: Object.keys(updates) } });
    return res.json({ success: true, data: { plan: { ...plan, id: String(plan._id) } } });
  } catch (error) { if (error.name === "ValidationError") return fail(res, 400, "Invalid plan details"); return next(error); }
}

export async function archiveSubscriptionPlan(req, res, next) {
  try {
    if (!validId(req.params.planId)) return fail(res, 400, "Invalid plan ID");
    const plan = await SubscriptionPlan.findOneAndUpdate({ _id: req.params.planId, isArchived: false }, { $set: { isArchived: true, isActive: false } }, { new: true }).lean();
    if (!plan) return fail(res, 404, "Subscription plan not found");
    await PlatformCommercialEvent.create({ actorUserId: actorId(req), action: "PLAN_ARCHIVED", details: { planId: String(plan._id) } });
    return res.json({ success: true, message: "Plan archived", data: { id: String(plan._id) } });
  } catch (error) { return next(error); }
}

export async function getSchoolSubscription(req, res, next) {
  try {
    if (!validId(req.params.schoolId)) return fail(res, 400, "Invalid school ID");
    const school = await Tenant.findById(req.params.schoolId).select("_id name status trialStartedAt trialEndsAt trialExpiredAt trialHistory").lean();
    if (!school) return fail(res, 404, "School not found");
    const subscription = await SchoolSubscription.findOne({ tenantId: school._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: { school, subscription } });
  } catch (error) { return next(error); }
}

export async function startSchoolTrial(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { schoolId } = req.params;
    if (!validId(schoolId)) return fail(res, 400, "Invalid school ID");
    const now = new Date();
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    let school, subscription;
    await session.withTransaction(async () => {
      school = await Tenant.findById(schoolId).session(session);
      if (!school) throw Object.assign(new Error("School not found"), { statusCode: 404 });
      if (school.status === "suspended" || school.status === "trial_expired") {
        throw Object.assign(new Error("This school cannot start a trial while suspended or already expired"), { statusCode: 409 });
      }
      const existingSubscription = await SchoolSubscription.findOne({ tenantId: school._id }).session(session);
      if (existingSubscription || school.trialStartedAt || (school.trialHistory || []).length > 0) {
        throw Object.assign(new Error("A free trial has already been used by this school"), { statusCode: 409 });
      }
      if (school.status !== "pending" && school.status !== "active") {
        throw Object.assign(new Error("School is not eligible for a trial"), { statusCode: 409 });
      }
      [subscription] = await SchoolSubscription.create([{
        tenantId: school._id, planId: null, planName: "30-day Free Trial", billingInterval: "trial",
        amount: 0, currency: "INR", status: "active", isTrial: true, trialEndsAt: endsAt,
        startsAt: now, currentPeriodStartsAt: now, currentPeriodEndsAt: endsAt,
        createdBy: actorId(req), notes: "One-time 30-day platform trial",
      }], { session });
      school.status = "active";
      school.trialStartedAt = now;
      school.trialEndsAt = endsAt;
      school.trialExpiredAt = null;
      school.trialHistory.push({ startedAt: now, endsAt, startedBy: actorId(req) || null });
      await school.save({ session });
      await User.updateMany(
        { tenantId: school._id, role: "school_admin", status: "pending" },
        { $set: { status: "active" } },
        { session },
      );
      await PlatformCommercialEvent.create([{
        actorUserId: actorId(req), tenantId: school._id, subscriptionId: subscription._id,
        action: "TRIAL_STARTED",
        details: { durationDays: 30, startsAt: now, endsAt, amount: 0, currency: "INR" },
      }], { session });
    });
    return res.status(201).json({
      success: true, message: "30-day free trial started",
      data: { school: { id: String(school._id), name: school.name, status: school.status, trialStartedAt: school.trialStartedAt, trialEndsAt: school.trialEndsAt }, subscription },
    });
  } catch (error) {
    if (error.statusCode) return fail(res, error.statusCode, error.message);
    if (error.name === "ValidationError") return fail(res, 400, "Unable to start the free trial");
    return next(error);
  } finally { await session.endSession(); }
}

export async function assignSchoolSubscription(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { schoolId } = req.params;
    const { planId, notes = "", dueAt } = req.body ?? {};
    if (!validId(schoolId) || !validId(planId)) return fail(res, 400, "Valid school and plan IDs are required");
    const [school, plan] = await Promise.all([Tenant.findById(schoolId).session(session), SubscriptionPlan.findOne({ _id: planId, isActive: true, isArchived: false }).session(session)]);
    if (!school) return fail(res, 404, "School not found");
    if (!plan) return fail(res, 404, "Active subscription plan not found");
    const now = new Date();
    const discountAmount = plan.billingInterval === "annual" ? money(plan.amount * Number(plan.annualDiscountPercent || 0) / 100) : 0;
    const charge = money(plan.amount - discountAmount);
    const invoiceNumber = `PS-${now.getTime()}-${String(school._id).slice(-6)}`;
    let subscription, invoice;
    await session.withTransaction(async () => {
      [subscription] = await SchoolSubscription.create([{
        tenantId: school._id, planId: plan._id, planName: plan.name, billingInterval: plan.billingInterval,
        amount: charge, currency: plan.currency, annualDiscountPercent: Number(plan.annualDiscountPercent || 0),
        status: "pending", startsAt: now, currentPeriodStartsAt: now,
        currentPeriodEndsAt: periodEnd(now, plan.billingInterval), nextBillingAt: periodEnd(now, plan.billingInterval),
        lifetimeAccess: plan.billingInterval === "one_time", createdBy: actorId(req), notes,
      }], { session });
      [invoice] = await PlatformInvoice.create([{
        tenantId: school._id, subscriptionId: subscription._id, invoiceNumber,
        items: [{ description: `${plan.name} (${plan.billingInterval})`, quantity: 1, unitAmount: plan.amount, amount: plan.amount }],
        subtotal: plan.amount, discountAmount, totalAmount: charge, currency: plan.currency,
        issuedAt: now, dueAt: dueAt ? new Date(dueAt) : new Date(now.getTime() + 7 * 86400000),
        status: "issued", notes, createdBy: actorId(req),
      }], { session });
      await PlatformCommercialEvent.create([{ actorUserId: actorId(req), tenantId: school._id, subscriptionId: subscription._id, invoiceId: invoice._id, action: "SUBSCRIPTION_ASSIGNED", details: { planId: String(plan._id), billingInterval: plan.billingInterval, amount: charge, currency: plan.currency, annualDiscountPercent: Number(plan.annualDiscountPercent || 0) } }], { session });
    });
    return res.status(201).json({ success: true, message: "Subscription assigned; access remains pending until invoice payment is confirmed", data: { subscription, invoice } });
  } catch (error) { if (error.name === "ValidationError") return fail(res, 400, "Invalid subscription details"); return next(error); }
  finally { await session.endSession(); }
}

export async function listPlatformInvoices(req, res, next) {
  try {
    const filter = {};
    if (req.query.schoolId !== undefined) {
      if (!validId(req.query.schoolId)) return fail(res, 400, "Invalid school ID");
      filter.tenantId = req.query.schoolId;
    }
    const invoices = await PlatformInvoice.find(filter).populate("tenantId", "name slug").sort({ issuedAt: -1 }).limit(100).lean();
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const payments = invoiceIds.length
      ? await PlatformPayment.find({ invoiceId: { $in: invoiceIds } }).sort({ paymentDate: -1 }).lean()
      : [];
    const paymentsByInvoice = new Map();
    for (const payment of payments) {
      const key = String(payment.invoiceId);
      paymentsByInvoice.set(key, [...(paymentsByInvoice.get(key) || []), payment]);
    }
    const data = invoices.map((invoice) => {
      const invoicePayments = paymentsByInvoice.get(String(invoice._id)) || [];
      const paidAmount = money(invoicePayments.filter((payment) => payment.status === "recorded").reduce((sum, payment) => sum + payment.amount, 0));
      return { ...invoice, payments: invoicePayments, paidAmount, outstandingAmount: money(invoice.totalAmount - paidAmount) };
    });
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
}

export async function recordPlatformPayment(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { invoiceId } = req.params;
    const { amount, paymentDate = new Date(), method, reference = "", notes = "" } = req.body ?? {};
    if (!validId(invoiceId)) return fail(res, 400, "Invalid invoice ID");
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return fail(res, 400, "Payment amount must be greater than zero");
    if (!["bank_transfer", "upi", "card", "cash", "cheque", "other"].includes(method)) return fail(res, 400, "Invalid payment method");
    let result;
    await session.withTransaction(async () => {
      const invoice = await PlatformInvoice.findById(invoiceId).session(session);
      if (!invoice || ["void", "paid"].includes(invoice.status)) throw Object.assign(new Error("Invoice is unavailable for payment"), { statusCode: 409 });
      const paid = await PlatformPayment.aggregate([{ $match: { invoiceId: invoice._id, status: "recorded" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).session(session);
      const outstanding = money(invoice.totalAmount - (paid[0]?.total || 0));
      if (Number(amount) > outstanding + 0.001) throw Object.assign(new Error("Payment exceeds invoice outstanding balance"), { statusCode: 400 });
      const [payment] = await PlatformPayment.create([{
        tenantId: invoice.tenantId, invoiceId: invoice._id, amount: money(amount), currency: invoice.currency,
        paymentDate: new Date(paymentDate), method, reference, notes, recordedBy: actorId(req),
      }], { session });
      const collected = money(outstanding - Number(amount));
      invoice.status = collected <= 0 ? "paid" : "partially_paid";
      await invoice.save({ session });
      await PlatformCommercialEvent.create([{ actorUserId: actorId(req), tenantId: invoice.tenantId, subscriptionId: invoice.subscriptionId, invoiceId: invoice._id, paymentId: payment._id, action: "PAYMENT_RECORDED", details: { amount: payment.amount, currency: payment.currency, method: payment.method, invoiceStatus: invoice.status } }], { session });
      if (invoice.subscriptionId && invoice.status === "paid") {
        const subscription = await SchoolSubscription.findOne({ _id: invoice.subscriptionId, tenantId: invoice.tenantId, status: { $in: ["pending", "active", "past_due"] } }).session(session);
        if (subscription) {
          await SchoolSubscription.updateMany({ tenantId: invoice.tenantId, _id: { $ne: subscription._id }, status: "active" }, { $set: { status: "cancelled", cancelledAt: new Date() } }, { session });
          const wasPending = subscription.status === "pending";
          if (!wasPending && subscription.billingInterval !== "one_time" && subscription.currentPeriodEndsAt) {
            subscription.currentPeriodStartsAt = subscription.currentPeriodEndsAt;
            subscription.currentPeriodEndsAt = periodEnd(subscription.currentPeriodStartsAt, subscription.billingInterval);
            subscription.nextBillingAt = subscription.currentPeriodEndsAt;
          }
          subscription.status = "active";
          await subscription.save({ session });
          await PlatformCommercialEvent.create([{ actorUserId: actorId(req), tenantId: invoice.tenantId, subscriptionId: subscription._id, invoiceId: invoice._id, action: wasPending ? "SUBSCRIPTION_ACTIVATED" : "SUBSCRIPTION_RENEWED", details: { billingInterval: subscription.billingInterval, lifetimeAccess: subscription.lifetimeAccess } }], { session });
          await Tenant.updateOne({ _id: invoice.tenantId, status: { $in: ["pending", "active", "trial_expired"] } }, { $set: { status: "active", trialEndsAt: null, trialExpiredAt: null } }, { session });
        }
      }
      result = { payment, invoice };
    });
    return res.status(201).json({ success: true, message: "Payment recorded", data: result });
  } catch (error) { if (error.statusCode) return fail(res, error.statusCode, error.message); return next(error); }
  finally { await session.endSession(); }
}

export async function getBusinessOverview(req, res, next) {
  try {
    const now = new Date();
    const renewalWindowEnd = new Date(now.getTime() + 30 * 86400000);
    const [schools, allSubscriptions, invoiceStats, paymentStats] = await Promise.all([
      Tenant.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      SchoolSubscription.aggregate([
        {
          $group: {
            _id: { currency: "$currency", status: "$status", billingInterval: "$billingInterval" },
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
            renewalsDueSoon: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$status", "active"] }, { $gte: ["$nextBillingAt", now] }, { $lte: ["$nextBillingAt", renewalWindowEnd] }] },
                  1,
                  0,
                ],
              },
            },
            trialsEndingSoon: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$status", "active"] }, { $eq: ["$billingInterval", "trial"] }, { $gte: ["$trialEndsAt", now] }, { $lte: ["$trialEndsAt", renewalWindowEnd] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      PlatformInvoice.aggregate([
        { $match: { status: { $nin: ["draft", "void"] } } },
        {
          $lookup: {
            from: "platformpayments",
            let: { invoiceId: "$_id" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$invoiceId", "$$invoiceId"] }, { $eq: ["$status", "recorded"] }] } } },
              { $group: { _id: null, paid: { $sum: "$amount" } } },
            ],
            as: "recordedPayments",
          },
        },
        { $addFields: { paidAmount: { $ifNull: [{ $arrayElemAt: ["$recordedPayments.paid", 0] }, 0] } } },
        { $addFields: { outstandingAmount: { $max: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } } },
        {
          $group: {
            _id: "$currency",
            invoiced: { $sum: "$totalAmount" },
            outstanding: { $sum: "$outstandingAmount" },
            overdue: { $sum: { $cond: [{ $and: [{ $lt: ["$dueAt", now] }, { $gt: ["$outstandingAmount", 0] }] }, "$outstandingAmount", 0] } },
            invoiceCount: { $sum: 1 },
            outstandingInvoiceCount: { $sum: { $cond: [{ $gt: ["$outstandingAmount", 0] }, 1, 0] } },
            overdueInvoiceCount: { $sum: { $cond: [{ $and: [{ $lt: ["$dueAt", now] }, { $gt: ["$outstandingAmount", 0] }] }, 1, 0] } },
          },
        },
      ]),
      PlatformPayment.aggregate([
        { $match: { status: "recorded" } },
        { $group: { _id: "$currency", collected: { $sum: "$amount" }, paymentCount: { $sum: 1 } } },
      ]),
    ]);

    const subscriptionMetrics = {};
    const subscriptionStatusCounts = {};
    let renewalsDueSoon = 0;
    let trialsEndingSoon = 0;
    for (const group of allSubscriptions) {
      const { currency, status, billingInterval } = group._id;
      const count = group.count || 0;
      const amount = group.amount || 0;
      subscriptionStatusCounts[status] = (subscriptionStatusCounts[status] || 0) + count;
      subscriptionMetrics[currency] ??= {
        mrr: 0, arr: 0, lifetimeSales: 0, activeSubscriptions: 0,
        pendingSubscriptions: 0, pastDueSubscriptions: 0, renewalsDueSoon: 0,
      };
      const metrics = subscriptionMetrics[currency];
      if (status === "active") {
        if (billingInterval === "trial") metrics.trialSubscriptions += count;
        else metrics.activeSubscriptions += count;
        metrics.renewalsDueSoon += group.renewalsDueSoon || 0;
        renewalsDueSoon += group.renewalsDueSoon || 0;
        metrics.trialsEndingSoon += group.trialsEndingSoon || 0;
        trialsEndingSoon += group.trialsEndingSoon || 0;
        if (billingInterval === "monthly") metrics.mrr += amount;
        else if (billingInterval === "annual") metrics.mrr += amount / 12;
        if (billingInterval !== "one_time") {
          metrics.arr += billingInterval === "annual" ? amount : amount * 12;
        }
      } else if (status === "pending") {
        metrics.pendingSubscriptions += count;
      } else if (status === "past_due") {
        metrics.pastDueSubscriptions += count;
      }
    }

    const lifetime = await PlatformInvoice.aggregate([
      { $match: { status: "paid", subscriptionId: { $ne: null } } },
      { $lookup: { from: "schoolsubscriptions", localField: "subscriptionId", foreignField: "_id", as: "subscription" } },
      { $unwind: "$subscription" },
      { $match: { "subscription.billingInterval": "one_time" } },
      { $group: { _id: "$currency", sales: { $sum: "$totalAmount" } } },
    ]);
    for (const item of lifetime) {
      subscriptionMetrics[item._id] ??= {
        mrr: 0, arr: 0, lifetimeSales: 0, activeSubscriptions: 0,
        pendingSubscriptions: 0, pastDueSubscriptions: 0, renewalsDueSoon: 0,
      };
      subscriptionMetrics[item._id].lifetimeSales = item.sales;
    }

    const schoolStatusCounts = Object.fromEntries(schools.map((item) => [item._id, item.count]));
    const totalSchools = schools.reduce((sum, item) => sum + item.count, 0);
    const activeSchools = schoolStatusCounts.active || 0;
    const recentActivity = await PlatformCommercialEvent.find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(8)
      .populate("tenantId", "name slug")
      .lean();

    return res.json({
      success: true,
      data: {
        generatedAt: now,
        schools: { total: totalSchools, active: activeSchools, byStatus: schools },
        subscriptions: subscriptionMetrics,
        subscriptionStatusCounts,
        renewalsDueSoon,
        trialsEndingSoon,
        invoiced: invoiceStats,
        collected: paymentStats,
        recentActivity,
      },
    });
  } catch (error) {
    return next(error);
  }
}


export async function createRenewalInvoice(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { subscriptionId } = req.params;
    if (!validId(subscriptionId)) return fail(res, 400, "Invalid subscription ID");
    let result;
    await session.withTransaction(async () => {
      const subscription = await SchoolSubscription.findById(subscriptionId).session(session);
      if (!subscription) throw Object.assign(new Error("Subscription not found"), { statusCode: 404 });
      if (subscription.billingInterval === "one_time" || subscription.lifetimeAccess) throw Object.assign(new Error("Lifetime subscriptions do not renew"), { statusCode: 400 });
      if (subscription.status !== "active" || !subscription.nextBillingAt || subscription.nextBillingAt > new Date()) throw Object.assign(new Error("Subscription is not due for renewal"), { statusCode: 409 });
      const duplicate = await PlatformInvoice.findOne({ subscriptionId: subscription._id, status: { $in: ["issued", "partially_paid", "overdue"] }, notes: "Automated subscription renewal" }).session(session);
      if (duplicate) throw Object.assign(new Error("An unpaid renewal invoice already exists"), { statusCode: 409 });
      const school = await Tenant.findById(subscription.tenantId).select("name").session(session);
      const now = new Date();
      const invoiceNumber = `RN-${now.getTime()}-${String(subscription.tenantId).slice(-6)}`;
      const [invoice] = await PlatformInvoice.create([{
        tenantId: subscription.tenantId, subscriptionId: subscription._id, invoiceNumber,
        items: [{ description: `${subscription.planName} renewal (${subscription.billingInterval})`, quantity: 1, unitAmount: subscription.amount, amount: subscription.amount }],
        subtotal: subscription.amount, discountAmount: 0, totalAmount: subscription.amount, currency: subscription.currency,
        issuedAt: now, dueAt: new Date(now.getTime() + 7 * 86400000), status: "issued",
        notes: "Automated subscription renewal", createdBy: actorId(req),
      }], { session });
      subscription.status = "past_due";
      await subscription.save({ session });
      await PlatformCommercialEvent.create([{ actorUserId: actorId(req), tenantId: subscription.tenantId, subscriptionId: subscription._id, invoiceId: invoice._id, action: "RENEWAL_INVOICED", details: { amount: invoice.totalAmount, currency: invoice.currency, schoolName: school?.name } }], { session });
      result = { subscription, invoice };
    });
    return res.status(201).json({ success: true, message: "Renewal invoice created", data: result });
  } catch (error) { if (error.statusCode) return fail(res, error.statusCode, error.message); return next(error); }
  finally { await session.endSession(); }
}

export async function reversePlatformPayment(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { paymentId } = req.params;
    const { reason } = req.body ?? {};
    if (!validId(paymentId)) return fail(res, 400, "Invalid payment ID");
    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 300) return fail(res, 400, "A reversal reason of up to 300 characters is required");
    let result;
    await session.withTransaction(async () => {
      const payment = await PlatformPayment.findOne({ _id: paymentId, status: "recorded" }).session(session);
      if (!payment) throw Object.assign(new Error("Recorded payment not found"), { statusCode: 404 });
      const invoice = await PlatformInvoice.findById(payment.invoiceId).session(session);
      if (!invoice || invoice.tenantId.toString() !== payment.tenantId.toString()) throw Object.assign(new Error("Payment invoice not found"), { statusCode: 404 });
      payment.status = "reversed";
      payment.reversedAt = new Date();
      payment.reversedBy = new mongoose.Types.ObjectId(actorId(req));
      payment.reversalReason = reason.trim();
      await payment.save({ session });
      const totals = await PlatformPayment.aggregate([{ $match: { invoiceId: invoice._id, status: "recorded" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).session(session);
      const paid = money(totals[0]?.total || 0);
      invoice.status = paid >= invoice.totalAmount ? "paid" : paid > 0 ? "partially_paid" : "issued";
      await invoice.save({ session });
      if (invoice.subscriptionId && invoice.status !== "paid") {
        const subscription = await SchoolSubscription.findOne({ _id: invoice.subscriptionId, tenantId: invoice.tenantId, status: { $in: ["active", "past_due"] } }).session(session);
        if (subscription) {
          if (subscription.billingInterval === "one_time" || subscription.lifetimeAccess) {
            subscription.status = "cancelled";
            subscription.cancelledAt = new Date();
          } else {
            subscription.status = "past_due";
          }
          await subscription.save({ session });
        }
      }
      await PlatformCommercialEvent.create([{ actorUserId: actorId(req), tenantId: payment.tenantId, subscriptionId: invoice.subscriptionId, invoiceId: invoice._id, paymentId: payment._id, action: "PAYMENT_REVERSED", details: { amount: payment.amount, currency: payment.currency, reason: reason.trim(), invoiceStatus: invoice.status } }], { session });
      result = { payment, invoice };
    });
    return res.json({ success: true, message: "Payment reversed and invoice balance recalculated", data: result });
  } catch (error) { if (error.statusCode) return fail(res, error.statusCode, error.message); return next(error); }
  finally { await session.endSession(); }
}


export async function listCommercialEvents(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit ?? "25", 10)));
    const filter = {};
    if (req.query.schoolId !== undefined) {
      if (!validId(req.query.schoolId)) return fail(res, 400, "Invalid school ID");
      filter.tenantId = req.query.schoolId;
    }
    if (req.query.action !== undefined) filter.action = req.query.action;
    const [events, total] = await Promise.all([
      PlatformCommercialEvent.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate("tenantId", "name slug").lean(),
      PlatformCommercialEvent.countDocuments(filter),
    ]);
    return res.json({ success: true, data: events, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { return next(error); }
}
