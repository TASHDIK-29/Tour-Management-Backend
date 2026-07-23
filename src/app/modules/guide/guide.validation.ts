import { z } from "zod";
import { GuideStatus } from "./guide.interface";

// POST /guide/apply — the NID photo arrives as a multipart file, so only the
// division reference is validated from the body.
export const applyGuideZodSchema = z.object({
    divisionId: z.string({ error: "divisionId is required" }),
});

// POST /guide/approve/:id — admin decides the outcome. Only the two terminal
// states are acceptable here; PENDING would be a no-op.
export const approveGuideZodSchema = z.object({
    status: z.enum([GuideStatus.APPROVED, GuideStatus.REJECTED], {
        error: "status must be either APPROVED or REJECTED",
    }),
});
