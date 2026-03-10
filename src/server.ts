/* eslint-disable no-console */
import mongoose from "mongoose"
import { Server } from "http"
import app from "./app";
import { envVars } from "./app/config/env";

let server: Server;

// const td = 26;

const startServer = async () => {
    try {
        await mongoose.connect(envVars.DB_URL)

        console.log("Connected To Db....");

        server = app.listen(envVars.PORT, () => {
            console.log(`Server is listening to port ${envVars.PORT}`);
        })
    } catch (error) {
        console.log(error);
    }
}

startServer();

// Handling Error

process.on("unhandledRejection", (err) => {
    console.log("Unhandled Rejection detected.... Server is shutting down....", err);

    if (server) {
        server.close(() => {
            process.exit(1);
        })
    }

    process.exit(1);
})

// Promise.reject(new Error("Forget to resolve promise."))


process.on("uncaughtException", (err) => {
    console.log("Uncaught Exception detected.... Server is shutting down....", err);

    if (server) {
        server.close(() => {
            process.exit(1);
        })
    }

    process.exit(1);
})

// throw new Error("Forget to resolve local error.")



process.on("SIGTERM", () => {
    console.log("SIGTERM signal received.... Server is shutting down....");

    if (server) {
        server.close(() => {
            process.exit(1);
        })
    }

    process.exit(1);
})

process.on("SIGINT", () => {
    console.log("SIGINT signal received.... Server is shutting down....");

    if (server) {
        server.close(() => {
            process.exit(1);
        })
    }

    process.exit(1);
})