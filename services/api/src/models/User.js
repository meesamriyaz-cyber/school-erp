
import mongoose from "mongoose";

const USER_ROLES = [
  "platform_admin",
  "school_admin",
  "principal",
  "teacher",
  "accountant",
  "librarian",
  "transport_manager",
  "student",
  "parent",
];

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      validate: {
        validator(value) {
          return this.role === "platform_admin"
            ? value == null
            : value != null;
        },
        message:
          "School users must belong to a school; platform administrators must not belong to a school.",
      },
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

    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },

    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
      maxlength: 20,
    },

    role: {
      type: String,
      required: true,
      enum: USER_ROLES,
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
      index: true,
    },
    
    authVersion: {
    type: Number,
    default: 0,
    min: 0,
    },


    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// School users: an email can be reused by different schools,
// but not by two users within the same school.
userSchema.index(
  { tenantId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tenantId: { $type: "objectId" },
      email: { $type: "string" },
    },
  }
);

// Platform administrators use a separate global email namespace.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: "platform_admin",
      email: { $type: "string" },
    },
  }
);

const User = mongoose.model("User", userSchema);

export { USER_ROLES };
export default User;
