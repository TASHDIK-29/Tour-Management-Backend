import { Request, Response } from "express"
import httpStatus from "http-status-codes";

export const notFound = (req: Request, res: Response) => {
    res.status(httpStatus.NOT_FOUND).json({
        status: false,
        message: "Route Not Found"
    })
}