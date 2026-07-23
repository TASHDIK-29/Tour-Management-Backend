import express from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { multerUpload } from "../../config/multer.config";
import { Role } from "../user/user.interface";
import { GuideController } from "./guide.controller";
import {
    applyGuideZodSchema,
    approveGuideZodSchema,
} from "./guide.validation";

const router = express.Router();

// USER applies to become a guide — NID photo uploaded as the `file` field,
// `divisionId` in the body (accepts a raw field or a JSON `data` field).
router.post(
    "/apply",
    checkAuth(Role.USER),
    multerUpload.single("file"),
    validateRequest(applyGuideZodSchema),
    GuideController.applyForGuide
);

// Admins approve or reject a pending application.
router.post(
    "/approve/:id",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    validateRequest(approveGuideZodSchema),
    GuideController.decideGuideApplication
);

// Admins list all applications with filters, search and pagination.
router.get(
    "/",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    GuideController.getAllGuideApplications
);

// Admin picker: approved guides in a division (candidates for manual booking
// assignment). Above "/:id" for the same reason as "/me".
router.get(
    "/available",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    GuideController.getAvailableGuides
);

// The applicant reads their own application. MUST stay above "/:id" — otherwise
// Express matches "me" as the :id param and routes it to the admin handler.
router.get(
    "/me",
    checkAuth(Role.USER, Role.GUIDE),
    GuideController.getMyGuideApplication
);

// Admins fetch a single application (bonus endpoint).
router.get(
    "/:id",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    GuideController.getGuideApplicationById
);

export const GuideRoutes = router;
