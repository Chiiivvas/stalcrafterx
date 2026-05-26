"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RecipeForm from "./RecipeForm";

const EMPTY_RECIPE = {
  item_id: "",
  base_output: 1,
  bonus_output: 0,
  bonus_chance: 0,
  ingredients: [],
};

export default function RecipesManager() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ ...EMPTY_RECIPE });
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [error, setError] = useState(null);

  const { data: recipesData, isLoading: recipesLoading } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const res = await fetch("/api/recipes");
      if (!res.ok) throw new Error("Failed to fetch recipes");
      return res.json();
    },
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
  });

  const recipes = recipesData?.recipes || [];
  const items = itemsData?.items || [];
  const craftableItems = items.filter((i) => !i.is_base_material);
  const itemsWithRecipes = new Set(recipes.map((r) => r.item_id));
  const availableCraftableItems = craftableItems.filter(
    (i) => !itemsWithRecipes.has(i.id),
  );

  const createMutation = useMutation({
    mutationFn: async (recipe) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      if (!res.ok) throw new Error("Failed to create recipe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setShowAddForm(false);
      setNewRecipe({ ...EMPTY_RECIPE });
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(`/api/recipes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update recipe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setEditingRecipe(null);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete recipe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const handleCreate = () => {
    if (!newRecipe.item_id) return;
    createMutation.mutate({
      ...newRecipe,
      item_id: parseInt(newRecipe.item_id),
    });
  };

  const handleUpdate = () => {
    if (!editingRecipe?.id) return;
    updateMutation.mutate({
      id: editingRecipe.id,
      base_output: editingRecipe.base_output,
      bonus_output: editingRecipe.bonus_output,
      bonus_chance: editingRecipe.bonus_chance,
      ingredients: editingRecipe.ingredients,
    });
  };

  const startEdit = (recipe) => {
    setEditingRecipe({
      ...recipe,
      item_id: String(recipe.item_id),
      ingredients: recipe.ingredients.map((ing) => ({
        ingredient_item_id: ing.ingredient_item_id,
        quantity: ing.quantity,
      })),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#111827]">Рецепты</h2>
          <p className="text-sm text-[#6B7280]">Управление рецептами крафта</p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError(null);
          }}
          className="bg-[#2563EB] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1D4ED8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          + Добавить рецепт
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 mb-6">
          <h3 className="text-sm font-semibold text-[#111827] mb-4">
            Новый рецепт
          </h3>
          <RecipeForm
            form={newRecipe}
            setForm={setNewRecipe}
            onSave={handleCreate}
            onCancel={() => setShowAddForm(false)}
            saveLabel={createMutation.isPending ? "Сохранение..." : "Сохранить"}
            items={items}
            craftableItems={availableCraftableItems}
          />
        </div>
      )}

      {/* Recipes list */}
      {recipesLoading ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center text-sm text-[#6B7280]">
          Загрузка...
        </div>
      ) : recipes.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center text-sm text-[#6B7280]">
          Рецепты не найдены. Добавьте первый рецепт.
        </div>
      ) : (
        <div className="space-y-4">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-xl border border-[#E5E7EB] p-6 hover:border-[#D1D5DB] transition-colors"
            >
              {editingRecipe?.id === recipe.id ? (
                <div>
                  <h3 className="text-sm font-semibold text-[#111827] mb-4">
                    Редактирование: {recipe.item_name}
                  </h3>
                  <RecipeForm
                    form={editingRecipe}
                    setForm={setEditingRecipe}
                    onSave={handleUpdate}
                    onCancel={() => setEditingRecipe(null)}
                    saveLabel={
                      updateMutation.isPending ? "Сохранение..." : "Сохранить"
                    }
                    items={items}
                    craftableItems={craftableItems}
                  />
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-[#111827]">
                        {recipe.item_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center gap-1 bg-white border border-[#E5E7EB] rounded-full px-3 py-1 text-xs text-[#6B7280]">
                          Выход: {recipe.base_output} шт
                        </span>
                        {parseFloat(recipe.bonus_chance) > 0 && (
                          <span className="inline-flex items-center gap-1 bg-white border border-[#E5E7EB] rounded-full px-3 py-1 text-xs text-[#6B7280]">
                            +{recipe.bonus_output} шт ({recipe.bonus_chance}%
                            шанс)
                          </span>
                        )}
                        {recipe.item_market_price > 0 && (
                          <span className="inline-flex items-center gap-1 bg-[#EFF6FF] border border-[#BFDBFE] rounded-full px-3 py-1 text-xs text-[#2563EB]">
                            {recipe.item_market_price.toLocaleString()} ₽/шт
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => startEdit(recipe)}
                        className="text-xs font-medium text-[#6B7280] hover:text-[#111827] transition-colors"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(recipe.id)}
                        disabled={deleteMutation.isPending}
                        className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>

                  {recipe.ingredients.length === 0 ? (
                    <p className="text-xs text-[#9CA3AF]">
                      Ингредиенты не указаны
                    </p>
                  ) : (
                    <div className="space-y-1 border-t border-[#F3F4F6] pt-3">
                      {recipe.ingredients.map((ing, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[#D1D5DB] text-sm select-none">
                              —
                            </span>
                            <span className="text-sm text-[#374151]">
                              {ing.ingredient_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#111827]">
                              ×{ing.quantity}
                            </span>
                            {ing.market_price > 0 && (
                              <span className="text-xs text-[#9CA3AF]">
                                {ing.market_price.toLocaleString()} ₽/шт
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
