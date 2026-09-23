export type RestaurantOfferConfig = {
  active: boolean;
  bannerText: string;
  discountPercent: number;
  minOrderValue: number;
  bounceBackReward: string;
  bounceBackCode: string;
  referralDiscount: string;
  validityDays?: number;
};

export const DEFAULT_OFFER_CONFIG: RestaurantOfferConfig = {
  active: true,
  bannerText: "FLAT 20% OFF TODAY · Auto-applied on orders above ₹399",
  discountPercent: 20,
  minOrderValue: 399,
  bounceBackReward: "₹100 OFF on your next visit (Min order ₹499)",
  bounceBackCode: "REPEAT100",
  referralDiscount: "15% OFF for your friends",
  validityDays: 15,
};

export type RestaurantThemeType = "amber" | "crimson" | "saffron" | "emerald" | "charcoal";

export type RestaurantBrandingConfig = {
  theme: RestaurantThemeType;
  logoUrl?: string | null;
  tagline?: string | null;
};

export const DEFAULT_BRANDING_CONFIG: RestaurantBrandingConfig = {
  theme: "amber",
  logoUrl: null,
  tagline: null,
};
