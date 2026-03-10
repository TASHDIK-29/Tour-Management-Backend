import express, { Request, Response } from "express"



const app = express();

app.get('/', async (req: Request, res: Response) => {
    res.status(200).json({
        message: "Welcome to Tour management System Server"
    })
})

export default app;