/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { UserServices } from "./user.service";
import { catchAsync } from "../../utils/catchAsync";
import { success } from "zod";
import { sendResponse } from "../../utils/sendResponse";

// const createUser = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const user = await UserServices.createUser(req.body);

//         res.status(httpStatus.CREATED).json({
//             message: "User Created Successfully",
//             user
//         });

//     } catch (err) {
//         console.log(err);

//         // res.status(httpStatus.BAD_REQUEST).json({
//         //     message: `Something went wrong ${err}`,
//         //     err
//         // });
//         next(err); // to global error handler
//     }
// }


/* Avoiding TryCatch Repetition using Higher Order Function */
const createUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserServices.createUser(req.body);

    // res.status(httpStatus.CREATED).json({
    //     message: "User Created Successfully",
    //     user
    // });

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: "User Created Successfully",
        data: user
    })
})

const getAllUsers = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await UserServices.getAllUsers();

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "All user retrieved Successfully",
        data: result.data,
        meta: result.meta
    })
})


export const UserControllers = {
    createUser,
    getAllUsers
}