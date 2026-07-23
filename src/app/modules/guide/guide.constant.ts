import { GuideCategory } from "./guide.interface";

// Fields on the referenced User/Division collections that `searchTerm` matches.
// GuideApplication itself has no free-text field, so the search is resolved
// against these refs first (see guide.service -> getAllGuideApplications).
export const guideUserSearchableFields = ["name", "email"];
export const guideDivisionSearchableFields = ["name"];

/**
 * A guide with MORE than this many successful guidings is PREMIUM; at or below
 * it they are STANDARD. New guides start at 0, so they begin as STANDARD.
 */
export const GUIDE_CATEGORY_THRESHOLD = 20;

/** Per-day fee (BDT) charged for a guide of each category. */
export const GUIDE_DAILY_RATE: Record<GuideCategory, number> = {
    [GuideCategory.STANDARD]: 300,
    [GuideCategory.PREMIUM]: 500,
};

/** Maps a live guiding count to its category tier. Missing count counts as 0. */
export const resolveGuideCategory = (
    completedGuidings = 0
): GuideCategory =>
    completedGuidings > GUIDE_CATEGORY_THRESHOLD
        ? GuideCategory.PREMIUM
        : GuideCategory.STANDARD;

/**
 * Mongo filter on `completedGuidings` for a category — the inverse of the map above.
 *
 * STANDARD is expressed as "NOT premium" rather than `{ $lte: 20 }` on purpose:
 * `$lte` skips documents where the field is absent, so a guide approved before
 * `completedGuidings` existed (field missing) would never match and could never
 * be assigned. `$not: { $gt }` treats a missing count as 0 → STANDARD.
 */
export const guidingCountFilterForCategory = (category: GuideCategory) =>
    category === GuideCategory.PREMIUM
        ? { $gt: GUIDE_CATEGORY_THRESHOLD }
        : { $not: { $gt: GUIDE_CATEGORY_THRESHOLD } };
