import sql from "@/app/api/utils/sql";

export async function GET() {
  try {
    const recipes = await sql`
      SELECT r.*, i.name as item_name, i.market_price as item_market_price
      FROM recipes r
      JOIN items i ON r.item_id = i.id
      ORDER BY i.name
    `;

    const ingredients = await sql`
      SELECT ri.*, i.name as ingredient_name, i.market_price
      FROM recipe_ingredients ri
      JOIN items i ON ri.ingredient_item_id = i.id
    `;

    const recipesWithIngredients = recipes.map((recipe) => ({
      ...recipe,
      ingredients: ingredients.filter((ing) => ing.recipe_id === recipe.id),
    }));

    return Response.json({ recipes: recipesWithIngredients });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch recipes" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { item_id, base_output, bonus_output, bonus_chance, ingredients } =
      await request.json();

    const [recipe] = await sql`
      INSERT INTO recipes (item_id, base_output, bonus_output, bonus_chance)
      VALUES (${item_id}, ${base_output ?? 1}, ${bonus_output ?? 0}, ${bonus_chance ?? 0})
      RETURNING *
    `;

    if (ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        await sql`
          INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
          VALUES (${recipe.id}, ${ing.ingredient_item_id}, ${ing.quantity})
        `;
      }
    }

    return Response.json({ recipe });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to create recipe" }, { status: 500 });
  }
}
