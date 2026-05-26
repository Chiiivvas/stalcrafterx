import sql from "@/app/api/utils/sql";

export async function GET() {
  try {
    const items = await sql`SELECT * FROM items ORDER BY name`;
    return Response.json({ items });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { name, is_base_material, market_price } = await request.json();
    const [item] = await sql`
      INSERT INTO items (name, is_base_material, market_price)
      VALUES (${name}, ${is_base_material ?? true}, ${market_price ?? 0})
      RETURNING *
    `;
    return Response.json({ item });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to create item" }, { status: 500 });
  }
}
