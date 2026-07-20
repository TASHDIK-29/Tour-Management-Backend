import { CookieOptions, Response } from "express";
import { envVars } from "../config/env";

interface AuthTokens {
    accessToken?: string;
    refreshToken?: string;
}

const isProduction = envVars.NODE_ENV === "production";

/**
 * Shared by set and clear so the attributes always match.
 *
 * `sameSite` MUST track `secure`: browsers reject a `SameSite=None` cookie that
 * isn't also `Secure` (Chrome 80+), so hardcoding "none" in development — where
 * secure is false over plain http — meant the cookie was silently discarded and
 * never stored. That broke Google OAuth completely, since its callback has no
 * way to hand the token over except through the cookie.
 *
 * In development the frontend (localhost:5173) and API (localhost:5000) are
 * same-site — differing ports don't change the site — so "lax" is sent on both
 * the OAuth top-level redirect and subsequent same-site fetches.
 *
 * In production, where the two are usually on different domains, "none" plus
 * "secure" over https is required for the cookie to cross origins at all.
 */
const authCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
};

export const setAuthCookie = (res: Response, tokenInfo: AuthTokens) => {
    if (tokenInfo.accessToken) {
        res.cookie('accessToken', tokenInfo.accessToken, authCookieOptions)
    }

    if (tokenInfo.refreshToken) {
        res.cookie('refreshToken', tokenInfo.refreshToken, authCookieOptions)
    }
}

export const clearAuthCookie = (res: Response) => {
    res.clearCookie('accessToken', authCookieOptions)
    res.clearCookie('refreshToken', authCookieOptions)
}
