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
import { GuideService } from "../guide/guide.service";
import { GuideApplication } from "../guide/guide.model";
import { GuideCategory, GuideStatus } from "../guide/guide.interface";
import { GUIDE_DAILY_RATE } from "../guide/guide.constant";
import { ITour } from "../tour/tour.interface";

/**
 * Tour duration in whole days, used to price the guide fee. Falls back to 1 day
 * when a tour has no start/end dates (both are optional on the tour schema).
 */
const getTourDurationDays = (tour: Pick<ITour, "startDate" | "endDate">) => {
    if (tour.startDate && tour.endDate) {
        const ms =
            new Date(tour.endDate).getTime() - new Date(tour.startDate).getTime();
        const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 1;
    }
    return 1;
};

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

        const tour = await Tour.findById(payload.tour).select(
            "costFrom division startDate endDate"
        )

        if (!tour?.costFrom) {
            throw new AppError(httpStatus.BAD_REQUEST, "No Tour Cost Found!")
        }

        // Guide fee: daily rate for the chosen category × the tour's length.
        const category = payload.guideCategory as GuideCategory
        const durationDays = getTourDurationDays(tour)
        const guideCost = GUIDE_DAILY_RATE[category] * durationDays

        // Auto-assign a guide from the tour's division in the chosen category via
        // round-robin. Null when none is available — the trip is booked
        // unassigned and an admin fills the guide in later. The fee is charged
        // either way, since the traveller booked that service level.
        const assignedGuide = await GuideService.assignGuide(
            tour.division,
            category,
            session
        )

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const amount = Number(tour.costFrom) * Number(payload.guestCount!) + guideCost

        const booking = await Booking.create([{
            user: userId,
            status: BOOKING_STATUS.PENDING,
            ...payload,
            guideCost,
            guide: assignedGuide,
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
// `division` is included so the admin UI can look up guides in the tour's region.
const withRefs = <T>(q: T) => (q as any)
    .populate("tour", "title slug images costFrom location startDate endDate division")
    .populate("payment", "transactionId amount status invoiceUrl")
    .populate("guide", "name email");

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

/**
 * Trips assigned to a guide (the bookings they will lead), for the guide's own
 * dashboard. Filtered to `guide === them`, so it never leaks other bookings.
 */
const getGuideAssignments = async (
    guideUserId: string,
    query: Record<string, string> = {}
) => {
    const queryBuilder = new QueryBuilder(
        Booking.find({ guide: guideUserId }),
        query
    );

    const bookings = queryBuilder.filter().sort().paginate();

    const [data, total] = await Promise.all([
        withRefs(bookings.build()).populate("user", "name email phone"),
        Booking.countDocuments({ guide: guideUserId, ...buildFilter(query) }),
    ]);

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    return {
        data,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
    };
};

/**
 * Admin manually assigns (or reassigns) the guide leading a booking.
 *
 * Used for trips booked while the division had no guide in the category, or to
 * correct an assignment. The chosen guide must be an APPROVED guide for the
 * tour's own division. A trip whose guiding has already been credited is locked,
 * so the confirmed guide keeps the credit.
 */
const assignGuideToBooking = async (
    bookingId: string,
    guideUserId: string
) => {
    const session = await Booking.startSession();
    session.startTransaction();

    try {
        const booking = await Booking.findById(bookingId).session(session);
        if (!booking) {
            throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
        }
        if (booking.guidingConfirmed) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "This guiding has been confirmed and can no longer be reassigned"
            );
        }

        const tour = await Tour.findById(booking.tour)
            .select("division")
            .session(session);
        if (!tour) {
            throw new AppError(httpStatus.NOT_FOUND, "Tour not found");
        }

        const guideApp = await GuideApplication.findOne({
            user: guideUserId,
            status: GuideStatus.APPROVED,
        }).session(session);

        if (!guideApp) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "Selected user is not an approved guide"
            );
        }
        if (String(guideApp.division) !== String(tour.division)) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "Guide is not approved for this tour's division"
            );
        }

        booking.guide = guideApp.user;
        await booking.save({ session });

        // A manual assignment also advances the rotation cursor, so this guide
        // moves to the back of the round-robin queue.
        guideApp.lastAssignedAt = new Date();
        await guideApp.save({ session });

        await session.commitTransaction();
        session.endSession();

        return withRefs(Booking.findById(bookingId)).populate(
            "user",
            "name email phone"
        );
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

/**
 * Admin credits a booking's guiding to the assigned guide (manual confirmation).
 *
 * `guidingConfirmed` makes this idempotent — a booking can only ever add one to
 * a guide's count. Crossing 20 promotes the guide to PREMIUM automatically,
 * since the category is always derived from the count.
 */
const confirmGuiding = async (bookingId: string) => {
    const session = await Booking.startSession();
    session.startTransaction();

    try {
        const booking = await Booking.findById(bookingId).session(session);
        if (!booking) {
            throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
        }
        if (!booking.guide) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "No guide is assigned to this booking yet"
            );
        }
        if (booking.guidingConfirmed) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "This guiding has already been confirmed"
            );
        }

        const updatedGuide = await GuideService.creditGuiding(
            booking.guide,
            session
        );
        if (!updatedGuide) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "Assigned guide is no longer an approved guide"
            );
        }

        booking.guidingConfirmed = true;
        await booking.save({ session });

        await session.commitTransaction();
        session.endSession();

        return withRefs(Booking.findById(bookingId)).populate(
            "user",
            "name email phone"
        );
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
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
    getGuideAssignments,
    assignGuideToBooking,
    confirmGuiding,
};