import { model, Schema } from "mongoose";
import { GuideStatus, IGuideApplication } from "./guide.interface";

const guideApplicationSchema = new Schema<IGuideApplication>({
    // `unique` guarantees at the DB level that a user can hold only one
    // application at a time; the service also checks up-front for a friendly
    // error message before hitting this index.
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
    },
    nidPhoto: { type: String, required: true },
    division: {
        type: Schema.Types.ObjectId,
        ref: "Division",
        required: true,
    },
    status: {
        type: String,
        enum: Object.values(GuideStatus),
        default: GuideStatus.PENDING,
    },
    // Successful guidings credited by admins; a guide's category tier is derived
    // from this at assignment time (see resolveGuideCategory).
    completedGuidings: { type: Number, default: 0, min: 0 },
    // Round-robin cursor: assignment claims the guide whose lastAssignedAt is
    // oldest (unset sorts first), giving fair rotation without a fragile index.
    lastAssignedAt: { type: Date },
    // Set when the application is approved — the precise "became a guide" date,
    // used to tie-break rotation among never-assigned guides.
    approvedAt: { type: Date },
}, {
    timestamps: true,
    versionKey: false,
});

export const GuideApplication = model<IGuideApplication>(
    "GuideApplication",
    guideApplicationSchema
);
