import httpStatus from "http-status-codes";
import { ClientSession, Types } from "mongoose";
import AppError from "../../error/AppError";
import { Division } from "../division/division.model";
import { Role } from "../user/user.interface";
import { User } from "../user/user.model";
import {
    guideDivisionSearchableFields,
    guidingCountFilterForCategory,
    guideUserSearchableFields,
} from "./guide.constant";
import { GuideCategory, GuideStatus } from "./guide.interface";
import { GuideApplication } from "./guide.model";

/**
 * Create a new guide application for the authenticated user.
 *
 * Edge cases handled:
 *  - The chosen division must exist.
 *  - A user may only ever hold a single application (enforced here for a clean
 *    message and by the unique index on the model as a backstop).
 */
const applyForGuide = async (
    userId: string,
    divisionId: string,
    nidPhoto: string
) => {
    const division = await Division.findById(divisionId);
    if (!division) {
        throw new AppError(httpStatus.NOT_FOUND, "Division not found");
    }

    const existingApplication = await GuideApplication.findOne({ user: userId });
    if (existingApplication) {
        throw new AppError(
            httpStatus.CONFLICT,
            "You have already applied to become a guide"
        );
    }

    const application = await GuideApplication.create({
        user: userId,
        division: divisionId,
        nidPhoto,
        status: GuideStatus.PENDING,
    });

    return application;
};

/**
 * Approve or reject a pending guide application.
 *
 * Uses a transaction so the application status and the user's role are updated
 * atomically — on approval the user is promoted to GUIDE, and if either write
 * fails neither is persisted.
 *
 * Only PENDING applications can transition, which prevents invalid moves such
 * as rejecting an already-approved application.
 */
const decideGuideApplication = async (
    applicationId: string,
    status: GuideStatus.APPROVED | GuideStatus.REJECTED
) => {
    const session = await GuideApplication.startSession();
    session.startTransaction();

    try {
        const application = await GuideApplication.findById(applicationId).session(
            session
        );

        if (!application) {
            throw new AppError(httpStatus.NOT_FOUND, "Guide application not found");
        }

        if (application.status !== GuideStatus.PENDING) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                `This application has already been ${application.status.toLowerCase()}`
            );
        }

        application.status = status;

        // Stamp the approval date — this is the guide's "became a guide" moment,
        // used to tie-break the assignment rotation.
        if (status === GuideStatus.APPROVED) {
            application.approvedAt = new Date();
        }

        await application.save({ session });

        // Promotion only happens on approval; a rejected applicant keeps their
        // USER role and can be handled separately if re-application is allowed.
        if (status === GuideStatus.APPROVED) {
            await User.findByIdAndUpdate(
                application.user,
                { role: Role.GUIDE },
                { session, runValidators: true }
            );
        }

        await session.commitTransaction();
        session.endSession();

        const populated = await GuideApplication.findById(applicationId)
            .populate("user", "name email role")
            .populate("division", "name slug");

        return populated;
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

/**
 * List guide applications with filtering, cross-reference search and pagination.
 *
 * `searchTerm` matches the referenced user's name/email or the division's name.
 * Because those live in other collections, the matching ids are resolved first
 * and folded into the GuideApplication filter. The same filter is used for the
 * count so `meta.total` reflects the filtered result, not the whole collection.
 */
const getAllGuideApplications = async (query: Record<string, string>) => {
    const { searchTerm, status, division, user } = query;

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    if (status) {
        filter.status = status;
    }
    if (division) {
        filter.division = division;
    }
    if (user) {
        filter.user = user;
    }

    if (searchTerm) {
        const regex = { $regex: searchTerm, $options: "i" };

        const [matchedUsers, matchedDivisions] = await Promise.all([
            User.find({
                $or: guideUserSearchableFields.map((field) => ({ [field]: regex })),
            }).select("_id"),
            Division.find({
                $or: guideDivisionSearchableFields.map((field) => ({
                    [field]: regex,
                })),
            }).select("_id"),
        ]);

        const userIds = matchedUsers.map((u) => u._id);
        const divisionIds = matchedDivisions.map((d) => d._id);

        filter.$or = [
            { user: { $in: userIds } },
            { division: { $in: divisionIds } },
        ];
    }

    const [data, total] = await Promise.all([
        GuideApplication.find(filter)
            .populate("user", "name email role")
            .populate("division", "name slug")
            .sort("-createdAt")
            .skip(skip)
            .limit(limit),
        GuideApplication.countDocuments(filter),
    ]);

    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPage: Math.ceil(total / limit),
        },
    };
};

