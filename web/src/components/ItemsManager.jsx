"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function ItemsManager() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    is_base_material: true,
    market_price: 0,
  });
  const [error, setError] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }) => {
      const res = await fetch(`/api/items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to update item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const createMutation = useMutation({
    mutationFn: async (item) => {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error("Failed to create item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setShowAddForm(false);
      setNewItem({ name: "", is_base_material: true, market_price: 0 });
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const items = data?.items || [];

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValues({
      name: item.name,
      is_base_material: item.is_base_material,
      market_price: item.market_price,
    });
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id: editingId,
      ...editValues,
      market_price: parseInt(editValues.market_price) || 0,
    });
  };

  const handleCreate = () => {
    if (!newItem.name.trim()) return;
    createMutation.mutate({
      ...newItem,
      market_price: parseInt(newItem.market_price) || 0,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#111827]">Предметы</h2>
          <p className="text-sm text-[#6B7280]">
            Управление предметами и рыночными ценами
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError(null);
          }}
          className="bg-[#2563EB] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1D4ED8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          + Добавить предмет
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
            Новый предмет
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
                Название
              </label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) =>
                  setNewItem((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Название предмета"
                className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
                Тип
              </label>
              <select
                value={newItem.is_base_material ? "true" : "false"}
                onChange={(e) =>
                  setNewItem((p) => ({
                    ...p,
                    is_base_material: e.target.value === "true",
                  }))
                }
                className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                <option value="true">Базовый материал</option>
                <option value="false">Крафтовый предмет</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#6B7280] mb-1.5 block">
                Цена рынка (₽)
              </label>
              <input
                type="number"
                min="0"
                value={newItem.market_price}
                onChange={(e) =>
                  setNewItem((p) => ({ ...p, market_price: e.target.value }))
                }
                className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={!newItem.name.trim() || createMutation.isPending}
              className="bg-[#2563EB] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              {createMutation.isPending ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="bg-white border border-[#E5E7EB] text-[#374151] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#F9FAFB] transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[#6B7280]">
            Загрузка...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B7280]">
            Предметы не найдены. Добавьте первый предмет.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <th className="text-left text-xs font-medium text-[#6B7280] px-6 py-3">
                  Название
                </th>
                <th className="text-left text-xs font-medium text-[#6B7280] px-6 py-3">
                  Тип
                </th>
                <th className="text-left text-xs font-medium text-[#6B7280] px-6 py-3">
                  Цена рынка
                </th>
                <th className="text-right text-xs font-medium text-[#6B7280] px-6 py-3">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors ${idx === items.length - 1 ? "border-b-0" : ""}`}
                >
                  {editingId === item.id ? (
                    <>
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={editValues.name}
                          onChange={(e) =>
                            setEditValues((p) => ({
                              ...p,
                              name: e.target.value,
                            }))
                          }
                          className="border border-[#E5E7EB] rounded-lg px-2 py-1.5 text-sm w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1"
                        />
                      </td>
                      <td className="px-6 py-3">
                        <select
                          value={editValues.is_base_material ? "true" : "false"}
                          onChange={(e) =>
                            setEditValues((p) => ({
                              ...p,
                              is_base_material: e.target.value === "true",
                            }))
                          }
                          className="border border-[#E5E7EB] rounded-lg px-2 py-1.5 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1"
                        >
                          <option value="true">Базовый</option>
                          <option value="false">Крафтовый</option>
                        </select>
                      </td>
                      <td className="px-6 py-3">
                        <input
                          type="number"
                          min="0"
                          value={editValues.market_price}
                          onChange={(e) =>
                            setEditValues((p) => ({
                              ...p,
                              market_price: e.target.value,
                            }))
                          }
                          className="border border-[#E5E7EB] rounded-lg px-2 py-1.5 text-sm w-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1"
                        />
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={saveEdit}
                            disabled={updateMutation.isPending}
                            className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors disabled:opacity-40"
                          >
                            {updateMutation.isPending
                              ? "Сохранение..."
                              : "Сохранить"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-[#6B7280] hover:text-[#374151] transition-colors"
                          >
                            Отмена
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-3 text-sm text-[#111827]">
                        {item.name}
                      </td>
                      <td className="px-6 py-3">
                        {item.is_base_material ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs border border-[#E5E7EB] text-[#6B7280] bg-white">
                            Базовый
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                            Крафтовый
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-[#111827]">
                        {item.market_price > 0 ? (
                          `${item.market_price.toLocaleString()} ₽`
                        ) : (
                          <span className="text-[#9CA3AF]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => startEdit(item)}
                            className="text-xs font-medium text-[#6B7280] hover:text-[#111827] transition-colors"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            disabled={deleteMutation.isPending}
                            className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
