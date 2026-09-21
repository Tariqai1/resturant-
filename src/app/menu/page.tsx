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
  special_tag?: string | null;
  photo_url: string | null;
};

const SPECIAL_BADGE_OPTIONS = [
  { value: "", label: "No Special Badge (Standard)" },
  { value: "Chef's Special", label: "⭐ Chef's Special (Chef Pick)" },
  { value: "Today's Special", label: "🔥 Today's Special (Aaj Ka Khas)" },
  { value: "Signature Dish", label: "👑 Signature Dish (Must Try)" },
  { value: "Bestseller", label: "🏷️ Popular Bestseller" },
  { value: "House Favorite", label: "❤️ House Favorite" },
];

export default function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [restaurantName, setRestaurantName] = useState<string>("Order Desk");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dietFilter, setDietFilter] = useState<"all" | "veg" | "non-veg">("all");
  const [stockFilter, setStockFilter] = useState<"all" | "instock" | "soldout">("all");
  const [onlySpecials, setOnlySpecials] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tables, setTables] = useState<ShareMenuTable[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Quick inline category create inside Dish modals
  const [inlineCategoryMode, setInlineCategoryMode] = useState(false);
  const [inlineCategoryInput, setInlineCategoryInput] = useState("");

  // Add Item Form State
  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    price: "",
    costPrice: "",
    description: "",
    isVeg: true,
    isBestseller: false,
    specialTag: "",
    photoUrl: "",
  });

  // Edit Item Form State
  const [editFormData, setEditFormData] = useState({
    name: "",
    categoryId: "",
    price: "",
    costPrice: "",
    description: "",
    isVeg: true,
    isBestseller: false,
    specialTag: "",
    photoUrl: "",
  });

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [updatingPhotoId, setUpdatingPhotoId] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

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
      // Keep state
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
        if (data.tables) setTables(data.tables);
        if (data.categories?.[0]?.id) {
          setFormData((prev) => ({ ...prev, categoryId: data.categories[0].id }));
        }
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

  // Category Creation Handler
  async function handleCreateCategorySubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create category");

      setCategories((prev) => [...prev, data.category]);
      setSelectedCategory(data.category.id);
      setNewCategoryName("");
      setIsAddingCategory(false);
      showToast(`Category "${data.category.name}" created successfully!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating category");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Inline Category Creator inside Dish Modals
  async function handleInlineCreateCategory(targetForm: "add" | "edit") {
    if (!inlineCategoryInput.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inlineCategoryInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create category");

      setCategories((prev) => [...prev, data.category]);
      if (targetForm === "add") {
        setFormData((prev) => ({ ...prev, categoryId: data.category.id }));
      } else {
        setEditFormData((prev) => ({ ...prev, categoryId: data.category.id }));
      }
      setInlineCategoryInput("");
      setInlineCategoryMode(false);
      showToast(`Category "${data.category.name}" added and selected!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating category");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Update Category Name
  async function handleUpdateCategory(categoryId: string) {
    if (!editingCategoryName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/menu/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, name: editingCategoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update category");

      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, name: data.category.name } : c))
      );
      setEditingCategoryId(null);
      showToast(`Category renamed to "${data.category.name}"`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating category");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Delete Category
  async function handleDeleteCategory(categoryId: string) {
    const target = categories.find((c) => c.id === categoryId);
    if (!confirm(`Are you sure you want to delete category "${target?.name || ""}"? Dishes will remain safe and move to Unassigned.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/menu/categories?id=${categoryId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete category");

      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      if (selectedCategory === categoryId) setSelectedCategory("all");
      await refreshMenu();
      showToast("Category deleted successfully.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting category");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Open Edit Modal with pre-filled dish details
  function openEditModal(item: MenuItem) {
    setEditingItem(item);
    setEditFormData({
      name: item.name,
      categoryId: item.category_id || (categories[0]?.id ?? ""),
      price: String(item.price),
      costPrice: item.cost_price ? String(item.cost_price) : "",
      description: item.description || "",
      isVeg: item.is_veg,
      isBestseller: item.is_bestseller,
      specialTag: item.special_tag || (item.is_bestseller ? "Chef's Special" : ""),
      photoUrl: item.photo_url || "",
    });
    setInlineCategoryMode(false);
    setUploadError("");
  }

  // 1-Tap Instant Optimistic Availability Toggle
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
      showToast(`${item.name} is now ${nextState ? "In Stock" : "Sold Out (86)"}`);
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: item.is_available } : i))
      );
      alert("Failed to toggle dish availability.");
    }
  }

  // Cloudinary Upload for Add Modal
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
      if (!res.ok) throw new Error(data.message || "Image upload failed");

      setFormData((prev) => ({ ...prev, photoUrl: data.url }));
      showToast("Dish photo uploaded successfully!");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload error");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  // Cloudinary Upload for Edit Modal
  async function handleEditPhotoUpload(file: File) {
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
      if (!res.ok) throw new Error(data.message || "Image upload failed");

      setEditFormData((prev) => ({ ...prev, photoUrl: data.url }));
      showToast("New dish photo uploaded!");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload error");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  // Inline Quick Photo Update directly from table
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
      if (!res.ok) throw new Error(data.message || "Photo upload failed");

      const patchRes = await fetch("/api/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, photoUrl: data.url }),
      });

      if (!patchRes.ok) throw new Error("Failed to save photo in menu");

      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, photo_url: data.url } : i))
      );
      showToast("Photo updated!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating photo");
    } finally {
      setUpdatingPhotoId(null);
    }
  }

  // Submit Add Dish
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
          isBestseller: Boolean(formData.specialTag) || formData.isBestseller,
          specialTag: formData.specialTag || (formData.isBestseller ? "Chef's Special" : null),
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
        specialTag: "",
        photoUrl: "",
      });
      showToast(`Dish "${data.item?.name || "Dish"}" created successfully!`);
      await refreshMenu();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create dish");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Submit Edit Dish
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem || !editFormData.name.trim() || !editFormData.price) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editingItem.id,
          name: editFormData.name,
          categoryId: editFormData.categoryId || null,
          price: Number(editFormData.price),
          costPrice: editFormData.costPrice ? Number(editFormData.costPrice) : null,
          description: editFormData.description || null,
          isVeg: editFormData.isVeg,
          isBestseller: Boolean(editFormData.specialTag) || editFormData.isBestseller,
          specialTag: editFormData.specialTag || (editFormData.isBestseller ? "Chef's Special" : null),
          photoUrl: editFormData.photoUrl || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update dish");

      const updated = data.item;
      setItems((prev) =>
        prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i))
      );
      setEditingItem(null);
      showToast(`"${updated.name}" updated successfully!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update dish");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Submit Delete Dish
  async function handleDeleteConfirm() {
    if (!deletingItem) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/menu?id=${deletingItem.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete dish");

      const dishName = deletingItem.name;
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      setDeletingItem(null);
      showToast(`"${dishName}" deleted from menu.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete dish");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Filtering Logic
  const filteredItems = items.filter((item) => {
    // Specials only filter
    if (onlySpecials && !item.is_bestseller && !item.special_tag) {
      return false;
    }
    // Category filter
    if (selectedCategory !== "all" && item.category_id !== selectedCategory) {
      return false;
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q) ?? false;
      const matchTag = item.special_tag?.toLowerCase().includes(q) ?? false;
      if (!matchName && !matchDesc && !matchTag) return false;
    }
    // Diet filter
    if (dietFilter === "veg" && !item.is_veg) return false;
    if (dietFilter === "non-veg" && item.is_veg) return false;
    // Stock filter
    if (stockFilter === "instock" && !item.is_available) return false;
    if (stockFilter === "soldout" && item.is_available) return false;

    return true;
  });

  // Metrics
  const totalCount = items.length;
  const inStockCount = items.filter((i) => i.is_available).length;
  const soldOutCount = items.filter((i) => !i.is_available).length;
  const vegCount = items.filter((i) => i.is_veg).length;
  const nonVegCount = items.filter((i) => !i.is_veg).length;
  const specialsCount = items.filter((i) => i.is_bestseller || Boolean(i.special_tag)).length;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-black">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-500 text-slate-950 px-4 py-2.5 rounded-xl font-bold text-xs shadow-2xl shadow-emerald-500/20 animate-in fade-in slide-in-from-bottom-5">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Dark Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0 flex flex-col justify-between p-5 bg-slate-900/80 border-r border-slate-800/80 backdrop-blur-xl">
        <div>
          {/* Brand Header */}
          <div className="flex items-center justify-between mb-8 pb-5 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🍽️</span>
                <h1 className="font-extrabold text-lg tracking-tight text-white bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                  Order Desk
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-[190px] mt-0.5">
                {restaurantName}
              </p>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-950/60 border border-amber-700/50 text-amber-400 rounded font-semibold">
              POS
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5 text-xs font-semibold">
            <Link
              href="/"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>📊</span>
              <span>Floor Overview</span>
            </Link>

            <Link
              href="/tables"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>🪑</span>
              <span>Floor Layout &amp; QR</span>
            </Link>

            <Link
              href="/kitchen"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>👨‍🍳</span>
              <span>Kitchen Rail (KDS)</span>
            </Link>

            <Link
              href="/menu"
              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/40 text-amber-300 font-bold shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <span>📖</span>
                <span>Menu &amp; Stock</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                {items.length}
              </span>
            </Link>

            <Link
              href="/staff"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>👥</span>
              <span>Staff &amp; Access</span>
            </Link>
          </nav>
        </div>

        {/* Back Link */}
        <div className="pt-4 border-t border-slate-800/80">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors"
          >
            <span>←</span>
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto space-y-6">
        {/* Top Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-white tracking-tight">
                Menu &amp; Stock Master
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                {items.length} dishes • {categories.length} categories
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time catalog, custom restaurant specials, instant pricing updates &amp; 1-tap 86 availability.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  viewMode === "table"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Dense Table View"
              >
                📋 Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Visual Card Grid"
              >
                🖼️ Cards
              </button>
            </div>

            {/* Share QR Menu */}
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-emerald-800/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <span>📲</span>
              <span>Share QR Menu</span>
            </button>

            {/* Create Category */}
            <button
              type="button"
              onClick={() => setIsAddingCategory(true)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <span>📁</span>
              <span>+ New Category</span>
            </button>

            {/* Add New Dish */}
            <button
              onClick={() => setIsAddingItem(true)}
              className="px-4 py-2 text-xs font-bold text-slate-950 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="text-base leading-none">+</span>
              <span>Add New Dish</span>
            </button>
          </div>
        </header>

        {/* Live Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Catalog
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white font-mono">{totalCount}</span>
              <span className="text-[11px] text-slate-400">items</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>⭐</span>
              House Specials
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-amber-400 font-mono">{specialsCount}</span>
              <span className="text-[11px] text-slate-400">signature items</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              In Stock &amp; Live
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-400 font-mono">{inStockCount}</span>
              <span className="text-[11px] text-slate-400">ready</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              Sold Out (86)
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-rose-400 font-mono">{soldOutCount}</span>
              <span className="text-[11px] text-slate-400">hidden on QR</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Diet Balance
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-bold font-mono">
                🟢 {vegCount} Veg
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-bold font-mono">
                🔴 {nonVegCount}
              </span>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-3.5 bg-slate-900/50 border border-slate-800/80 p-4 rounded-2xl backdrop-blur-md">
          {/* Top Search & Dropdown Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by dish name, category, or 'special'..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Specials Filter */}
            <button
              type="button"
              onClick={() => setOnlySpecials(!onlySpecials)}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                onlySpecials
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-xs"
                  : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-amber-400 hover:border-amber-500/30"
              }`}
            >
              <span>⭐</span>
              <span>House Specials ({specialsCount})</span>
            </button>

            {/* Diet Filter */}
            <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setDietFilter("all")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  dietFilter === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All Diet
              </button>
              <button
                type="button"
                onClick={() => setDietFilter("veg")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  dietFilter === "veg" ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60" : "text-slate-400 hover:text-emerald-400"
                }`}
              >
                🟢 Veg
              </button>
              <button
                type="button"
                onClick={() => setDietFilter("non-veg")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  dietFilter === "non-veg" ? "bg-rose-900/60 text-rose-300 border border-rose-700/60" : "text-slate-400 hover:text-rose-400"
                }`}
              >
                🔴 Non-veg
              </button>
            </div>

            {/* Stock Filter */}
            <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setStockFilter("all")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  stockFilter === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("instock")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  stockFilter === "instock" ? "bg-emerald-900/60 text-emerald-300" : "text-slate-400 hover:text-emerald-300"
                }`}
              >
                In Stock
              </button>
              <button
                type="button"
                onClick={() => setStockFilter("soldout")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  stockFilter === "soldout" ? "bg-rose-900/60 text-rose-300" : "text-slate-400 hover:text-rose-300"
                }`}
              >
                86 (Sold Out)
              </button>
            </div>
          </div>

          {/* Category Tabs Pill Bar + Category Management Buttons */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none flex-1">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 ${
                  selectedCategory === "all"
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                    : "bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white"
                }`}
              >
                All ({items.length})
              </button>

              {categories.map((cat) => {
                const count = items.filter((i) => i.category_id === cat.id).length;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                        : "bg-slate-800/60 text-slate-300 hover:bg-slate-700/80 hover:text-white"
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected ? "bg-slate-950/30 text-slate-950 font-extrabold" : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Category Quick Actions */}
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <button
                type="button"
                onClick={() => setIsAddingCategory(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                title="Add New Category"
              >
                <span>+</span>
                <span>Category</span>
              </button>
              <button
                type="button"
                onClick={() => setIsManagingCategories(true)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs transition-colors cursor-pointer"
                title="Manage & Rename Categories"
              >
                ⚙️
              </button>
            </div>
          </div>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-semibold">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Content View: Table or Cards */}
        {isLoading ? (
          <div className="p-16 text-center text-slate-400 text-sm font-semibold bg-slate-900/40 border border-slate-800 rounded-2xl">
            <span className="inline-block animate-spin text-xl mb-2">⏳</span>
            <div>Loading menu registry...</div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
            <span className="text-4xl">🍲</span>
            <h3 className="text-base font-bold text-white">No dishes found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || selectedCategory !== "all" || dietFilter !== "all" || stockFilter !== "all" || onlySpecials
                ? "No menu items match your active search or filter. Try clearing filters."
                : "Your menu is currently empty. Click '+ Add New Dish' above to create your first item."}
            </p>
            {(searchQuery || selectedCategory !== "all" || dietFilter !== "all" || stockFilter !== "all" || onlySpecials) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                  setDietFilter("all");
                  setStockFilter("all");
                  setOnlySpecials(false);
                }}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : viewMode === "table" ? (
          /* ============================================================ */
          /* TABLE VIEW: Luxury Obsidian Dense Table                     */
          /* ============================================================ */
          <div className="bg-slate-900/60 border border-slate-800/90 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-5 py-4">Dish &amp; Special Highlight</th>
                    <th className="px-4 py-4">Diet</th>
                    <th className="px-4 py-4">Category</th>
                    <th className="px-4 py-4">Price</th>
                    <th className="px-5 py-4">Availability (86 Switch)</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.map((item) => {
                    const categoryName = categories.find((c) => c.id === item.category_id)?.name || "General";
                    const specialTag = item.special_tag || (item.is_bestseller ? "Chef's Special" : null);

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          !item.is_available ? "opacity-75 bg-slate-950/30" : ""
                        }`}
                      >
                        {/* Dish Details */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3.5">
                            {/* Dish Photo Thumbnail with 1-tap change */}
                            <label
                              className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-700 bg-slate-800 shrink-0 cursor-pointer group shadow-sm"
                              title="Click to replace dish photo"
                            >
                              {item.photo_url ? (
                                <img
                                  src={item.photo_url}
                                  alt={item.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xl bg-slate-800 text-slate-400">
                                  🍲
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
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

                            {/* Name, Special badge, Description */}
                            <div className="min-w-0 max-w-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-white text-sm hover:text-amber-300 transition-colors">
                                  {item.name}
                                </span>
                                {specialTag && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400/15 text-amber-300 border border-amber-500/40 shadow-xs flex items-center gap-1">
                                    <span>⭐</span>
                                    <span>{specialTag}</span>
                                  </span>
                                )}
                              </div>
                              {item.description ? (
                                <p className="text-[11px] text-slate-400 truncate mt-0.5" title={item.description}>
                                  {item.description}
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-600 italic mt-0.5">No description</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Diet (Indian FSSAI Standard) */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {item.is_veg ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-[11px] font-bold">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-900" />
                              <span>Veg</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-[11px] font-bold">
                              <span className="w-2 h-2 rounded-full bg-rose-400 ring-2 ring-rose-900" />
                              <span>Non-veg</span>
                            </span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700/80 text-slate-300 text-[11px] font-semibold">
                            {categoryName}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-mono font-black text-white text-sm">
                            ₹{item.price}
                          </div>
                          {item.cost_price && (
                            <div className="text-[10px] font-mono text-slate-500">
                              Cost: ₹{item.cost_price}
                            </div>
                          )}
                        </td>

                        {/* Instant 86 Switch */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleAvailability(item)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-2 shadow-xs active:scale-95 ${
                              item.is_available
                                ? "bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800/70"
                                : "bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/70"
                            }`}
                            title="Click to toggle availability on QR menu"
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                item.is_available ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                              }`}
                            />
                            <span>{item.is_available ? "In stock" : "Sold out (86)"}</span>
                          </button>
                        </td>

                        {/* Action Buttons: Edit & Delete */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                              title="Edit dish details"
                            >
                              <span>✏️</span>
                              <span>Edit</span>
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => setDeletingItem(item)}
                              className="px-2.5 py-1.5 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 hover:text-rose-200 border border-rose-800/50 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                              title="Delete dish"
                            >
                              <span>🗑️</span>
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* CARDS VIEW: Rich Food Visual Grid Layout                     */
          /* ============================================================ */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item) => {
              const categoryName = categories.find((c) => c.id === item.category_id)?.name || "General";
              const specialTag = item.special_tag || (item.is_bestseller ? "Chef's Special" : null);

              return (
                <div
                  key={item.id}
                  className={`bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all group ${
                    !item.is_available ? "opacity-75" : ""
                  }`}
                >
                  {/* Card Image Banner */}
                  <div className="relative h-40 w-full bg-slate-800 overflow-hidden">
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl bg-slate-800 text-slate-500">
                        🍲
                      </div>
                    )}

                    {/* Top Badges */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap max-w-[80%]">
                      {item.is_veg ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md border border-emerald-700 text-emerald-400 text-[10px] font-bold">
                          🟢 Veg
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md border border-rose-700 text-rose-400 text-[10px] font-bold">
                          🔴 Non-veg
                        </span>
                      )}
                      {specialTag && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black shadow-xs flex items-center gap-1">
                          <span>⭐</span>
                          <span>{specialTag}</span>
                        </span>
                      )}
                    </div>

                    {/* Price Tag Overlay */}
                    <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-white font-mono font-black text-sm">
                      ₹{item.price}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="text-[10px] font-mono text-amber-400 font-semibold uppercase tracking-wider">
                        {categoryName}
                      </div>
                      <h4 className="font-bold text-white text-base mt-0.5 line-clamp-1">{item.name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                        {item.description || "No description provided for this dish."}
                      </p>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      {/* Stock Switch */}
                      <button
                        type="button"
                        onClick={() => toggleAvailability(item)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          item.is_available
                            ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/70"
                            : "bg-rose-950/40 text-rose-300 border-rose-800/70"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.is_available ? "bg-emerald-400" : "bg-rose-400"
                          }`}
                        />
                        <span>{item.is_available ? "In Stock" : "Sold Out"}</span>
                      </button>

                      {/* Edit and Delete */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs transition-colors cursor-pointer"
                          title="Edit Dish"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingItem(item)}
                          className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 rounded-lg border border-rose-800/60 text-xs transition-colors cursor-pointer"
                          title="Delete Dish"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 1: ADD NEW DISH                                        */}
        {/* ============================================================ */}
        {isAddingItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsAddingItem(false)}
          >
            <div
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-4 mb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-lg font-black text-white">Add New Dish</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Create a new food, drink, or signature item for your restaurant.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingItem(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddItem} className="space-y-4 text-xs">
                {/* Name */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Dish Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mutton Handi Dum Biryani"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                  />
                </div>

                {/* Category Selector with Inline Quick Creator */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-300 font-semibold">
                      Category *
                    </label>
                    <button
                      type="button"
                      onClick={() => setInlineCategoryMode(!inlineCategoryMode)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                    >
                      {inlineCategoryMode ? "Cancel New Category" : "+ Create New Category"}
                    </button>
                  </div>

                  {inlineCategoryMode ? (
                    <div className="flex items-center gap-2 p-2 bg-slate-950 border border-amber-500/50 rounded-xl">
                      <input
                        type="text"
                        placeholder="e.g. Tandoor & Kebab"
                        value={inlineCategoryInput}
                        onChange={(e) => setInlineCategoryInput(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-medium focus:outline-none text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleInlineCreateCategory("add")}
                        disabled={isSubmitting || !inlineCategoryInput.trim()}
                        className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-lg font-bold text-xs cursor-pointer hover:bg-amber-400 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Selling & Cost Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Selling Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 380"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-amber-500 transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Cost Price (₹) <span className="text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 140"
                      value={formData.costPrice}
                      onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                    />
                  </div>
                </div>

                {/* Special / Signature Highlight Badge */}
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <label className="block text-slate-300 font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>⭐</span>
                      <span>House Special / Signature Tag</span>
                    </span>
                    <span className="text-[10px] text-amber-400/90 font-mono">Highlights on QR menu</span>
                  </label>
                  <select
                    value={formData.specialTag}
                    onChange={(e) => setFormData({ ...formData, specialTag: e.target.value, isBestseller: Boolean(e.target.value) })}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-amber-300 font-bold focus:outline-none focus:border-amber-500 text-xs"
                  >
                    {SPECIAL_BADGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cloudinary Dish Photo Upload */}
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>📷</span>
                      <span>Dish Photo</span>
                    </span>
                    {formData.photoUrl && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                        ✓ Photo Ready
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {formData.photoUrl ? (
                      <div className="relative w-16 h-16 rounded-xl border border-slate-700 overflow-hidden shrink-0">
                        <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, photoUrl: "" })}
                          className="absolute top-1 right-1 bg-black/80 hover:bg-black text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 flex items-center justify-center text-2xl text-slate-500 shrink-0">
                        🍲
                      </div>
                    )}

                    <div className="flex-1 space-y-1.5">
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition-colors shadow-xs">
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
                      {uploadError && <p className="text-[10px] text-rose-400 font-bold">{uploadError}</p>}
                      <p className="text-[10px] text-slate-400">
                        High-resolution photo automatically resized and served via Cloudinary.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Dish Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Signature preparation cooked on charcoal flame with aromatic saffron gravy..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                  />
                </div>

                {/* Diet */}
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-semibold text-slate-300 block text-[11px]">Diet Standard</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="add_diet"
                        checked={formData.isVeg}
                        onChange={() => setFormData({ ...formData, isVeg: true })}
                        className="accent-emerald-500"
                      />
                      <span className="text-emerald-400 font-bold">🟢 Vegetarian</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="add_diet"
                        checked={!formData.isVeg}
                        onChange={() => setFormData({ ...formData, isVeg: false })}
                        className="accent-rose-500"
                      />
                      <span className="text-rose-400 font-bold">🔴 Non-vegetarian</span>
                    </label>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddingItem(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Adding..." : "Add to Menu"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 2: EDIT DISH DETAILS                                  */}
        {/* ============================================================ */}
        {editingItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => setEditingItem(null)}
          >
            <div
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-4 mb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-base">✏️</span>
                    <h3 className="text-lg font-black text-white">Edit Dish Details</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Editing <span className="text-white font-bold">"{editingItem.name}"</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
                {/* Name */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Dish Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                  />
                </div>

                {/* Category Selector with Inline Quick Creator */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-300 font-semibold">
                      Category *
                    </label>
                    <button
                      type="button"
                      onClick={() => setInlineCategoryMode(!inlineCategoryMode)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                    >
                      {inlineCategoryMode ? "Cancel New Category" : "+ Create New Category"}
                    </button>
                  </div>

                  {inlineCategoryMode ? (
                    <div className="flex items-center gap-2 p-2 bg-slate-950 border border-amber-500/50 rounded-xl">
                      <input
                        type="text"
                        placeholder="e.g. Signature Handi"
                        value={inlineCategoryInput}
                        onChange={(e) => setInlineCategoryInput(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-medium focus:outline-none text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleInlineCreateCategory("edit")}
                        disabled={isSubmitting || !inlineCategoryInput.trim()}
                        className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-lg font-bold text-xs cursor-pointer hover:bg-amber-400 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editFormData.categoryId}
                      onChange={(e) => setEditFormData({ ...editFormData, categoryId: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Selling & Cost Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Selling Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editFormData.price}
                      onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-amber-500 transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Cost Price (₹) <span className="text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editFormData.costPrice}
                      onChange={(e) => setEditFormData({ ...editFormData, costPrice: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                    />
                  </div>
                </div>

                {/* Special / Signature Highlight Badge */}
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <label className="block text-slate-300 font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>⭐</span>
                      <span>House Special / Signature Tag</span>
                    </span>
                    <span className="text-[10px] text-amber-400/90 font-mono">Highlights on QR menu</span>
                  </label>
                  <select
                    value={editFormData.specialTag}
                    onChange={(e) => setEditFormData({ ...editFormData, specialTag: e.target.value, isBestseller: Boolean(e.target.value) })}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-amber-300 font-bold focus:outline-none focus:border-amber-500 text-xs"
                  >
                    {SPECIAL_BADGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dish Photo Uploader */}
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>📷</span>
                      <span>Dish Photo</span>
                    </span>
                    {editFormData.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setEditFormData({ ...editFormData, photoUrl: "" })}
                        className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {editFormData.photoUrl ? (
                      <div className="relative w-16 h-16 rounded-xl border border-slate-700 overflow-hidden shrink-0">
                        <img src={editFormData.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 flex items-center justify-center text-2xl text-slate-500 shrink-0">
                        🍲
                      </div>
                    )}

                    <div className="flex-1 space-y-1.5">
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition-colors shadow-xs">
                        <span>{isUploadingPhoto ? "⏳ Uploading..." : "Upload New Photo"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingPhoto}
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleEditPhotoUpload(f);
                          }}
                        />
                      </label>
                      {uploadError && <p className="text-[10px] text-rose-400 font-bold">{uploadError}</p>}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Dish Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ingredients, preparation note..."
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                  />
                </div>

                {/* Diet */}
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-semibold text-slate-300 block text-[11px]">Diet Standard</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="edit_diet"
                        checked={editFormData.isVeg}
                        onChange={() => setEditFormData({ ...editFormData, isVeg: true })}
                        className="accent-emerald-500"
                      />
                      <span className="text-emerald-400 font-bold">🟢 Vegetarian</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="edit_diet"
                        checked={!editFormData.isVeg}
                        onChange={() => setEditFormData({ ...editFormData, isVeg: false })}
                        className="accent-rose-500"
                      />
                      <span className="text-rose-400 font-bold">🔴 Non-vegetarian</span>
                    </label>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 3: DELETE CONFIRMATION MODAL                           */}
        {/* ============================================================ */}
        {deletingItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setDeletingItem(null)}
          >
            <div
              className="w-full max-w-md bg-slate-900 border border-rose-800/80 rounded-2xl shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-xl">
                  🗑️
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Delete Dish Permanently?</h3>
                  <p className="text-xs text-slate-400">This action cannot be undone.</p>
                </div>
              </div>

              {/* Dish Preview Summary */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-3">
                {deletingItem.photo_url ? (
                  <img
                    src={deletingItem.photo_url}
                    alt={deletingItem.name}
                    className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-700"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-xl shrink-0">
                    🍲
                  </div>
                )}
                <div>
                  <div className="font-bold text-white text-sm">{deletingItem.name}</div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-0.5">
                    <span>₹{deletingItem.price}</span>
                    <span>•</span>
                    <span className={deletingItem.is_veg ? "text-emerald-400" : "text-rose-400"}>
                      {deletingItem.is_veg ? "Veg" : "Non-veg"}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to remove <strong className="text-white">"{deletingItem.name}"</strong>? It will immediately disappear from diner QR codes, server order terminals, and the kitchen display.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/50 cursor-pointer transition-all disabled:opacity-50 text-xs flex items-center gap-1.5"
                >
                  <span>{isSubmitting ? "Deleting..." : "Yes, Delete Dish"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 4: CREATE CATEGORY MODAL                               */}
        {/* ============================================================ */}
        {isAddingCategory && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsAddingCategory(false)}
          >
            <div
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>📁</span>
                    <span>Create New Category</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add a new section for your menu (e.g. "Chef's Special", "Tandoor", "Momos").
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(false)}
                  className="text-slate-400 hover:text-white text-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateCategorySubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Today's Special, Tandoori Khazana..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-500 transition-all text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newCategoryName.trim()}
                    className="px-5 py-2 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 cursor-pointer transition-all disabled:opacity-50 text-xs"
                  >
                    {isSubmitting ? "Creating..." : "Create Category"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MODAL 5: MANAGE CATEGORIES MODAL (RENAME / DELETE)          */}
        {/* ============================================================ */}
        {isManagingCategories && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsManagingCategories(false)}
          >
            <div
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95 space-y-4 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>⚙️</span>
                    <span>Manage Categories</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Rename categories or remove sections you no longer need.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsManagingCategories(false)}
                  className="text-slate-400 hover:text-white text-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="divide-y divide-slate-800 text-xs">
                {categories.map((cat) => {
                  const count = items.filter((i) => i.category_id === cat.id).length;
                  const isEditing = editingCategoryId === cat.id;

                  return (
                    <div key={cat.id} className="py-3 flex items-center justify-between gap-3">
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-slate-950 border border-amber-500 rounded-lg text-white font-semibold text-xs focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateCategory(cat.id)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryId(null)}
                            className="px-2.5 py-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="font-bold text-white text-sm">{cat.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {count} {count === 1 ? "dish" : "dishes"} linked
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat.id)}
                              className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-800/60 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsManagingCategories(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Share Menu QR Modal */}
      <ShareMenuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        restaurantName={restaurantName}
        tables={tables}
      />
    </div>
  );
}
