export const tourSearchableFields = ["title", "description", "location"]
// Must match the model field (`tourName`). With "name" the search stage built
// `{ $or: [{ name: /…/ }] }`, which matches no document, so the list endpoint
// always came back empty even when tour types existed.
export const tourTypeSearchableFields = ["tourName"]