import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import SchoolSubscription from "../models/SchoolSubscription.js";
import PlatformInvoice from "../models/PlatformInvoice.js";
import PlatformPayment from "../models/PlatformPayment.js";

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
    return res.json({ success: true, data: { plan: { ...plan, id: String(plan._id) } } });
  } catch (error) { if (error.name === "ValidationError") return fail(res, 400, "Invalid plan details"); return next(error); }
}

export async function archiveSubscriptionPlan(req, res, next) {
  try {
    if (!validId(req.params.planId)) return fail(res, 400, "Invalid plan ID");
    const plan = await SubscriptionPlan.findOneAndUpdate({ _id: req.params.planId, isArchived: false }, { $set: { isArchived: true, isActive: false } }, { new: true }).lean();
    if (!plan) return fail(res, 404, "Subscription plan not found");
    return res.json({ success: true, message: "Plan archived", data: { id: String(plan._id) } });
  } catch (error) { return next(error); }
}

export async function getSchoolSubscription(req, res, next) {
  try {
    if (!validId(req.params.schoolId)) return fail(res, 400, "Invalid school ID");
    const school = await Tenant.findById(req.params.schoolId).select("_id name").lean();
    if (!school) return fail(res, 404, "School not found");
    const subscription = await SchoolSubscription.findOne({ tenantId: school._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: { school, subscription } });
  } catch (error) { return next(error); }
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
      await SchoolSubscription.updateMany({ tenantId: school._id, status: { $in: ["pending", "active", "past_due"] } }, { $set: { status: "cancelled", cancelledAt: now } }, { session });
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
    return res.json({ success: true, data: invoices });
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
      if (invoice.subscriptionId && invoice.status === "paid") {
        const subscription = await SchoolSubscription.findOne({ _id: invoice.subscriptionId, tenantId: invoice.tenantId, status: "pending" }).session(session);
        if (subscription) {
          subscription.status = "active";
          await subscription.save({ session });
          await Tenant.updateOne({ _id: invoice.tenantId, status: "pending" }, { $set: { status: "active" } }, { session });
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
    const [schools, subscriptions, invoiceStats, paymentStats] = await Promise.all([
      Tenant.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      SchoolSubscription.find({ status: "active" }).lean(),
      PlatformInvoice.aggregate([{ $match: { status: { $nin: ["draft", "void"] } } }, { $group: { _id: "$currency", invoiced: { $sum: "$totalAmount" }, invoiceCount: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $lt: ["$dueAt", new Date()] }, { $ne: ["$status", "paid"] }] }, "$totalAmount", 0] } } } }]),
      PlatformPayment.aggregate([{ $match: { status: "recorded" } }, { $group: { _id: "$currency", collected: { $sum: "$amount" }, paymentCount: { $sum: 1 } } }]),
    ]);
    const activeSchools = await Tenant.countDocuments({ status: "active" });
    const subscriptionMetrics = {};
    for (const sub of subscriptions) {
      const key = sub.currency;
      subscriptionMetrics[key] ??= { mrr: 0, arr: 0, lifetimeSales: 0, activeSubscriptions: 0 };
      subscriptionMetrics[key].activeSubscriptions += 1;
      if (sub.billingInterval === "monthly") subscriptionMetrics[key].mrr += sub.amount;
      else if (sub.billingInterval === "annual") subscriptionMetrics[key].mrr += sub.amount / 12;
      if (sub.billingInterval !== "one_time") subscriptionMetrics[key].arr += sub.billingInterval === "annual" ? sub.amount : sub.amount * 12;
    }
    const lifetime = await PlatformInvoice.aggregate([{ $match: { status: "paid", subscriptionId: { $ne: null } } }, { $lookup: { from: "schoolsubscriptions", localField: "subscriptionId", foreignField: "_id", as: "subscription" } }, { $unwind: "$subscription" }, { $match: { "subscription.billingInterval": "one_time" } }, { $group: { _id: "$currency", sales: { $sum: "$totalAmount" } } }]);
    for (const item of lifetime) { subscriptionMetrics[item._id] ??= { mrr: 0, arr: 0, lifetimeSales: 0, activeSubscriptions: 0 }; subscriptionMetrics[item._id].lifetimeSales = item.sales; }
    return res.json({ success: true, data: { schools: { total: await Tenant.countDocuments(), active: activeSchools, byStatus: schools }, subscriptions: subscriptionMetrics, invoiced: invoiceStats, collected: paymentStats } });
  } catch (error) { return next(error); }
}
