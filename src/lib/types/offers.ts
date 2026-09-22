export type RestaurantOfferConfig = {
  active: boolean;
  bannerText: string;
  discountPercent: number;
  minOrderValue: number;
  bounceBackReward: string;
  bounceBackCode: string;
  referralDiscount: string;
};

export const DEFAULT_OFFER_CONFIG: RestaurantOfferConfig = {
  active: true,
  bannerText: "FLAT 20% OFF TODAY · Auto-applied on orders above ₹399",
  discountPercent: 20,
  minOrderValue: 399,
  bounceBackReward: "₹100 OFF on your next visit (Min order ₹499)",
  bounceBackCode: "REPEAT100",
  referralDiscount: "15% OFF for your friends",
};
