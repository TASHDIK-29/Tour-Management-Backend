/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from "http-status-codes";
import AppError from "../../error/AppError";
import { PAYMENT_STATUS } from "../payment/payment.interface";
import { Payment } from "../payment/payment.model";
import { ISSLCommerz } from "../sslCommerz/sslCommerz.interface";
import { SSLService } from "../sslCommerz/sslCommerz.service";
import { Tour } from "../tour/tour.model";
import { User } from "../user/user.model";
import { BOOKING_STATUS, IBooking } from "./booking.interface";
import { Booking } from "./booking.model";
import { getTransactionId } from "../../utils/getTransactionId";
import { JwtPayload } from "jsonwebtoken";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { excludeField } from "../../constants";
import { Role } from "../user/user.interface";

// const getTransactionId = () => {
//     return `tran_${Date.now()}_${Math.floor(Math.random() * 1000)}`
// }

/**
 * Duplicate DB Collections / replica
 * 
 * Relica DB -> [ Create Booking -> Create Payment ->  Update Booking -> Error] -> Real DB
 */

const createBooking = async (payload: Partial<IBooking>, userId: string) => {
    const transactionId = getTransactionId()

    const session = await Booking.startSession();
    session.startTransaction()

    try {
        const user = await User.findById(userId);

        if (!user?.phone || !user.address) {
            throw new AppError(httpStatus.BAD_REQUEST, "Please Update Your Profile to Book a Tour.")
        }

        const tour = await Tour.findById(payload.tour).select("costFrom")

        if (!tour?.costFrom) {
            throw new AppError(httpStatus.BAD_REQUEST, "No Tour Cost Found!")
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const amount = Number(tour.costFrom) * Number(payload.guestCount!)

        const booking = await Booking.create([{
            user: userId,
            status: BOOKING_STATUS.PENDING,
            ...payload
        }], { session })

        const payment = await Payment.create([{
            booking: booking[0]._id,
            status: PAYMENT_STATUS.UNPAID,
            transactionId: transactionId,
            amount: amount
        }], { session })

        const updatedBooking = await Booking
            .findByIdAndUpdate(
                booking[0]._id,
                { payment: payment[0]._id },
                { new: true, runValidators: true, session }
            )
            .populate("user", "name email phone address")
            .populate("tour", "title costFrom")
            .populate("payment");

        const userAddress = (updatedBooking?.user as any).address
        const userEmail = (updatedBooking?.user as any).email
        const userPhoneNumber = (updatedBooking?.user as any).phone
        const userName = (updatedBooking?.user as any).name

        const sslPayload: ISSLCommerz = {
            address: userAddress,
            email: userEmail,
            phoneNumber: userPhoneNumber,
            name: userName,
            amount: amount,
            transactionId: transactionId
        }

        const sslPayment = await SSLService.sslPaymentInit(sslPayload)

        // console.log(sslPayment);

        await session.commitTransaction(); //transaction
        session.endSession()
        return {
            paymentUrl: sslPayment.GatewayPageURL,
            booking: updatedBooking
        }
    } catch (error) {
        await session.abortTransaction(); // rollback
        session.endSession()
        // throw new AppError(httpStatus.BAD_REQUEST, error) ❌❌
        throw error
    }
};

// Frontend(localhost:5173) - User - Tour - Booking (Pending) - Payment(Unpaid) -> SSLCommerz Page -> Payment Complete -> Backend(localhost:5000/api/v1/payment/success) -> Update Payment(PAID) & Booking(CONFIRM) -> redirect to frontend -> Frontend(localhost:5173/payment/success)

// Frontend(localhost:5173) - User - Tour - Booking (Pending) - Payment(Unpaid) -> SSLCommerz Page -> Payment Fail / Cancel -> Backend(localhost:5000) -> Update Payment(FAIL / CANCEL) & Booking(FAIL / CANCEL) -> redirect to frontend -> Frontend(localhost:5173/payment/cancel or localhost:5173/payment/fail)

// Shared populate set so every booking response has the same shape.
const withRefs = <T>(q: T) => (q as any)
    .populate("tour", "title slug images costFrom location startDate endDate")
    .populate("payment", "transactionId amount status invoiceUrl");

const getUserBookings = async (userId: string, query: Record<string, string> = {}) => {

    const queryBuilder = new QueryBuilder(Booking.find({ user: userId }), query)

    const bookings = queryBuilder
        .filter()
        .sort()
        .paginate()

    const [data, total] = await Promise.all([
        withRefs(bookings.build()),
        // Counted through the same filter as the query, so the totals stay
        // correct when the list is filtered (QueryBuilder.getMeta counts the
        // whole collection, which would be wrong here).
        Booking.countDocuments({ user: userId, ...buildFilter(query) })
    ])

    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10

    return {
        data,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) }
    }
};

