/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from "express";

/* Avoid TryCatch repetition */
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>

// Higher Order Function
export const catchAsync = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
        
        next(err);
    })
}