/**
 * Fetch the authenticated user's own guide application.
 *
 * Returns `null` (not a 404) when the user has never applied, so the client can
 * treat "no application yet" as a normal state and render the apply form.
 */
const getMyGuideApplication = async (userId: string) => {
    const application = await GuideApplication.findOne({ user: userId }).populate(
        "division",
        "name slug"
    );

    return application;
};

/**
 * Fetch a single guide application by id (bonus endpoint).
 */
const getGuideApplicationById = async (applicationId: string) => {
    if (!Types.ObjectId.isValid(applicationId)) {
        throw new AppError(httpStatus.BAD_REQUEST, "Invalid application id");
    }

    const application = await GuideApplication.findById(applicationId)
        .populate("user", "name email role")
        .populate("division", "name slug");

    if (!application) {
        throw new AppError(httpStatus.NOT_FOUND, "Guide application not found");
    }

    return application;
};

/**
 * Atomically pick and claim a guide for a booking.
 *
 * Eligibility: an APPROVED guide in the tour's division whose live guiding count
 * places them in the requested category. Among those, the least-recently-
 * assigned wins (`lastAssignedAt` ascending puts never-assigned guides first),
 * tie-broken by approval date. The single `findOneAndUpdate` both selects and
 * stamps `lastAssignedAt`, so two concurrent bookings can never grab the same
 * guide.
 *
 * Returns the chosen guide's user id, or `null` when the division has no guide
 * in that category (the caller then books the tour unassigned).
 */
const assignGuide = async (
    division: Types.ObjectId,
    category: GuideCategory,
    session: ClientSession
): Promise<Types.ObjectId | null> => {
    const claimed = await GuideApplication.findOneAndUpdate(
        {
            status: GuideStatus.APPROVED,
            division,
            completedGuidings: guidingCountFilterForCategory(category),
        },
        { $set: { lastAssignedAt: new Date() } },
        {
            sort: { lastAssignedAt: 1, approvedAt: 1 },
            new: true,
            session,
        }
    );

    return claimed ? claimed.user : null;
};

/**
 * Credit one successful guiding to a guide (admin-confirmed). Bumping the count
 * may move the guide into the PREMIUM tier — the category is always derived from
 * this number, never stored, so no extra bookkeeping is needed.
 */
const creditGuiding = async (
    guideUserId: Types.ObjectId | string,
    session: ClientSession
) => {
    return GuideApplication.findOneAndUpdate(
        { user: guideUserId, status: GuideStatus.APPROVED },
        { $inc: { completedGuidings: 1 } },
        { new: true, session }
    );
};

/**
 * List approved guides in a division for an admin picker (manual assignment),
 * ordered the same way the auto-assigner would consider them. Optionally
 * narrowed to a single category.
 */
const getAvailableGuides = async (
    division: string,
    category?: GuideCategory
) => {
    if (!Types.ObjectId.isValid(division)) {
        throw new AppError(httpStatus.BAD_REQUEST, "Invalid division id");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {
        status: GuideStatus.APPROVED,
        division,
    };

    if (category) {
        filter.completedGuidings = guidingCountFilterForCategory(category);
    }

    return GuideApplication.find(filter)
        .populate("user", "name email")
        .sort({ lastAssignedAt: 1, approvedAt: 1 });
};

export const GuideService = {
    applyForGuide,
    decideGuideApplication,
    getAllGuideApplications,
    getMyGuideApplication,
    getGuideApplicationById,
    assignGuide,
    creditGuiding,
    getAvailableGuides,
};
