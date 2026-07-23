import { model, Schema } from "mongoose";
import { BOOKING_STATUS, IBooking } from "./booking.interface";
import { GuideCategory } from "../guide/guide.interface";


const bookingSchema = new Schema<IBooking>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    tour: {
        type: Schema.Types.ObjectId,
        ref: "Tour",
        required: true,
    },
    payment: {
        type: Schema.Types.ObjectId,
        ref: "Payment"
    },
    status: {
        type: String,
        enum: Object.values(BOOKING_STATUS),
        default: BOOKING_STATUS.PENDING
    },
    guestCount: {
        type: Number,
        required: true
    },
    guideCategory: {
        type: String,
        enum: Object.values(GuideCategory),
        required: true
    },
    guideCost: {
        type: Number,
        required: true,
        default: 0
    },
    // The GUIDE user assigned to lead this trip. Null when the division had no
    // guide in the chosen category at booking time — an admin assigns one later.
    guide: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    guidingConfirmed: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
})

export const Booking = model<IBooking>("Booking", bookingSchema)