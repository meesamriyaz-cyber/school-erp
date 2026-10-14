
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    authVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },


    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    
    previousRefreshTokenHash: {
    type: String,
    default: null,
    select: false,
    },

    previousRefreshTokenRotatedAt: {
    type: Date,
    default: null,
    },


    expiresAt: {
      type: Date,
      required: true,
    },
    absoluteExpiresAt: {
        type: Date,
        required: true,
        },

    revokedAt: {
      type: Date,
      default: null,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);


sessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

sessionSchema.index({ tenantId: 1, userId: 1 });

const Session = mongoose.model("Session", sessionSchema);

export default Session;
