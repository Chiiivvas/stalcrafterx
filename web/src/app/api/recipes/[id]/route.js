import sql from "@/app/api/utils/sql";

export async function PUT(request, { params: { id } }) {
  try {
    const { base_output, bonus_output, bonus_chance, ingredients } =
      await request.json();

    await sql`
      UPDATE recipes
      SET base_output = ${base_output}, bonus_output = ${bonus_output}, bonus_chance = ${bonus_chance}
      WHERE id = ${id}
    `;

    if (ingredients !== undefined) {
      await sql`DELETE FROM recipe_ingredients WHERE recipe_id = ${id}`;
      for (const ing of ingredients) {
        await sql`
          INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
          VALUES (${id}, ${ing.ingredient_item_id}, ${ing.quantity})
        `;
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to update recipe" }, { status: 500 });
  }
}

export async function DELETE(request, { params: { id } }) {
  try {
    await sql`DELETE FROM recipes WHERE id = ${id}`;
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to delete recipe" }, { status: 500 });
  }
}
