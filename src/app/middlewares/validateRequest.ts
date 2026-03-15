import { ZodObject } from "zod";
import { NextFunction, Request, Response } from "express";

export const validateRequest = (zodSchema: ZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        req.body = await zodSchema.parseAsync(req.body);

        next();
    } catch (error) {
        next(error)
    }
}