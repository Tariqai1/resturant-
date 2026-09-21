import FoodChefLoader from "@/components/FoodChefLoader";

export default function TableRouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#FAF8F2]">
      <FoodChefLoader
        variant="light"
        size="lg"
        message="Connecting to your table..."
        subMessage="Preparing your 5-star digital dining experience..."
      />
    </div>
  );
}
