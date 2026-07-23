import { z } from "zod";
import { BOOKING_STATUS } from "./booking.interface";
import { GuideCategory } from "../guide/guide.interface";

export const createBookingZodSchema = z.object({
    tour: z.string(),
    guestCount: z.number().int().positive(),
    guideCategory: z.enum(Object.values(GuideCategory) as [string, ...string[]]),
});

export const updateBookingStatusZodSchema = z.object({
    status: z.enum(Object.values(BOOKING_STATUS) as [string]),
});

export const assignGuideZodSchema = z.object({
    guideId: z.string({ error: "guideId is required" }),
});