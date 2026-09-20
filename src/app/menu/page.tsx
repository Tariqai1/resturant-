"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ShareMenuModal, { ShareMenuTable } from "@/components/ShareMenuModal";

type Category = {
  id: string;
  name: string;
  sort_order: number;
};

type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  cost_price: number | null;
  is_veg: boolean;
  is_available: boolean;
  is_bestseller: boolean;
  photo_url: string | null;
};

export default function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [restaurantName, setRestaurantName] = useState<string>("Order Desk");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tables, setTables] = useState<ShareMenuTable[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // New item form state
  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    price: "",
    costPrice: "",
    description: "",
    isVeg: true,
    isBestseller: false,
    photoUrl: "",
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [updatingPhotoId, setUpdatingPhotoId] = useState<string | null>(null);

  async function refreshMenu() {
    try {
      const res = await fetch("/api/menu");
      const data = await res.json();
      if (res.ok) {
        setCategories(data.categories || []);
        setItems(data.items || []);
        if (data.restaurantName) setRestaurantName(data.restaurantName);
        if (data.tables) setTables(data.tables);
      }
    } catch {
      // Keep running state
    }
  }

  useEffect(() => {
    let isMounted = true;
    fetch("/api/menu")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setCategories(data.categories || []);
        setItems(data.items || []);
        if (data.restaurantName) setRestaurantName(data.restaurantName);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMessage(err instanceof Error ? err.message : "Error loading menu");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 1-Tap Instant Optimistic Availability Toggle (Used mid-service under time pressure)
  async function toggleAvailability(item: MenuItem) {
    const nextState = !item.is_available;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_available: nextState } : i))
    );

    try {
      const res = await fetch("/api/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, isAvailable: nextState }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: item.is_available } : i))
      );
      alert("Failed to toggle dish availability.");
    }
  }

  async function handlePhotoUpload(file: File) {
    setIsUploadingPhoto(true);
    setUploadError("");
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: uploadForm,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Cloudinary upload failed");

      setFormData((prev) => ({ ...prev, photoUrl: data.url }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload error");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleUpdateDishPhoto(itemId: string, file: File) {
    setUpdatingPhotoId(itemId);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: uploadForm,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Cloudinary upload failed");

      const patchRes = await fetch("/api/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, photoUrl: data.url }),
      });

      if (!patchRes.ok) throw new Error("Failed to save photo in menu");

      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, photo_url: data.url } : i))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating photo");
    } finally {
      setUpdatingPhotoId(null);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.price) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          categoryId: formData.categoryId || (categories[0]?.id ?? null),
          price: Number(formData.price),
          costPrice: formData.costPrice ? Number(formData.costPrice) : null,
          description: formData.description || null,
          isVeg: formData.isVeg,
          isBestseller: formData.isBestseller,
          photoUrl: formData.photoUrl || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create dish");

      setIsAddingItem(false);
      setFormData({
        name: "",
        categoryId: categories[0]?.id || "",
        price: "",
        costPrice: "",
        description: "",
        isVeg: true,
        isBestseller: false,
        photoUrl: "",
      });
      await refreshMenu();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create dish");
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredItems = items.filter((item) => {
    if (selectedCategory === "all") return true;
    return item.category_id === selectedCategory;
  });

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ backgroundColor: "var(--paper)" }}>
      {/* Dark Sidebar */}
      <aside
        className="w-full md:w-60 flex-shrink-0 flex flex-col justify-between p-5"
        style={{
          backgroundColor: "var(--dark-surface)",
          borderRight: "1px solid rgba(220, 209, 183, 0.15)",
          color: "#FAF6EC",
        }}
      >
        <div>
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-800">
            <div>
              <h1 className="font-heading text-xl font-bold tracking-wide" style={{ color: "#FAF6EC" }}>
                Order Desk
              </h1>
              <p className="text-xs truncate max-w-[170px]" style={{ color: "#9E9382" }}>
                {restaurantName}
              </p>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-medium">
            <Link
              href="/"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Floor overview</span>
            </Link>

            <Link
              href="/tables"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Floor layout</span>
            </Link>

            <Link
              href="/kitchen"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Kitchen rail</span>
            </Link>

            <Link
              href="/menu"
              className="flex items-center justify-between px-3 py-2 rounded font-semibold transition-colors"
              style={{
                backgroundColor: "rgba(193, 101, 44, 0.18)",
                color: "var(--rust)",
                border: "1px solid rgba(193, 101, 44, 0.35)",
              }}
            >
              <span>Menu and stock</span>
              <span className="font-receipt text-[11px] font-bold">{items.length}</span>
            </Link>

            <Link
              href="/staff"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Staff and roles</span>
            </Link>
          </nav>
        </div>

        <div className="pt-4 border-t border-stone-800">
          <Link
            href="/"
            className="block text-xs font-medium hover:underline"
            style={{ color: "#9E9382" }}
          >
            Back to dashboard
          </Link>
        </div>
      </aside>

      {/* Main Workspace (Admin desktop/tablet dense layout) */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto space-y-6" style={{ backgroundColor: "var(--paper)" }}>
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
              Menu &amp; Stock Registry
            </h2>
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              Manage dish prices, recipes, and instant 86 (sold out) availability switches
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold rounded cursor-pointer border flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              style={{
                backgroundColor: "#E8F5E9",
                color: "#1B5E20",
                borderColor: "#A5D6A7",
                borderRadius: "5px",
              }}
              title="Preview and share customer digital menu"
            >
              <span>📤</span>
              <span>Share Menu Link</span>
            </button>
            <button
              onClick={() => setIsAddingItem(true)}
              className="px-4 py-2 text-xs font-bold text-white rounded cursor-pointer shadow-sm active:scale-95 transition-transform"
              style={{ backgroundColor: "var(--rust)", borderRadius: "5px" }}
            >
              + Add new dish
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="p-3 rounded text-xs" style={{ backgroundColor: "#FDF2F2", color: "var(--brick)", border: "1px solid #FCA5A5" }}>
            {errorMessage}
          </div>
        )}

        {/* Category Filter Bar */}
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className="px-3 py-1.5 rounded cursor-pointer transition-colors"
            style={{
              backgroundColor: selectedCategory === "all" ? "var(--dark-surface)" : "var(--paper-dim)",
              color: selectedCategory === "all" ? "var(--paper)" : "var(--ink-soft)",
              border: "1px solid var(--hairline)",
            }}
          >
            All categories ({items.length})
          </button>

          {categories.map((cat) => {
            const count = items.filter((i) => i.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors flex-shrink-0"
                style={{
                  backgroundColor: selectedCategory === cat.id ? "var(--dark-surface)" : "var(--paper-dim)",
                  color: selectedCategory === cat.id ? "var(--paper)" : "var(--ink-soft)",
                  border: "1px solid var(--hairline)",
                }}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Dense List View with Inline Availability Toggle (Admin service reality) */}
        <section
          className="rounded border overflow-hidden"
          style={{
            backgroundColor: "var(--paper)",
            borderColor: "var(--hairline)",
            boxShadow: "var(--shadow-sm)",
            borderRadius: "4px",
          }}
        >
          <div className="px-5 py-3 border-b border-dashed flex justify-between items-center" style={{ borderColor: "var(--hairline)", backgroundColor: "var(--paper-dim)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
              {filteredItems.length} menu items listed
            </span>
            <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
              1-tap toggle marks dish sold out instantly on customer QR menus
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
              Loading menu registry...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b" style={{ borderColor: "var(--hairline)", backgroundColor: "var(--paper-dim)", color: "var(--ink-soft)" }}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">Dish</th>
                    <th className="px-4 py-3 font-semibold">Diet</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Price</th>
                    <th className="px-4 py-3 font-semibold">Availability (86 Switch)</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  {filteredItems.map((item) => {
                    const categoryName = categories.find((c) => c.id === item.category_id)?.name || "General";
                    return (
                      <tr key={item.id} className="hover:bg-amber-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <label
                              className="relative w-11 h-11 rounded-lg overflow-hidden border shadow-xs shrink-0 cursor-pointer group"
                              style={{ borderColor: "var(--hairline)" }}
                              title="Click to upload or replace dish photo"
                            >
                              {item.photo_url ? (
                                <img
                                  src={item.photo_url}
                                  alt={item.name}
                                  className="w-full h-full object-cover group-hover:brightness-75 transition-all"
                                />
                              ) : (
                                <div
                                  className="w-full h-full border-dashed flex items-center justify-center text-lg"
                                  style={{ backgroundColor: "var(--paper-dim)" }}
                                >
                                  🍽️
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                                {updatingPhotoId === item.id ? "⏳" : "📷"}
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={updatingPhotoId === item.id}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUpdateDishPhoto(item.id, f);
                                }}
                              />
                            </label>
                            <div>
                              <div className="font-bold text-sm" style={{ color: "var(--ink)" }}>
                                {item.name}
                              </div>
                              {item.description && (
                                <div className="text-[11px] truncate max-w-sm" style={{ color: "var(--ink-soft)" }}>
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={item.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                            <span className="text-[11px]" style={{ color: item.is_veg ? "var(--sage)" : "var(--brick)" }}>
                              {item.is_veg ? "Veg" : "Non-veg"}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3" style={{ color: "var(--ink-soft)" }}>
                          {categoryName}
                        </td>

                        <td className="px-4 py-3 font-receipt font-bold text-sm" style={{ color: "var(--ink)" }}>
                          ₹{item.price}
                        </td>

                        {/* Inline Instant Availability Toggle */}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleAvailability(item)}
                            className="px-3 py-1.5 rounded text-xs font-semibold border cursor-pointer transition-all active:scale-95 flex items-center gap-2"
                            style={{
                              backgroundColor: item.is_available ? "#EFF6EF" : "#FDF2F2",
                              borderColor: item.is_available ? "var(--sage)" : "var(--brick)",
                              color: item.is_available ? "var(--sage)" : "var(--brick)",
                            }}
                            title="Click to toggle availability"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: item.is_available ? "var(--sage)" : "var(--brick)" }}
                            />
                            <span>{item.is_available ? "In stock" : "Sold out (86)"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal: Add New Dish Form (Fast, clear data entry) */}
        {isAddingItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(34, 29, 22, 0.45)" }}
            onClick={() => setIsAddingItem(false)}
          >
            <div
              className="w-full max-w-md p-6 rounded"
              style={{
                backgroundColor: "var(--paper)",
                border: "1px solid var(--hairline)",
                boxShadow: "var(--shadow-lg)",
                borderRadius: "5px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-3 mb-4 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
                <div>
                  <h3 className="font-heading text-xl font-bold" style={{ color: "var(--ink)" }}>
                    New Menu Dish
                  </h3>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Enter item details for floor service</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingItem(false)}
                  className="text-xs font-bold p-1"
                  style={{ color: "var(--ink-soft)" }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddItem} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft)" }}>
                    Dish name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Paneer Butter Masala"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded font-semibold focus:outline-none"
                    style={{
                      backgroundColor: "var(--paper-dim)",
                      border: "1px solid var(--hairline)",
                      color: "var(--ink)",
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft)" }}>
                      Category
                    </label>
                    <select
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full px-3 py-2 rounded font-semibold focus:outline-none"
                      style={{
                        backgroundColor: "var(--paper-dim)",
                        border: "1px solid var(--hairline)",
                        color: "var(--ink)",
                      }}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft)" }}>
                      Selling price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 280"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-3 py-2 rounded font-receipt font-bold focus:outline-none"
                      style={{
                        backgroundColor: "var(--paper-dim)",
                        border: "1px solid var(--hairline)",
                        color: "var(--ink)",
                      }}
                    />
                  </div>
                </div>

                {/* Cloudinary Powered Dish Image Uploader */}
                <div className="p-3 rounded-xl border bg-stone-50/70" style={{ borderColor: "var(--hairline)" }}>
                  <label className="block text-xs font-semibold mb-2 flex items-center justify-between" style={{ color: "var(--ink)" }}>
                    <span className="flex items-center gap-1.5">
                      <span>📷</span>
                      <span>Dish Photo (Cloudinary Powered)</span>
                    </span>
                    {formData.photoUrl && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        ✓ Photo Ready
                      </span>
                    )}
                  </label>

                  <div className="flex items-center gap-3">
                    {formData.photoUrl ? (
                      <div className="relative w-16 h-16 rounded-xl border overflow-hidden shadow-xs shrink-0">
                        <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, photoUrl: "" })}
                          className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center text-2xl text-stone-400 bg-white shrink-0" style={{ borderColor: "var(--hairline)" }}>
                        🍲
                      </div>
                    )}

                    <div className="flex-1 space-y-1">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold bg-white hover:bg-stone-50 cursor-pointer shadow-xs transition-colors">
                        <span>{isUploadingPhoto ? "⏳ Uploading..." : "Upload from Device"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingPhoto}
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handlePhotoUpload(f);
                          }}
                        />
                      </label>
                      {uploadError && <p className="text-[10px] text-red-600 font-bold">{uploadError}</p>}
                      <p className="text-[10px] text-stone-500">
                        Cloudinary auto-optimizes size & quality for instant diner mobile loading.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft)" }}>
                    Short description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ingredients or preparation note..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 rounded focus:outline-none"
                    style={{
                      backgroundColor: "var(--paper-dim)",
                      border: "1px solid var(--hairline)",
                      color: "var(--ink)",
                    }}
                  />
                </div>

                <div className="flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <input
                      type="radio"
                      name="diet"
                      checked={formData.isVeg}
                      onChange={() => setFormData({ ...formData, isVeg: true })}
                      className="accent-[#5B7A55]"
                    />
                    <span className="flex items-center gap-1.5">
                      <span className="veg-indicator" /> Vegetarian
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <input
                      type="radio"
                      name="diet"
                      checked={!formData.isVeg}
                      onChange={() => setFormData({ ...formData, isVeg: false })}
                      className="accent-[#A8412F]"
                    />
                    <span className="flex items-center gap-1.5">
                      <span className="nonveg-indicator" /> Non-vegetarian
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-dashed" style={{ borderColor: "var(--hairline)" }}>
                  <button
                    type="button"
                    onClick={() => setIsAddingItem(false)}
                    className="px-3.5 py-1.5 rounded"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded font-bold text-white cursor-pointer"
                    style={{ backgroundColor: "var(--rust)", borderRadius: "4px" }}
                  >
                    {isSubmitting ? "Saving..." : "Add to menu"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <ShareMenuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        restaurantName={restaurantName}
        tables={tables}
      />
    </div>
  );
}
