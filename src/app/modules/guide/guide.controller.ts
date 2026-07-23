import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import httpStatus from "http-status-codes";
import AppError from "../../error/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { GuideService } from "./guide.service";
import { GuideCategory } from "./guide.interface";

/**
 * POST /guide/apply
 * Authenticated USER applies to become a guide by uploading a NID photo and
 * selecting a division. The NID file is provided through multer (`req.file`).
 */
const applyForGuide = catchAsync(async (req: Request, res: Response) => {
    const decodedToken = req.user as JwtPayload;

    if (!req.file) {
        throw new AppError(httpStatus.BAD_REQUEST, "NID photo is required");
    }

    const { divisionId } = req.body;

    const result = await GuideService.applyForGuide(
        decodedToken.userId,
        divisionId,
        req.file.path
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Guide application submitted successfully",
        data: result,
    });
});

/**
 * POST /guide/approve/:id
 * Admin approves or rejects a pending application. On approval the applicant is
 * promoted to the GUIDE role (handled atomically in the service).
 */
const decideGuideApplication = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { status } = req.body;

    const result = await GuideService.decideGuideApplication(id, status);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Guide application ${status.toLowerCase()} successfully`,
        data: result,
    });
});

/**
 * GET /guide
 * Admin lists guide applications with filters, search and pagination.
 */
const getAllGuideApplications = catchAsync(
    async (req: Request, res: Response) => {
        const result = await GuideService.getAllGuideApplications(
            req.query as Record<string, string>
        );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Guide applications retrieved successfully",
            data: result.data,
            meta: result.meta,
        });
    }
);

/**
 * GET /guide/available?division=&category=
 * Admin lists approved guides in a division (optionally one category) — the
 * candidate pool for manually assigning a guide to a booking.
 */
const getAvailableGuides = catchAsync(async (req: Request, res: Response) => {
    const { division, category } = req.query as {
        division?: string;
        category?: GuideCategory;
    };

    if (!division) {
        throw new AppError(httpStatus.BAD_REQUEST, "division is required");
    }

    const result = await GuideService.getAvailableGuides(division, category);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Available guides retrieved successfully",
        data: result,
    });
});

/**
 * GET /guide/me
 * The authenticated applicant reads their own application (or null if none).
 * Lets a USER track their status without exposing the admin list.
 */
const getMyGuideApplication = catchAsync(async (req: Request, res: Response) => {
    const decodedToken = req.user as JwtPayload;

    const result = await GuideService.getMyGuideApplication(decodedToken.userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result
            ? "Your guide application retrieved successfully"
            : "No guide application found",
        data: result,
    });
});

/**
 * GET /guide/:id
 * Admin fetches a single guide application (bonus endpoint).
 */
const getGuideApplicationById = catchAsync(
    async (req: Request, res: Response) => {
        const { id } = req.params as { id: string };

        const result = await GuideService.getGuideApplicationById(id);

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Guide application retrieved successfully",
            data: result,
        });
    }
);

export const GuideController = {
    applyForGuide,
    decideGuideApplication,
    getAllGuideApplications,
    getAvailableGuides,
    getMyGuideApplication,
    getGuideApplicationById,
};
