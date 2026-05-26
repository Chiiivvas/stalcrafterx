"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

export default function Calculator() {
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [numCrafts, setNumCrafts] = useState(1);

  const { data: recipesData, isLoading: recipesLoading } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const res = await fetch("/api/recipes");
      if (!res.ok) throw new Error("Failed to fetch recipes");
      return res.json();
    },
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
  });

  const recipes = recipesData?.recipes || [];
  const items = itemsData?.items || [];

  const itemsMap = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      map[item.id] = item;
    });
    return map;
  }, [items]);

  const selectedRecipe = recipes.find(
    (r) => r.id === parseInt(selectedRecipeId),
  );

  const calculation = useMemo(() => {
    if (!selectedRecipe) return null;
    const craftedItem = itemsMap[selectedRecipe.item_id];
    if (!craftedItem) return null;

    const ingredientDetails = selectedRecipe.ingredients.map((ing) => {
      const item = itemsMap[ing.ingredient_item_id];
      const totalQuantity = ing.quantity * numCrafts;
      const pricePerUnit = item?.market_price || 0;
      const totalCost = totalQuantity * pricePerUnit;
      return {
        name: ing.ingredient_name || item?.name || "Неизвестно",
        quantityPerCraft: ing.quantity,
        totalQuantity,
        pricePerUnit,
        totalCost,
      };
    });

    const totalCraftingCost = ingredientDetails.reduce(
      (sum, ing) => sum + ing.totalCost,
      0,
    );
    const bonusChance = parseFloat(selectedRecipe.bonus_chance) || 0;
    const expectedYield =
      numCrafts *
      (selectedRecipe.base_output +
        selectedRecipe.bonus_output * (bonusChance / 100));
    const itemPrice = craftedItem.market_price || 0;
    const marketValue = expectedYield * itemPrice;
    const profit = marketValue - totalCraftingCost;
    const profitPercent =
      totalCraftingCost > 0
        ? ((profit / totalCraftingCost) * 100).toFixed(1)
        : "∞";

    return {
      craftedItemName: craftedItem.name,
      craftedItemPrice: itemPrice,
      baseOutput: selectedRecipe.base_output,
      bonusOutput: selectedRecipe.bonus_output,
      bonusChance,
      expectedYield,
      ingredientDetails,
      totalCraftingCost,
      marketValue,
      profit,
      profitPercent,
      isProfitable: profit >= 0,
    };
  }, [selectedRecipe, numCrafts, itemsMap]);

  const isLoading = recipesLoading || itemsLoading;

  const craftSuffix = (n) => {
    if (n === 1) return "крафт";
    if (n >= 2 && n <= 4) return "крафта";
    return "крафтов";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Input */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
        <h2 className="text-base font-semibold text-[#111827] mb-1">
          Что крафтим?
        </h2>
        <p className="text-sm text-[#6B7280] mb-6">
          Выберите предмет и количество крафтов
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
              Предмет
            </label>
            {isLoading ? (
              <div className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#9CA3AF] bg-[#F9FAFB]">
                Загрузка...
              </div>
            ) : (
              <select
                value={selectedRecipeId}
                onChange={(e) => setSelectedRecipeId(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                <option value="">Выберите предмет...</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.item_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
              Количество крафтов
            </label>
            <input
              type="number"
              min="1"
              value={numCrafts}
              onChange={(e) =>
                setNumCrafts(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            />
          </div>
        </div>

        {/* Ingredient list */}
        {calculation && (
          <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
            <p className="text-xs font-medium text-[#6B7280] mb-3 uppercase tracking-wide">
              Необходимые ингредиенты
            </p>
            <div className="space-y-1">
              {calculation.ingredientDetails.map((ing, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[#D1D5DB] text-sm select-none">
                      —
                    </span>
                    <span className="text-sm text-[#374151]">{ing.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-[#111827]">
                      ×{ing.totalQuantity.toLocaleString()}
                    </span>
                    {ing.pricePerUnit > 0 && (
                      <p className="text-xs text-[#9CA3AF]">
                        {ing.pricePerUnit.toLocaleString()} ₽/шт
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Results */}
      <div className="space-y-4">
        {!calculation ? (
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-10 flex flex-col items-center justify-center min-h-[220px]">
            <div className="w-10 h-10 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-3">
              <span className="text-[#9CA3AF] text-lg">⚗</span>
            </div>
            <p className="text-sm text-[#6B7280] text-center">
              Выберите предмет для расчёта
            </p>
          </div>
        ) : (
          <>
            {/* Cost breakdown */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
              <h2 className="text-base font-semibold text-[#111827] mb-1">
                Стоимость крафта
              </h2>
              <p className="text-sm text-[#6B7280] mb-5">
                {calculation.craftedItemName} — {numCrafts}{" "}
                {craftSuffix(numCrafts)}
              </p>

              <div className="space-y-3">
                {calculation.ingredientDetails.map((ing, idx) => (
                  <div key={idx} className="flex items-start justify-between">
                    <div>
                      <span className="text-sm text-[#374151]">{ing.name}</span>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        {ing.totalQuantity.toLocaleString()} ×{" "}
                        {ing.pricePerUnit.toLocaleString()} ₽
                      </p>
                    </div>
                    <span
                      className={`text-sm font-medium ${ing.totalCost === 0 ? "text-[#9CA3AF]" : "text-[#111827]"}`}
                    >
                      {ing.totalCost === 0
                        ? "—"
                        : `${ing.totalCost.toLocaleString()} ₽`}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-[#E5E7EB] flex items-center justify-between">
                <span className="text-sm font-semibold text-[#111827]">
                  Итого затрат
                </span>
                <span className="text-base font-semibold text-[#111827]">
                  {calculation.totalCraftingCost.toLocaleString()} ₽
                </span>
              </div>
            </div>

            {/* Yield & Profit */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
              <h2 className="text-base font-semibold text-[#111827] mb-4">
                Выход и прибыль
              </h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B7280]">Базовый выход</span>
                  <span className="text-sm text-[#111827]">
                    {(numCrafts * calculation.baseOutput).toLocaleString()} шт
                  </span>
                </div>

                {calculation.bonusChance > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#6B7280]">
                      Бонус ({calculation.bonusOutput} шт,{" "}
                      {calculation.bonusChance}%)
                    </span>
                    <span className="text-sm text-[#111827]">
                      +
                      {(
                        (numCrafts *
                          calculation.bonusOutput *
                          calculation.bonusChance) /
                        100
                      ).toFixed(2)}{" "}
                      шт
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B7280]">
                    Ожидаемый выход
                  </span>
                  <span className="text-sm font-medium text-[#111827]">
                    {calculation.expectedYield.toFixed(2)} шт
                  </span>
                </div>

                {calculation.craftedItemPrice > 0 ? (
                  <>
                    <div className="pt-2 border-t border-[#F3F4F6]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[#6B7280]">
                          Цена продажи
                        </span>
                        <span className="text-sm text-[#111827]">
                          {calculation.craftedItemPrice.toLocaleString()} ₽/шт
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#6B7280]">
                          Рыночная стоимость
                        </span>
                        <span className="text-sm font-medium text-[#111827]">
                          {calculation.marketValue.toLocaleString()} ₽
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#111827]">
                        Прибыль
                      </span>
                      <div className="text-right">
                        <p
                          className={`text-base font-semibold ${calculation.isProfitable ? "text-green-600" : "text-red-600"}`}
                        >
                          {calculation.isProfitable ? "+" : ""}
                          {calculation.profit.toLocaleString()} ₽
                        </p>
                        <p
                          className={`text-xs ${calculation.isProfitable ? "text-green-500" : "text-red-500"}`}
                        >
                          {calculation.isProfitable ? "+" : ""}
                          {calculation.profitPercent}%
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 p-3 bg-[#F9FAFB] rounded-lg border border-[#E5E7EB]">
                    <p className="text-xs text-[#6B7280]">
                      Укажите рыночную цену предмета во вкладке «Предметы»,
                      чтобы рассчитать прибыль.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Status pill */}
            {calculation.craftedItemPrice > 0 && (
              <div className="flex justify-end">
                <span
                  className={`inline-flex items-center gap-1.5 bg-white border border-[#E5E7EB] rounded-full px-3 py-1 text-xs font-medium ${calculation.isProfitable ? "text-green-700" : "text-red-600"}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${calculation.isProfitable ? "bg-green-500" : "bg-red-500"}`}
                  />
                  {calculation.isProfitable ? "Выгодно" : "Невыгодно"}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
