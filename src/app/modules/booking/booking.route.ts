import express from "express";

import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import { BookingController } from "./booking.controller";
import { assignGuideZodSchema, createBookingZodSchema, updateBookingStatusZodSchema } from "./booking.validation";

const router = express.Router();

// api/v1/booking
router.post("/",
    checkAuth(...Object.values(Role)),
    validateRequest(createBookingZodSchema),
    BookingController.createBooking
);

// api/v1/booking
router.get("/",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    BookingController.getAllBookings
);

// api/v1/booking/my-bookings
router.get("/my-bookings",
    checkAuth(...Object.values(Role)),
    BookingController.getUserBookings
);

// api/v1/booking/guide-assignments — trips a guide is assigned to lead.
// MUST stay above "/:bookingId" or Express matches it as a booking id.
router.get("/guide-assignments",
    checkAuth(Role.GUIDE, Role.ADMIN, Role.SUPER_ADMIN),
    BookingController.getGuideAssignments
);

// api/v1/booking/bookingId
router.get("/:bookingId",
    checkAuth(...Object.values(Role)),
    BookingController.getSingleBooking
);

// api/v1/booking/bookingId/status
router.patch("/:bookingId/status",
    checkAuth(...Object.values(Role)),
    validateRequest(updateBookingStatusZodSchema),
    BookingController.updateBookingStatus
);

// api/v1/booking/bookingId/assign-guide — admin manual (re)assignment
router.patch("/:bookingId/assign-guide",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    validateRequest(assignGuideZodSchema),
    BookingController.assignGuideToBooking
);

// api/v1/booking/bookingId/confirm-guiding — admin credits the guiding
router.patch("/:bookingId/confirm-guiding",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    BookingController.confirmGuiding
);

export const BookingRoutes = router;