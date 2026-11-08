
import mongoose from "mongoose";

const studentAddressSchema = new mongoose.Schema({
  line1: { type: String, trim: true, default: "", maxlength: 120 }, line2: { type: String, trim: true, default: "", maxlength: 120 },
  city: { type: String, trim: true, default: "", maxlength: 80 }, district: { type: String, trim: true, default: "", maxlength: 80 },
  state: { type: String, trim: true, default: "", maxlength: 80 }, postalCode: { type: String, trim: true, default: "", maxlength: 12 },
  country: { type: String, trim: true, default: "", maxlength: 80 },
}, { _id: false, versionKey: false });

const studentSchema = new mongoose.Schema(
  {
    // Assigned by the server from the authenticated user's school.
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "School tenant is required"],
      immutable: true,
    },

    // Explicitly linked by a school administrator to a student login account.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Admission numbers must be unique within each school,
    // not globally across the entire ERP.
    admissionNumber: {
      type: String,
      required: [true, "Admission number is required"],
      trim: true,
      uppercase: true,
      maxlength: 50,
    },

    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: 80,
    },

    lastName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    photoUrl: {
      type: String, trim: true, default: null, maxlength: 2048,
      validate: {
        validator(value) {
          if (value === null || value === undefined || value === "") return true;
          try { return new URL(value).protocol === "https:"; } catch { return false; }
        },
        message: "Student photo URL must be a valid HTTPS URL",
      },
    },
    address: { type: studentAddressSchema, default: () => ({}) },

    gender: {
      type: String,
      enum: ["male", "female", "other", "not_specified"],
      default: "not_specified",
    },

    admissionDate: {
      type: Date,
      required: [true, "Admission date is required"],
      default: Date.now,
    },

    guardianName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 160,
    },

    guardianPhone: {
      type: String,
      trim: true,
      default: null,
      maxlength: 20,
    },

    guardianEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      maxlength: 254,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "withdrawn"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// An admission number can be reused by another school,
// but not by two students within the same school.
studentSchema.index(
  { tenantId: 1, admissionNumber: 1 },
  { unique: true }
);

// Supports common school-scoped status filters.
studentSchema.index({ tenantId: 1, status: 1 });
studentSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);

const Student = mongoose.model("Student", studentSchema);

export default Student;
