// User - Booking(Pending) -> Payment (Unpaid) -> SSLCommerz -> Booking update = confirm -> Payment update = Paid

import { Types } from "mongoose";
import { GuideCategory } from "../guide/guide.interface";


export enum BOOKING_STATUS {
    PENDING = "PENDING",
    CANCEL = "CANCEL",
    COMPLETE = "COMPLETE",
    FAILED = "FAILED"
}

export interface IBooking {
    user: Types.ObjectId,
    tour: Types.ObjectId,
    payment?: Types.ObjectId,
    guestCount: number,
    status: BOOKING_STATUS,
    /** Experience tier the traveller booked (drives which guide pool + the rate). */
    guideCategory: GuideCategory,
    /** Guide fee for the trip = daily rate × tour duration in days. */
    guideCost: number,
    /** Auto-assigned via round-robin; null when no guide was available (admin fills in later). */
    guide?: Types.ObjectId | null,
    /** True once an admin has credited this trip to the guide's guiding count (idempotency guard). */
    guidingConfirmed: boolean,
    createdAt: Date,
}