const getBookingById = async (bookingId: string, decodedToken: JwtPayload) => {

    const booking = await withRefs(Booking.findById(bookingId))
        .populate("user", "name email phone address")

    if (!booking) {
        throw new AppError(httpStatus.NOT_FOUND, "Booking not found")
    }

    // A booking is private: only its owner or an admin may read it. Without
    // this the id alone would expose another customer's details.
    const isOwner = String((booking.user as any)?._id ?? booking.user) === String(decodedToken.userId)
    const isAdmin = decodedToken.role === Role.ADMIN || decodedToken.role === Role.SUPER_ADMIN

    if (!isOwner && !isAdmin) {
        throw new AppError(httpStatus.FORBIDDEN, "You are not permitted to view this booking")
    }

    return booking
};

const updateBookingStatus = async (
    bookingId: string,
    status: BOOKING_STATUS,
    decodedToken: JwtPayload
) => {

    const booking = await Booking.findById(bookingId)

    if (!booking) {
        throw new AppError(httpStatus.NOT_FOUND, "Booking not found")
    }

    const isOwner = String(booking.user) === String(decodedToken.userId)
    const isAdmin = decodedToken.role === Role.ADMIN || decodedToken.role === Role.SUPER_ADMIN

    if (!isOwner && !isAdmin) {
        throw new AppError(httpStatus.FORBIDDEN, "You are not permitted to update this booking")
    }

    // Customers may only cancel, and only a booking that hasn't completed.
    // Everything else (COMPLETE, FAILED, reinstating) stays with admins so a
    // customer can't mark their own unpaid booking as paid-for.
    if (!isAdmin) {
        if (status !== BOOKING_STATUS.CANCEL) {
            throw new AppError(httpStatus.FORBIDDEN, "You can only cancel your booking")
        }
        if (booking.status === BOOKING_STATUS.COMPLETE) {
            throw new AppError(httpStatus.BAD_REQUEST, "A completed booking cannot be cancelled")
        }
    }

    const updatedBooking = await withRefs(
        Booking.findByIdAndUpdate(bookingId, { status }, { new: true, runValidators: true })
    )

    return updatedBooking
};

const getAllBookings = async (query: Record<string, string> = {}) => {

    const queryBuilder = new QueryBuilder(Booking.find(), query)

    const bookings = queryBuilder
        .filter()
        .sort()
        .paginate()

    const [data, total] = await Promise.all([
        withRefs(bookings.build()).populate("user", "name email phone"),
        Booking.countDocuments(buildFilter(query))
    ])

    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10

    return {
        data,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) }
    }
};

/** Mirrors QueryBuilder.filter(): the query minus its reserved control keys. */
const buildFilter = (query: Record<string, string>) => {
    const filter = { ...query }
    for (const field of excludeField) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete filter[field]
    }
    return filter
};

export const BookingService = {
    createBooking,
    getUserBookings,
    getBookingById,
    updateBookingStatus,
    getAllBookings,
};