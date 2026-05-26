"use client";

export default function RecipeForm({
  form,
  setForm,
  onSave,
  onCancel,
  saveLabel,
  items,
  craftableItems,
}) {
  const addIngredient = () => {
    setForm((p) => ({
      ...p,
      ingredients: [...p.ingredients, { ingredient_item_id: "", quantity: 1 }],
    }));
  };

  const removeIngredient = (idx) => {
    setForm((p) => ({
      ...p,
      ingredients: p.ingredients.filter((_, i) => i !== idx),
    }));
  };

  const updateIngredient = (idx, field, value) => {
    setForm((p) => ({
      ...p,
      ingredients: p.ingredients.map((ing, i) =>
        i === idx ? { ...ing, [field]: value } : ing,
      ),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
            Предмет (результат крафта)
          </label>
          <select
            value={form.item_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, item_id: e.target.value }))
            }
            className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            <option value="">Выберите предмет...</option>
            {craftableItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
              Выход (шт)
            </label>
            <input
              type="number"
              min="1"
              value={form.base_output}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  base_output: parseInt(e.target.value) || 1,
                }))
              }
              className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
              +Бонус
            </label>
            <input
              type="number"
              min="0"
              value={form.bonus_output}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  bonus_output: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
              Шанс %
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.bonus_chance}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  bonus_chance: parseFloat(e.target.value) || 0,
                }))
              }
              className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            />
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-[#6B7280]">
            Ингредиенты
          </label>
          <button
            type="button"
            onClick={addIngredient}
            className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
          >
            + Добавить ингредиент
          </button>
        </div>

        <div className="space-y-2">
          {form.ingredients.length === 0 && (
            <p className="text-xs text-[#9CA3AF] py-2 px-1">
              Нет ингредиентов. Нажмите «+ Добавить ингредиент».
            </p>
          )}
          {form.ingredients.map((ing, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={ing.ingredient_item_id}
                onChange={(e) =>
                  updateIngredient(
                    idx,
                    "ingredient_item_id",
                    parseInt(e.target.value),
                  )
                }
                className="flex-1 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1"
              >
                <option value="">Выберите ингредиент...</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={ing.quantity}
                onChange={(e) =>
                  updateIngredient(
                    idx,
                    "quantity",
                    parseInt(e.target.value) || 1,
                  )
                }
                placeholder="Кол-во"
                className="w-24 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1"
              />
              <button
                type="button"
                onClick={() => removeIngredient(idx)}
                className="text-[#9CA3AF] hover:text-red-500 transition-colors text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!form.item_id}
          className="bg-[#2563EB] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-white border border-[#E5E7EB] text-[#374151] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#F9FAFB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
