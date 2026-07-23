import { Types } from "mongoose";

export enum GuideStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
}

/**
 * Experience tier a traveller books. Derived from `completedGuidings` at
 * selection time — never stored on the guide, since a guide crosses tiers as
 * their count grows.
 */
export enum GuideCategory {
    STANDARD = "STANDARD",
    PREMIUM = "PREMIUM",
}

export interface IGuideApplication {
    user: Types.ObjectId;
    nidPhoto: string;
    division: Types.ObjectId;
    status: GuideStatus;
    /** Successful guidings credited by an admin; drives the category tier. */
    completedGuidings: number;
    /** Least-recently-assigned round-robin cursor; unset until first assigned. */
    lastAssignedAt?: Date;
    /** When the application was approved — the "became a guide" date, tie-breaks rotation. */
    approvedAt?: Date;
}
