export const ROLES = ["admin", "farmer", "certifier", "processor", "distributor", "retailer"] as const;
export type Role = (typeof ROLES)[number];

/** Roles a person can pick on the public registration form. */
export const SELF_REGISTER_ROLES = ["farmer", "certifier", "processor", "distributor", "retailer"] as const;

export const USER_STATUSES = ["pending", "approved", "blocked"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
