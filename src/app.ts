import express, { Request, Response } from "express"
import cors from "cors";
import cookieParser from "cookie-parser";
import { router } from "./app/routes";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler";
import { notFound } from "./app/middlewares/notFound";
import passport from "passport";
import expressSession from "express-session";

// **IMPORTANT**//
import './app/config/passport';


const app = express();

app.use(expressSession({
    secret: 'Your Secret',
    resave: false,
    saveUninitialized: false
}))

app.use(passport.initialize())
app.use(passport.session())

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true })) // For Form-data
app.use(cors());

app.use('/api/v1', router);

app.get('/', async (req: Request, res: Response) => {
    res.status(200).json({
        message: "Welcome to Tour management System Server"
    })
})


app.use(globalErrorHandler)

app.use(notFound)

export default app;