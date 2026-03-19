/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status-codes";
import { AuthServices } from "./auth.service";
import AppError from "../../error/AppError";
import { setAuthCookie } from "../../utils/setCookie";
import { JwtPayload } from "jsonwebtoken";
import { createUserTokens } from "../../utils/userTokens";
import { envVars } from "../../config/env";
import passport from "passport";

const credentialsLogin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {


    passport.authenticate('local', async (err: any, user: any, info: any) => {

        if (err) {
            return next(err);
        }

        if (!user) {
            return next(new AppError(401, info.message));
        }

        const userTokens = createUserTokens(user);

        setAuthCookie(res, userTokens);

        delete user.toObject().password;

        sendResponse(res, {
            success: true,
            statusCode: httpStatus.OK,
            message: "User Logged In Successfully",
            data: {
                accessToken: userTokens.accessToken,
                refreshToken: userTokens.refreshToken,
                user
            }
        })
    })(req, res, next)

    // const loginInfo = await AuthServices.credentialsLogin(req.body);
    // setAuthCookie(res, loginInfo)

    // sendResponse(res, {
    //     success: true,
    //     statusCode: httpStatus.OK,
    //     message: "User Logged In Successfully",
    //     data: loginInfo
    // })
})

const getNewAccessToken = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
        throw new AppError(httpStatus.BAD_REQUEST, "No Refresh Token Get");
    }
    // const refreshToken = req.headers.authorization;

    const tokenInfo = await AuthServices.getNewAccessToken(refreshToken as string);

    setAuthCookie(res, tokenInfo);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "User Logged In Successfully",
        data: tokenInfo
    })
})

const logout = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: false,
        sameSite: "lax"
    })

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: false,
        sameSite: "lax"
    })

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "User Logged out",
        data: null
    })
})


const resetPassword = catchAsync(async (req: Request, res: Response, next: NextFunction) => {

    const newPassword = req.body.newPassword;
    const oldPassword = req.body.oldPassword;
    const decodedToken = req.user as JwtPayload;

    await AuthServices.resetPassword(oldPassword, newPassword, decodedToken);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Password Changed Successfully",
        data: null
    })
})


const googleCallbackController = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let redirectTo = req.query.state ? req.query.state as string : "";

    if (redirectTo.startsWith('/')) {
        redirectTo = redirectTo.slice(1);
    }

    const user = req.user;
    console.log('User : ', user);

    if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
    }

    const tokenInfo = createUserTokens(user);

    setAuthCookie(res, tokenInfo);

    res.redirect(`${envVars.FRONTEND_URL}/${redirectTo}`);
})

export const AuthControllers = {
    credentialsLogin,
    getNewAccessToken,
    logout,
    resetPassword,
    googleCallbackController
}