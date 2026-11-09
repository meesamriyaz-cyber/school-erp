import mongoose from "mongoose";
import Announcement from "../models/Announcement.js";
import { enqueueAnnouncementPublishedNotifications } from "./notificationEnqueueService.js";

export async function publishAnnouncementWithNotifications({ filter, update, tenantId }) {
  const session = await mongoose.startSession();
  let published;
  try {
    await session.withTransaction(async () => {
      published = await Announcement.findOneAndUpdate(
        filter,
        update,
        { new: true, runValidators: true, session },
      );
      if (!published) {
        const error = new Error("Announcement changed; reload and try again");
        error.code = "ANNOUNCEMENT_CONFLICT";
        throw error;
      }
      await enqueueAnnouncementPublishedNotifications({
        tenantId,
        announcement: published,
        session,
      });
    });
    return published;
  } finally {
    await session.endSession();
  }
}
