import { TGenericErrorResponse } from "../interfaces/error.types"

/* eslint-disable @typescript-eslint/no-explicit-any */
export const handlerDuplicateError = (err: any): TGenericErrorResponse => {
    // Mongo phrases duplicate-key errors inconsistently. Only some include a
    // quoted value (`... dup key: { name: "Dhaka" }`); a null/undefined dup key
    // renders as `dup key: { name: null }` with nothing quoted. Indexing into a
    // null match then threw a TypeError, turning a 400 into an unhandled 500.
    const quotedValue = err?.message?.match(/"([^"]*)"/)?.[1]

    // Fall back to the offending field name from keyPattern/keyValue.
    const field =
        Object.keys(err?.keyPattern ?? err?.keyValue ?? {})[0]

    const subject = quotedValue ?? field ?? "Value"

    return {
        statusCode: 400,
        message: `${subject} already exists!!`
    }
}
