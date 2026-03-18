/* eslint-disable @typescript-eslint/no-non-null-assertion */
import AppError from "../../error/AppError";
import { IUser } from "../user/user.interface"
import { User } from "../user/user.model";
import httpStatus from "http-status-codes";
import bcryptjs from "bcryptjs";
import { createNewAccessTokenWithRefreshToken, createUserTokens } from "../../utils/userTokens";
import { JwtPayload } from "jsonwebtoken";
import { envVars } from "../../config/env";


const credentialsLogin = async (payload: Partial<IUser>) => {
    const { email, password } = payload;

    const isUserExist = await User.findOne({ email });

    if (!isUserExist) {
        throw new AppError(httpStatus.BAD_REQUEST, "User Not Exist");
    }

    const isPasswordMatched = await bcryptjs.compare(password as string, isUserExist.password as string);

    if (!isPasswordMatched) {
        throw new AppError(httpStatus.BAD_REQUEST, "Incorrect Password");
    }

    const userTokens = createUserTokens(isUserExist);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: pass, ...rest } = isUserExist.toObject();

    return {
        accessToken: userTokens.accessToken,
        refreshToken: userTokens.refreshToken,
        user: rest
    }
}

const getNewAccessToken = async (refreshToken: string) => {
    const accessToken = await createNewAccessTokenWithRefreshToken(refreshToken);
    // console.log("From Service ->", {accessToken});

    return {
        accessToken
    }
}


const resetPassword = async (oldPassword: string, newPassword: string, decodedToken: JwtPayload) => {
    const user = await User.findById(decodedToken.userId);

    const isOldPasswordMatched = await bcryptjs.compare(oldPassword, user!.password as string);

    if (!isOldPasswordMatched) {
        throw new AppError(httpStatus.UNAUTHORIZED, 'Old password does not match.')
    }

    user!.password = await bcryptjs.hash(newPassword, Number(envVars.BCRYPT_SALT_ROUND));
    user!.save();

}




export const AuthServices = {
    credentialsLogin,
    getNewAccessToken,
    resetPassword
}